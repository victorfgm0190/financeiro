import { describe, it, expect } from 'vitest'
import { executarRegras } from './regras'
import { planejarVarredura, aplicarPlano } from './motor'
import { aplicarAjustes, podeCorrigirSozinho, ordenarParaCorrecao, previaDeCorrecao } from './ajustes'
import { installmentKey } from '../installments'
import { OPC, GRUPOS, CONTAS, gasto } from './fixtures'

// SERIE_NUMERACAO_INCOERENTE — casos reais do Itaupers confirmados pelo usuário em 01/10/2026:
//   Farmácias São João 3x R$ 41,94 e Jim.com 3x R$ 316,68: 08 "1/3", 09 "3/3" (é 2/3), 10 "3/3".
//   M6 Comercio 4x R$ 127,49 e Aramis 4x R$ 149,95: 08 "1/4" (é 2/4), 09 "3/4", 10 "4/4".
// O vínculo varia de caso a caso (parte com serie_id, parte sem) — a renumeração não depende dele.

const FARM_09 = 'tx_1784046447597_0f3evi5es32'
const lanc = (id, base, n, total, valor, fmy, extra = {}) => gasto(id, `${base} ${n}/${total}`, valor, fmy, {
  grupoGerencial: 'grp_D', categoryId: 'cat_x', payee: `${base} ${n}/${total}`, ...extra,
})
const comSerie = (serieId, n, total) => ({ serieId, installmentNum: n, installmentTotal: total })

const farmacias = () => [
  lanc('tx_farm_08', 'Farmacias Sao Joao', 1, 3, 41.94, '2026-08'),
  lanc(FARM_09, 'Farmacias Sao Joao', 3, 3, 41.94, '2026-09', comSerie('serie_farm', 3, 3)),
  lanc('tx_farm_10', 'Farmacias Sao Joao', 3, 3, 41.94, '2026-10', comSerie('serie_farm', 3, 3)),
]
const jim = () => [
  lanc('tx_jim_08', 'Jim.com* 60278703', 1, 3, 316.68, '2026-08'),
  lanc('tx_jim_09', 'Jim.com* 60278703', 3, 3, 316.68, '2026-09'),
  lanc('tx_jim_10', 'Jim.com* 60278703', 3, 3, 316.68, '2026-10', { payee: 'Jim.com* 60278703 1/3' }),
]
const m6 = () => [
  lanc('tx_m6_08', 'M6 Comercio -Ct On', 1, 4, 127.49, '2026-08'),
  lanc('tx_m6_09', 'M6 Comercio -Ct On', 3, 4, 127.49, '2026-09', comSerie('serie_m6', 3, 4)),
  lanc('tx_m6_10', 'M6 Comercio -Ct On', 4, 4, 127.49, '2026-10', comSerie('serie_m6', 4, 4)),
]
const aramis = () => [
  lanc('tx_ara_08', 'Aramis', 1, 4, 149.95, '2026-08'),
  lanc('tx_ara_09', 'Aramis', 3, 4, 149.95, '2026-09', comSerie('serie_aramis', 3, 4)),
  lanc('tx_ara_10', 'Aramis', 4, 4, 149.95, '2026-10', comSerie('serie_aramis', 4, 4)),
]
const dados = (transactions, extra = {}) => ({ transactions, schedules: [], accounts: CONTAS, gerencialGroups: GRUPOS, ...extra })
const todos = () => dados([...farmacias(), ...jim(), ...m6(), ...aramis()])

const DE_SERIE = new Set([
  'SERIE_NUMERACAO_INCOERENTE', 'PARCELA_SEM_VINCULO', 'PARCELA_DUPLICADA', 'PARCELA_FATURA_INCOERENTE',
  'PARCELA_NUMERO_INCOERENTE', 'SERIE_PARCELAS_INCOMPLETA', 'SERIE_PARCELAS_REPETIDA', 'SERIE_GRUPO_DIVERGENTE',
])
const deSerie = (d) => executarRegras(d, OPC).filter(x => DE_SERIE.has(x.regra))
const pendencias = (d) => aplicarPlano([], planejarVarredura([], executarRegras(d, OPC), {}), 't')
const renumerar = (d, opcao) => aplicarAjustes(d, pendencias(d)
  .filter(p => p.regra === 'SERIE_NUMERACAO_INCOERENTE').map(p => (opcao ? { ...p, opcao } : p)))
