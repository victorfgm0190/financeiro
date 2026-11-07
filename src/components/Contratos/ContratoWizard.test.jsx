// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'

// Seletores de categoria do cadastro: clicar numa opção grava o ID (string) no formulário — o
// CategorySelect entrega { target: { value } } e o objeto ia parar no contrato ("[object Object]").
const criarContrato = vi.fn(async (dados) => ({ ...dados, id: 'k1' }))
const app = {
  profiles: [{ id: 'pf', name: 'Pessoal' }],
  accounts: [
    { id: 'cc1', name: 'Itaú', type: 'checking', profileId: 'pf' },
    { id: 'bem-x', name: 'Imóvel Exemplo', type: 'asset', tipoBem: 'bem_imobilizado' },
  ],
  categories: [
    { id: 'cat-mor', name: 'Moradia', type: 'expense' },
    { id: 'cat-alug', name: 'Aluguel', type: 'expense' },
    { id: 'cat-cond', name: 'Condomínio', type: 'expense' },
    { id: 'cat-rec', name: 'Moradia', type: 'income' },
  ],
  payees: [], costCenters: [], tiposDocumento: [], activeProfileId: 'pf', schedules: [], categoryGroupOrder: null,
  criarContrato, atualizarContrato: vi.fn(), salvarItensContrato: vi.fn(), carregarIndice: vi.fn(async () => null),
  indicesContratos: {}, planejarParcelasContrato: vi.fn(), aplicarParcelasContrato: vi.fn(),
  vincularEGerarContrato: vi.fn(async () => ({})),
}
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))

const { default: ContratoWizard } = await import('./ContratoWizard.jsx')

const campo = (rotulo) => screen.getByText(rotulo, { selector: 'label' }).parentElement
const gatilho = (rotulo) => within(campo(rotulo)).getByRole('button', { expanded: false })
const avancar = () => fireEvent.click(screen.getByRole('button', { name: /Avançar/ }))
const modalidade = (m) => fireEvent.change(campo('Modalidade').querySelector('select'), { target: { value: m } })
const preencher = (rotulo, valor) => fireEvent.change(within(campo(rotulo)).getAllByRole('textbox')[0] || campo(rotulo).querySelector('input'), { target: { value: valor } })

// Limpa no "×" e escolhe outra categoria clicando na lista (o gatilho mostra o rótulo escolhido).
function trocarCategoria(rotulo, nova) {
  const g = gatilho(rotulo)
  expect(g.textContent).toContain('Moradia')
  fireEvent.mouseDown(g.querySelector('[aria-hidden="true"]'))
  expect(gatilho(rotulo).textContent).toContain('Sem categoria')
  fireEvent.click(gatilho(rotulo))
  const opcao = screen.getAllByRole('button').find(b => b.hasAttribute('data-item') && b.textContent === nova)
  fireEvent.mouseDown(opcao)
  fireEvent.click(opcao)
  expect(gatilho(rotulo).textContent).toContain(nova)
}

afterEach(() => { cleanup(); criarContrato.mockClear() })

describe('ContratoWizard — categorias', () => {
  it('aluguel e condomínio: limpar, abrir a lista e clicar grava o id escolhido', async () => {
    render(<ContratoWizard onClose={() => {}} onSalvo={() => {}} />)
    modalidade('aluguel')
    fireEvent.change(screen.getByPlaceholderText('Digite o nome do favorecido'), { target: { value: 'Imob Silva' } })
    fireEvent.change(campo('Fim da vigência').querySelector('input'), { target: { value: '2028-06-30' } })
    avancar()

    fireEvent.change(campo('Conta de pagamento').querySelector('select'), { target: { value: 'cc1' } })
    preencher('Valor do aluguel (contratual)', '3.900,00')
    fireEvent.change(campo('Dia de vencimento').querySelector('input'), { target: { value: '15' } })
    trocarCategoria('Categoria do aluguel', 'Aluguel')
    avancar()
    avancar()

    fireEvent.click(screen.getByText(/Tem condomínio/))
    preencher('Valor previsto', '1.300,00')
    trocarCategoria('Categoria do condomínio', 'Condomínio')
    avancar()

    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }))
    await vi.waitFor(() => expect(criarContrato).toHaveBeenCalled())
    const [dados] = criarContrato.mock.calls[0]
    expect(dados.categoria_id).toBe('cat-alug')
    expect(dados.categoria_condominio_id).toBe('cat-cond')
  })

  it('sugere "Moradia" nas duas categorias', () => {
    render(<ContratoWizard onClose={() => {}} onSalvo={() => {}} />)
    modalidade('aluguel')
    fireEvent.change(screen.getByPlaceholderText('Digite o nome do favorecido'), { target: { value: 'Imob Silva' } })
    fireEvent.click(screen.getByLabelText(/Sem data de fim/))
    avancar()
    expect(gatilho('Categoria do aluguel').textContent).toContain('Moradia')
  })
})

