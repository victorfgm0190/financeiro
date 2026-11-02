// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { computeOccurrences } from '../../lib/occurrences'

// Consulta propositiva: resposta + filtro usado + "Também encontrei" + refinamentos que NÃO chamam a
// IA; pergunta quando o nome é ambíguo; continuação "e no mês passado?" no Assistente. FICTÍCIO.
const app = vi.hoisted(() => ({}))
const api = vi.hoisted(() => ({ interpretar: vi.fn() }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/saldos', () => ({ hojeStr: () => '2026-11-02' }))
vi.mock('../../hooks/useDespesasPorCategoria', () => ({ useModoDespesas: () => ['cheio', () => {}] }))
vi.mock('../../lib/assistenteApi', () => ({ interpretar: (...a) => api.interpretar(...a) }))
const { default: ConsultaMovimentos, GastosOuConsulta } = await import('./ConsultaMovimentos.jsx')
const { default: Assistente } = await import('./Assistente.jsx')
const { ABRIR_AGENDAMENTOS_FILTRO_KEY, ABRIR_BUSCA_KEY } = await import('../../lib/abrirTela')

const tx = (id, date, amount, extra = {}) => ({ id, date, amount, type: 'expense', accountId: 'cc', ...extra })
const base = { transactionType: 'expense', accountId: 'cc', overrides: {}, registered: [], skipped: [], frequency: 'monthly', occurrenceType: 'continuous' }
beforeEach(() => Object.assign(app, {
  activeProfileId: null,
  profileReportTransactions: [
    tx('t1', '2026-11-01', 100, { payee: 'João Exemplo', description: 'Consulta', categoryId: 'saude' }),
    tx('t2', '2026-10-10', 80, { payee: 'João Exemplo', description: 'Consulta antiga', categoryId: 'saude' }),
    tx('t3', '2026-11-01', 50, { payee: 'João Exemplo Filho', description: 'Aula', categoryId: 'edu' }),
    tx('t4', '2026-11-01', 60, { payee: 'Posto Exemplo', description: 'Gasolina', categoryId: 'comb' }),
  ],
  profileSchedules: [
    { ...base, id: 's1', description: 'Plano mensal', payee: 'João Exemplo', amount: 120, startDate: '2026-10-15', nextOccurrence: '2026-10-15', categoryId: 'saude' },
  ],
  getNextOccurrences: computeOccurrences, profileAccounts: [{ id: 'cc', name: 'Conta Exemplo', type: 'checking' }],
  accounts: [{ id: 'cc', name: 'Conta Exemplo', type: 'checking' }],
  categories: [{ id: 'saude', name: 'Saúde' }, { id: 'edu', name: 'Educação' }, { id: 'comb', name: 'Combustível' }],
  payees: ['João Exemplo', 'João Exemplo Filho', 'Posto Exemplo'], reserveFunctions: [], getFinancialPeriod: null,
}))
afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear() })
const props = { onClose: vi.fn(), onNovo: vi.fn() }

