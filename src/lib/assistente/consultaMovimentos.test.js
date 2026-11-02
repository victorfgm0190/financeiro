import { describe, it, expect } from 'vitest'
import {
  intervaloDoPeriodo, filtroInicial, resolverNome, casaComFiltro, pagosDoFiltro, abertosDoFiltro, refinamentos,
  aplicarMudanca, continuacaoDoTexto, textoPrincipal, textoComplemento, MAX_BOTOES,
} from './consultaMovimentos'
import { criarClassificadores } from '../receitasDespesas'
import { despesasPorCategoria } from '../despesasPorCategoria'
import { isResgateReservaSombra } from '../../components/shared/utils'
import { buildScheduleGroups } from '../agendamentosGrupos'
import { ocorrenciasPendentes } from '../agendaCalendario'
import { computeOccurrences } from '../occurrences'

// Dados FICTÍCIOS.
const HOJE = '2026-11-02'
const accounts = [{ id: 'cc', name: 'Conta Exemplo', type: 'checking' }, { id: 'res', name: 'Reserva Exemplo', type: 'savings', isReserva: true }]
const cls = { ...criarClassificadores([], accounts), isResgateReservaSombra }
const tx = (id, date, amount, extra = {}) => ({ id, date, amount, type: 'expense', accountId: 'cc', ...extra })
const transactions = [
  tx('t1', '2026-11-01', 100, { payee: 'João Exemplo', description: 'Consulta', categoryId: 'saude' }),
  tx('t2', '2026-10-10', 80, { payee: 'João Exemplo', description: 'Consulta', categoryId: 'saude' }),
  tx('t3', '2026-11-01', 50, { payee: 'Posto Exemplo', description: 'Gasolina', categoryId: 'comb' }),
  tx('t4', '2026-11-20', 70, { payee: 'João Exemplo', description: 'Consulta futura', categoryId: 'saude' }), // ainda não pago
  tx('t5', '2026-11-01', 30, { payee: 'João Exemplo', description: 'Reserva', reservaAuto: true }), // sombra técnica
  { id: 't6', date: '2026-11-01', amount: 900, type: 'transfer', accountId: 'cc', toAccountId: 'res', payee: 'João Exemplo' }, // transferência
  tx('t7', '2026-11-01', 400, { payee: 'João Exemplo Filho', description: 'Aluguel', categoryId: 'casa' }),
  { id: 't8', date: '2026-11-01', amount: 1000, type: 'income', accountId: 'cc', payee: 'João Exemplo', description: 'Reembolso' },
]
const base = { transactionType: 'expense', accountId: 'cc', overrides: {}, registered: [], skipped: [], frequency: 'monthly', occurrenceType: 'continuous' }
const schedules = [
  { ...base, id: 's1', description: 'Plano mensal', payee: 'João Exemplo', amount: 120, startDate: '2026-10-15', nextOccurrence: '2026-10-15', categoryId: 'saude' }, // vencido
  { ...base, id: 's2', description: 'Curso', payee: 'Escola Exemplo', amount: 300, startDate: '2026-09-10', occurrenceType: 'installment', installments: 4, registered: ['2026-09-10', '2026-10-10'], nextOccurrence: '2026-11-10' },
  { ...base, id: 's3', description: 'Provisão IPVA', payee: 'João Exemplo', amount: 999, startDate: '2026-11-20', isProvisao: true },
  { ...base, id: 's4', description: 'Aplicação', payee: 'João Exemplo', amount: 500, startDate: '2026-11-05', transactionType: 'transfer', toAccountId: 'res' },
]
const rows = buildScheduleGroups(schedules, computeOccurrences)
const pendentes = (ini, fim) => ocorrenciasPendentes(rows, computeOccurrences, { ini, fim, hoje: HOJE, accounts })