const doId = (d, id) => d.transactions.find(t => t.id === id)
const parcelas = (d, prefixo) => d.transactions.filter(t => t.id.startsWith(prefixo) || t.id === FARM_09 && prefixo === 'tx_farm')
  .sort((a, b) => a.faturaMonthYear.localeCompare(b.faturaMonthYear))

describe('Detecção', () => {
  it('os 4 casos geram UMA pendência cada, automática, e nenhuma outra pendência de série', () => {
    const r = deSerie(todos())
    expect(r.map(x => [x.regra, x.severidade])).toEqual(Array(4).fill(['SERIE_NUMERACAO_INCOERENTE', 'auto']))
  })

  it('a mensagem descreve o problema real', () => {
    const msg = (txs) => deSerie(dados(txs))[0].descricao
    expect(msg(farmacias())).toBe('"farmacias sao joao" 3x de R$ 41,94: série com duas parcelas 3/3 e sem 2/3 — pela posição nas faturas 09/2026 é 2/3')
    expect(msg(jim())).toContain('série com duas parcelas 3/3 e sem 2/3')
    expect(msg(m6())).toBe('"m6 comercio -ct on" 4x de R$ 127,49: série com 1/4 fora da sequência e sem 2/4 — pela posição nas faturas 08/2026 é 2/4')
    expect(msg(aramis())).toContain('série com 1/4 fora da sequência e sem 2/4')
    expect(msg(jim())).not.toMatch(/não existe/)
  })

  it('a numeração esperada vem da âncora (parcela mais recente com número confiável)', () => {
    const [f] = deSerie(dados(farmacias()))
    expect(f.esperado.numeracao).toEqual(['1/3', '2/3', '3/3'])
    expect(f.esperado.opcoes[0]).toMatchObject({ recomendada: true, ancora: { fatura: '10/2026', parcela: '3/3' } })
    const [m] = deSerie(dados(m6()))
    expect(m.esperado.numeracao).toEqual(['2/4', '3/4', '4/4'])
  })

  it('série coerente não gera nada; compras seguidas da mesma loja também não', () => {
    const coerente = [1, 2, 3].map(n => lanc(`tx_ok_${n}`, 'Loja Ok', n, 3, 10, ['2026-07', '2026-08', '2026-09'][n - 1]))
    const seguidas = [
      ...coerente,
      lanc('tx_ok2_1', 'Loja Ok', 1, 3, 10, '2026-10'), lanc('tx_ok2_2', 'Loja Ok', 2, 3, 10, '2026-11'),
    ]
    expect(deSerie(dados(seguidas)).filter(x => x.regra === 'SERIE_NUMERACAO_INCOERENTE')).toEqual([])
  })

  it('repetição real (1/3, 2/3, 2/3, 3/3) não é renumerada', () => {
    const txs = [1, 2, 2, 3].map((n, j) => lanc(`tx_rep_${j}`, 'Loja Rep', n, 3, 10, ['2026-07', '2026-08', '2026-09', '2026-10'][j]))
    expect(deSerie(dados(txs)).filter(x => x.regra === 'SERIE_NUMERACAO_INCOERENTE')).toEqual([])
  })

  it('âncora ambígua (duas numerações empatadas) → aprovar com as opções, a de âncora mais recente primeiro', () => {
    const txs = [lanc('tx_amb_09', 'Loja Amb', 2, 4, 10, '2026-09'), lanc('tx_amb_10', 'Loja Amb', 2, 4, 10, '2026-10')]
    const [p] = deSerie(dados(txs))
    expect(p).toMatchObject({ regra: 'SERIE_NUMERACAO_INCOERENTE', severidade: 'aprovar' })
    expect(p.esperado.opcoes.map(o => [o.id, o.parcelas.map(x => x.para).join(','), o.recomendada])).toEqual([
      ['inicio:1', '1/4,2/4', true], ['inicio:2', '2/4,3/4', false],
    ])
    expect(podeCorrigirSozinho({ ...p, status: 'pendente' })).toBe(false)
  })
})

