import { describe, it, expect } from 'vitest'
import { executarRegras } from './regras'
import { planejarVarredura, aplicarPlano } from './motor'
import { aplicarAjustes, podeCorrigirSozinho, ordenarParaCorrecao, previaDeCorrecao } from './ajustes'
import { installmentKey } from '../installments'
import { txToRow } from '../db'
import { montarUpsertSql, separarLimpezaDeParcela, CAMPOS_PARCELA_PROTEGIDOS } from '../../../api/_db.js'
import { OPC, GRUPOS, CONTAS, gasto } from './fixtures'

// Casos reais (Itaupers, conferidos via SQL em 01/10/2026): as parcelas são ligadas por serie_id,
// e três parcelas da fatura 08/2026 perderam installment_num/total/key e serie_id.
const S_AMZ = 'serie_1784640547057_bzl3so34'
const S_BIA = 'serie_1783911754890_acyz9s50'
const S_ARA = 'serie_1784640547057_aramis00'
const AMZ_1 = 'tx_1784640943583_m87u1zig35c'
const ARA_1 = 'tx_1784640943583_eobomoe2w36'
const BIA_2 = 'tx_1783913338190_zhm4gul0qeh'

const FATURAS = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']
const parcela = (id, base, n, total, valor, fmy, serieId, extra = {}) => gasto(id, `${base} ${n}/${total}`, valor, fmy, {
  installmentNum: n, installmentTotal: total, serieId, grupoGerencial: 'grp_D', payee: `${base} ${n}/${total}`, ...extra,
})
const semVinculo = (id, base, n, total, valor, fmy, extra = {}) => gasto(id, `${base} ${n}/${total}`, valor, fmy, {
  grupoGerencial: 'grp_D', payee: `${base} ${n}/${total}`, ...extra,
})

const amazon = () => [
  semVinculo(AMZ_1, 'Amazon Marketplace', 1, 6, 87.45, '2026-08'),
  ...[2, 3, 4, 5, 6].map(n => parcela(`tx_amz_${n}`, 'Amazon Marketplace', n, 6, 87.45, FATURAS[n], S_AMZ)),
]
const biashoes = () => [
  parcela('tx_bia_1', 'Biashoes Mod-ct Ou', 1, 4, 132.5, '2026-07', S_BIA),
  semVinculo(BIA_2, 'Biashoes Mod-ct Ou', 2, 4, 132.5, '2026-08', { origin: 'manual', createdAt: '2026-07-13T10:00:00Z' }),
  parcela('tx_bia_3', 'Biashoes Mod-ct Ou', 3, 4, 132.5, '2026-09', S_BIA),
  parcela('tx_bia_4', 'Biashoes Mod-ct Ou', 4, 4, 132.5, '2026-10', S_BIA),
]
// Aramis: 3/4 e 4/4 na série; a linha da 08/2026 diz "1/4", mas pela fatura ela é a 2/4.
const aramis = () => [
  semVinculo(ARA_1, 'Aramis', 1, 4, 224.5, '2026-08'),
  parcela('tx_ara_3', 'Aramis', 3, 4, 224.5, '2026-09', S_ARA),
  parcela('tx_ara_4', 'Aramis', 4, 4, 224.5, '2026-10', S_ARA),
]
const dados = (transactions, extra = {}) => ({ transactions, schedules: [], accounts: CONTAS, gerencialGroups: GRUPOS, ...extra })

const DE_SERIE = new Set([
  'PARCELA_SEM_VINCULO', 'PARCELA_DUPLICADA', 'PARCELA_FATURA_INCOERENTE', 'PARCELA_NUMERO_INCOERENTE',
  'SERIE_PARCELAS_INCOMPLETA', 'SERIE_PARCELAS_REPETIDA', 'SERIE_GRUPO_DIVERGENTE',
])
const deSerie = (d, opc = OPC) => executarRegras(d, opc).filter(x => DE_SERIE.has(x.regra))
// Pendências como a aba as mostra (com id e status), a partir de uma varredura.
const pendencias = (d) => aplicarPlano([], planejarVarredura([], executarRegras(d, OPC), {}), 't')
const chaveDe = (t) => installmentKey(t)