describe('ContratoWizard — contrato que não é aluguel', () => {
  it('prestação de serviço: sem etapa de imóvel, sem categoria sugerida, sem reajuste, rótulos de "parcela"', async () => {
    render(<ContratoWizard onClose={() => {}} onSalvo={() => {}} />)
    // Sem modalidade não avança.
    avancar()
    expect(screen.getByText('Escolha a modalidade do contrato.')).toBeTruthy()
    modalidade('servico')
    expect(screen.queryByText(/Imóvel e condomínio/)).toBeNull()
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['1. Dados', '2. Valores', '3. Reajuste', '4. Prévia'])
    expect(within(campo('Tipo')).getAllByRole('option').map(o => o.textContent)).toEqual(['A pagar', 'A receber'])
    fireEvent.change(screen.getByPlaceholderText('Digite o nome do favorecido'), { target: { value: 'Oficina Bom Motor' } })
    fireEvent.click(screen.getByLabelText(/Sem data de fim/))
    avancar()

    expect(gatilho('Categoria').textContent).toContain('Sem categoria')
    fireEvent.change(campo('Conta de pagamento').querySelector('select'), { target: { value: 'cc1' } })
    preencher('Valor da parcela', '800,00')
    fireEvent.change(campo('Dia de vencimento').querySelector('input'), { target: { value: '5' } })
    fireEvent.click(gatilho('Categoria'))
    const opcao = screen.getAllByRole('button').find(b => b.hasAttribute('data-item') && b.textContent === 'Aluguel')
    fireEvent.mouseDown(opcao)
    fireEvent.click(opcao)
    expect(screen.getByText('Desconto temporário por mês (desconto)')).toBeTruthy()
    avancar()
    expect(campo('Índice de reajuste').querySelector('select').value).toBe('NENHUM')
    avancar()
    expect(screen.getByRole('button', { name: /Confirmar/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }))
    await vi.waitFor(() => expect(criarContrato).toHaveBeenCalled())
    const [dados, itens] = criarContrato.mock.calls[0]
    expect(dados).toMatchObject({
      modalidade: 'servico', tipo_imovel: null, tem_condominio: false, valor_condominio_previsto: null, favorecido_condominio: null,
      indice_reajuste: 'NENHUM', meses_sem_cobranca: [], credito_abatimento: 'mes_seguinte', categoria_id: 'cat-alug',
    })
    expect(itens).toEqual([])
  })
})

