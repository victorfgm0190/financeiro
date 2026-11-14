// Importar Fatura — Etapa 6a: regras de casamento com os casos reais da simulação (fatura 11/2026 de
// um Itaú, fechamento dia 13). Dados fictícios com a mesma forma.
import { describe, it, expect } from 'vitest'
import { resolverLinhasRevisao, linhasAImportar, patchColisao, idsNoBancoConferidos } from './revisaoImportacao'
import { aplicarJaLancados } from './casamentoFatura'
import { aplicarCorrespondencias } from './importacaoCorrespondencias'
import { similaridade } from './matchLancamento'
import { nomeSemSufixo, semPalavrasGenericas } from './nomeEstabelecimento'
import { contarRevisaoFatura, conferenciaDaFatura, textoSemDecisao } from './contagemRevisaoFatura'
import { projetarTotalFatura } from './revisaoImportacao'

const CARD = 'card_itau'
const accounts = [{ id: CARD, type: 'credit', closingDay: 13, name: 'Itaú' }]
const tx = (o) => ({ accountId: CARD, accountType: 'credit', type: 'expense', reconciled: false, origin: 'manual', ...o })
const linha = (o) => ({ type: 'expense', faturaMonthYear: '2026-11', selected: true, ...o })
const revisar = (rows, transactions) => {
  const base = resolverLinhasRevisao(rows, { accountId: CARD, transactions, closingDay: 13 })
  const ja = aplicarJaLancados(base, { transactions, accountId: CARD, closingDay: 13 })
  return aplicarCorrespondencias(ja, { transactions, accounts, accountId: CARD })
}
const status = (r) => {
  if (r._jaLancado) return 'ja_lancado'
  if (r._collisionTx) return 'no_banco'
  if (r._isDuplicate) return 'ja_existe'
  if (r._dupLevel === 'possivel') return 'possivel'
  if (r._jaLancadoOpcoes) return 'escolher'
  return r.selected ? 'novo' : 'desmarcada'
}
const p = (num, total) => ({ installmentNum: num, installmentTotal: total })

// Parcelas de outras compras na fatura seguinte (12/2026) — os "candidatos" que a tela mostrava.
const HAVAN_CEN_4 = tx({ id: 'havan_cen_4', description: 'Havan Londrina Cen 4/5', payee: 'Havan', amount: 191.96, date: '2026-11-15', faturaMonthYear: '2026-12', ...p(4, 5), serieId: 'serie_cen' })
const HAVAN_2_10 = tx({ id: 'havan_2_10', description: 'Havan', payee: 'Havan', amount: 39.99, date: '2026-11-15', faturaMonthYear: '2026-12', ...p(2, 10), serieId: 'serie_h10' })
const HAVAN_EN_3 = tx({ id: 'havan_en_3', description: 'Havan Londri-ct En 3/5', payee: 'Havan', amount: 59.98, date: '2026-11-15', faturaMonthYear: '2026-12', ...p(3, 5), serieId: 'serie_en' })
const SHOPEE_5_8 = tx({ id: 'shopee_5_8', description: 'Shopee *Webcontine 5/8', amount: 64.13, date: '2026-11-15', faturaMonthYear: '2026-12', ...p(5, 8) })
const SHOPEE_4_6 = tx({ id: 'shopee_4_6', description: 'Shopee*g Story Eco 4/6', amount: 67.18, date: '2026-11-15', faturaMonthYear: '2026-12', ...p(4, 6) })
const COMPRA_AMAZON = tx({ id: 'compra_amazon', description: 'Compra Amazon', amount: 51.12, date: '2026-11-15', faturaMonthYear: '2026-12', ...p(2, 3) })
const AMAZON_3_6 = tx({ id: 'amazon_3_6', description: 'Amazonmktplc*amazo 3/6', amount: 59.23, date: '2026-11-15', faturaMonthYear: '2026-12', ...p(3, 6) })
const AMAZON_5_6 = tx({ id: 'amazon_5_6', description: 'Amazon Marketplace 5/6', amount: 58.44, date: '2026-11-15', faturaMonthYear: '2026-12', ...p(5, 6) })
const YEM_3_4 = tx({ id: 'yem_3_4', description: 'Yem Comercio-ct Ve 3/4', amount: 63.2, date: '2026-11-15', faturaMonthYear: '2026-12', ...p(3, 4) })