describe('Séries agrupadas por serie_id (o vínculo perdido não vira "falta")', () => {
  it('Amazon 6x: 1/6 sem vínculo encaixa na série — nenhuma pendência de série além do PARCELA_SEM_VINCULO auto', () => {
    const r = deSerie(dados(amazon()))
    expect(r.map(x => [x.regra, x.origem_id, x.severidade])).toEqual([['PARCELA_SEM_VINCULO', AMZ_1, 'auto']])
    expect(r[0].esperado).toMatchObject({ serie_id: S_AMZ, parcela: '1/6' })
  })

  it('Biashoes 4x: a 2/4 manual sem vínculo não faz a série "faltar 4/4"', () => {
    const r = deSerie(dados(biashoes()))
    expect(r.map(x => [x.regra, x.origem_id, x.severidade])).toEqual([['PARCELA_SEM_VINCULO', BIA_2, 'auto']])
  })

  it('Aramis: PARCELA_SEM_VINCULO aprovar com as duas opções', () => {
    const [p] = deSerie(dados(aramis()))
    expect(p).toMatchObject({ regra: 'PARCELA_SEM_VINCULO', origem_id: ARA_1, severidade: 'aprovar' })
    expect(p.esperado.opcoes.map(o => [o.id, `${o.num}/${o.total}`])).toEqual([
      [`posicao:${S_ARA}`, '2/4'], [`descricao:${S_ARA}`, '1/4'],
    ])
    expect(p.esperado.opcoes[0].rotulo).toContain('pela posição na fatura 08/2026')
    expect(p.encontrado.motivo).toBe('a descrição diz 1/4, mas pela fatura é a 2/4')
  })

  it('sem série candidata: só informativo, sem opção', () => {
    const [p] = deSerie(dados([semVinculo('tx_solo', 'Loja Nova', 2, 3, 10, '2026-09')]))
      .filter(x => x.regra === 'PARCELA_SEM_VINCULO')
    expect(p).toMatchObject({ severidade: 'aprovar', esperado: { opcoes: [] } })
    expect(podeCorrigirSozinho({ ...p, status: 'pendente' })).toBe(false)
  })

  it('parcela via favorecido (descrição sem N/M) também é religável', () => {
    const txs = amazon()
    txs[0] = gasto(AMZ_1, 'Amazon Marketplace', 87.45, '2026-08', { grupoGerencial: 'grp_D', payee: 'Amazon Marketplace 1/6' })
    const [p] = deSerie(dados(txs))
    expect(p).toMatchObject({ regra: 'PARCELA_SEM_VINCULO', severidade: 'auto', encontrado: { via_favorecido: true } })
  })
})

