// @vitest-environment jsdom
// Cenário ponta a ponta da recorrência parcelada: o modal real (ScheduleForm) grava no AppProvider
// real, e o motor real da fatura (reconcileFaturaState) gera os resgates. A API é simulada: nada
// aqui fala com banco nem servidor. Seguro: R$ 2.800, 25/03/2027, Anual, Sem fim, 12x, cartão, CA.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'

const dados = {
  settings: { financialMonthStartDay: 1, financialMonthMode: 'custom', currency: 'BRL', recurringMatchExceptions: [], categoryGroups: [], faturasFechadas: {} },
  costCenters: [], transactions: [], schedules: [], budgets: [], classificationRules: [], gerencialRules: [], payables: [],
  payees: [], envelopes: [], accountGroups: null, cardImports: [], rateios: [], scheduleReservaFuncoes: [], favorecidoAliases: [],
  profiles: [{ id: 'p1', name: 'Pessoal', ordem: 0 }],
  categories: [{ id: 'cat_seg', name: 'Seguro', type: 'expense', icon: '🚗' }],
  accounts: [
    { id: 'cc', name: 'Conta', type: 'checking', profileId: 'p1', contaCorrentePrincipal: true, balance: 0, initialBalance: 0, active: true },
    { id: 'card', name: 'Cartão', apelido: 'Card', type: 'credit', profileId: 'p1', closingDay: 14, dueDay: 20, paymentAccountId: 'cc', active: true },
    { id: 'res', name: 'Reserva CA', type: 'savings', profileId: 'p1', isReserva: true, reservaType: 'geral', balance: 0, initialBalance: 0, active: true },
  ],
  gerencialGroups: [
    { id: 'grp_1', number: 1, name: 'Gerencial', alias: 'G', fixed: true },
    { id: 'grp_D', number: 'D', name: 'Despesa', alias: 'D', fixed: true },
    { id: 'grp_ca', number: 2, name: 'CA', alias: 'CA', defaultAccountId: 'res' },
  ],
  reserveFunctions: [
    { id: 'fn_seg', name: 'Seguro Carro', accountId: 'res', ordem: 0 },
    { id: 'fn_out', name: 'Outra', accountId: 'res', ordem: 1 },
  ],
}

vi.mock('../lib/db', async (orig) => ({
  ...(await orig()),
  loadFromDb: vi.fn(async () => ({ status: 'connected', assinatura: null, recursos: null, data: dados })),
}))

const { AppProvider, useApp } = await import('./AppContext')
const { default: ScheduleForm } = await import('../components/Schedule/ScheduleForm')
const { previsoesDasFuncoes } = await import('../lib/previsaoReserva')
const { computeOccurrences } = await import('../lib/occurrences')
const { occEfetiva } = await import('../lib/fluxoCaixa')

let app
function Espiao() { app = useApp(); return null }

beforeAll(() => {
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  localStorage.setItem('auth_token', 'x.' + btoa(JSON.stringify({ nivel: 'admin', sub: 't', exp: 4102444800 })) + '.y')
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
})
afterEach(() => cleanup())

const inicial = {
  description: 'Seguro Carro', transactionType: 'expense', accountId: 'card', amount: 2800, frequency: 'annual',
  startDate: '2027-03-25', occurrenceType: 'continuous', installments: 0, categoryId: 'cat_seg', autoRegister: false,
  grupoGerencial: 'grp_ca', reservaFuncaoId: 'fn_seg', tipoDocumentoId: 'doc',
}

async function montar(init = inicial) {
  render(<AppProvider><Espiao /><ScheduleForm initial={init} onClose={() => {}} /></AppProvider>)
  await waitFor(() => expect(app.accounts.some(a => a.id === 'card')).toBe(true), { timeout: 15000 })
}
const soma = (l) => Math.round(l.reduce((a, b) => a + b, 0) * 100) / 100