describe('ContratoWizard — aluguel a receber por administradora', () => {
  it('repasse: administradora, inquilino, dia do repasse, 1º mês proporcional, saldo inicial e bem', async () => {
    render(<ContratoWizard onClose={() => {}} onSalvo={() => {}} />)
    modalidade('aluguel')
    fireEvent.change(campo('Tipo').querySelector('select'), { target: { value: 'receber' } })
    fireEvent.click(screen.getByText(/Recebo por uma administradora/))
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toContain('4. Imóvel')
    fireEvent.change(screen.getByPlaceholderText('Digite o nome do favorecido'), { target: { value: 'Administradora Exemplo' } })
    fireEvent.change(screen.getByPlaceholderText('Nome do inquilino (opcional)'), { target: { value: 'Inquilino Exemplo' } })
    fireEvent.change(campo('Início da vigência').querySelector('input'), { target: { value: '2026-03-10' } })
    fireEvent.click(screen.getByLabelText(/Sem data de fim/))
    avancar()

    fireEvent.change(campo('Conta de recebimento').querySelector('select'), { target: { value: 'cc1' } })
    preencher('Valor do aluguel (contratual)', '3.000,00')
    fireEvent.change(campo('Dia de vencimento do inquilino').querySelector('input'), { target: { value: '5' } })
    // Sem o dia do repasse não avança.
    avancar()
    expect(screen.getByText('Dia do repasse entre 1 e 31.')).toBeTruthy()
    fireEvent.change(campo('Dia do repasse').querySelector('input'), { target: { value: '12' } })
    expect(screen.getByText(/aluguel de 03\/2026 → repasse em 12\/04\/2026/)).toBeTruthy()
    expect(screen.getByText(/proporcional de 22 dias/)).toBeTruthy()
    expect(campo('Periodicidade').querySelector('select').disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Sentido do saldo inicial'), { target: { value: 'devedor' } })
    fireEvent.change(screen.getByLabelText('Valor do saldo inicial'), { target: { value: '150,50' } })
    avancar()
    expect(screen.getByText('Informe a competência do saldo inicial.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Competência do saldo inicial'), { target: { value: '2026-03' } })
    avancar()
    avancar()

    expect(screen.queryByText(/Tem condomínio/)).toBeNull()
    fireEvent.change(campo('Bem do Patrimônio (opcional)').querySelector('select'), { target: { value: 'bem-x' } })
    avancar()
    fireEvent.change(campo('Gerar repasses a partir da competência').querySelector('input'), { target: { value: '2026-03' } })
    expect(screen.getByText('Repasse 03/2026')).toBeTruthy()
    // 1º mês proporcional 2.200,00 com o saldo inicial de −150,50 (eu devo): repasse 2.049,50.
    expect(screen.getByText('R$ 2.049,50')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }))
    await vi.waitFor(() => expect(criarContrato).toHaveBeenCalled())
    const [dados, itens] = criarContrato.mock.calls[0]
    expect(dados).toMatchObject({
      tipo: 'receber', modo_repasse: true, favorecido: 'Administradora Exemplo', contraparte_nome: 'Inquilino Exemplo',
      dia_vencimento: 5, dia_repasse: 12, repasse_meses_depois: 1, valor_primeiro_mes: null, periodicidade: 'mensal',
      saldo_inicial_adm: -150.5, saldo_inicial_competencia: '2026-03', bem_id: 'bem-x', tem_condominio: false,
    })
    expect(itens).toEqual([])
  })

  it('banco sem a migração do repasse: a opção não aparece', () => {
    app.recursosBanco = { contratoRepasse: false }
    try {
      render(<ContratoWizard onClose={() => {}} onSalvo={() => {}} />)
      modalidade('aluguel')
      fireEvent.change(campo('Tipo').querySelector('select'), { target: { value: 'receber' } })
      expect(screen.queryByText(/Recebo por uma administradora/)).toBeNull()
    } finally {
      app.recursosBanco = null
    }
  })

  it('a receber sem administradora e a pagar ficam como antes (campos neutros)', async () => {
    render(<ContratoWizard onClose={() => {}} onSalvo={() => {}} />)
    modalidade('aluguel')
    fireEvent.change(campo('Tipo').querySelector('select'), { target: { value: 'receber' } })
    fireEvent.click(screen.getByText(/Recebo por uma administradora/))
    // Volta para "a pagar": o repasse desliga.
    fireEvent.change(campo('Tipo').querySelector('select'), { target: { value: 'pagar' } })
    expect(screen.queryByText(/Recebo por uma administradora/)).toBeNull()
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toContain('4. Imóvel e condomínio')
  })
})
