// @vitest-environment jsdom
// Composição do recibo do ALUGUEL na tela: leitura simulada de PDF (débito/crédito; "PAGAMENTO
// EFETUADO" e totais ignorados), reconhecimento, ligação com o crédito, soma divergente bloqueando,
// e a mesma composição aberta por Agendamentos (botão) e pela ficha (mesmo pedido ao host).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { gerarPlanoParcelas, planejarSincronizacao, idParcela } from '../../lib/contratos/parcelas.js'

const app = vi.hoisted(() => ({}))
const ia = vi.hoisted(() => ({ pedidos: [], resposta: null }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/assistenteApi.js', () => ({ interpretar: async (p) => { ia.pedidos.push(p); return ia.resposta } }))
const { default: ComposicaoParcelaHost } = await import('./ComposicaoParcelaHost.jsx')
const { default: BotaoComposicaoParcela } = await import('./BotaoComposicaoParcela.jsx')
const { default: EncargosNaParcela } = await import('./EncargosNaParcela.jsx')
const { formParaEncargo } = await import('../../lib/contratos/encargosForm.js')
const { normalizarSaidaRecibo } = await import('../../../api/_leituraBoleto.js')

const C = {
  id: 'c1', tipo: 'pagar', modalidade: 'aluguel', objeto: 'Apto', favorecido: 'Imob', status: 'ativo',
  data_inicio: '2026-09-20', data_fim: '2029-08-20', valor_base: 3900, periodicidade: 'mensal', dia_vencimento: 20,
  indice_reajuste: 'NENHUM', bonificacao_valor: 200, bonificacao_meses: 12, tem_condominio: false, credito_abatimento: 'proximo_pendente',
  encargos: [{ id: 'e_seg', descricao: 'Seguro incêndio', sinal: 'encargo', valor: 49.06, parcelas_total: 36, parcela_inicio: 1, ativo: true }],
}
const PARCELAS = planejarSincronizacao(C, [], gerarPlanoParcelas(C, { hoje: '2026-11-04', apartirDe: '2026-11' })).criar
const NOV = PARCELAS.find(s => s.id === idParcela('c1', 'aluguel', '2026-11'))
const CREDITO = { id: 'k_set', contrato_id: 'c1', status: 'aberto', valor: 79.14, data_origem: '2026-09-10', descricao: 'fundo de reserva', itens: [{ desc: 'fundo de reserva', valor: 79.14 }] }
const PDF_LIDO = normalizarSaidaRecibo({
  referencia: '11/2026', vencimento: '2026-11-20', valor_pago: null,
  itens: [
    { descricao: 'ALUGUEL', valor: 3900, natureza: 'debito' }, { descricao: 'BONIFICAÇÃO', valor: 200, natureza: 'credito' },
    { descricao: 'SEGURO INCENDIO 3/36', valor: 49.06, natureza: 'debito' }, { descricao: 'FUNDO DE RESERVA', valor: 79.14, natureza: 'credito' },
    { descricao: 'TOTAL', valor: 3669.92, natureza: 'debito' }, { descricao: 'PAGAMENTO EFETUADO', valor: 3669.92, natureza: 'credito' },
  ],
})

vi.setConfig({ testTimeout: 20000 })
afterEach(() => { cleanup(); ia.pedidos = []; vi.clearAllMocks() })
const base = (o = {}) => Object.assign(app, {
  contratosHabilitado: true, contratoPorId: () => C, schedules: PARCELAS, transactions: [], creditosContratos: [CREDITO],
  regrasContratos: [], pode: () => true, fecharComposicaoParcela: vi.fn(), abrirComposicaoParcela: vi.fn(),
  informarReciboAluguel: vi.fn(async () => ({ ok: true })), ...o,
})

describe('Recibo do aluguel — tela', () => {
  it('PDF (mock): lê débito/crédito, ignora total e "PAGAMENTO EFETUADO", reconhece itens e liga o crédito; confirma 3.669,92', async () => {
    base({ pedidoComposicaoParcela: { parcelaId: NOV.id } })
    ia.resposta = { leitura: PDF_LIDO }
    render(<ComposicaoParcelaHost />)
    expect(screen.getByText('Composição do recibo do aluguel')).toBeTruthy()
    fireEvent.change(screen.getByTestId('recibo-arquivo'), { target: { files: [new File(['%PDF-1.4'], 'recibo.pdf', { type: 'application/pdf' })] } })
    await vi.waitFor(() => expect(screen.getByTestId('leitura-recibo')).toBeTruthy())
    expect(ia.pedidos[0]).toMatchObject({ leitura: 'recibo_aluguel', mimeType: 'application/pdf' })
    const linhas = screen.getAllByTestId('item-recibo')
    expect(linhas).toHaveLength(4)
    const tipo = (i) => within(linhas[i]).getByLabelText('Tipo do item').value
    expect([tipo(0), tipo(1), tipo(2), tipo(3)]).toEqual(['base', 'bonificacao', 'encargo', 'credito'])
    expect(within(linhas[3]).getByLabelText('Crédito do proprietário').value).toBe('k_set')
    expect(screen.getByTestId('soma-recibo').textContent).toMatch(/3\.669,92/)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar composição' }))
    await vi.waitFor(() => expect(app.informarReciboAluguel).toHaveBeenCalled())
    const [, dados] = app.informarReciboAluguel.mock.calls[0]
    expect(dados).toMatchObject({ parcelaId: NOV.id, tx: null, total: 3669.92 })
    expect(dados.itens.find(i => i.tipo === 'credito')).toMatchObject({ credito_id: 'k_set', valor: -79.14 })
  })

  it('parcela paga: soma tem de dar o valor pago — divergente bloqueia o Confirmar', async () => {
    const tx = { id: 'tx1', amount: 3278.44, date: '2026-11-19', contratoId: 'c1' }
    const paga = { ...NOV, registered: [NOV.startDate], registeredMeta: { [NOV.startDate]: { lancamento_id: 'tx1' } } }
    base({ pedidoComposicaoParcela: { parcelaId: NOV.id, txId: 'tx1' }, schedules: PARCELAS.map(s => (s.id === NOV.id ? paga : s)), transactions: [tx] })
    ia.resposta = { leitura: PDF_LIDO }
    render(<ComposicaoParcelaHost />)
    fireEvent.change(screen.getByTestId('recibo-arquivo'), { target: { files: [new File(['%PDF'], 'r.pdf', { type: 'application/pdf' })] } })
    await vi.waitFor(() => expect(screen.getByTestId('leitura-recibo')).toBeTruthy())
    expect(screen.getByTestId('pendencia-recibo').textContent).toMatch(/precisa ser igual/)
    expect(screen.getByRole('button', { name: 'Confirmar composição' }).disabled).toBe(true)
    expect(screen.getByText(/O lançamento não muda/)).toBeTruthy()
  })

  it('Agendamentos e ficha abrem a MESMA composição: o botão pede o host com o id da parcela (pendente e paga)', () => {
    base()
    render(<BotaoComposicaoParcela schedule={NOV} />)
    fireEvent.click(screen.getByRole('button', { name: /Informar composição/ }))
    expect(app.abrirComposicaoParcela).toHaveBeenCalledWith(NOV.id, {})
    cleanup()
    const paga = { ...NOV, registered: [NOV.startDate] }
    base({ transactions: [{ id: 'tx1', amount: 3700 }] })
    render(<BotaoComposicaoParcela schedule={paga} txId="tx1" />)
    fireEvent.click(screen.getByRole('button', { name: /Informar composição/ }))
    expect(app.abrirComposicaoParcela).toHaveBeenCalledWith(NOV.id, { txId: 'tx1' })
  })
})

describe('Encargos e descontos na parcela (cadastro)', () => {
  it('contrato em andamento: "na próxima parcela pendente (nº 4) está na 3 de 36" → começa na 2', () => {
    const onChange = vi.fn()
    const linha = { id: null, descricao: 'Seguro incêndio', sinal: 'encargo', valor: '49,06', parcelas_total: '36', modo: 'atual', parcela_inicio: '', parcela_atual: '3' }
    render(<EncargosNaParcela linhas={[linha]} onChange={onChange} proxima={4} />)
    expect(screen.getByText(/Na parcela 4: Seguro incêndio 3\/36 \+R\$\s*49,06/)).toBeTruthy()
    expect(formParaEncargo(linha, 4)).toMatchObject({ parcela_inicio: 2, parcelas_total: 36, valor: 49.06, sinal: 'encargo' })
    fireEvent.click(screen.getByRole('button', { name: /Encargo ou desconto/ }))
    expect(onChange).toHaveBeenCalledWith([linha, expect.objectContaining({ parcela_inicio: '4', modo: 'inicio' })])
  })
})
