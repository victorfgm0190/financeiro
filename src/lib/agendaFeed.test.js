import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { computeOccurrences } from './occurrences.js'
import { buildScheduleGroups } from './agendamentosGrupos.js'
import { montarCalendario, limitesDoMes } from './agendaCalendario.js'
import { itensDoFeed, gerarFeed, janelaDoFeed, uidOcorrencia } from './agendaFeed.js'
import { recortarLeitura } from '../../api/_permissoesApi.js'

// Data fixa: buildScheduleGroups lê o "hoje" do relógio.
const HOJE = '2026-10-18'
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 18, 12)) })
afterAll(() => { vi.useRealTimers() })

const gno = (s, n = 12) => computeOccurrences(s, n)
const ACCOUNTS = [
  { id: 'acc_cc', name: 'Conta Itaú', apelido: 'Itaú' },
  { id: 'acc_card', name: 'Cartão Visa', type: 'credit' },
  { id: 'acc_card2', name: 'Cartão Master', type: 'credit' },
  { id: 'acc_poup', name: 'Poupança', type: 'savings', isReserva: true },
]
const CATEGORIES = [{ id: 'cat_casa', name: 'Casa' }, { id: 'cat_sal', name: 'Salário' }]
const base = (o) => ({ registered: [], skipped: [], overrides: {}, frequency: 'once', accountId: 'acc_cc', ...o })

const SCHEDULES = [
  base({ id: 'aluguel', description: 'Aluguel', transactionType: 'expense', amount: 1500, frequency: 'monthly', startDate: '2026-09-05',
    registered: ['2026-09-05'], categoryId: 'cat_casa', payee: 'Imobiliária Lar, Ltda; Centro' }),
  base({ id: 'salario', description: 'Salário', transactionType: 'income', amount: 9000, frequency: 'monthly', startDate: '2026-11-05', categoryId: 'cat_sal' }),
  base({ id: 'iptu', description: 'IPTU', transactionType: 'expense', amount: 300, startDate: '2026-10-10' }), // atrasado
  base({ id: 'velho', description: 'Atrasado demais', transactionType: 'expense', amount: 50, startDate: '2026-08-01' }), // fora da janela
  base({ id: 'zero', description: 'Zerado', transactionType: 'expense', amount: 0, startDate: '2026-10-25' }),
  base({ id: 'aplic', description: 'Aplicação', transactionType: 'transfer', toAccountId: 'acc_poup', amount: 500, startDate: '2026-10-28' }),
  // Agendamento da fatura de novembro do Visa: o card do contas_a_pagar da MESMA fatura sai.
  base({ id: 'fsch_acc_card_202611_pagamento_fatura', tipo: 'pagamento_fatura', transactionType: 'transfer', toAccountId: 'acc_card',
    cardId: 'acc_card', description: 'Pagamento Fatura Visa', amount: 1234.56, startDate: '2026-11-20',
    overrides: { _gerencial: { cardId: 'acc_card', faturaRef: '11/2026' } } }),
]
const PAYABLES = [
  { id: 'cap1', origin: 'invoice', cartaoId: 'acc_card', mesAno: '2026-11', dueDate: '2026-11-20', amount: 1234.56, status: 'pending', description: 'Fatura Visa 11/2026' },
  { id: 'cap2', origin: 'invoice', cartaoId: 'acc_card2', mesAno: '2026-10', dueDate: '2026-10-25', amount: 800, status: 'pending', description: 'Fatura Master 10/2026' },
  { id: 'cap3', origin: 'invoice', cartaoId: 'acc_card2', mesAno: '2026-09', dueDate: '2026-09-25', amount: 700, status: 'paid' },
]
const DADOS = { schedules: SCHEDULES, payables: PAYABLES, accounts: ACCOUNTS, categories: CATEGORIES, getNextOccurrences: gno, hoje: HOJE }
const AGORA = new Date('2026-10-18T15:00:00Z')
const feed = (extra = {}) => gerarFeed({ ...DADOS, agora: AGORA, linkFinup: 'https://aa.finup.app.br/', ...extra })
const uids = (ics) => [...ics.matchAll(/^UID:(.+)$/gm)].map(m => m[1].trim())