describe('Corrigir — renumerar pela posição e religar na mesma serie_id', () => {
  it('Farmácias: setembro 3/3 → 2/3; as três na mesma série; modal mostra de→para', () => {
    const d = dados(farmacias())
    const [plano] = previaDeCorrecao(d, pendencias(d).filter(p => p.regra === 'SERIE_NUMERACAO_INCOERENTE'))
    expect(plano.plano.texto.split('\n')).toEqual([
      'Agosto/2026 Farmacias Sao Joao 1/3 (mantém o número) · religar',
      'Setembro/2026 Farmacias Sao Joao 3/3 → 2/3',
      'Outubro/2026 Farmacias Sao Joao 3/3 (mantém o número)',
      'Todas na série serie_farm',
    ])
    const { nd } = renumerar(d)
    expect(parcelas(nd, 'tx_farm').map(t => [t.description, t.installmentNum, t.installmentTotal, t.serieId])).toEqual([
      ['Farmacias Sao Joao 1/3', 1, 3, 'serie_farm'],
      ['Farmacias Sao Joao 2/3', 2, 3, 'serie_farm'],
      ['Farmacias Sao Joao 3/3', 3, 3, 'serie_farm'],
    ])
    expect(deSerie(nd)).toEqual([])
  })

  it('Jim.com: setembro 3/3 → 2/3, sem serie_id nenhuma → série nova determinística', () => {
    const { nd } = renumerar(dados(jim()))
    const ps = parcelas(nd, 'tx_jim')
    expect(ps.map(t => t.installmentNum)).toEqual([1, 2, 3])
    expect(new Set(ps.map(t => t.serieId))).toEqual(new Set(['serie_renum_jim_08']))
    expect(deSerie(nd)).toEqual([])
  })

  it('M6 e Aramis: agosto 1/4 → 2/4, e as chaves ficam no padrão das irmãs', () => {
    for (const [txs, prefixo, serie] of [[m6(), 'tx_m6', 'serie_m6'], [aramis(), 'tx_ara', 'serie_aramis']]) {
      const { nd } = renumerar(dados(txs))
      const ps = parcelas(nd, prefixo)
      expect(ps.map(t => [t.installmentNum, t.serieId])).toEqual([[2, serie], [3, serie], [4, serie]])
      expect(ps[0].description).toMatch(/ 2\/4$/)
      expect(new Set(ps.map(t => installmentKey(t).split('|')[4]))).toEqual(new Set(['2026-07']))
      expect(deSerie(nd)).toEqual([])
    }
  })

  it('muda SÓ "N/M" da descrição, installment_num/total e serie_id — nunca valor, data, fatura, grupo, categoria, favorecido nem saldo', () => {
    const d = todos()
    const { nd, contasAfetadas } = aplicarAjustes(d, pendencias(d).filter(p => p.regra === 'SERIE_NUMERACAO_INCOERENTE'))
    const permitidos = new Set(['description', 'installmentNum', 'installmentTotal', 'serieId'])
    for (const antes of d.transactions) {
      const depois = doId(nd, antes.id)
      const mudou = Object.keys({ ...antes, ...depois }).filter(k => antes[k] !== depois[k])
      expect(mudou.filter(k => !permitidos.has(k)), antes.id).toEqual([])
    }
    expect(contasAfetadas).toEqual([])
    expect(nd.accounts).toBe(d.accounts)
  })

  it('vale em fatura fechada (só esses campos)', () => {
    const d = dados(farmacias(), { faturasFechadas: { 'acc_itaupers_2026-08': true, 'acc_itaupers_2026-09': true } })
    expect(deSerie(d).map(x => x.regra)).toEqual(['SERIE_NUMERACAO_INCOERENTE'])
    const { nd } = renumerar(d)
    expect(doId(nd, FARM_09)).toMatchObject({ installmentNum: 2, description: 'Farmacias Sao Joao 2/3', amount: 41.94, faturaMonthYear: '2026-09' })
  })

  it('âncora ambígua: sem escolha não grava; com escolha, renumera', () => {
    const d = dados([lanc('tx_amb_09', 'Loja Amb', 2, 4, 10, '2026-09'), lanc('tx_amb_10', 'Loja Amb', 2, 4, 10, '2026-10')])
    expect(renumerar(d).ignorados.map(i => i.motivo)).toEqual(['Escolha uma das numerações.'])
    const { nd } = renumerar(d, 'inicio:2')
    expect(['tx_amb_09', 'tx_amb_10'].map(id => doId(nd, id).installmentNum)).toEqual([2, 3])
  })

  it('conflito com o índice único: não grava e diz o motivo', () => {
    const txs = farmacias()
    txs.push(lanc('tx_outra', 'Farmacias Sao Joao', 2, 3, 41.94, '2026-09', { ...comSerie('serie_outra', 2, 3), installmentOccurrence: null }))
    // Com outra 2/3 em setembro a família tem duas parcelas na fatura: não é cadeia, não renumera.
    expect(deSerie(dados(txs)).some(x => x.regra === 'SERIE_NUMERACAO_INCOERENTE')).toBe(false)
  })
})

