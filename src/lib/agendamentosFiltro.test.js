import { describe, it, expect } from 'vitest'
import { filtrarAgendamentos, dataExibidaAgendamento, diaLocal, filtrarPorStatusPeriodo, filtrarPagosPorPeriodo, opcoesPeriodo, periodoPadrao, contarFiltrosAvancados, lerFiltrosAba, etiquetasFiltros, AVANCADOS_VAZIOS, avancadosValidos } from './agendamentosFiltro'

// getNextOccurrences simplificado: devolve a(s) próxima(s) data(s) ORIGINAL(is) declaradas no fixture.
const getNext = (s, n = 1) => (s._next || []).slice(0, n)
const HOJE = '2026-10-08'
const FILTRO_14 = { from: '2026-10-14', to: '2026-10-14' }
const ids = (l) => l.map(s => s.id)

const isoComHora = {
  id: 'iso_hora', description: 'Data ISO com hora', amount: 50, frequency: 'once',
  startDate: '2026-10-14T15:30:00.000Z', _next: ['2026-10-14T15:30:00.000Z'],
}
// Ocorrência original 15/10 movida para 14/10 (override): a coluna mostra 14/10.
const comOverride = {
  id: 'override', description: 'Resgate Reserva - Aniversário', amount: 123, frequency: 'once',
  tipo: 'resgate_reserva', startDate: '2026-10-15', _next: ['2026-10-15'],
  overrides: { '2026-10-15': { date: '2026-10-14' } },
}
// Resgate cuja composição usa ids sintéticos sch:<schedule>@<data> (o filtro só olha a data).
const resgateSintetico = {
  id: 'fsch_resg', description: 'Resgate Reserva - Salão', amount: 500, frequency: 'once',
  tipo: 'resgate_reserva', startDate: '2026-10-14', _next: ['2026-10-14'],
  sourceExpenseIds: ['sch:sch_salao@2026-10-14'],
  overrides: { _gerencialKey: 'x', _sourceTxIds: ['sch:sch_salao@2026-10-14'] },
}
// Controle: original 14/10 movida para 15/10 — exibe 15/10, NÃO entra no filtro de 14/10.
const movidoPara15 = {
  id: 'movido_15', description: 'Movido', amount: 10, frequency: 'once',
  startDate: '2026-10-14', _next: ['2026-10-14'],
  overrides: { '2026-10-14': { date: '2026-10-15' } },
}
const todos = [isoComHora, comOverride, resgateSintetico, movidoPara15]

describe('diaLocal', () => {
  it('ISO com hora → dia gravado, sem conversão de fuso', () => {
    expect(diaLocal('2026-10-14T23:30:00-03:00')).toBe('2026-10-14')
    expect(diaLocal('2026-10-14T02:00:00.000Z')).toBe('2026-10-14')
    expect(diaLocal('2026-10-14')).toBe('2026-10-14')
  })
  it('Date → dia local', () => {
    expect(diaLocal(new Date(2026, 9, 14, 23, 59))).toBe('2026-10-14')
  })
  it('vazio/inválido → ""', () => {
    expect(diaLocal('')).toBe('')
    expect(diaLocal(null)).toBe('')
    expect(diaLocal('14/10/2026')).toBe('')
  })
})

describe('filtrarAgendamentos — data 14/10 a 14/10', () => {
  it('a data filtrada é a data exibida (override aplicado)', () => {
    expect(dataExibidaAgendamento(comOverride, getNext, HOJE)).toBe('2026-10-14')
    expect(dataExibidaAgendamento(movidoPara15, getNext, HOJE)).toBe('2026-10-15')
  })

  it('ISO com hora, override de data e resgate sintético em 14/10 entram; o movido para 15/10 não', () => {
    expect(ids(filtrarAgendamentos(todos, FILTRO_14, getNext, HOJE))).toEqual(['iso_hora', 'override', 'fsch_resg'])
  })

  it('Data De / Data Até são inclusivos', () => {
    expect(ids(filtrarAgendamentos(todos, { from: '2026-10-14' }, getNext, HOJE))).toEqual(['iso_hora', 'override', 'fsch_resg', 'movido_15'])
    expect(ids(filtrarAgendamentos(todos, { to: '2026-10-14' }, getNext, HOJE))).toEqual(['iso_hora', 'override', 'fsch_resg'])
    expect(ids(filtrarAgendamentos(todos, { from: '2026-10-15', to: '2026-10-15' }, getNext, HOJE))).toEqual(['movido_15'])
  })

  it('filtros combinados: valor 123–123 + data 14/10 mantém o resgate movido', () => {
    expect(ids(filtrarAgendamentos(todos, { ...FILTRO_14, min: 123, max: 123 }, getNext, HOJE))).toEqual(['override'])
  })

  it('sem nenhum filtro devolve a lista intacta', () => {
    expect(filtrarAgendamentos(todos, {}, getNext, HOJE)).toBe(todos)
  })
})