describe('ConsultaMovimentos', () => {
  it('"o que já paguei ao João?": pagos do mês, filtro visível, em aberto relacionado e refinamentos', () => {
    render(<ConsultaMovimentos parametros={{ assunto: 'favorecido', status: 'pago', tipo: 'despesa', favorecido: 'João Exemplo' }} textoOriginal="o que já paguei ao João Exemplo?" {...props} />)
    expect(screen.getByText('Pago a João Exemplo: R$ 100,00 em 1 lançamento — Este mês (01/11 a 30/11).')).toBeTruthy()
    const filtro = screen.getByLabelText('Filtro usado').textContent
    expect(filtro).toMatch(/Favorecido: João Exemplo/)
    expect(filtro).toMatch(/Este mês \(01\/11 a 30\/11\)/)
    const tambem = screen.getByLabelText('Também encontrei')
    expect(tambem.textContent).toMatch(/Em aberto: .* 1 vencido \(R\$ 120,00\); próximo vencimento 15\/11\/2026/)
    expect(within(screen.getByLabelText('Refinar')).getAllByRole('button').map(b => b.textContent)).toEqual(['Mês passado', 'Últimos 3 meses', 'Só em aberto', 'Escolher datas'])
  })

  it('botão muda só o período e recalcula sem chamar a IA', () => {
    render(<ConsultaMovimentos parametros={{ assunto: 'favorecido', status: 'pago', favorecido: 'João Exemplo' }} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mês passado' }))
    expect(screen.getByText('Pago a João Exemplo: R$ 80,00 em 1 lançamento — Mês passado (01/10 a 31/10).')).toBeTruthy()
    expect(screen.getByLabelText('Filtro usado').textContent).toMatch(/Favorecido: João Exemplo/)
    expect(api.interpretar).not.toHaveBeenCalled()
  })

  it('escolher datas (intervalo personalizado)', () => {
    render(<ConsultaMovimentos parametros={{ assunto: 'favorecido', status: 'pago', favorecido: 'João Exemplo' }} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Escolher datas' }))
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '01102026' } })
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '30112026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(screen.getByText(/^Pago a João Exemplo: R\$ 180,00 em 2 lançamentos — De 01\/10\/2026 a 30\/11\/2026\.$/)).toBeTruthy()
  })

  it('em aberto: vencidos, próximo vencimento e total pago relacionado', () => {
    render(<ConsultaMovimentos parametros={{ assunto: 'favorecido', status: 'em_aberto', favorecido: 'João Exemplo' }} {...props} />)
    expect(screen.getByText(/^Em aberto com João Exemplo: .* — Todas as pendentes.*1 vencido \(R\$ 120,00\)\. Próximo vencimento: 15\/11\/2026/)).toBeTruthy()
    expect(screen.getByLabelText('Também encontrei').textContent).toMatch(/Já pago nos últimos 12 meses: R\$ 180,00 em 2 lançamentos; último em 01\/11\/2026/)
    fireEvent.click(screen.getByRole('button', { name: 'Só vencidos' }))
    expect(screen.getByText('Vencido com João Exemplo: R$ 120,00 em 1 ocorrência.')).toBeTruthy()
  })

  it('nome ambíguo: pergunta com botões (uma pergunta), sem escolher sozinho', () => {
    render(<ConsultaMovimentos parametros={{ assunto: 'favorecido', status: 'pago', favorecido: 'João' }} {...props} />)
    expect(screen.getByText('Achei 2 favorecidos com “João”. Qual deles?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'João Exemplo Filho' }))
    expect(screen.getByText(/^Pago a João Exemplo Filho: R\$ 50,00/)).toBeTruthy()
  })

  it('termo que é categoria ou descrição; termo não encontrado', () => {
    const { unmount } = render(<ConsultaMovimentos parametros={{ status: 'pago', favorecido: 'saúde' }} {...props} />)
    expect(screen.getByText(/^Gasto em Saúde: R\$ 100,00/)).toBeTruthy()
    unmount()
    render(<ConsultaMovimentos parametros={{ status: 'pago', favorecido: 'Inexistente' }} {...props} />)
    expect(screen.getByText(/Não encontrei favorecido, categoria ou descrição com “Inexistente”/)).toBeTruthy()
  })

  it('"quanto gastei em Combustível?": o número do Painel com período visível e refinamentos', () => {
    render(<GastosOuConsulta parametros={{ categoria_id: 'comb', periodo: 'current' }} {...props} />)
    expect(screen.getByText('Gasto em Combustível: R$ 60,00 em 1 lançamento — Este mês (01/11 a 30/11).')).toBeTruthy()
    expect(screen.getByText(/Mesmo número do Painel/)).toBeTruthy()
    expect(within(screen.getByLabelText('Refinar')).getAllByRole('button').map(b => b.textContent)).toEqual(['Mês passado', 'Últimos 3 meses', 'Só em aberto', 'Escolher datas'])
  })

  it('"Ver todos" abre Agendamentos já filtrado', () => {
    app.profileSchedules = [1, 2, 3, 4, 5, 6].map(i => ({ ...base, id: `p${i}`, description: `Parcela ${i}`, payee: 'João Exemplo', amount: 10, startDate: `2026-11-1${i}`, frequency: 'once' }))
    render(<ConsultaMovimentos parametros={{ status: 'em_aberto', favorecido: 'João Exemplo' }} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver todos \(6\)/ }))
    expect(JSON.parse(sessionStorage.getItem(ABRIR_AGENDAMENTOS_FILTRO_KEY))).toEqual({ status: 'apagar', payee: 'João Exemplo', desc: '', cat: '' })
  })

  it('"Ver todos" dos pagos abre a busca global preenchida', () => {
    app.profileReportTransactions = [1, 2, 3, 4, 5, 6].map(i => tx(`x${i}`, `2026-11-0${i > 2 ? 2 : 1}`, 10, { payee: 'João Exemplo' }))
    render(<ConsultaMovimentos parametros={{ status: 'pago', favorecido: 'João Exemplo' }} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver todos \(6\)/ }))
    expect(JSON.parse(sessionStorage.getItem(ABRIR_BUSCA_KEY))).toEqual({ payee: 'João Exemplo', description: '', from: '2026-11-01', to: '2026-11-30' })
  })
})

describe('Assistente: continuação em texto/voz', () => {
  it('"e no mês passado?" mantém o assunto e não chama a IA de novo', async () => {
    api.interpretar.mockResolvedValueOnce({ ferramenta: 'consultar_movimentos', parametros: { assunto: 'favorecido', status: 'pago', tipo: 'despesa', favorecido: 'João Exemplo' } })
    render(<Assistente onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/Digite o que você quer/), { target: { value: 'o que já paguei ao João Exemplo?' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }))
    await screen.findByText(/^Pago a João Exemplo: R\$ 100,00/)
    fireEvent.click(screen.getByRole('button', { name: 'Novo pedido' }))
    expect(screen.getByText(/Continuando a consulta a João Exemplo/)).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(/Digite o que você quer/), { target: { value: 'e no mês passado?' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }))
    await waitFor(() => expect(screen.getByText(/^Pago a João Exemplo: R\$ 80,00 em 1 lançamento — Mês passado/)).toBeTruthy())
    expect(api.interpretar).toHaveBeenCalledTimes(1)
  })

  it('pedido novo (não é continuação) vai para a IA', async () => {
    api.interpretar.mockResolvedValue({ ferramenta: 'perguntar', parametros: { pergunta: 'Qual conta?', opcoes: [] } })
    render(<Assistente onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/Digite o que você quer/), { target: { value: 'gastei 50 no mercado' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }))
    await waitFor(() => expect(api.interpretar).toHaveBeenCalledTimes(1))
  })
})