describe('cenário do seguro no modal real e no motor real', () => {
  it('limita N pela frequência no modal', async () => {
    await montar()
    const campo = await screen.findByLabelText('Número de parcelas por ocorrência')
    expect(campo.getAttribute('max')).toBe('12')
    fireEvent.change(campo, { target: { value: '18' } })
    expect((await screen.findByRole('alert')).textContent).toMatch('no máximo 12 parcelas')
    fireEvent.change(campo, { target: { value: '12' } })
    expect(screen.queryByText(/no máximo 12 parcelas/)).toBeNull()
  }, 30000)

  it('cria 12x, gera os resgates por parcela e fecha 2.800,00 por ano', async () => {
    await montar()
    fireEvent.change(await screen.findByLabelText('Número de parcelas por ocorrência'), { target: { value: '12' } })
    expect((await screen.findByText(/12x de R\$\s*233,33 \(1ª parcela R\$\s*233,37\)/))).toBeTruthy()
    expect(screen.getByText('Ocorrência 2027')).toBeTruthy()
    expect(screen.getByText('Ocorrência 2028')).toBeTruthy()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Criar Agendamento' })) })
    const sch = await waitFor(() => {
      const s = app.schedules.find(x => x.description === 'Seguro Carro' && x.transactionType === 'expense')
      expect(s).toBeTruthy()
      return s
    })
    expect(sch).toMatchObject({ amount: 2800, parcelasPorOcorrencia: 12, frequency: 'annual', occurrenceType: 'continuous' })

    // Agendamentos: 12 itens de mar/2027 a fev/2028, depois mais 12.
    const datas = computeOccurrences(sch, 24)
    const valores = datas.map(d => occEfetiva(sch, d).amount)
    expect(datas[0]).toBe('2027-03-25')
    expect(datas[11]).toBe('2028-02-25')
    expect(datas[12]).toBe('2028-03-25')
    expect(valores[0]).toBe(233.37)
    expect(valores[1]).toBe(233.33)
    expect(soma(valores.slice(0, 12))).toBe(2800)
    expect(soma(valores.slice(12, 24))).toBe(2800)

    // Motor real: um resgate por fatura, no mês da fatura (fechamento 14: 25/03 cai em abr).
    await waitFor(() => expect(app.schedules.filter(s => s.tipo === 'resgate_reserva').length).toBeGreaterThanOrEqual(24), { timeout: 15000 })
    const resgates = app.schedules.filter(s => s.tipo === 'resgate_reserva').sort((a, b) => a.faturaMesAno.localeCompare(b.faturaMesAno))
    // Um resgate por fatura, da reserva para a conta, com data no mês da fatura (vencimento dia 20).
    expect(new Set(resgates.map(r => r.faturaMesAno)).size).toBe(resgates.length)
    for (const r of resgates) {
      expect(r).toMatchObject({ accountId: 'res', toAccountId: 'cc', cardId: 'card' })
      expect(r.startDate.slice(0, 7)).toBe(r.faturaMesAno)
    }
    expect(resgates[0]).toMatchObject({ faturaMesAno: '2027-04', startDate: '2027-04-20', amount: 233.37 })
    expect(resgates[1]).toMatchObject({ faturaMesAno: '2027-05', amount: 233.33 })
    // Por parcela: a soma dos resgates de cada ano de faturas fecha 2.800,00.
    const anoResgates = (de, ate) => soma(resgates.filter(r => r.faturaMesAno >= de && r.faturaMesAno <= ate).map(r => r.amount))
    expect(anoResgates('2027-04', '2028-03')).toBe(2800)
    expect(anoResgates('2028-04', '2029-03')).toBe(2800)

    // Fluxo Futuro de Reservas: mesma função que a tela usa (previsoesDasFuncoes), sem o corte da janela.
    const prev = previsoesDasFuncoes(app.reserveFunctions.filter(f => f.id === 'fn_seg'), {
      accounts: app.accounts, schedules: app.schedules, scheduleReservaFuncoes: app.scheduleReservaFuncoes, getNextOccurrences: computeOccurrences,
    }, { ini: '2027-01-01', fim: '2029-12-31' }).fn_seg
    const linhas = prev.filter(p => p.tipo === 'resgate').map(p => ({ mes: p.date.slice(0, 7), fatura: p.schedule.faturaMesAno, valor: p.amount }))
    const ano = (de, ate) => soma(linhas.filter(l => l.fatura >= de && l.fatura <= ate).map(l => l.valor))

    expect(linhas[0]).toMatchObject({ fatura: '2027-04', valor: 233.37 })
    expect(linhas[1]).toMatchObject({ fatura: '2027-05', valor: 233.33 })
    expect(linhas[12]).toMatchObject({ fatura: '2028-04', valor: 233.37 })
    expect(new Set(linhas.map(l => l.fatura)).size).toBe(linhas.length)
    expect(ano('2027-04', '2028-03')).toBe(2800)
    expect(ano('2028-04', '2029-03')).toBe(2800)
  }, 60000)
})