describe('FilterBar — status × período (substitui os chips sem perder combinação)', () => {
  const HOJE = '2026-10-16'
  // getNextOccurrences simplificado: próxima = nextOccurrence (null = série concluída).
  const gno = (s, n) => (s.nextOccurrence ? [s.nextOccurrence].slice(0, n) : [])
  const S = [
    { id: 'atraso', nextOccurrence: '2026-10-08', amount: 1 },
    { id: 'mes', nextOccurrence: '2026-10-25', amount: 1 },
    { id: 'nov', nextOccurrence: '2026-11-10', amount: 1 },
    { id: 'dez', nextOccurrence: '2026-12-20', amount: 1 },
    { id: 'concl', nextOccurrence: null, amount: 1 },
    { id: 'prov', nextOccurrence: '2026-11-01', amount: 1, isProvisao: true },
    { id: 'provEfet', nextOccurrence: null, amount: 1, isProvisao: true },
  ]
  const ids = (st, p) => filtrarPorStatusPeriodo(S, { status: st, periodo: p }, gno, HOJE).map(s => s.id)
  it('A pagar: Todos os futuros = antigo "Todos os futuros" (só com próxima ocorrência)', () => {
    expect(ids('apagar', 'futuros')).toEqual(['atraso', 'mes', 'nov', 'dez', 'prov'])
  })
  it('A pagar: Próximos 30 dias inclui os em atraso; Este mês = próxima no mês', () => {
    expect(ids('apagar', 'next30')).toEqual(['atraso', 'mes', 'nov', 'prov'])
    expect(ids('apagar', 'mes')).toEqual(['atraso', 'mes'])
  })
  it('A pagar: Tudo = antigo "Todos" (inclui as concluídas); Personalizado não recorta aqui', () => {
    expect(ids('apagar', 'tudo')).toHaveLength(S.length)
    expect(ids('apagar', 'custom')).toHaveLength(S.length)
  })
  it('Provisões: Tudo = antigo chip "Provisões"; Todos os futuros = só as pendentes', () => {
    expect(ids('provisoes', 'tudo')).toEqual(['prov', 'provEfet'])
    expect(ids('provisoes', 'futuros')).toEqual(['prov'])
  })
  it('Pagos pelo período da data de pagamento', () => {
    const L = [{ dataPagamento: '2026-10-02' }, { dataPagamento: '2026-09-20' }, { dataPagamento: '2026-08-01' }]
    expect(filtrarPagosPorPeriodo(L, 'mes', HOJE)).toHaveLength(1)
    expect(filtrarPagosPorPeriodo(L, 'ult30', HOJE)).toHaveLength(2)
    expect(filtrarPagosPorPeriodo(L, 'tudo', HOJE)).toHaveLength(3)
  })
  it('opções e padrões: Pagos não tem futuros; Pagos abre em Este mês, os outros em Todos os futuros', () => {
    expect(opcoesPeriodo('pagos')).toEqual(['mes', 'ult30', 'tudo', 'custom'])
    expect(opcoesPeriodo('apagar')).toEqual(['mes', 'next30', 'futuros', 'tudo', 'custom'])
    expect([periodoPadrao('apagar'), periodoPadrao('provisoes'), periodoPadrao('pagos'), periodoPadrao('resgates')]).toEqual(['futuros', 'futuros', 'mes', 'tudo'])
  })
  it('badge de Filtros conta descrição, favorecido, categoria, tipo e valor (datas não)', () => {
    expect(contarFiltrosAvancados({})).toBe(0)
    expect(contarFiltrosAvancados({ desc: 'x', payee: ' ', categoryId: 'c', tipos: new Set(['CC']), min: '10' })).toBe(4)
    expect(contarFiltrosAvancados({ valores: new Set([1]) })).toBe(1)
  })
  it('persistência por aba: restaura status/período/filtros avançados; Personalizado, datas e lixo voltam ao padrão', () => {
    const raw = JSON.stringify({
      conta: { status: 'pagos', periodos: { apagar: 'next30', provisoes: 'custom', pagos: 'tudo' }, avancados: { desc: 'TV', tipos: ['CC'], valores: ['150', 'x'], min: 10 } },
      anuais: { status: 'xx' },
    })
    expect(lerFiltrosAba('conta', raw)).toEqual({
      status: 'pagos', periodos: { apagar: 'next30', provisoes: 'futuros', pagos: 'tudo' },
      avancados: { desc: 'TV', payee: '', cat: '', min: '', max: '', tipos: ['CC'], valores: [150], agenda: '' },
      datas: { from: '', to: '' }, contaReserva: '',
    })
    expect(lerFiltrosAba('anuais', raw)).toMatchObject({ status: 'apagar', periodos: { apagar: 'futuros', pagos: 'mes', resgates: 'tudo' }, avancados: AVANCADOS_VAZIOS })
    expect(lerFiltrosAba('cartao', 'lixo{')).toMatchObject({ status: 'apagar', periodos: { apagar: 'futuros', pagos: 'mes' } })
  })
  it('persistência da conta de reserva (aba Contas Anuais)', () => {
    expect(lerFiltrosAba('anuais', JSON.stringify({ anuais: { status: 'pagos', contaReserva: 'res1' } })).contaReserva).toBe('res1')
    expect(lerFiltrosAba('anuais', JSON.stringify({ anuais: { contaReserva: 42 } })).contaReserva).toBe('')
  })
  it('etiquetas dos filtros ativos (removíveis pela chave)', () => {
    const av = { ...AVANCADOS_VAZIOS, desc: ' TV ', cat: 'c1', tipos: ['CC', 'RES'], min: '10', valores: [150] }
    const et = etiquetasFiltros({ avancados: av, datas: { from: '2026-10-01', to: '' }, periodo: 'custom' }, { nomeCategoria: () => 'Saúde' })
    expect(et.map(e => [e.chave, e.texto])).toEqual([
      ['datas', 'Período: 2026-10-01 – …'],
      ['desc', 'Descrição: TV'],
      ['cat', 'Categoria: Saúde'],
      ['tipos', 'Tipo: CC, RES'],
      ['valor', 'Valor: ≥ 10 · 150'],
    ])
    // datas só contam no Personalizado
    expect(etiquetasFiltros({ avancados: AVANCADOS_VAZIOS, datas: { from: '2026-10-01' }, periodo: 'mes' })).toEqual([])
  })
})

describe('filtro "Agenda do celular"', () => {
  const lista = [{ id: 'a', description: 'A' }, { id: 'b', description: 'B', sincronizarAgenda: false }, { id: 'c', description: 'C', sincronizarAgenda: true }]
  const gnoVazio = () => []
  it('Sincroniza / Não sincroniza / Todos', () => {
    expect(filtrarAgendamentos(lista, { agenda: 'sim' }, gnoVazio, '2026-10-19').map(s => s.id)).toEqual(['a', 'c'])
    expect(filtrarAgendamentos(lista, { agenda: 'nao' }, gnoVazio, '2026-10-19').map(s => s.id)).toEqual(['b'])
    expect(filtrarAgendamentos(lista, { agenda: '' }, gnoVazio, '2026-10-19')).toBe(lista)
  })
  it('conta como filtro avançado e vira etiqueta', () => {
    expect(contarFiltrosAvancados({ agenda: 'nao' })).toBe(1)
    expect(etiquetasFiltros({ avancados: { ...AVANCADOS_VAZIOS, agenda: 'nao' } }).map(e => e.texto)).toEqual(['Agenda: não sincroniza'])
    expect(avancadosValidos({ agenda: 'x' }).agenda).toBe('')
  })
})