describe('Corrigir — religar a parcela', () => {
  const corrigir = (d, opcao) => {
    const ps = pendencias(d).filter(p => p.regra === 'PARCELA_SEM_VINCULO').map(p => (opcao ? { ...p, opcao } : p))
    return aplicarAjustes(d, ps)
  }

  it('Amazon: a 1/6 entra na série, no mesmo padrão de chave das irmãs, e nenhuma pendência de série sobra', () => {
    const d = dados(amazon())
    const { nd, aplicados } = corrigir(d)
    expect(aplicados.map(a => a.acao)).toEqual(['religar'])
    const tx = nd.transactions.find(t => t.id === AMZ_1)
    expect(tx).toMatchObject({ serieId: S_AMZ, installmentNum: 1, installmentTotal: 6, amount: 87.45, date: '2026-08-01', faturaMonthYear: '2026-08' })
    expect(chaveDe(tx)).toBe('acc_itaupers|amazon marketplace|1/6|8745|2026-08')
    const inicioIrmas = nd.transactions.filter(t => t.serieId === S_AMZ).map(t => chaveDe(t).split('|')[4])
    expect(new Set(inicioIrmas)).toEqual(new Set(['2026-08']))
    expect(deSerie(nd)).toEqual([])
  })

  it('Biashoes: a 2/4 entra na série e nenhuma pendência de série sobra', () => {
    const { nd } = corrigir(dados(biashoes()))
    expect(nd.transactions.find(t => t.id === BIA_2)).toMatchObject({ serieId: S_BIA, installmentNum: 2, installmentTotal: 4 })
    expect(deSerie(nd)).toEqual([])
  })

  it('Aramis: sem escolha não grava; escolhida a "2/4", a série fica completa a partir de 08/2026', () => {
    const d = dados(aramis())
    expect(corrigir(d).ignorados.map(i => i.motivo)).toEqual(['Escolha uma das opções.'])

    const { nd } = corrigir(d, `posicao:${S_ARA}`)
    const tx = nd.transactions.find(t => t.id === ARA_1)
    expect(tx).toMatchObject({ serieId: S_ARA, installmentNum: 2, installmentTotal: 4, description: 'Aramis 2/4', payee: 'Aramis 1/4' })
    // 2/4 (08) → 3/4 (09) → 4/4 (10): nenhuma pendência de série. A 1/4 (07/2026) é anterior à
    // primeira fatura com dado deste cartão — fora da conta, como em qualquer série.
    expect(deSerie(nd)).toEqual([])
    // Com outro gasto em 07 (o app já acompanhava), a única falta seria a 1/4 de 07.
    const com07 = { ...nd, transactions: [...nd.transactions, gasto('tx_jul', 'Padaria', 10, '2026-07', { grupoGerencial: 'grp_D' })] }
    const faltas = deSerie(com07).map(x => [x.regra, x.esperado.faltando?.map(f => `${f.parcela}@${f.fatura}`)])
    expect(faltas).toEqual([['SERIE_PARCELAS_INCOMPLETA', ['1/4@07/2026']]])
  })

  it('Aramis: a opção "manter como 1/4" religa com o número da descrição', () => {
    const { nd } = corrigir(dados(aramis()), `descricao:${S_ARA}`)
    expect(nd.transactions.find(t => t.id === ARA_1)).toMatchObject({ serieId: S_ARA, installmentNum: 1, description: 'Aramis 1/4' })
  })

  it('conflito com o índice único: não grava e diz o motivo', () => {
    const txs = amazon()
    txs.push(parcela('tx_outra_1', 'Amazon Marketplace', 1, 6, 87.45, '2026-08', 'serie_outra'))
    const d = dados(txs)
    const r = corrigir(d)
    expect(r.aplicados).toEqual([])
    expect(r.ignorados[0].motivo).toMatch(/uq_lancamentos_installment/)
    expect(r.nd).toBe(d)
  })

  it('não altera valor, data, fatura, conta nem saldo', () => {
    const d = dados(biashoes())
    const { nd, contasAfetadas } = corrigir(d)
    const [antes, depois] = [d, nd].map(x => x.transactions.find(t => t.id === BIA_2))
    for (const k of ['amount', 'date', 'faturaMonthYear', 'accountId', 'dateCartao', 'grupoGerencial']) expect(depois[k]).toBe(antes[k])
    expect(contasAfetadas).toEqual([])
    expect(nd.accounts).toBe(d.accounts)
  })
})