describe('nome do estabelecimento: cidade, sufixo e palavras genéricas não fazem a loja', () => {
  it('corta a cidade (2+ espaços ou colada com "bra") e as palavras genéricas', () => {
    expect(nomeSemSufixo('Anderson Pasteis       Londrina      Bra')).toBe('Anderson Pasteis')
    expect(nomeSemSufixo('Havan Londrina 3londrinabra')).toBe('Havan Londrina')
    expect(nomeSemSufixo('Sereia Comercio De Linlondrinabra')).toBe('Sereia Comercio De')
    expect(semPalavrasGenericas('iof compra internacional')).toBe('iof')
    expect(semPalavrasGenericas('loja')).toBe('')
  })
  it('similaridade: só a cidade ou uma palavra genérica em comum não basta', () => {
    expect(similaridade('Anderson Pasteis       Londrina      Bra', 'Havan Londrina Cen 4/5')).toBeLessThan(0.6)
    expect(similaridade('Liz Lingerie Shop Boullondrinabra', 'Shopee *Webcontine 5/8')).toBeLessThan(0.6)
    expect(similaridade('Iof Compra Internacional', 'Compra Amazon')).toBeLessThan(0.6)
    expect(similaridade('Sereia Comercio De Linlondrinabra', 'Yem Comercio-ct Ve 3/4')).toBeLessThan(0.6)
    // A mesma loja continua parecida.
    expect(similaridade('Havan Londrina 3londrinabra', 'Havan')).toBeGreaterThanOrEqual(0.6)
    expect(similaridade('PG *Mercado Bom', 'mercado bom')).toBe(1)
  })
})

describe('casos reais da simulação (antes viravam "Parecido — é este?") → novos', () => {
  const todos = [HAVAN_CEN_4, HAVAN_2_10, HAVAN_EN_3, SHOPEE_5_8, SHOPEE_4_6, COMPRA_AMAZON, AMAZON_3_6, AMAZON_5_6, YEM_3_4]
  const um = (o) => revisar([linha({ _id: 'L', date: '2026-10-31', _dateCartao: '2026-10-31', ...o })], todos)[0]

  it('Havan 1/5 R$ 16,82 × Havan 4/5, 2/10, 3/5 → novo, sem aviso (valor longe)', () => {
    const r = um({ description: 'Havan Londrina 3londrinabra 1/5', amount: 16.82, _installment: { num: 1, total: 5 } })
    expect(status(r)).toBe('novo')
    expect(r._avisoParecido).toBeUndefined()
  })
  it('Liz Lingerie Shop 1/5 × Shopee 5/8 e 4/6 → novo', () => {
    const r = um({ description: 'Liz Lingerie Shop Boullondrinabra 1/5', amount: 145.52, _installment: { num: 1, total: 5 } })
    expect(status(r)).toBe('novo')
    expect(r._avisoParecido).toBeUndefined()
  })
  it('Anderson Pasteis Londrina × Havan Londrina (mesmo com valor perto) → novo, sem aviso', () => {
    const perto = tx({ id: 'havan_avista', description: 'Havan Londrina', amount: 63.5, date: '2026-10-31', faturaMonthYear: '2026-11' })
    const r = revisar([linha({ _id: 'L', description: 'Anderson Pasteis       Londrina      Bra', amount: 64, date: '2026-10-30', _dateCartao: '2026-10-30' })], [...todos, perto])[0]
    expect(status(r)).toBe('novo')
    expect(r._avisoParecido).toBeUndefined()
  })
  it('IOF Compra Internacional × "Compra Amazon" → não casa por "compra"', () => {
    const iof = tx({ id: 'compra_x', description: 'Compra Amazon', amount: 3.75, date: '2026-10-31', faturaMonthYear: '2026-11' })
    const r = revisar([linha({ _id: 'L', description: 'Iof Compra Internacional', amount: 3.73, date: '2026-10-20', _dateCartao: '2026-10-20' })], [...todos, iof])[0]
    expect(status(r)).toBe('novo')
    expect(r._avisoParecido).toBeUndefined()
  })
  it('Sereia Comercio × Yem Comercio → novo', () => {
    const yemAvista = tx({ id: 'yem_avista', description: 'Yem Comercio', amount: 139, date: '2026-10-31', faturaMonthYear: '2026-11' })
    const r = revisar([linha({ _id: 'L', description: 'Sereia Comercio De Linlondrinabra', amount: 139.9, date: '2026-10-31', _dateCartao: '2026-10-31' })], [...todos, yemAvista])[0]
    expect(status(r)).toBe('novo')
    expect(r._avisoParecido).toBeUndefined()
  })
  it('Amazonmktplc 1/3 × Amazon 2/3, 3/6, 5/6 → novo (parcela diferente) e SEM aviso: o aviso confere parcela e valor (12/11/2026)', () => {
    const r = um({ description: 'Amazonmktplc*amazon Brsao Paulobra 1/3', amount: 49.37, _installment: { num: 1, total: 3 } })
    expect(status(r)).toBe('novo')
    expect(r._avisoParecido).toBeUndefined()
    expect(linhasAImportar([r])).toHaveLength(1)
  })
})

