// @vitest-environment jsdom
// Resgate ligado na LISTA de Agendamentos (tela real + AppProvider real, API simulada). Na linha do
// resgate: Pagar, Vincular a um resgate já feito e Excluir (esta ocorrência ou o resgate inteiro);
// Pular/Estornar ficam na despesa; selo "Acompanha" abre a despesa; Editar abre o painel do resgate
// (mudar a data de uma ocorrência). A despesa continua mandando na data. O PAGAMENTO é separado:
// pagar a despesa não paga o resgate (fica pendente); pagar o resgate na linha dele grava uma
// transferência só. No mesmo dia, o resgate vem antes da despesa. Dados fictícios.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within, act } from '@testing-library/react'
import { novoResgateVinculado } from '../lib/resgateVinculado'
import { opcoesAplicarData } from '../lib/fluxoCaixaDatas'
import { computeOccurrences } from '../lib/occurrences'
import { occEfetiva } from '../lib/fluxoCaixa'

const hoje = new Date()
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const inicio = iso(new Date(hoje.getFullYear(), hoje.getMonth(), Math.min(hoje.getDate(), 28)))
let extras = []

const base = () => {
  const accounts = [
    { id: 'cc', name: 'Conta Corrente', type: 'checking', profileId: 'p1', contaCorrentePrincipal: true, balance: 10000, initialBalance: 10000, active: true },
    { id: 'res', name: 'Contas Anuais', type: 'savings', profileId: 'p1', isReserva: true, reservaType: 'geral', balance: 50000, initialBalance: 50000, active: true },
  ]
  const gerencialGroups = [
    { id: 'grp_1', number: 1, name: 'Gerencial', alias: 'G', fixed: true },
    { id: 'grp_D', number: 'D', name: 'Despesa', alias: 'D', fixed: true },
    { id: 'grp_ca', number: 2, name: 'Contas Anuais', alias: 'CA', defaultAccountId: 'res' },
  ]
  const reserveFunctions = [{ id: 'fn_esc', name: 'Escola', accountId: 'res', ordem: 0 }, { id: 'fn_ipva', name: 'IPVA', accountId: 'res', ordem: 1 }]
  const despesa = {
    id: 'sch_esc', description: 'ESCOLA EXEMPLO', transactionType: 'expense', accountId: 'cc', accountType: 'checking', amount: 1268,
    frequency: 'monthly', startDate: inicio, occurrenceType: 'installment', installments: 3, grupoGerencial: 'grp_ca', reservaFuncaoId: 'fn_esc',
    registered: [], registeredMeta: {}, skipped: [], overrides: {}, categoryId: 'cat_esc', autoRegister: false, tipoDocumentoId: null, payee: '',
  }
  const resgate = novoResgateVinculado(despesa, { accounts, gerencialGroups, reserveFunctions })
  return {
    settings: { financialMonthStartDay: 1, financialMonthMode: 'custom', currency: 'BRL', recurringMatchExceptions: [], categoryGroups: [], faturasFechadas: {} },
    costCenters: [], transactions: [...extras], budgets: [], classificationRules: [], gerencialRules: [], payables: [],
    payees: [], envelopes: [], accountGroups: null, cardImports: [], rateios: [], scheduleReservaFuncoes: [], favorecidoAliases: [],
    profiles: [{ id: 'p1', name: 'Pessoal', ordem: 0 }],
    categories: [{ id: 'cat_esc', name: 'Escola', type: 'expense', icon: '🎒' }],
    accounts, gerencialGroups, reserveFunctions, schedules: [despesa, resgate],
  }
}