describe('período', () => {
  it('padrões e rótulos visíveis', () => {
    expect(intervaloDoPeriodo('mes_atual', { hoje: HOJE })).toMatchObject({ ini: '2026-11-01', fim: '2026-11-30', rotulo: 'Este mês (01/11 a 30/11)' })
    expect(intervaloDoPeriodo('mes_passado', { hoje: HOJE })).toMatchObject({ ini: '2026-10-01', fim: '2026-10-31' })
    expect(intervaloDoPeriodo('ultimos_3_meses', { hoje: HOJE })).toMatchObject({ ini: '2026-09-01', fim: '2026-11-30' })
    expect(intervaloDoPeriodo('este_ano', { hoje: HOJE })).toMatchObject({ ini: '2026-01-01', fim: '2026-12-31' })
    expect(intervaloDoPeriodo('intervalo', { hoje: HOJE, de: '2026-08-05', ate: '2026-09-20' })).toEqual({ ini: '2026-08-05', fim: '2026-09-20', rotulo: 'De 05/08/2026 a 20/09/2026' })
    expect(intervaloDoPeriodo('pendentes', { hoje: HOJE })).toMatchObject({ ini: '0000-01-01', fim: '2027-11-30' })
  })
  it('mês financeiro do Painel quando informado', () => {
    const mesPainel = (f) => (f === 'current' ? { start: '2026-10-25', end: '2026-11-24' } : { start: '2026-09-25', end: '2026-10-24' })
    expect(intervaloDoPeriodo('mes_atual', { hoje: HOJE, mesPainel })).toMatchObject({ ini: '2026-10-25', fim: '2026-11-24' })
  })
  it('sem período: pago = mês atual (histórico se pedido); em aberto = todas as pendentes', () => {
    expect(filtroInicial({ status: 'pago', favorecido: 'João' }).periodo).toBe('mes_atual')
    expect(filtroInicial({ status: 'pago', historico_completo: true }).periodo).toBe('historico')
    expect(filtroInicial({ status: 'em_aberto' }).periodo).toBe('pendentes')
    expect(filtroInicial({ status: 'pago', periodo: 'mes_atual', de: '2026-01-01', ate: '2026-01-31' })).toMatchObject({ periodo: 'intervalo', de: '2026-01-01' })
  })
})

describe('resolver nomes sem escolher sozinho', () => {
  const nomes = ['João Exemplo', 'João Exemplo Filho', 'Maria Teste', 'Posto Exemplo']
  it('exato, vários, parecido, nenhum', () => {
    expect(resolverNome('joão exemplo', nomes).valor).toBe('João Exemplo')
    expect(resolverNome('Maria', nomes).valor).toBe('Maria Teste')
    expect(resolverNome('João', nomes).opcoes).toEqual(['João Exemplo', 'João Exemplo Filho'])
    expect(resolverNome('Mariah Testi', nomes).sugestoes).toEqual(['Maria Teste'])
    expect(resolverNome('Pedro', nomes)).toEqual({ valor: null, opcoes: [], sugestoes: [] })
  })
  it('descrição: uma palavra solta coincidente não basta', () => {
    expect(casaComFiltro({ description: 'Consulta médica' }, { descricao: 'consulta' })).toBe(true)
    expect(casaComFiltro({ description: 'Consulta médica' }, { descricao: 'consulta dentista' })).toBe(false)
    expect(casaComFiltro({ payee: 'João Exemplo Filho' }, { favorecido: 'João Exemplo' })).toBe(false)
  })
})

describe('pagos (classificação do Painel)', () => {
  const f = filtroInicial({ status: 'pago', favorecido: 'João Exemplo' })
  it('favorecido: só despesas pagas até hoje; sem sombra, transferência, receita ou outro favorecido', () => {
    const p = pagosDoFiltro(transactions, f, intervaloDoPeriodo('mes_atual', { hoje: HOJE }), cls, { hoje: HOJE })
    expect(p.itens.map(t => t.id)).toEqual(['t1'])
    expect(p.total).toBe(100)
  })
  it('recebidos', () => {
    const p = pagosDoFiltro(transactions, { ...f, tipo: 'receita' }, intervaloDoPeriodo('mes_atual', { hoje: HOJE }), cls, { hoje: HOJE })
    expect(p.itens.map(t => t.id)).toEqual(['t8'])
  })
  it('categoria = o número do Painel (despesasPorCategoria)', () => {
    const fc = filtroInicial({ assunto: 'categoria', status: 'pago', categoria_id: 'saude' })
    const per = intervaloDoPeriodo('mes_atual', { hoje: HOJE })
    const p = pagosDoFiltro(transactions, fc, per, cls, { hoje: HOJE })
    const painel = despesasPorCategoria(transactions, { start: per.ini, end: per.fim }, cls, 'cheio').categorias.find(c => c.categoryId === 'saude')
    expect(p).toMatchObject({ total: painel.valor, painel: true })
    expect(p.total).toBe(170) // o Painel conta o mês inteiro (inclui o lançamento de 20/11)
  })
  it('período com intervalo e mês passado', () => {
    const p = pagosDoFiltro(transactions, aplicarMudanca(f, { periodo: 'mes_passado' }), intervaloDoPeriodo('mes_passado', { hoje: HOJE }), cls, { hoje: HOJE })
    expect(p.itens.map(t => t.id)).toEqual(['t2'])
  })
})

