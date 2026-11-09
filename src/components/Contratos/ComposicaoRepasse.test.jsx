// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'

// Dados fictícios. Contrato do caso de referência (aluguel 2.200, adm 10%, início 21/02/2026).
const CONTRATO = {
  id: 'c9', tipo: 'receber', modalidade: 'aluguel', modo_repasse: true, objeto: 'Imóvel Exemplo', favorecido: 'Administradora Exemplo',
  data_inicio: '2026-02-21', data_fim: '2026-09-30', valor_base: 2200, periodicidade: 'mensal', dia_vencimento: 5, dia_repasse: 10,
  repasse_meses_depois: 1, indice_reajuste: 'NENHUM', bonificacao_valor: 0, bonificacao_meses: 0, categoria_id: 'cat-alug',
  taxa_adm_pct: 10, taxa_adm_base: 'bruto', categoria_taxa_adm_id: 'cat-adm', perfil_id: 'pf',
  itens_repasse: [{ id: 'tu', tipo_repasse: 'taxa_unica', descricao: 'Intermediação', valor: 2200, valores_parcelas: [470, 865, 865], vigencia_inicio: '2026-02', ativo: true }],
  competencias: [{ competencia: '2026-02', status: 'aberta', itens: [
    { chave: 'adm', tipo: 'taxa_adm', origem: 'auto', informado: true, valor: -11.67, dedutivel_ir: true },
    { chave: 'm:x', tipo: 'despesa', natureza: 'iptu', descricao: 'IPTU', valor: -200, origem: 'manual', dedutivel_ir: true },
  ] }],
}
const salvarCompetenciaRepasse = vi.fn(async () => ({}))
const registerScheduleOccurrence = vi.fn()
const app = {
  categories: [{ id: 'cat-adm', name: 'Taxas', type: 'expense' }, { id: 'cat-alug', name: 'Aluguel', type: 'income' }],
  indicesContratos: {}, schedules: [], transactions: [], accounts: [], salvarCompetenciaRepasse, pode: () => true, registerScheduleOccurrence,
  activeProfileId: 'pf', categoryGroupOrder: null,
}
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))

const { default: ComposicaoRepasseModal } = await import('./ComposicaoRepasseModal.jsx')
const { default: TabelaRepasse } = await import('./TabelaRepasse.jsx')

// Valor em destaque ao lado do rótulo do resumo ("Resultado do mês", "Repasse"…).
const valorDe = (rotulo) => screen.getAllByText(rotulo, { exact: false }).find(n => n.tagName === 'P' && n.textContent.startsWith(rotulo)).querySelector('strong').textContent.replace(/\u00a0/g, ' ')

afterEach(() => { cleanup(); salvarCompetenciaRepasse.mockClear(); registerScheduleOccurrence.mockClear(); app.schedules = [] })