describe('Corrigir todas e varredura', () => {
  const corrigirTodas = (d) => aplicarAjustes(d, ordenarParaCorrecao(pendencias(d).filter(podeCorrigirSozinho)))

  it('os quatro casos entram no "Corrigir todas" (antes das etapas A) e a segunda vez não muda nada', () => {
    const d = dados(todos().transactions.map(t => ({ ...t, grupoGerencial: 'grp_1' })))
    const { nd, aplicados } = corrigirTodas(d)
    expect(aplicados.slice(0, 4).map(a => a.acao)).toEqual(Array(4).fill('renumerar'))
    expect(aplicados.slice(4).every(a => a.acao === 'criar')).toBe(true)
    const segunda = corrigirTodas(nd)
    expect(segunda.aplicados).toEqual([])
    expect(segunda.nd).toBe(nd)
  })

  it('depois de corrigir, a varredura leva as pendências de série dessas compras para Resolvidas', () => {
    const d = todos()
    // Pendências de série que a versão anterior do motor gravou para essas compras.
    const antigas = [
      { regra: 'PARCELA_NUMERO_INCOERENTE', origem_id: 'tx_jim_10', fatura_ref: '10/2026' },
      { regra: 'SERIE_PARCELAS_REPETIDA', origem_id: 'serie:serie_farm|3', fatura_ref: '10/2026' },
      { regra: 'PARCELA_SEM_VINCULO', origem_id: 'tx_ara_08', fatura_ref: '08/2026' },
      { regra: 'SERIE_PARCELAS_INCOMPLETA', origem_id: 'serie:serie_m6', fatura_ref: '08/2026' },
    ].map(p => ({ ...p, id: `${p.regra}|${p.origem_id}`, severidade: 'aprovar', conta_id: 'acc_itaupers', status: 'pendente', resolvida_por: null }))
    const t1 = aplicarPlano(antigas, planejarVarredura(antigas, executarRegras(d, OPC), {}), 't1')
    const { nd } = corrigirTodas(d)
    const t2 = aplicarPlano(t1, planejarVarredura(t1, executarRegras(nd, OPC), {}), 't2')
    expect(t2.filter(p => p.status === 'pendente')).toEqual([])
    expect(t2.every(p => p.status === 'resolvida' && p.resolvida_por === 'varredura')).toBe(true)
    expect(t2.filter(p => p.regra === 'SERIE_NUMERACAO_INCOERENTE')).toHaveLength(4)
  })
})