describe('mesmo lançamento automático, perguntas e novos', () => {
  it('valor diferente (16,28 × 16,82, mesma loja) nunca é proposto: nem pergunta, nem aviso (12/11/2026)', () => {
    const manual = tx({ id: 'havan_manual', description: 'Havan', payee: 'Havan', amount: 16.28, date: '2026-10-31' })
    const [r] = revisar([linha({ _id: 'L', description: 'Havan Londrina 3londrinabra 1/5', amount: 16.82, date: '2026-10-31', _dateCartao: '2026-10-31', _installment: { num: 1, total: 5 } })], [manual])
    expect(status(r)).toBe('novo')
    expect(r._avisoParecido).toBeUndefined()
    // À vista dos dois lados, mesma loja e mesma semana, mas ±5% de diferença: antes perguntava; agora novo.
    const [av] = revisar([linha({ _id: 'L', description: 'Havan Londrina 3londrinabra', amount: 16.82, date: '2026-10-31', _dateCartao: '2026-10-31' })], [manual])
    expect(status(av)).toBe('novo')
    expect(av._jaLancadoOpcoes).toBeUndefined()
    expect(av._avisoParecido).toBeUndefined()
    // Mesmo valor e mesma loja: continua perguntando.
    const [igual] = revisar([linha({ _id: 'L', description: 'Havan Londrina 3londrinabra', amount: 16.28, date: '2026-11-05', _dateCartao: '2026-11-05' })], [manual])
    expect(status(igual)).toBe('escolher')
    expect(igual._jaLancadoOpcoes).toEqual([manual])
  })

  it('aviso "parecido" só com a mesma parcela e o mesmo valor (fora da janela de pergunta)', () => {
    const manual = tx({ id: 'loja', description: 'Loja Exemplo', payee: 'Loja Exemplo', amount: 80, date: '2026-10-20', faturaMonthYear: '2026-11' })
    // Mesmo valor, à vista, 10 dias depois (fora dos 7 da pergunta): aviso.
    const [r] = revisar([linha({ _id: 'L', description: 'LOJA EXEMPLO', amount: 80, date: '2026-10-30', _dateCartao: '2026-10-30' })], [manual])
    expect(status(r)).toBe('novo')
    expect(r._avisoParecido).toMatchObject({ tx: manual })
    // Mesmo valor, mas parcela 1/3 × à vista: sem aviso.
    const [p13] = revisar([linha({ _id: 'L', description: 'LOJA EXEMPLO 1/3', amount: 80, date: '2026-10-30', _dateCartao: '2026-10-30', _installment: { num: 1, total: 3 } })], [manual])
    expect(p13._avisoParecido).toBeUndefined()
  })

  it('à vista, mesmo valor: até 3 dias e único → automático (descrição pode diferir); 4–7 dias → pergunta; > 7 → novo', () => {
    const ifood = tx({ id: 'ifood', description: 'iFood', amount: 57.07, date: '2026-10-25' })
    const r = (d) => revisar([linha({ _id: 'L', description: 'IFD*DJM EMPREENDIMENTO', amount: 57.07, date: d, _dateCartao: d })], [ifood])[0]
    expect(status(r('2026-10-27'))).toBe('ja_lancado')
    expect(status(r('2026-10-30'))).toBe('escolher')
    expect(status(r('2026-11-01'))).toBe('escolher')
    expect(status(r('2026-11-02'))).toBe('novo')
  })

  it('mais de um candidato igual → pergunta; duas compras iguais no mesmo dia × duas no Finup → 1:1, sem perguntar', () => {
    const u1 = tx({ id: 'u1', description: 'Uber', amount: 25, date: '2026-10-20' })
    const u2 = tx({ id: 'u2', description: 'Uber', amount: 25, date: '2026-10-20' })
    const l = (id) => linha({ _id: id, description: 'UBER *TRIP', amount: 25, date: '2026-10-20', _dateCartao: '2026-10-20' })
    const [so] = revisar([l('A')], [u1, u2])
    expect(status(so)).toBe('escolher')
    const [a, b] = revisar([l('A'), l('B')], [u1, u2])
    expect([status(a), status(b)]).toEqual(['ja_lancado', 'ja_lancado'])
    expect(new Set([a._jaLancado.tx.id, b._jaLancado.tx.id])).toEqual(new Set(['u1', 'u2']))
  })

  it('Aramis 4/4 no Finup × 3/4 no extrato, mesma série e valor → pergunta; "É a mesma" corrige o número e não importa de novo', () => {
    const a4 = tx({ id: 'a4', description: 'Aramis 4/4', amount: 149.95, date: '2026-10-15', faturaMonthYear: '2026-11', ...p(4, 4), serieId: 'serie_aramis' })
    const row = linha({ _id: 'L', description: 'Aramis 3/4', amount: 149.95, date: '2026-10-15', _dateCartao: '2026-07-10', _installment: { num: 3, total: 4, base: 'Aramis' }, _serieExistente: 'serie_aramis' })
    const [r] = revisar([row], [a4])
    expect(status(r)).toBe('possivel')
    expect(r._dupTx).toBe(a4)
    expect(linhasAImportar([r])).toEqual([])
    const [mesmo] = revisar([{ ...row, _mesmoQueId: 'a4' }], [a4])
    expect(status(mesmo)).toBe('no_banco')
    expect(patchColisao(mesmo, a4, { saveDate: '2026-10-15' })).toMatchObject({ installmentNum: 3, installmentTotal: 4 })
    expect(linhasAImportar([mesmo])).toEqual([])
    // Valor diferente ou outra série: não pergunta — novo.
    expect(status(revisar([{ ...row, amount: 120 }], [a4])[0])).toBe('novo')
    expect(status(revisar([{ ...row, _serieExistente: 'serie_outra' }], [a4])[0])).toBe('novo')
  })

  it('parcela da mesma série, mesmo n/total, fatura e valor ±0,01 → automático; centavos (até ±0,50) → atualiza a previsão sozinha (12/11/2026)', () => {
    const p2 = tx({ id: 'nb2', description: 'Notebook 2/10', amount: 100, date: '2026-10-15', faturaMonthYear: '2026-11', ...p(2, 10), serieId: 'serie_nb' })
    const row = linha({ _id: 'L', description: 'MAGAZINE LUIZA 02/10', amount: 100, date: '2026-10-15', _dateCartao: '2026-09-02', _installment: { num: 2, total: 10 }, _serieExistente: 'serie_nb' })
    expect(status(revisar([row], [p2])[0])).toBe('no_banco')
    const [cent] = revisar([{ ...row, amount: 100.3 }], [p2])
    expect(status(cent)).toBe('no_banco')
    expect(cent._ajustarValor).toBe(true)
    expect(contarRevisaoFatura([cent]).decisao.qtd).toBe(0)
    // A confirmação grava o valor do arquivo na previsão…
    expect(patchColisao(cent, p2, { saveDate: '2026-10-15' })).toMatchObject({ amount: 100.3 })
    // … e o total projetado já é o do arquivo (14/11/2026: vale o valor da fatura do banco; o ajuste
    // aparece no bloco "Ajustados ao valor do banco", não como divergência).
    const conf = projetarTotalFatura([cent], { fatura: '2026-11', accountId: CARD, transactions: [p2], closingDay: 13 })
    expect(conf.itens).toEqual([])
    expect(conf.projetado).toBe(100.3)
    expect(cent._ajusteValor).toMatchObject({ de: 100, para: 100.3 })
    // Centavos contra parcela de OUTRA série ou além de R$ 0,50: não é candidato — novo.
    expect(status(revisar([{ ...row, amount: 100.3, _serieExistente: 'serie_outra' }], [p2])[0])).toBe('novo')
    expect(status(revisar([{ ...row, amount: 101 }], [p2])[0])).toBe('novo')
  })

  it('o mesmo lançamento NÃO conciliado em outra fatura vira pergunta; o conciliado não aparece (12/11/2026)', () => {
    const outra = tx({ id: 'out', description: 'Clinica Exemplo', amount: 300, date: '2026-09-20', dateCartao: '2026-09-20', faturaMonthYear: '2026-09' })
    const row = linha({ _id: 'L', description: 'CLINICA EXEMPLO', amount: 300, date: '2026-09-20', _dateCartao: '2026-09-20' })
    const [r] = revisar([row], [outra])
    expect(status(r)).toBe('escolher')
    expect(r._jaLancadoOpcoes).toEqual([outra])
    expect(r._tambemEm).toEqual([])
    // Escolhido: casa e o existente vai para a fatura do arquivo.
    const [esc] = revisar([{ ...row, _jaLancadoEscolha: 'out' }], [outra])
    expect(esc._jaLancado).toMatchObject({ tx: outra, fatura: { de: '2026-09', para: '2026-11' } })
    // Conciliado em outra fatura: nem pergunta, nem aviso.
    const [c] = revisar([row], [{ ...outra, reconciled: true }])
    expect(status(c)).toBe('novo')
    expect(c._tambemEm).toEqual([])
  })
})