describe('Corrigir todas', () => {
  // As três compras no Grupo G: além de religar, a correção cria as etapas A que faltam.
  const tudoG = () => dados([...amazon(), ...biashoes(), ...aramis()].map(t => ({ ...t, grupoGerencial: 'grp_1' })))
  const corrigirTodas = (d) => aplicarAjustes(d, ordenarParaCorrecao(pendencias(d).filter(podeCorrigirSozinho)))

  it('religa as parcelas ANTES das etapas A', () => {
    const { aplicados } = corrigirTodas(tudoG())
    const acoes = aplicados.map(a => a.acao)
    expect(acoes.slice(0, 2)).toEqual(['religar', 'religar'])
    expect(acoes.slice(2).every(a => a === 'criar')).toBe(true)
    expect(acoes.length).toBeGreaterThan(2)
  })

  it('a prévia do modal segue a mesma sequência da execução', () => {
    const d = tudoG()
    const ps = ordenarParaCorrecao(pendencias(d).filter(podeCorrigirSozinho))
    const previa = previaDeCorrecao(d, ps)
    expect(previa.filter(x => x.plano.ok).map(x => x.plano.texto)).toEqual(aplicarAjustes(d, ps).aplicados.map(a => a.texto))
  })

  it('duas vezes seguidas: a segunda não muda nada', () => {
    const { nd } = corrigirTodas(tudoG())
    const segunda = corrigirTodas(nd)
    expect(segunda.aplicados).toEqual([])
    expect(segunda.nd).toBe(nd)
  })

  it('depois da correção, a varredura resolve as pendências de série que eram consequência', () => {
    const d = tudoG()
    const t1 = pendencias(d)
    const { nd } = corrigirTodas(d)
    const t2 = aplicarPlano(t1, planejarVarredura(t1, executarRegras(nd, OPC), {}), 't2')
    const sem = t2.filter(p => p.regra === 'PARCELA_SEM_VINCULO')
    expect(sem.filter(p => p.status === 'pendente').map(p => p.origem_id)).toEqual([ARA_1])
    expect(sem.filter(p => p.status === 'resolvida').map(p => p.origem_id).sort()).toEqual([AMZ_1, BIA_2].sort())
  })
})

describe('Causa da perda do vínculo: UPDATE não apaga mais os campos de parcela', () => {
  it('o upsert de lancamentos preserva installment_num/total/key e serie_id quando chega NULL', () => {
    const cols = ['id', 'description', ...CAMPOS_PARCELA_PROTEGIDOS, 'amount']
    const sql = montarUpsertSql('lancamentos', cols, 1, 'id', CAMPOS_PARCELA_PROTEGIDOS)
    for (const c of CAMPOS_PARCELA_PROTEGIDOS) expect(sql).toContain(`"${c}" = COALESCE(EXCLUDED."${c}", lancamentos."${c}")`)
    expect(sql).toContain('"description" = EXCLUDED."description"')
    expect(sql).toContain('"amount" = EXCLUDED."amount"')
  })

  it('uma cópia do lançamento sem os campos (form de edição, importação, conciliação) vai para o lote protegido', () => {
    const original = { id: BIA_2, type: 'expense', accountId: 'acc_itaupers', amount: 132.5, description: 'Biashoes Mod-ct Ou 2/4', faturaMonthYear: '2026-08', installmentNum: 2, installmentTotal: 4, serieId: S_BIA }
    const copiaSemParcela = { ...original, installmentNum: null, installmentTotal: null, serieId: null }
    const row = txToRow(copiaSemParcela)
    expect(row).toMatchObject({ installment_num: null, installment_total: null, installment_key: null, serie_id: null, _limpar_parcela: false })
    const { protegidas, limpar } = separarLimpezaDeParcela([row])
    expect(limpar).toEqual([])
    expect(protegidas[0]).not.toHaveProperty('_limpar_parcela')
  })

  it('"Marcar como à vista" é a única limpeza que passa (lote sem proteção)', () => {
    const row = txToRow({ id: 'x', type: 'expense', amount: 1, description: 'LT01/03', installmentNum: null, installmentTotal: null, _limparParcela: true })
    const { protegidas, limpar } = separarLimpezaDeParcela([row])
    expect(protegidas).toEqual([])
    expect(limpar).toHaveLength(1)
    expect(montarUpsertSql('lancamentos', Object.keys(limpar[0]), 1, 'id', [])).not.toContain('COALESCE')
  })
})