vi.mock('../lib/db', async (orig) => ({
  ...(await orig()),
  loadFromDb: vi.fn(async () => ({ status: 'connected', assinatura: null, recursos: null, data: base() })),
}))
vi.mock('./atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useAtalhoTitulo: (t) => t }))
vi.mock('../components/shared/ShortcutHint', () => ({ default: () => null }))

const { AppProvider, useApp } = await import('./AppContext')
const { default: SchedulePanel } = await import('../components/Schedule/SchedulePanel')

let app
function Espiao() { app = useApp(); return null }

beforeAll(() => {
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  localStorage.setItem('auth_token', 'x.' + btoa(JSON.stringify({ nivel: 'admin', sub: 't', exp: 4102444800 })) + '.y')
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {}
})
afterEach(() => { cleanup(); extras = [] })

async function montar() {
  render(<AppProvider><Espiao /><SchedulePanel /></AppProvider>)
  await waitFor(() => expect(app.schedules.length).toBe(2), { timeout: 15000 })
  await screen.findAllByText(/ESCOLA EXEMPLO/, {}, { timeout: 15000 })
}
const resgate = () => app.schedules.find(s => s.agendamentoVinculadoId === 'sch_esc')
const linhaDoResgate = () => screen.getByTestId('selo-acompanha').closest('tr')
const linhaDaDespesa = () => screen.getAllByText('ESCOLA EXEMPLO').map(el => el.closest('tr')).find(tr => tr && !within(tr).queryByTestId('selo-acompanha'))
const saldo = (id) => app.accounts.find(a => a.id === id).balance

describe('linha do resgate ligado', () => {
  it('Pagar, Vincular e Excluir; sem Pular/Estornar; selo "Acompanha" abre a despesa; vem antes da despesa', async () => {
    await montar()
    const r = linhaDoResgate()
    expect(within(r).getByTestId('selo-acompanha').textContent).toMatch('Acompanha: ESCOLA EXEMPLO')
    for (const nome of ['Pagar', 'Vincular', 'Excluir']) expect(within(r).getByRole('button', { name: nome })).toBeTruthy()
    for (const nome of ['Pular', 'Estornar']) expect(within(r).queryByRole('button', { name: nome })).toBeNull()
    const d = linhaDaDespesa()
    for (const nome of ['Pagar', 'Pular', 'Estornar', 'Excluir']) expect(within(d).getByRole('button', { name: nome })).toBeTruthy()
    // Mesmo dia: o resgate antes da despesa.
    expect(r.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(within(r).getByTestId('selo-acompanha'))
    expect(await screen.findByText('Editar Agendamento')).toBeTruthy()
    expect(screen.getByDisplayValue('ESCOLA EXEMPLO')).toBeTruthy()
    expect(screen.queryByTestId('painel-resgate-ligado')).toBeNull()
  }, 40000)

  it('Excluir só esta ocorrência do resgate: a despesa não muda e mudar a despesa não a traz de volta', async () => {
    await montar()
    const primeira = computeOccurrences(resgate(), 1)[0]
    fireEvent.click(within(linhaDoResgate()).getByRole('button', { name: 'Excluir' }))
    fireEvent.click(await screen.findByRole('button', { name: /Só esta ocorrência/ }))
    await waitFor(() => expect(computeOccurrences(resgate(), 10)).not.toContain(primeira))
    expect(computeOccurrences(app.schedules.find(s => s.id === 'sch_esc'), 10)).toContain(primeira)
    act(() => app.updateSchedule('sch_esc', { amount: 1300 }))
    await waitFor(() => expect(resgate().amount).toBe(1300))
    expect(computeOccurrences(resgate(), 10)).not.toContain(primeira)
  }, 40000)

  it('Excluir o resgate inteiro: some e não volta ao mudar a despesa', async () => {
    await montar()
    fireEvent.click(within(linhaDoResgate()).getByRole('button', { name: 'Excluir' }))
    fireEvent.click(await screen.findByRole('button', { name: 'O resgate inteiro' }))
    await waitFor(() => expect(resgate()).toBeUndefined())
    act(() => app.updateSchedule('sch_esc', { amount: 1300 }))
    act(() => app.garantirResgateVinculado('sch_esc'))
    await new Promise(r => setTimeout(r, 50))
    expect(resgate()).toBeUndefined()
  }, 40000)

  it('Vincular a um resgate já feito e pagar a despesa: sem resgate em dobro; saldos da reserva e da conta certos', async () => {
    extras = [{ id: 'tx_feito', type: 'transfer', accountId: 'res', toAccountId: 'cc', amount: 1268, date: inicio, description: 'Resgate feito à mão', createdAt: '2020-01-01T00:00:00.000Z' }]
    await montar()
    fireEvent.click(within(linhaDoResgate()).getByRole('button', { name: 'Vincular' }))
    const lista = await screen.findByTestId('vincular-resgate-lista')
    fireEvent.click(within(lista).getByRole('button', { name: 'Vincular' }))
    await waitFor(() => expect(resgate().registered).toHaveLength(1))
    const res0 = saldo('res')
    const cc0 = saldo('cc')
    fireEvent.click(within(linhaDaDespesa()).getByRole('button', { name: 'Pagar' }))
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar Pagamento/ }))
    await waitFor(() => expect(app.transactions.some(t => t.type === 'expense' && t.scheduleId === 'sch_esc')).toBe(true))
    await new Promise(r => setTimeout(r, 50))
    expect(app.transactions.filter(t => t.type === 'transfer').map(t => t.id)).toEqual(['tx_feito'])
    expect(saldo('res')).toBe(res0)
    expect(saldo('cc')).toBe(cc0 - 1268)
  }, 40000)

  it('Editar abre o painel do resgate: mudar a data de uma ocorrência; depois a da despesa manda', async () => {
    await montar()
    fireEvent.click(within(linhaDoResgate()).getByRole('button', { name: 'Editar' }))
    expect(await screen.findByTestId('painel-resgate-ligado')).toBeTruthy()
    const chave = computeOccurrences(resgate(), 1)[0]
    const nova = iso(new Date(Date.parse(`${chave}T12:00:00`) - 2 * 86400000))
    fireEvent.change(screen.getByLabelText('Data desta ocorrência'), { target: { value: nova } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar data/ }))
    await waitFor(() => expect(occEfetiva(resgate(), chave).date).toBe(nova))
    const daDespesa = iso(new Date(Date.parse(`${chave}T12:00:00`) + 3 * 86400000))
    act(() => app.updateSchedule('sch_esc', { overrides: { [chave]: { date: daDespesa } } }))
    await waitFor(() => expect(occEfetiva(resgate(), chave).date).toBe(daDespesa))
  }, 40000)

  it('Pagar a despesa por valor diferente NÃO paga o resgate: ele fica pendente; saldos só da despesa; nenhum "Resgate <grupo>" avulso', async () => {
    await montar()
    const res0 = saldo('res')
    const cc0 = saldo('cc')
    fireEvent.click(within(linhaDaDespesa()).getByRole('button', { name: 'Pagar' }))
    await screen.findByRole('button', { name: /Confirmar Pagamento/ })
    const valor = document.querySelector('[data-help-id="registrarAgendamento.valor"] input')
    fireEvent.change(valor, { target: { value: '1.300,50' } })
    await waitFor(() => expect(valor.value).toBe('1.300,50'))
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Pagamento/ }))
    // Resgate pendente com valor diferente: pergunta se ajusta; aqui, deixar como está.
    fireEvent.click(within(await screen.findByTestId('pergunta-ajuste-resgate')).getByRole('button', { name: 'Não, deixar como está' }))
    await waitFor(() => expect(app.transactions.some(t => t.type === 'expense' && t.scheduleId === 'sch_esc')).toBe(true))
    await new Promise(r => setTimeout(r, 50))
    expect(app.transactions.find(t => t.scheduleId === 'sch_esc').amount).toBe(1300.5)
    expect(app.transactions.filter(t => t.type === 'transfer')).toHaveLength(0)
    expect(resgate().registered).toEqual([])
    expect(saldo('res')).toBe(res0)
    expect(saldo('cc')).toBe(cc0 - 1300.5)
    // A linha do resgate continua com Pagar.
    expect(within(linhaDoResgate()).getByRole('button', { name: 'Pagar' })).toBeTruthy()
  }, 40000)

  it('Pagar o RESGATE (linha dele) por valor diferente do agendado: uma transferência só, com o valor pago; a despesa continua pendente', async () => {
    await montar()
    const res0 = saldo('res')
    const cc0 = saldo('cc')
    fireEvent.click(within(linhaDoResgate()).getByRole('button', { name: 'Pagar' }))
    await screen.findByRole('button', { name: /Confirmar/ })
    const valor = document.querySelector('[data-help-id="registrarAgendamento.valor"] input')
    fireEvent.change(valor, { target: { value: '1.300,50' } })
    await waitFor(() => expect(valor.value).toBe('1.300,50'))
    fireEvent.click(screen.getAllByRole('button', { name: /Confirmar/ }).at(-1))
    await waitFor(() => expect(resgate().registered).toHaveLength(1))
    await new Promise(r => setTimeout(r, 50))
    const transfers = app.transactions.filter(t => t.type === 'transfer')
    expect(transfers).toHaveLength(1)
    expect(transfers[0]).toMatchObject({ accountId: 'res', toAccountId: 'cc', amount: 1300.5, scheduleId: resgate().id })
    expect(saldo('res')).toBe(res0 - 1300.5)
    expect(saldo('cc')).toBe(cc0 + 1300.5)
    expect(app.schedules.find(s => s.id === 'sch_esc').registered).toEqual([])
    // Nenhum lançamento da despesa (as sombras da reserva, sem conta, são do resgate).
    expect(app.transactions.some(t => t.scheduleId === 'sch_esc')).toBe(false)
    expect(app.transactions.filter(t => t.accountId === 'cc' || t.toAccountId === 'cc').map(t => t.type)).toEqual(['transfer'])
  }, 40000)
})