describe('conciliados: nunca candidatos a escolha, mas reconhecidos em silêncio na reimportação', () => {
  // O que a 1ª importação deixou: importado com data do cartão, projeção de parcela conciliada sem
  // data do cartão, e um manual que virou "Já lançado" (recebeu a data do cartão da fatura).
  const IMPORTADO = tx({ id: 'imp', description: 'PADARIA CENTRAL', amount: 32.9, date: '2026-10-25', dateCartao: '2026-10-25', faturaMonthYear: '2026-11', reconciled: true, origin: 'importacao_fatura' })
  const PROJ = tx({ id: 'proj', description: 'Seguradora Alfa Parc2 08/12', amount: 205.61, date: '2026-10-15', faturaMonthYear: '2026-11', ...p(8, 12), reconciled: true, origin: 'importacao_fatura' })
  const MANUAL = tx({ id: 'man', description: 'Uber', amount: 18.69, date: '2026-10-28', dateCartao: '2026-10-27', faturaMonthYear: '2026-11', reconciled: true })
  const banco = [IMPORTADO, PROJ, MANUAL]
  const rows = [
    linha({ _id: 'a', description: 'PADARIA CENTRAL', amount: 32.9, date: '2026-10-25', _dateCartao: '2026-10-25' }),
    linha({ _id: 'b', description: 'SEGURADORA ALFA 08/12', amount: 205.61, date: '2026-10-30', _dateCartao: '2026-03-30', _installment: { num: 8, total: 12 } }),
    linha({ _id: 'c', description: 'UBER *TRIP', amount: 18.69, date: '2026-10-27', _dateCartao: '2026-10-27' }),
  ]

  it('reimportação da mesma fatura → "já importado" sem perguntar e nada novo', () => {
    const out = revisar(rows, banco)
    expect(out.map(status)).toEqual(['ja_existe', 'ja_existe', 'ja_existe'])
    expect(linhasAImportar(out)).toEqual([])
    expect(contarRevisaoFatura(out).decisao.qtd).toBe(0)
    expect(idsNoBancoConferidos(out).sort()).toEqual(['imp', 'man', 'proj'])
  })

  it('conciliado nunca aparece em "Para escolher", "Possível duplicata" nem no aviso', () => {
    const conc = tx({ id: 'farm', description: 'Farmácia Pague Menos', amount: 50, date: '2026-10-20', faturaMonthYear: '2026-11', reconciled: true })
    const r = (o) => revisar([linha({ _id: 'L', description: 'FARMACIA PAGUE MENOS', date: '2026-10-20', _dateCartao: '2026-10-20', ...o })], [conc])[0]
    for (const x of [r({ amount: 51 }), r({ amount: 50, date: '2026-10-25', _dateCartao: '2026-10-25' })]) {
      expect(status(x)).toBe('novo')
      expect(x._avisoParecido).toBeUndefined()
    }
    const parcConc = tx({ id: 'pc', description: 'Loja 2/3', amount: 33.34, date: '2026-10-15', faturaMonthYear: '2026-11', ...p(2, 3), reconciled: true })
    const arred = revisar([linha({ _id: 'L', description: 'Loja 2/3', amount: 33.37, _installment: { num: 2, total: 3, base: 'Loja' } })], [parcConc])[0]
    expect(arred._dupLevel).toBeNull()
  })
})