describe('composição do repasse', () => {
  it('tabela por competência: saldos negativos sem repasse, 1º repasse em 06', () => {
    render(<TabelaRepasse contrato={CONTRATO} />)
    const linha = (ym) => screen.getByText(ym).closest('tr')
    expect(within(linha('02/2026')).getByText('Sem repasse — saldo transportado')).toBeTruthy()
    expect(within(linha('02/2026')).getByText('R$ 586,67')).toBeTruthy()
    // 02: 586,67 − 11,67 − 470 − 200 = −95,00 → 03: −95 + 2.200 − 220 − 865 = 1.020,00 (1º repasse)
    expect(within(linha('02/2026')).getAllByText('-R$ 95,00').length).toBe(2)
    expect(within(linha('03/2026')).getAllByText('R$ 1.020,00').length).toBe(2)
    // Repasse de 10/04/2026 já passou e não há lançamento na conta: não cria recebimento sozinho.
    expect(within(linha('03/2026')).getByText('Pendente — não encontrado na conta')).toBeTruthy()
  })

  it('modal: taxa informada mostra o calculado; despesa incluída entra no resultado e é gravada', async () => {
    render(<ComposicaoRepasseModal contrato={CONTRATO} competencia="2026-02" onClose={() => {}} />)
    expect(screen.getByText(/calculado R\$ 58,67/)).toBeTruthy()
    expect(screen.getByText('R$ 586,67')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Despesa do proprietário/ }))
    fireEvent.change(screen.getAllByLabelText('Descrição do item').at(-1), { target: { value: 'Água' } })
    fireEvent.change(screen.getByLabelText('Valor de Água'), { target: { value: '96,73' } })
    // 586,67 − 11,67 − 470 − 200 − 96,73 = −191,73
    expect(valorDe('Resultado do mês')).toBe('-R$ 191,73')
    expect(valorDe('Repasse')).toBe('Sem repasse — saldo transportado')
    fireEvent.click(screen.getByRole('button', { name: 'Gravar' }))
    await vi.waitFor(() => expect(salvarCompetenciaRepasse).toHaveBeenCalled())
    const [id, comp] = salvarCompetenciaRepasse.mock.calls[0]
    expect(id).toBe('c9')
    expect(comp.competencia).toBe('2026-02')
    expect(comp.itens.map(i => [i.tipo, i.valor, i.origem])).toEqual([
      ['aluguel', 586.67, 'auto'], ['taxa_adm', -11.67, 'auto'], ['taxa_unica', -470, 'auto'], ['despesa', -200, 'manual'], ['despesa', -96.73, 'manual'],
    ])
    expect(comp.itens[1]).toMatchObject({ informado: true, valor_calculado: -58.67 })
  })

  it('voltar ao calculado desfaz o valor informado', () => {
    render(<ComposicaoRepasseModal contrato={CONTRATO} competencia="2026-02" onClose={() => {}} />)
    fireEvent.click(screen.getByText(/calculado R\$ 58,67/))
    expect(screen.queryByText(/calculado R\$ 58,67/)).toBeNull()
    // 586,67 − 58,67 − 470 − 200 = −142,00
    expect(valorDe('Resultado do mês')).toBe('-R$ 142,00')
  })
})

describe('Etapa 4 — registrar pelo contrato', () => {
  const PARCELA = {
    id: 'ctr_c9_aluguel_202603', contratoId: 'c9', contratoPapel: 'aluguel', startDate: '2026-04-10', amount: 1020,
    registered: [], registeredMeta: {}, composicao: { tipo: 'repasse', competencia: '2026-03' },
  }
  it('mesmo efeito do Agendamento: registerScheduleOccurrence com data e valor que caiu na conta', () => {
    app.schedules = [PARCELA]
    render(<ComposicaoRepasseModal contrato={CONTRATO} competencia="2026-03" onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Valor recebido'), { target: { value: '1.009,35' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar recebimento' }))
    expect(registerScheduleOccurrence).toHaveBeenCalledWith('ctr_c9_aluguel_202603', '2026-04-10', '2026-04-10', 1009.35)
  })

  it('com a composição alterada e não gravada, pede para gravar antes', () => {
    app.schedules = [PARCELA]
    render(<ComposicaoRepasseModal contrato={CONTRATO} competencia="2026-03" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Despesa do proprietário/ }))
    expect(screen.getByRole('button', { name: 'Registrar recebimento' }).disabled).toBe(true)
    expect(screen.getByText('Grave a composição antes de registrar o recebimento.')).toBeTruthy()
  })

  it('benfeitoria marcada sem bem ligado: avisa', () => {
    render(<ComposicaoRepasseModal contrato={CONTRATO} competencia="2026-03" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Benfeitoria/ }))
    fireEvent.click(screen.getByLabelText('Somar ao custo do bem'))
    expect(screen.getByText('Ligue um bem ao contrato para somar ao custo')).toBeTruthy()
  })
})

describe('Preenchimento Guiado na composição', () => {
  it('todo campo visível tem passo no guia', async () => {
    const { controlesSemPasso } = await import('../../help/guiaPreenchimento.js')
    render(<ComposicaoRepasseModal contrato={CONTRATO} competencia="2026-02" onClose={() => {}} />)
    const raiz = document.querySelector('[data-help-form="repasseComposicao"]')
    expect(controlesSemPasso(raiz).map(c => c.outerHTML.slice(0, 160))).toEqual([])
  })
})