describe('reabrir e editar no modal real', () => {
  const gravado = (over = {}) => ({
    ...inicial, id: 'sch_seg', parcelasPorOcorrencia: 12, registered: [], skipped: [], overrides: {}, registeredMeta: {}, ...over,
  })
  const abrir = async (s) => {
    dados.schedules = [s]
    render(<AppProvider><Espiao /><Reabre id={s.id} /></AppProvider>)
    await screen.findByLabelText('Número de parcelas por ocorrência', {}, { timeout: 15000 })
  }
  function Reabre({ id }) {
    const { schedules } = useApp()
    const s = schedules.find(x => x.id === id)
    return s ? <ScheduleForm initial={s} onClose={() => {}} /> : null
  }
  const campoValor = () => document.querySelector('.valor-destaque')
  const salvar = () => act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar' })) })
  const atual = () => app.schedules.find(s => s.id === 'sch_seg')
  afterEach(() => { dados.schedules = [] })

  it('o campo Valor reabre com o TOTAL; salvar sem mudar nada não pergunta nem altera', async () => {
    await abrir(gravado({ registered: ['2027-03-25'], nextOccurrence: '2027-04-25' }))
    expect(screen.getByText(/Valor total da ocorrência \(R\$\)/)).toBeTruthy()
    expect(Number(String(campoValor().value).replace(/\./g, '').replace(',', '.'))).toBe(2800)
    await salvar()
    expect(screen.queryByText(/Aplicar só nesta ocorrência/)).toBeNull()
    expect(atual().amount).toBe(2800)
    expect(atual().parcelasPorOcorrencia).toBe(12)
    expect(occEfetiva(atual(), '2027-04-25').amount).toBe(233.33)
  }, 30000)

  it('Única em N parcelas: gravada Anual + 1, reabre como Única', async () => {
    await abrir(gravado({ amount: 900, parcelasPorOcorrencia: 3, occurrenceType: 'installment', installments: 1 }))
    expect(screen.getByText('Dividir em')).toBeTruthy()
    expect(screen.getByText('Parcelas')).toBeTruthy()
    expect(screen.queryByText(/Ocorrência 20/)).toBeNull()
    expect(screen.getAllByText('Única').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Número de parcelas por ocorrência').getAttribute('max')).toBe('360')
  }, 30000)

  it('novo total com parcelas pagas: pergunta "só nesta ocorrência" e recalcula só as pendentes', async () => {
    await abrir(gravado({ registered: ['2027-03-25', '2027-04-25', '2027-05-25'], nextOccurrence: '2027-06-25' }))
    fireEvent.change(campoValor(), { target: { value: '3000' } })
    await salvar()
    expect(await screen.findByText(/Aplicar só nesta ocorrência \(2027\) ou nesta e nas próximas\?/)).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Só nesta ocorrência' })) })
    await waitFor(() => expect(atual().overrides._parcelamento).toBeTruthy())
    expect(atual().amount).toBe(2800)
    expect(occEfetiva(atual(), '2027-03-25').amount).toBe(233.37)
    expect(occEfetiva(atual(), '2027-06-25').amount).toBe(255.57)
    expect(occEfetiva(atual(), '2027-07-25').amount).toBe(255.55)
    expect(occEfetiva(atual(), '2028-03-25').amount).toBe(233.37)
    const hist = globalThis.fetch.mock.calls.filter(([u]) => String(u).includes('/api/historico')).map(([, o]) => o?.body || '').join()
    expect(hist).toContain('valorTotalOcorrencia')
  }, 30000)

  it('nesta e nas próximas: a base muda, as parcelas de antes não', async () => {
    await abrir(gravado({ registered: ['2027-03-25'], nextOccurrence: '2027-04-25' }))
    fireEvent.change(campoValor(), { target: { value: '3600' } })
    await salvar()
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Nesta e nas próximas' })) })
    await waitFor(() => expect(atual().amount).toBe(3600))
    expect(occEfetiva(atual(), '2027-03-25').amount).toBe(233.37)
    expect(occEfetiva(atual(), '2028-03-25').amount).toBe(300)
  }, 30000)

  it('N menor que as parcelas pagas é recusado com o motivo', async () => {
    await abrir(gravado({ registered: ['2027-03-25', '2027-04-25', '2027-05-25'], nextOccurrence: '2027-06-25' }))
    fireEvent.change(screen.getByLabelText('Número de parcelas por ocorrência'), { target: { value: '2' } })
    await salvar()
    expect((await screen.findByRole('alert')).textContent).toMatch('não pode ser menor que 3')
    expect(atual().parcelasPorOcorrencia).toBe(12)
  }, 30000)

  it('série com baixa: data e frequência travadas, com o motivo; sem baixa, livres', async () => {
    await abrir(gravado({ registered: ['2027-03-25'], nextOccurrence: '2027-04-25' }))
    expect(screen.getAllByText(/já tem parcela baixada/).length).toBeGreaterThan(0)
    cleanup()
    await abrir(gravado())
    expect(screen.queryByText(/já tem parcela baixada/)).toBeNull()
  }, 30000)

  it('agendamento comum com baixas não vira parcelado', async () => {
    await abrir({ ...gravado({ parcelasPorOcorrencia: 1, amount: 500, registered: ['2027-03-25'], nextOccurrence: '2028-03-25' }) })
    expect(screen.getByLabelText('Número de parcelas por ocorrência').disabled).toBe(true)
    expect(screen.getByText(/não pode virar parcelado/)).toBeTruthy()
  }, 30000)
})

describe('o campo só aparece onde pode', () => {
  it.each([
    ['Mensal', { frequency: 'monthly' }],
    ['Transferência', { transactionType: 'transfer', toAccountId: 'cc', accountId: 'res', frequency: 'annual' }],
  ])('%s: sem Parcelamento', async (_, over) => {
    render(<AppProvider><Espiao /><ScheduleForm initial={{ ...inicial, ...over }} onClose={() => {}} /></AppProvider>)
    await waitFor(() => expect(app.accounts.some(a => a.id === 'card')).toBe(true), { timeout: 15000 })
    expect(screen.queryByLabelText('Número de parcelas por ocorrência')).toBeNull()
  }, 30000)
})
