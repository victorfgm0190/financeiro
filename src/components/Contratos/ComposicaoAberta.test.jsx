// @vitest-environment jsdom
// Composição do boleto em parcela ABERTA: leitura simulada (mock) de FOTO e de PDF pelo Assistente,
// soma certa e soma divergente (não confirma sem ajuste), prévia do crédito previsto, e as duas
// entradas (Agendamentos e ficha) abrindo o MESMO modal pelo mesmo pedido.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { gerarPlanoParcelas, planejarSincronizacao, idParcela } from '../../lib/contratos/parcelas.js'

const app = vi.hoisted(() => ({}))
const ia = vi.hoisted(() => ({ pedidos: [], resposta: null }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/assistenteApi.js', () => ({ interpretar: async (p) => { ia.pedidos.push(p); return ia.resposta } }))
vi.mock('../../lib/assistente.js', async (orig) => ({
  ...(await orig()),
  comprimirImagem: async () => ({ base64: 'IMAGEM_REDUZIDA', mimeType: 'image/jpeg' }),
}))
const { default: ComposicaoBoletoModal } = await import('./ComposicaoBoletoModal.jsx')
const { default: ComposicaoParcelaHost } = await import('./ComposicaoParcelaHost.jsx')
const { default: BotaoComposicaoParcela } = await import('./BotaoComposicaoParcela.jsx')

const C = {
  id: 'c1', tipo: 'pagar', modalidade: 'aluguel', objeto: 'Apto', favorecido: 'Imob Lar', status: 'ativo',
  data_inicio: '2026-09-15', data_fim: '2028-08-31', valor_base: 3900, periodicidade: 'mensal', dia_vencimento: 15,
  indice_reajuste: 'NENHUM', bonificacao_valor: 200, bonificacao_meses: 12, tem_condominio: true, valor_condominio_previsto: 1300,
  dia_vencimento_condominio: 5, favorecido_condominio: 'Cond Ed Sol', conta_id: 'cc', categoria_id: 'cat', credito_abatimento: 'mes_seguinte',
}
const PARCELAS = planejarSincronizacao(C, [], gerarPlanoParcelas(C, { hoje: '2026-11-04', apartirDe: '2026-11' })).criar
const COND = PARCELAS.find(s => s.id === idParcela('c1', 'condominio', '2026-11'))
const REGRAS = [{ id: 'g1', contrato_id: null, padrao: 'fundo de reserva', tipo_match: 'comeca_com', responsavel: 'proprietario' }]
const LEITURA = (total = 1290) => ({
  leitura: {
    vencimento: '2026-11-05', total, beneficiario: 'Cond Ed Sol',
    itens: [{ desc: 'Taxa de condomínio', valor: 900 }, { desc: 'Água', valor: 100 }, { desc: 'Fundo de reserva', valor: 90 }, { desc: 'Taxas', valor: 200 }],
  },
})

vi.setConfig({ testTimeout: 20000 })
afterEach(() => { cleanup(); ia.pedidos = []; vi.clearAllMocks() })
const base = (o = {}) => Object.assign(app, {
  regrasContratos: REGRAS, schedules: PARCELAS, transactions: [], creditosContratos: [], contratosHabilitado: true,
  contratoPorId: () => C, pode: () => true, ...o,
})
const abrirModal = (props = {}) => {
  const onConfirmar = vi.fn(async () => {})
  render(<ComposicaoBoletoModal contrato={C} parcela={COND} modo="aberta" onConfirmar={onConfirmar} onClose={() => {}} {...props} />)
  return onConfirmar
}
const enviarArquivo = (testId, arquivo) => fireEvent.change(screen.getByTestId(testId), { target: { files: [arquivo] } })
const confirmar = () => screen.getByRole('button', { name: 'Confirmar composição' })

describe('Composição do boleto — parcela aberta', () => {
  it('foto (mock): lê vencimento/total/itens, classifica pelas regras, mostra a prévia do crédito previsto e confirma 1.290', async () => {
    base()
    ia.resposta = LEITURA()
    const onConfirmar = abrirModal()
    enviarArquivo('foto-camera', new File(['x'], 'boleto.jpg', { type: 'image/jpeg' }))
    await vi.waitFor(() => expect(screen.getByTestId('leitura-boleto')).toBeTruthy())
    expect(ia.pedidos[0]).toMatchObject({ leitura: 'boleto_condominio', imagemBase64: 'IMAGEM_REDUZIDA', mimeType: 'image/jpeg' })
    expect(screen.getByTestId('leitura-boleto').textContent).toMatch(/05\/11\/2026.*1\.290,00.*4 item/)
    // "Fundo de reserva" casou a regra; os outros pedem "De quem é?".
    expect(screen.getAllByText(/Sem regra — de quem é\?/)).toHaveLength(3)
    expect(confirmar().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Itens sem regra são do inquilino' }))
    expect(screen.getByTestId('previa-abatimento').textContent).toMatch(/90,00.*15\/12\/2026.*3\.700,00.*3\.610,00/)
    expect(confirmar().disabled).toBe(false)
    fireEvent.click(confirmar())
    await vi.waitFor(() => expect(onConfirmar).toHaveBeenCalled())
    expect(onConfirmar.mock.calls[0][0].composicao).toMatchObject({ total: 1290, proprietario: 90, inquilino: 1200 })
  })

  it('PDF (mock): vai inteiro como application/pdf; soma divergente do total não confirma sem o item de diferença', async () => {
    base()
    ia.resposta = LEITURA(1300) // boleto diz 1.300, itens somam 1.290
    const onConfirmar = abrirModal()
    enviarArquivo('foto-arquivo', new File(['%PDF-1.4 /Type /Page'], 'boleto.pdf', { type: 'application/pdf' }))
    await vi.waitFor(() => expect(screen.getByTestId('leitura-boleto')).toBeTruthy())
    expect(ia.pedidos[0].mimeType).toBe('application/pdf')
    fireEvent.click(screen.getByRole('button', { name: 'Itens sem regra são do inquilino' }))
    expect(screen.getByTestId('diferenca').textContent).toMatch(/10,00/)
    expect(screen.getByText(/precisa ser igual ao total do boleto/)).toBeTruthy()
    expect(confirmar().disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Criar item "Diferença\/arredondamento" \(R\$\s*10,00\)/ }))
    expect(confirmar().disabled).toBe(false)
    fireEvent.click(confirmar())
    await vi.waitFor(() => expect(onConfirmar).toHaveBeenCalled())
    expect(onConfirmar.mock.calls[0][0].composicao.total).toBe(1300)
  })

  it('leitura que não acha itens: avisa e nada é preenchido nem gravado', async () => {
    base()
    ia.resposta = { leitura: { vencimento: null, total: null, itens: [] } }
    const onConfirmar = abrirModal()
    enviarArquivo('foto-arquivo', new File(['x'], 'b.png', { type: 'image/png' }))
    await vi.waitFor(() => expect(screen.getByText(/Não consegui ler os itens do boleto/)).toBeTruthy())
    expect(confirmar().disabled).toBe(true)
    expect(onConfirmar).not.toHaveBeenCalled()
  })

  it('digitando: sem total do boleto, o total é a soma; com total, tem de fechar', () => {
    base()
    abrirModal({ leituraInicial: null, composicaoInicial: { itens: [{ desc: 'Taxa', valor: 1000, responsavel: 'inquilino' }] } })
    expect(confirmar().disabled).toBe(false)
    fireEvent.change(screen.getByPlaceholderText('Valor a pagar do boleto'), { target: { value: '1.050,00' } })
    expect(confirmar().disabled).toBe(true)
  })

  it('crédito já abatido: a prévia avisa antes de confirmar', () => {
    base({ creditosContratos: [{ id: 'k', contrato_id: 'c1', origem_agendamento_id: COND.id, status: 'compensado', valor: 90 }] })
    abrirModal({ composicaoInicial: { itens: [{ desc: 'Fundo de reserva', valor: 80, responsavel: 'proprietario' }] } })
    expect(screen.getByTestId('previa-abatimento').textContent).toMatch(/já foi abatido/)
  })
})

describe('Agendamentos e ficha abrem o mesmo modal e gravam no mesmo lugar', () => {
  it('o botão da ocorrência pendente pede a mesma parcela que a ficha; o host grava por informarComposicaoAberta', async () => {
    const abrir = vi.fn()
    base({ abrirComposicaoParcela: abrir })
    render(<BotaoComposicaoParcela schedule={COND} />)
    fireEvent.click(screen.getByRole('button', { name: /Informar composição/ }))
    expect(abrir).toHaveBeenCalledWith(COND.id, {})
    cleanup()

    const informar = vi.fn(async () => ({ ok: true }))
    base({ pedidoComposicaoParcela: { parcelaId: COND.id }, fecharComposicaoParcela: vi.fn(), informarComposicaoAberta: informar })
    ia.resposta = LEITURA()
    render(<ComposicaoParcelaHost />)
    expect(screen.getByText(/parcela de 05\/11\/2026 \(pendente\)/)).toBeTruthy()
    enviarArquivo('foto-arquivo', new File(['x'], 'b.jpg', { type: 'image/jpeg' }))
    await vi.waitFor(() => expect(screen.getByTestId('leitura-boleto')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Itens sem regra são do inquilino' }))
    fireEvent.click(confirmar())
    await vi.waitFor(() => expect(informar).toHaveBeenCalled())
    expect(informar.mock.calls[0][0]).toBe(C)
    expect(informar.mock.calls[0][1]).toBe(COND.id)
    expect(informar.mock.calls[0][2].itens.map(i => i.valor)).toEqual([900, 100, 90, 200])
  })

  it('host: crédito abatido com valor novo → pergunta e grava com a decisão escolhida', async () => {
    const informar = vi.fn(async (_c, _p, { decisao }) => (decisao ? { ok: true } : { ok: false, conflito: { acao: 'conflito', id: 'k', abatido: 90, novo: 100 } }))
    const fechar = vi.fn()
    base({
      pedidoComposicaoParcela: { parcelaId: COND.id }, fecharComposicaoParcela: fechar, informarComposicaoAberta: informar,
      creditosContratos: [{ id: 'k', contrato_id: 'c1', status: 'compensado', valor: 90, data_compensacao: '2026-11-20' }],
    })
    render(<ComposicaoParcelaHost />)
    fireEvent.click(screen.getByRole('button', { name: 'Digitar itens' }))
    fireEvent.click(screen.getByRole('button', { name: 'Item' }))
    fireEvent.change(screen.getByPlaceholderText('Descrição do item'), { target: { value: 'Fundo de reserva' } })
    fireEvent.change(screen.getByPlaceholderText('Valor do item'), { target: { value: '100,00' } })
    fireEvent.click(confirmar())
    await vi.waitFor(() => expect(screen.getByText(/já foi abatido no aluguel pago em 20\/11\/2026/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /criar crédito de R\$\s*10,00/ }))
    await vi.waitFor(() => expect(informar).toHaveBeenCalledTimes(2))
    expect(informar.mock.calls[1][2].decisao).toBe('complementar')
    expect(fechar).toHaveBeenCalled()
  })
})