describe('janela do feed', () => {
  it('hoje − 30 dias até hoje + 12 meses', () => {
    expect(janelaDoFeed('2026-10-18')).toEqual({ ini: '2026-09-18', fim: '2027-10-18' })
    expect(janelaDoFeed('2028-02-29')).toEqual({ ini: '2028-01-30', fim: '2029-02-28' })
  })
})

describe('itens do feed', () => {
  const itens = itensDoFeed(DADOS)

  it('Despesas: despesas + faturas; Receitas: receitas; transferências, zerados e fora da janela não entram', () => {
    const ids = (l) => [...new Set(l.map(i => i.schedule?.id || i.fatura.id))].sort()
    expect(ids(itens.despesa)).toEqual(['aluguel', 'cap2', 'fsch_acc_card_202611_pagamento_fatura', 'iptu'])
    expect(ids(itens.receita)).toEqual(['salario'])
  })

  it('a mesma fatura nunca aparece duas vezes (card do contas_a_pagar × agendamento pagamento_fatura)', () => {
    const ics = feed().despesa.conteudo
    const visa = uids(ics).filter(u => u.startsWith('fat-acc_card-202611'))
    expect(visa).toEqual(['fat-acc_card-202611@finup.app.br'])
    expect(uids(ics)).toContain('fat-acc_card2-202610@finup.app.br')
    expect(new Set(uids(ics)).size).toBe(uids(ics).length)
  })

  it('recorrente: próxima e seguintes até o fim da janela (12 meses)', () => {
    const aluguel = itens.despesa.filter(i => i.schedule?.id === 'aluguel').map(i => i.data)
    expect(aluguel[0]).toBe('2026-10-05')
    expect(aluguel.at(-1)).toBe('2027-10-05')
    expect(aluguel).toHaveLength(13)
  })

  it('mesmas ocorrências e valores da Visão Calendário (status A pagar), mês a mês', () => {
    const { ini, fim } = janelaDoFeed(HOJE)
    const rows = buildScheduleGroups(SCHEDULES.filter(s => s.id !== 'zero'), gno, { agruparSeries: false })
    const doFeed = [...itens.despesa, ...itens.receita]
    for (const ym of ['2026-10', '2026-11', '2026-12', '2027-06']) {
      const cal = montarCalendario({ ym, status: 'apagar', rows, faturas: [PAYABLES[1]], getNextOccurrences: gno, hoje: HOJE, accounts: ACCOUNTS })
      const [a, b] = limitesDoMes(ym)
      const doCal = [...cal.dias.values()].flatMap(d => d.itens)
        .filter(i => i.data >= a && i.data <= b && i.data >= ini && i.data <= fim && i.grupo !== 'aplicacao')
        .map(i => `${i.data}|${i.amount}`).sort()
      const f = doFeed.filter(i => i.data >= a && i.data <= b).map(i => `${i.data}|${i.amount}`).sort()
      expect(f).toEqual(doCal)
    }
  })

  it('sem permissão de ver agendamentos → feed vazio', () => {
    expect(itensDoFeed({ ...DADOS, podeVer: false })).toEqual({ despesa: [], receita: [] })
    const f = feed({ podeVer: false })
    expect(f.despesa.conteudo).not.toContain('BEGIN:VEVENT')
    expect(f.receita.conteudo).not.toContain('BEGIN:VEVENT')
  })

  it('perfis: usuário restrito a um perfil só recebe os agendamentos das contas dele (recorte do /api/load)', () => {
    const linhas = [
      { id: 'p1', account_id: 'acc_cc', to_account_id: null },
      { id: 'p2', account_id: 'acc_outro', to_account_id: null },
    ]
    const ctx = { perfis: ['perfil_a'], contas: new Set(['acc_cc']), funcoes: new Set() }
    const permitidos = new Set(recortarLeitura('agendamentos', linhas, ctx).map(r => r.id))
    const schedules = [
      base({ id: 'p1', description: 'Do perfil A', transactionType: 'expense', amount: 10, startDate: '2026-10-20' }),
      base({ id: 'p2', description: 'Do perfil B', transactionType: 'expense', amount: 20, startDate: '2026-10-21', accountId: 'acc_outro' }),
    ].filter(s => permitidos.has(s.id))
    const ics = gerarFeed({ ...DADOS, schedules, payables: [], agora: AGORA }).despesa.conteudo
    expect(ics).toContain('Do perfil A')
    expect(ics).not.toContain('Do perfil B')
  })
})