describe('conferência: itens sem decisão não contam como explicados', () => {
  it('texto "N itens ainda sem decisão — R$ X não serão importados"', () => {
    const manual = tx({ id: 'ifood', description: 'iFood', amount: 57.07, date: '2026-10-25', faturaMonthYear: '2026-11' })
    const rows = [linha({ _id: 'L', description: 'IFD*DJM EMPREENDIMENTO', amount: 57.07, date: '2026-10-30', _dateCartao: '2026-10-30' })]
    const out = revisar(rows, [manual])
    expect(status(out[0])).toBe('escolher')
    const conf = conferenciaDaFatura(projetarTotalFatura(out, { fatura: '2026-11', accountId: CARD, transactions: [manual], closingDay: 13 }))
    expect(conf.totalmenteExplicada).toBe(false)
    expect(conf.semDecisao).toEqual({ qtd: 1, valor: 57.07 })
    expect(conf.grupos[0]).toMatchObject({ tipo: 'sem_decisao', naoExplica: true })
    expect(conf.semExplicacao).toBe(0)
    expect(textoSemDecisao(1, 57.07)).toBe('1 item ainda sem decisão — R$ 57,07 não será importado')
    expect(textoSemDecisao(3, 120.5)).toBe('3 itens ainda sem decisão — R$ 120,50 não serão importados')
  })
})