describe('em aberto / vencidos (ocorrências da Agenda)', () => {
  it('mesmas ocorrências da Agenda; sem provisão nem aplicação/transferência', () => {
    const per = intervaloDoPeriodo('pendentes', { hoje: HOJE })
    const itens = pendentes(per.ini, per.fim)
    const a = abertosDoFiltro(itens, filtroInicial({ status: 'em_aberto', favorecido: 'João Exemplo' }), { hoje: HOJE })
    expect(a.itens.every(i => i.schedule.id === 's1')).toBe(true)
    expect(a.itens[0]).toMatchObject({ data: '2026-10-15', amount: 120 })
    expect(a.vencidos).toBe(1)
    expect(a.proximo.data).toBe('2026-11-15')
    // Bate com a lista da Agenda (mesmo item, mesmo valor).
    const daAgenda = itens.filter(i => i.schedule.id === 's1')
    expect(a.total).toBe(Math.round(daAgenda.reduce((s, i) => s + i.amount, 0) * 100) / 100)
  })
  it('vencidos e agendamento específico (descrição)', () => {
    const v = abertosDoFiltro(pendentes('0000-01-01', '2026-11-01'), filtroInicial({ status: 'vencido', favorecido: 'João Exemplo' }), { hoje: HOJE, soVencidos: true })
    expect(v.itens.map(i => i.data)).toEqual(['2026-10-15'])
    const curso = abertosDoFiltro(pendentes('0000-01-01', '2027-11-30'), filtroInicial({ status: 'em_aberto', descricao: 'curso' }), { hoje: HOJE })
    expect(curso.itens.map(i => i.data)).toEqual(['2026-11-10', '2026-12-10'])
    expect(curso.total).toBe(600)
  })
})

describe('textos, refinamentos e continuação', () => {
  it('texto principal mostra o período; complemento resume o outro lado', () => {
    const f = filtroInicial({ status: 'pago', favorecido: 'João Exemplo' })
    const periodo = intervaloDoPeriodo('mes_atual', { hoje: HOJE })
    expect(textoPrincipal(f, { periodo, pagos: { itens: [transactions[0]], total: 100 } })).toBe('Pago a João Exemplo: R$ 100,00 em 1 lançamento — Este mês (01/11 a 30/11).')
    const abertos = abertosDoFiltro(pendentes('0000-01-01', '2027-11-30'), { ...f, status: 'em_aberto' }, { hoje: HOJE })
    expect(textoComplemento(f, { tipo: 'abertos', dados: abertos })).toMatch(/^Em aberto: R\$ .* 1 vencido \(R\$ 120,00\); próximo vencimento 15\/11\/2026\.$/)
  })
  it('no máximo 4 botões; cada um muda só um filtro', () => {
    for (const st of ['pago', 'em_aberto', 'vencido', 'todos']) {
      for (const rel of [{}, { favorecido: 'João Exemplo' }]) {
        const f = filtroInicial({ status: st, ...rel })
        const bs = refinamentos(f)
        expect(bs.length).toBeLessThanOrEqual(MAX_BOTOES)
        for (const b of bs.filter(x => x.mudanca)) {
          const novo = aplicarMudanca(f, b.mudanca)
          expect(novo.favorecido).toBe(f.favorecido) // contexto mantido
          expect(novo.tipo).toBe(f.tipo)
        }
      }
    }
    const f = filtroInicial({ status: 'pago', favorecido: 'João Exemplo' })
    expect(refinamentos(f).map(b => b.rotulo)).toEqual(['Mês passado', 'Últimos 3 meses', 'Só em aberto', 'Escolher datas'])
  })
  it.each([
    ['e no mês passado?', { periodo: 'mes_passado' }],
    ['E este ano', { periodo: 'este_ano' }],
    ['e nos últimos 3 meses?', { periodo: 'ultimos_3_meses' }],
    ['e em setembro?', { periodo: 'intervalo', de: '2026-09-01', ate: '2026-09-30' }],
    ['e em dezembro?', { periodo: 'intervalo', de: '2025-12-01', ate: '2025-12-31' }],
    ['e de 01/08 a 15/08?', { periodo: 'intervalo', de: '2026-08-01', ate: '2026-08-15' }],
    ['e em aberto?', { status: 'em_aberto' }],
    ['e os vencidos?', { status: 'vencido' }],
    ['e do Pedro?', { favorecido: 'pedro' }],
  ])('continuação: %s', (t, m) => expect(continuacaoDoTexto(t, HOJE)).toEqual(m))
  it.each(['gastei 50 no mercado', 'qual o saldo da conta corrente', 'lance despesa de 100 de combustível hoje no cartão'])('não é continuação: %s', (t) => {
    expect(continuacaoDoTexto(t, HOJE)).toBeNull()
  })
})