describe('.ics do feed', () => {
  it('título com valor, descrição com conta, categoria, favorecido e link; caracteres escapados', () => {
    const ics = feed().despesa.conteudo.replace(/\r\n /g, '')
    expect(ics).toContain('SUMMARY:Aluguel — R$ 1.500\\,00')
    expect(ics).toContain('DESCRIPTION:Conta: Itaú\\nCategoria: Casa\\nFavorecido: Imobiliária Lar\\, Ltda\\; Centro\\nAbrir no Finup: https://aa.finup.app.br/')
    expect(ics).toContain('SUMMARY:⚠ IPTU — R$ 300\\,00')
    expect(ics).toContain('Atrasado (venceu em 10/10/2026)')
  })

  it('valores ocultos (mostrar_valores = false): título sem R$', () => {
    const f = feed({ mostrarValores: false })
    const ics = f.despesa.conteudo.replace(/\r\n /g, '')
    expect(ics).toContain('SUMMARY:Aluguel\r\n')
    expect(ics).not.toMatch(/R\$/)
    expect(f.receita.conteudo).not.toMatch(/R\$/)
  })

  it('só os tipos escolhidos', () => {
    expect(Object.keys(feed({ tipos: ['receita'] }))).toEqual(['receita'])
  })

  it('UID estável entre duas gerações (outra hora) e hash igual', () => {
    const a = feed()
    const b = feed({ agora: new Date('2026-10-18T22:00:00Z') })
    expect(uids(b.despesa.conteudo)).toEqual(uids(a.despesa.conteudo))
    expect(b.despesa.hash).toBe(a.despesa.hash)
    expect(b.despesa.conteudo).not.toBe(a.despesa.conteudo) // só o DTSTAMP mudou
  })

  it('UID da ocorrência não muda quando a anterior é paga (a próxima vira outra) nem quando a data é movida', () => {
    const antes = uids(feed().despesa.conteudo)
    const pago = SCHEDULES.map(s => s.id === 'aluguel' ? { ...s, registered: [...s.registered, '2026-10-05'] } : s)
    const depois = uids(feed({ schedules: pago }).despesa.conteudo)
    expect(depois).not.toContain(uidOcorrencia('aluguel', '2026-10-05'))
    expect(depois).toContain(uidOcorrencia('aluguel', '2026-11-05'))
    expect(antes).toContain(uidOcorrencia('aluguel', '2026-11-05'))
    const movido = SCHEDULES.map(s => s.id === 'aluguel' ? { ...s, overrides: { '2026-11-05': { date: '2026-11-03' } } } : s)
    const ics = feed({ schedules: movido }).despesa.conteudo
    expect(ics).toContain(`UID:${uidOcorrencia('aluguel', '2026-11-05')}\r\nDTSTAMP:20261018T150000Z\r\nDTSTART;VALUE=DATE:20261103`)
  })

  it('regeneração: mudar um agendamento muda o hash; não mudar nada não muda', () => {
    const a = feed()
    const mudou = SCHEDULES.map(s => s.id === 'iptu' ? { ...s, amount: 310 } : s)
    expect(feed({ schedules: mudou }).despesa.hash).not.toBe(a.despesa.hash)
    expect(feed({ schedules: mudou }).receita.hash).toBe(a.receita.hash)
    expect(feed({ schedules: [...SCHEDULES] }).despesa.hash).toBe(a.despesa.hash)
  })
})
