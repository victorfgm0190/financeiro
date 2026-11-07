// @vitest-environment jsdom
// Provisão com parcelamento, ponta a ponta: o modal real (ProvisaoForm) grava no AppProvider real, e o
// Fluxo Futuro sai da mesma função da tela (previsoesDasFuncoes). A API é simulada: nada aqui fala com
// banco nem servidor. Cenário: R$ 2.800, 25/03/2027, Anual, Sem fim, 12x, Itaú Principal, Seguro Carro.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup, within } from '@testing-library/react'

const dados = {
  settings: { financialMonthStartDay: 1, financialMonthMode: 'custom', currency: 'BRL', recurringMatchExceptions: [], categoryGroups: [], faturasFechadas: {} },
  costCenters: [], transactions: [], schedules: [], budgets: [], classificationRules: [], gerencialRules: [], payables: [],
  payees: [], envelopes: [], accountGroups: null, cardImports: [], rateios: [], scheduleReservaFuncoes: [], favorecidoAliases: [],
  profiles: [{ id: 'p1', name: 'Pessoal', ordem: 0 }],
  categories: [{ id: 'cat_seg', name: 'Seguro', type: 'expense', icon: '🚗' }],
  accounts: [
    { id: 'itau', name: 'Itaú Principal', type: 'checking', profileId: 'p1', contaCorrentePrincipal: true, balance: 0, initialBalance: 0, active: true },
    { id: 'res', name: 'Reserva', type: 'savings', profileId: 'p1', isReserva: true, reservaType: 'geral', balance: 0, initialBalance: 0, active: true },
  ],
  gerencialGroups: [{ id: 'grp_1', number: 1, name: 'Gerencial', alias: 'G', fixed: true }, { id: 'grp_D', number: 'D', name: 'Despesa', alias: 'D', fixed: true }],
  reserveFunctions: [{ id: 'fn_seg', name: 'Seguro Carro', accountId: 'res', ordem: 0 }],
}

vi.mock('../lib/db', async (orig) => ({
  ...(await orig()),
  loadFromDb: vi.fn(async () => ({ status: 'connected', assinatura: null, recursos: { efetivacoesProvisao: true }, data: dados })),
}))

const { AppProvider, useApp } = await import('./AppContext')
const { default: ProvisaoForm } = await import('../components/Schedule/ProvisaoForm')
const { default: ScheduleForm } = await import('../components/Schedule/ScheduleForm')
const { EfetivarProvisaoModal } = await import('../components/Schedule/SchedulePanel')
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
afterEach(() => { cleanup(); dados.schedules = [] })

const CAMPO_N = 'Número de parcelas por ocorrência'
const soma = (l) => Math.round(l.reduce((a, b) => a + b, 0) * 100) / 100
const nova = {
  description: 'Seguro Carro', amount: 2800, frequency: 'annual', startDate: '2027-03-25', occurrenceType: 'continuous',
  installments: 0, accountId: 'itau', reservaFuncaoId: 'fn_seg', categoryId: 'cat_seg',
}
const gravada = (over = {}) => ({
  ...nova, id: 'prov', transactionType: 'expense', accountType: 'checking', isProvisao: true, provisaoEfetivada: false, autoRegister: false,
  parcelasPorOcorrencia: 12, registered: [], skipped: [], overrides: {}, registeredMeta: {}, efetivacoes: [], ...over,
})
const efetivacao = (ocorrencia, valor = 233.33) => ({ id: 'e_' + ocorrencia, em: '2027-01-01', ocorrencia, dataReal: ocorrencia, valor, despesaId: null, resgateId: null, anterior: {} })
const prov = () => app.schedules.find(s => s.id === 'prov')
const previsoes = () => previsoesDasFuncoes(app.reserveFunctions, {
  accounts: app.accounts, schedules: app.schedules, scheduleReservaFuncoes: app.scheduleReservaFuncoes, getNextOccurrences: computeOccurrences,
}, { ini: '2027-01-01', fim: '2029-12-31' }).fn_seg