// Pagar a DESPESA por valor diferente do resgate da mesma ocorrência (src/lib/ajusteResgate.js).
async function pagarDespesaPor(valorTexto) {
  fireEvent.click(within(linhaDaDespesa()).getByRole('button', { name: 'Pagar' }))
  await screen.findByRole('button', { name: /Confirmar Pagamento/ })
  const v = document.querySelector('[data-help-id="registrarAgendamento.valor"] input')
  fireEvent.change(v, { target: { value: valorTexto } })
  await waitFor(() => expect(v.value).toBe(valorTexto))
  fireEvent.click(screen.getByRole('button', { name: /Confirmar Pagamento/ }))
}
const pergunta = () => screen.queryByTestId('pergunta-ajuste-resgate')
const responder = (nome) => fireEvent.click(within(pergunta()).getByRole('button', { name: nome }))
const despesaPaga = () => waitFor(() => expect(app.transactions.some(t => t.type === 'expense' && t.scheduleId === 'sch_esc')).toBe(true))
const transfers = () => app.transactions.filter(t => t.type === 'transfer')
async function resgateJaPago() {
  await montar()
  act(() => { app.registerScheduleOccurrence(resgate().id, inicio, inicio) })
  await waitFor(() => expect(resgate().registered).toEqual([inicio]))
  return { serie: computeOccurrences(resgate(), 400), res0: saldo('res'), cc0: saldo('cc') }
}