async function criar(init = nova) {
  render(<AppProvider><Espiao /><ProvisaoForm initial={init} onClose={() => {}} /></AppProvider>)
  await waitFor(() => expect(app.accounts.some(a => a.id === 'itau')).toBe(true), { timeout: 15000 })
}
function Reabre({ id, Form }) {
  const { schedules } = useApp()
  const s = schedules.find(x => x.id === id)
  return s ? <Form initial={s} onClose={() => {}} /> : null
}
async function abrir(s, Form = ProvisaoForm) {
  dados.schedules = [s]
  render(<AppProvider><Espiao /><Reabre id={s.id} Form={Form} /></AppProvider>)
  await screen.findByLabelText(CAMPO_N, {}, { timeout: 15000 })
  await act(async () => {})
}
const salvar = () => act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar' })) })
const valorDoForm = () => document.querySelector('input.valor-destaque') || screen.getAllByRole('textbox').find(i => /2\.?800/.test(i.value))

describe('cenário do seguro pelo Lançar Provisão', () => {
  it('mesmos rótulos, limite, texto e prévia do agendamento', async () => {
    await criar()
    expect(screen.queryByText('Parcelada')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Número de ocorrências' }))
    expect(screen.getByText('Nº de ocorrências')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Sem fim' }))
    const n = screen.getByLabelText(CAMPO_N)
    expect(n.getAttribute('max')).toBe('12')
    fireEvent.change(n, { target: { value: '18' } })
    expect((await screen.findByRole('alert')).textContent).toMatch('no máximo 12 parcelas')
    fireEvent.change(n, { target: { value: '12' } })
    expect(await screen.findByText(/12x de R\$\s*233,33 \(1ª parcela R\$\s*233,37\)/)).toBeTruthy()
    expect(screen.getByText('Ocorrência 2027')).toBeTruthy()
    expect(screen.getByText('Ocorrência 2028')).toBeTruthy()
  }, 30000)

  it('resgate provisório sai por parcela, mês a mês, e fecha 2.800,00 por ano', async () => {
    await criar()
    fireEvent.change(screen.getByLabelText(CAMPO_N), { target: { value: '12' } })
    await salvar()
    const s = await waitFor(() => {
      const x = app.schedules.find(y => y.description === 'Seguro Carro' && y.isProvisao)
      expect(x).toBeTruthy()
      return x
    })
    expect(s).toMatchObject({ amount: 2800, parcelasPorOcorrencia: 12, frequency: 'annual', occurrenceType: 'continuous', reservaFuncaoId: 'fn_seg', accountId: 'itau' })
    const linhas = previsoes().filter(p => p.tipo === 'provisao').map(p => ({ mes: p.date.slice(0, 7), valor: p.amount, label: p.label }))
    const doAno = (de, ate) => soma(linhas.filter(l => l.mes >= de && l.mes <= ate).map(l => l.valor))
    expect(linhas[0]).toMatchObject({ mes: '2027-03', valor: 233.37, label: 'Seguro Carro (1/12 · ocorr. 2027)' })
    expect(linhas[1]).toMatchObject({ mes: '2027-04', valor: 233.33 })
    expect(linhas[11]).toMatchObject({ mes: '2028-02', valor: 233.33 })
    expect(linhas[12]).toMatchObject({ mes: '2028-03', valor: 233.37 })
    expect(new Set(linhas.map(l => l.mes)).size).toBe(linhas.length)
    expect(doAno('2027-03', '2028-02')).toBe(2800)
    expect(doAno('2028-03', '2029-02')).toBe(2800)
  }, 30000)

  it('Única em 3x: gravada Anual + 1 e sem repetir', async () => {
    await criar({ ...nova, frequency: 'once', amount: 900 })
    fireEvent.change(screen.getByLabelText(CAMPO_N), { target: { value: '3' } })
    await salvar()
    const s = await waitFor(() => { const x = app.schedules.find(y => y.isProvisao); expect(x).toBeTruthy(); return x })
    expect(s).toMatchObject({ frequency: 'annual', occurrenceType: 'installment', installments: 1, parcelasPorOcorrencia: 3 })
    expect(previsoes().filter(p => p.tipo === 'provisao').map(p => [p.date, p.amount])).toEqual([['2027-03-25', 300], ['2027-04-25', 300], ['2027-05-25', 300]])
  }, 30000)
})

describe('provisão comum continua igual', () => {
  it('sem parcelamento: Anual + 12 ocorrências projeta só a próxima, com o valor cheio', async () => {
    await abrir(gravada({ parcelasPorOcorrencia: 1, occurrenceType: 'installment', installments: 12 }))
    expect(previsoes().map(p => [p.date, p.amount])).toEqual([['2027-03-25', 2800]])
    expect(computeOccurrences(prov(), 2)).toEqual(['2027-03-25', '2028-03-25'])
  }, 30000)
})

describe('efetivar uma parcela', () => {
  it('modal abre com o valor da parcela, sem perguntar sobre as próximas', async () => {
    dados.schedules = [gravada()]
    render(<AppProvider><Espiao /><ModalEfetivar /></AppProvider>)
    expect(await screen.findByText(/Parcela 1\/12 · ocorr\. 2027 de/, {}, { timeout: 15000 })).toBeTruthy()
    expect(screen.queryByTestId('efetivar-aplicar-proximas')).toBeNull()
    const valor = screen.getAllByRole('textbox').map(i => i.value).join(' ')
    expect(valor).toMatch(/233,37/)
  }, 30000)

  it('efetiva só a parcela: série não se move, resgate real substitui o provisório, e desfaz', async () => {
    await abrir(gravada())
    await act(async () => { app.efetivarProvisao('prov', { amount: 240, date: '2027-03-28', occurrenceDate: '2027-03-25' }) })
    await waitFor(() => expect(prov().efetivacoes).toHaveLength(1))
    expect(prov()).toMatchObject({ startDate: '2027-03-25', amount: 2800, nextOccurrence: '2027-04-25' })
    expect(computeOccurrences(prov(), 2)).toEqual(['2027-04-25', '2027-05-25'])
    const despesa = app.schedules.find(s => s.id === prov().efetivacoes[0].despesaId)
    expect(despesa).toMatchObject({ amount: 240, startDate: '2027-03-28', frequency: 'once', isProvisao: false })
    const p = previsoes()
    expect(p.filter(x => x.tipo === 'resgate').map(x => [x.date, x.amount])).toEqual([['2027-03-28', 240]])
    expect(p.filter(x => x.tipo === 'provisao')[0]).toMatchObject({ date: '2027-04-25', amount: 233.33 })

    let r
    await act(async () => { r = app.desfazerEfetivacaoProvisao('prov') })
    expect(r.ok).toBe(true)
    await waitFor(() => expect(prov().efetivacoes).toHaveLength(0))
    expect(computeOccurrences(prov(), 1)).toEqual(['2027-03-25'])
    expect(prov().nextOccurrence).toBe('2027-03-25')
    expect(app.schedules.some(s => s.id === despesa.id)).toBe(false)
  }, 30000)
})

describe('editar provisão parcelada', () => {
  const tres = () => gravada({ efetivacoes: [efetivacao('2027-03-25', 233.37), efetivacao('2027-04-25'), efetivacao('2027-05-25')], nextOccurrence: '2027-06-25' })

  it('reabre com o TOTAL; novo total: pergunta, recalcula só as pendentes e grava histórico', async () => {
    await abrir(tres())
    expect(screen.getByText(/Valor total estimado da ocorrência/)).toBeTruthy()
    const campo = valorDoForm()
    fireEvent.change(campo, { target: { value: '3000' } })
    await salvar()
    expect(await screen.findByText(/Aplicar só nesta ocorrência \(2027\) ou nesta e nas próximas\?/)).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Só nesta ocorrência' })) })
    await waitFor(() => expect(prov().overrides._parcelamento).toBeTruthy())
    expect(prov().amount).toBe(2800)
    expect(occEfetiva(prov(), '2027-03-25').amount).toBe(233.37)
    expect(occEfetiva(prov(), '2027-06-25').amount).toBe(255.57)
    expect(occEfetiva(prov(), '2027-07-25').amount).toBe(255.55)
    expect(occEfetiva(prov(), '2028-03-25').amount).toBe(233.37)
    await waitFor(() => {
      const hist = globalThis.fetch.mock.calls.filter(([u]) => String(u).includes('/api/historico')).map(([, o]) => o?.body || '').join()
      expect(hist).toContain('valorTotalOcorrencia')
    })
  }, 30000)

  it('N menor que as efetivadas é recusado; data e frequência travam com o motivo', async () => {
    await abrir(tres())
    expect(screen.getAllByText(/já tem parcela baixada/).length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText(CAMPO_N), { target: { value: '2' } })
    await salvar()
    expect((await screen.findByRole('alert')).textContent).toMatch('não pode ser menor que 3')
    expect(prov().parcelasPorOcorrencia).toBe(12)
  }, 30000)

  it('provisão comum com efetivação não vira parcelada', async () => {
    await abrir(gravada({ parcelasPorOcorrencia: 1, efetivacoes: [efetivacao('2027-03-25', 2800)], startDate: '2028-03-25', nextOccurrence: '2028-03-25' }))
    expect(screen.getByLabelText(CAMPO_N).disabled).toBe(true)
    expect(screen.getByText(/não pode virar parcelado/)).toBeTruthy()
  }, 30000)
})

describe('aviso de soma na prévia', () => {
  const editarParcela = async (rotulo, valor) => {
    fireEvent.click(screen.getAllByTitle('Clique para editar esta parcela').find(b => b.textContent.startsWith(rotulo)))
    const painel = screen.getByText(new RegExp(`^Parcela ${rotulo.replace('/', '\\/')} de`)).closest('.relative')
    fireEvent.change(within(painel).getAllByRole('textbox').at(-1), { target: { value: valor } })
    await act(async () => { fireEvent.click(within(painel).getByRole('button', { name: 'Confirmar' })) })
  }
  const AVISO = /A soma desta ocorrência \(R\$\s*2\.816,67\) está diferente do total \(R\$\s*2\.800,00\)/

  it.each([
    ['Provisão', ProvisaoForm, gravada()],
    ['Agendamento', ScheduleForm, { ...gravada(), id: 'prov', isProvisao: false }],
  ])('%s: parcela alterada pela prévia mostra o aviso; soma certa, sem aviso', async (_, Form, s) => {
    await abrir(s, Form)
    expect(screen.queryByText(/A soma desta ocorrência/)).toBeNull()
    await editarParcela('3/12', '250')
    expect(await screen.findByText(AVISO)).toBeTruthy()
    // Só a ocorrência alterada avisa.
    expect(screen.getAllByText(/A soma desta ocorrência/)).toHaveLength(1)
    // O total da ocorrência continua sendo o digitado.
    await salvar()
    await waitFor(() => expect(occEfetiva(prov(), '2027-05-25').amount).toBe(250))
    expect(prov().amount).toBe(2800)
    expect(occEfetiva(prov(), '2027-06-25').amount).toBe(233.33)
  }, 30000)
})

function ModalEfetivar() {
  const { schedules, accounts } = useApp()
  const s = schedules.find(x => x.id === 'prov')
  return s ? <EfetivarProvisaoModal schedule={s} accounts={accounts} onClose={() => {}} onConfirm={() => {}} /> : null
}