describe('linha do resgate: próxima pendente DELE', () => {
  it('com as ocorrências 1 e 2 do resgate pagas (despesa ainda na 1ª), a linha mostra a 3ª e "3/3"', async () => {
    await montar()
    const [o1, o2, o3] = computeOccurrences(resgate(), 400)
    act(() => { app.registerScheduleOccurrence(resgate().id, o1, o1) })
    await waitFor(() => expect(resgate().registered).toEqual([o1]))
    act(() => { app.registerScheduleOccurrence(resgate().id, o1, o2) })
    await waitFor(() => expect(resgate().registered).toEqual([o1, o2]))
    const fmtBR = (d) => d.split('-').reverse().join('/')
    await waitFor(() => expect(linhaDoResgate().textContent).toMatch(fmtBR(o3)))
    expect(linhaDoResgate().textContent).toMatch('3/3')
    expect(linhaDoResgate().textContent).not.toMatch(fmtBR(o2))
    // A despesa continua na 1ª.
    expect(linhaDaDespesa().textContent).toMatch(fmtBR(o1))
  }, 40000)
})

describe('pagar a despesa por valor diferente do resgate', () => {
  it('(a) resgate pago, pagando MAIS — Sim: resgate complementar da diferença; sem ocorrência nova', async () => {
    const { serie, res0 } = await resgateJaPago()
    await pagarDespesaPor('1.300,00')
    expect((await screen.findByTestId('pergunta-ajuste-resgate')).textContent)
      .toMatch(/Você resgatou R\$\s*1\.268,00 para esta despesa e está pagando R\$\s*1\.300,00\. Deseja criar um resgate complementar de R\$\s*32,00\?/)
    expect(app.transactions.some(t => t.type === 'expense' && t.scheduleId === 'sch_esc')).toBe(false) // nada gravado antes da resposta
    // Celular 380 px e temas: só cores do tema, botões que quebram linha, sem largura fixa.
    const classes = [pergunta(), ...pergunta().querySelectorAll('*')].map(el => el.getAttribute('class') || '').join(' ')
    expect(classes).not.toMatch(/\b(min-)?w-\[|\bwhitespace-nowrap\b|#[0-9a-fA-F]{3,6}\b|\b(text|bg|border)-(red|green|blue|gray|slate|zinc|white|black)\b/)
    expect(classes).toMatch(/\bflex-wrap\b/)
    responder('Sim')
    await despesaPaga()
    await waitFor(() => expect(transfers()).toHaveLength(2))
    const aj = transfers().find(t => t.origin === 'resgate_ajuste')
    expect(aj).toMatchObject({ accountId: 'res', toAccountId: 'cc', amount: 32, sourceScheduleId: resgate().id, dataOcorrencia: inicio, reservaFuncaoId: 'fn_esc' })
    expect(transfers().some(t => /^Resgate Contas Anuais$/.test(t.description))).toBe(false)
    expect(saldo('res')).toBe(res0 - 32)
    expect(resgate().registered).toEqual([inicio])
    expect(computeOccurrences(resgate(), 400)).toEqual(serie)
    // Estornar a despesa não desfaz o complementar (o estorno dele é pelo próprio lançamento).
    const desp = app.transactions.find(t => t.type === 'expense' && t.scheduleId === 'sch_esc')
    act(() => app.reverseTransaction(desp.id))
    await waitFor(() => expect(app.schedules.find(s => s.id === 'sch_esc').registered).toEqual([]))
    expect(transfers().some(t => t.id === aj.id)).toBe(true)
    expect(resgate().registered).toEqual([inicio])
  }, 40000)

  it('(a) resgate pago, pagando MAIS — Não: grava só a despesa', async () => {
    const { res0 } = await resgateJaPago()
    await pagarDespesaPor('1.300,00')
    await screen.findByTestId('pergunta-ajuste-resgate')
    responder('Não, gravar só a despesa')
    await despesaPaga()
    await new Promise(r => setTimeout(r, 50))
    expect(transfers()).toHaveLength(1)
    expect(saldo('res')).toBe(res0)
  }, 40000)

  it('(a) resgate pago, pagando MENOS — Sim: devolve a diferença para "conta › função"', async () => {
    const { res0, cc0, serie } = await resgateJaPago()
    await pagarDespesaPor('1.200,00')
    expect((await screen.findByTestId('pergunta-ajuste-resgate')).textContent)
      .toMatch(/Você resgatou R\$\s*1\.268,00 para esta despesa e está pagando R\$\s*1\.200,00\. Deseja devolver R\$\s*68,00 para Contas Anuais › Escola\?/)
    responder('Sim')
    await despesaPaga()
    await waitFor(() => expect(transfers()).toHaveLength(2))
    expect(transfers().find(t => t.origin === 'resgate_ajuste')).toMatchObject({ accountId: 'cc', toAccountId: 'res', amount: 68, reservaFuncaoId: 'fn_esc' })
    expect(saldo('res')).toBe(res0 + 68)
    expect(saldo('cc')).toBe(cc0 - 1200 - 68)
    expect(computeOccurrences(resgate(), 400)).toEqual(serie)
  }, 40000)

  it('(a) resgate pago, pagando MENOS — Não: grava só a despesa', async () => {
    await resgateJaPago()
    await pagarDespesaPor('1.200,00')
    await screen.findByTestId('pergunta-ajuste-resgate')
    responder('Não, gravar só a despesa')
    await despesaPaga()
    await new Promise(r => setTimeout(r, 50))
    expect(transfers()).toHaveLength(1)
  }, 40000)

  it('(b) resgate pendente: MAIS com Sim ajusta só esta ocorrência (continua pendente); MENOS com Não deixa como está', async () => {
    await montar()
    await pagarDespesaPor('1.300,00')
    expect((await screen.findByTestId('pergunta-ajuste-resgate')).textContent)
      .toMatch(/O resgate desta ocorrência está agendado em R\$\s*1\.268,00\. Deseja ajustar para R\$\s*1\.300,00\?/)
    responder('Sim')
    await despesaPaga()
    await waitFor(() => expect(occEfetiva(resgate(), inicio).amount).toBe(1300))
    expect(resgate().registered).toEqual([])
    expect(transfers()).toHaveLength(0)
    const proxima = computeOccurrences(resgate(), 400)[1]
    expect(occEfetiva(resgate(), proxima).amount).toBe(1268)
    // Próxima ocorrência da despesa, pagando MENOS → Não: o resgate dela fica como está.
    await pagarDespesaPor('1.200,00')
    expect((await screen.findByTestId('pergunta-ajuste-resgate')).textContent).toMatch(/Deseja ajustar para R\$\s*1\.200,00\?/)
    responder('Não, deixar como está')
    await waitFor(() => expect(app.schedules.find(s => s.id === 'sch_esc').registered).toHaveLength(2))
    expect(occEfetiva(resgate(), proxima).amount).toBe(1268)
  }, 40000)

  it('(b) resgate pendente, pagando MENOS — Sim: ajusta para o valor pago; MAIS — Não: fica como está', async () => {
    await montar()
    await pagarDespesaPor('1.200,00')
    await screen.findByTestId('pergunta-ajuste-resgate')
    responder('Sim')
    await waitFor(() => expect(occEfetiva(resgate(), inicio).amount).toBe(1200))
    expect(resgate().registered).toEqual([])
    const proxima = computeOccurrences(resgate(), 400)[1]
    await pagarDespesaPor('1.300,00')
    await screen.findByTestId('pergunta-ajuste-resgate')
    responder('Não, deixar como está')
    await waitFor(() => expect(app.schedules.find(s => s.id === 'sch_esc').registered).toHaveLength(2))
    expect(occEfetiva(resgate(), proxima).amount).toBe(1268)
  }, 40000)

  it('valor igual: não pergunta', async () => {
    await montar()
    await pagarDespesaPor('1.268,00')
    await despesaPaga()
    expect(pergunta()).toBeNull()
    expect(occEfetiva(resgate(), inicio).amount).toBe(1268)
  }, 40000)

  it('efetivar em lote com valor diferente: não pergunta, grava só a despesa', async () => {
    await montar()
    fireEvent.click(screen.getByRole('button', { name: /Selecionar/ }))
    fireEvent.click(await screen.findByLabelText('Selecionar ESCOLA EXEMPLO'))
    fireEvent.click(screen.getByRole('button', { name: /Registrar selecionados/ }))
    const v = await screen.findByLabelText('Valor de ESCOLA EXEMPLO')
    fireEvent.change(v, { target: { value: '1.300,00' } })
    await waitFor(() => expect(v.value).toBe('1.300,00'))
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Registro/ }))
    await despesaPaga()
    await new Promise(r => setTimeout(r, 50))
    expect(pergunta()).toBeNull()
    expect(transfers()).toHaveLength(0)
    expect(app.transactions.find(t => t.scheduleId === 'sch_esc').amount).toBe(1300)
    expect(occEfetiva(resgate(), inicio).amount).toBe(1268)
  }, 40000)
})

describe('Fluxo de Caixa: mudar data do resgate ligado', () => {
  it('só esta ocorrência pode; a série segue a despesa', () => {
    const r = base().schedules[1]
    const op = opcoesAplicarData(r, inicio, '2099-01-01', inicio)
    expect(op.bloqueio).toBeUndefined()
    expect(op.serie.ok).toBe(false)
    expect(op.serie.motivo).toMatch('mude a despesa')
  })
})
