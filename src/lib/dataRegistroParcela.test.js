// Data das parcelas — regra nova (decisão 9 de docs/importar-fatura-6b-diagnostico.md, 12/11/2026).
// Exemplo da decisão: compra em 12/11 em 3x, cartão que fecha dia 13 e vence dia 20, mês financeiro do
// dia 15 ao 14. Dados fictícios.
import { describe, it, expect } from 'vitest'
import { dataRegistroParcela, dataCompraDaParcela, textoDataCompra, installmentSystemDate, faturaToDate, buildSeries } from './parcelas'
import { applyReferenceFatura, linhasDaFaturaParaRevisao } from './linhasFaturaImportada'
import { resolverLinhasRevisao, linhasAImportar } from './revisaoImportacao'
import { montarProvisaoGerencial } from './provisaoGerencial'

const CARD = 'card_x'
const FECHA = 13
const VENCE = 20
const INICIO_MES = 15

describe('dataRegistroParcela — registro no cartão', () => {
  it('exemplo da decisão: compra 12/11 em 3x → 12/11, 12/12, 12/01', () => {
    expect([1, 2, 3].map(n => dataRegistroParcela('2026-11-12', n))).toEqual(['2026-11-12', '2026-12-12', '2027-01-12'])
  })
  it('à vista e parcela 1 = data da compra', () => {
    expect(dataRegistroParcela('2026-11-12', 1)).toBe('2026-11-12')
    expect(dataRegistroParcela('2026-11-12')).toBe('2026-11-12')
    expect(dataRegistroParcela('2026-11-12', 0)).toBe('2026-11-12')
  })
  it('mês sem o dia → último dia do mês (31, 30, fevereiro, ano bissexto)', () => {
    expect(dataRegistroParcela('2027-01-31', 2)).toBe('2027-02-28')
    expect(dataRegistroParcela('2027-01-30', 2)).toBe('2027-02-28')
    expect(dataRegistroParcela('2027-03-31', 2)).toBe('2027-04-30')
    expect(dataRegistroParcela('2027-01-31', 3)).toBe('2027-03-31')
    expect(dataRegistroParcela('2028-01-31', 2)).toBe('2028-02-29') // bissexto
    expect(dataRegistroParcela('2028-01-29', 2)).toBe('2028-02-29')
    expect(dataRegistroParcela('2026-12-31', 3)).toBe('2027-02-28') // virada de ano
  })
  it('data inválida → null (quem chama cai na regra antiga)', () => {
    expect(dataRegistroParcela(null, 2)).toBeNull()
    expect(dataRegistroParcela('12/11/2026', 2)).toBeNull()
  })
  it('a regra antiga (dia 15 do mês anterior à fatura) continua existindo só para a transferência gerencial', () => {
    expect(installmentSystemDate('2026-12', 2, '2026-11-12', INICIO_MES)).toBe('2026-11-15')
  })
})

describe('dataCompraDaParcela — data da compra de uma linha do arquivo', () => {
  it('Itaú: a parcela N traz a data da compra original → fica como está', () => {
    expect(dataCompraDaParcela({ dateCartao: '2026-11-12', num: 2, fatura: '2026-12', closingDay: FECHA })).toBe('2026-11-12')
  })
  it('extrato que traz a data da COBRANÇA (já na fatura da parcela N) → recua N-1 meses', () => {
    expect(dataCompraDaParcela({ dateCartao: '2027-01-12', num: 3, fatura: '2027-01', closingDay: FECHA })).toBe('2026-11-12')
  })
  it('parcela por extenso ("Seguradora Parc8") e anuidade: a data é a da cobrança → registro no mesmo dia dela', () => {
    // Parc8 na fatura 11/2026, cobrada em 31/10 (fechamento 13): compra em 31/03 → parcela 8 em 31/10.
    const parc8 = dataCompraDaParcela({ dateCartao: '2026-10-31', num: 8, fatura: '2026-11', closingDay: FECHA })
    expect(parc8).toBe('2026-03-31')
    expect(dataRegistroParcela(parc8, 8)).toBe('2026-10-31')
    // Anuidade 6/12 na fatura 06/2026 cobrada em 14/05 (fechamento cadastrado 14, banco fechou antes).
    const anuidade = dataCompraDaParcela({ dateCartao: '2026-05-14', num: 6, fatura: '2026-06', closingDay: 14 })
    expect(anuidade).toBe('2025-12-14')
    expect(dataRegistroParcela(anuidade, 6)).toBe('2026-05-14')
  })
  it('Itaú "9/12" com a data da compra original de fevereiro, na fatura 11/2026: fica a de fevereiro', () => {
    expect(dataCompraDaParcela({ dateCartao: '2026-02-13', num: 9, fatura: '2026-11', closingDay: FECHA })).toBe('2026-02-13')
  })
  it('parcela 1 / sem fatura: a própria data', () => {
    expect(dataCompraDaParcela({ dateCartao: '2026-11-12', num: 1, fatura: '2026-11', closingDay: FECHA })).toBe('2026-11-12')
  })
  it('texto para a tela: "compra em 12/11" (ano só quando não é o atual)', () => {
    expect(textoDataCompra('2026-11-12', new Date('2026-12-01T12:00:00'))).toBe('compra em 12/11')
    expect(textoDataCompra('2025-11-12', new Date('2026-12-01T12:00:00'))).toBe('compra em 12/11/2025')
    expect(textoDataCompra(null)).toBeNull()
  })
})

// Linha do Itaú: a data do cartão da parcela N é a da compra original; o arquivo é UMA fatura.
const linhaItau = (n, grupo, extra = {}) => ({
  _id: `${grupo}_${n}`, _itau: true, type: 'expense', description: `LOJA EXEMPLO ${String(n).padStart(2, '0')}/03`,
  amount: 100, date: '2026-11-12', _dateCartao: '2026-11-12', _origDay: 12,
  _installment: { num: n, total: 3, base: 'LOJA EXEMPLO', matchStr: `${String(n).padStart(2, '0')}/03` },
  grupoGerencial: grupo, ...extra,
})
const FATURA_DA_PARCELA = { 1: '2026-11', 2: '2026-12', 3: '2027-01' }
// Os 4 tipos: despesa (D), gerencial (G), contas anuais e pharma (grupos numerados).
const TIPOS = { despesa: 'grp_D', gerencial: 'grp_G', contasAnuais: 'grp_CA', pharma: 'grp_PH' }

describe('Importar Fatura: registro igual para os 4 tipos, data da compra em todas as parcelas', () => {
  for (const [tipo, grupo] of Object.entries(TIPOS)) {
    it(`${tipo}: parcela N no mesmo dia da compra, N-1 meses depois; data da compra guardada`, () => {
      for (const n of [1, 2, 3]) {
        const [r] = applyReferenceFatura([linhaItau(n, grupo)], FATURA_DA_PARCELA[n], FECHA, VENCE, INICIO_MES)
        expect(r.date).toBe(dataRegistroParcela('2026-11-12', n))
        expect(r._dataCompra).toBe('2026-11-12')
        expect(r._dateCartao).toBe('2026-11-12') // o que veio no arquivo não muda
        expect(r.faturaMonthYear).toBe(FATURA_DA_PARCELA[n])
      }
    })
  }
  it('à vista: data da compra, sem data da compra de parcela', () => {
    const [r] = applyReferenceFatura([{ ...linhaItau(1, 'grp_D'), _installment: null, description: 'PADARIA' }], '2026-11', FECHA, VENCE, INICIO_MES)
    expect(r.date).toBe('2026-11-12')
    expect(r._dataCompra).toBeNull()
  })
  it('parcelas geradas a partir da linha (irmãs) herdam a data da compra e seguem a regra', () => {
    const base = linhaItau(1, 'grp_G')
    const irma = { _id: 'g3', _generated: true, _seriesId: base._id, _installmentNum: 3, date: '2026-11-12' }
    const [, g] = applyReferenceFatura([base, irma], '2026-11', FECHA, VENCE, INICIO_MES)
    expect(g.date).toBe('2027-01-12')
    expect(g._dataCompra).toBe('2026-11-12')
    expect(g.faturaMonthYear).toBe('2027-01')
  })
  it('Dindin/CSV com a data da cobrança na parcela N: recua para a compra e registra no mesmo dia', () => {
    const csv = { ...linhaItau(3, 'grp_D'), _itau: false, date: '2027-01-12', _dateCartao: '2027-01-12', _origDay: 12 }
    const [r] = applyReferenceFatura([csv], '2027-01', FECHA, VENCE, INICIO_MES)
    expect(r._dataCompra).toBe('2026-11-12')
    expect(r.date).toBe('2027-01-12')
  })
})

describe('o casamento da importação não muda', () => {
  // Previsão já gravada (regra antiga: dia 15 do mês anterior à fatura) da parcela 2/3.
  const previsao = {
    id: 'prev2', accountId: CARD, accountType: 'credit', type: 'expense', reconciled: false,
    description: 'LOJA EXEMPLO 02/03', amount: 100, date: '2026-11-15', faturaMonthYear: '2026-12',
    installmentNum: 2, installmentTotal: 3, serieId: 'serie_loja',
  }
  it('a linha 2/3 (registro novo 12/12) continua casando com a previsão de 15/11 — "No banco", nada novo', () => {
    const parsed = [{ type: 'expense', description: 'LOJA EXEMPLO 02/03', amount: 100, date: '2026-11-12' }]
    const linhas = linhasDaFaturaParaRevisao(parsed, { accountId: CARD, transactions: [previsao], closingDay: FECHA, dueDay: VENCE, reference: '2026-12', isItau: true, financialStartDay: INICIO_MES })
    expect(linhas[0].date).toBe('2026-12-12')
    const [r] = resolverLinhasRevisao(linhas, { accountId: CARD, transactions: [previsao], closingDay: FECHA })
    expect(r._collisionTx).toBe(previsao)
    expect(linhasAImportar([r])).toEqual([])
  })
})

describe('transferência gerencial e resgate não acompanham a data de registro', () => {
  const d = {
    gerencialGroups: [{ id: 'grp_G', number: 1 }],
    accounts: [
      { id: CARD, type: 'credit', profileId: 'prf', closingDay: FECHA, dueDay: VENCE, apelido: 'CARTAO' },
      { id: 'cc', type: 'checking', profileId: 'prf', contaCentral: true, isMain: true, contaCorrentePrincipal: true },
    ],
    settings: { financialMonthStartDay: INICIO_MES },
  }
  const parcela = (n, date) => ({ id: `p${n}`, accountId: CARD, type: 'expense', amount: 100, description: 'LOJA EXEMPLO', installmentNum: n, installmentTotal: 3, faturaMonthYear: FATURA_DA_PARCELA[n], date, grupoGerencial: 'grp_G' })
  it('parcela 2..N: dia 15 do mês anterior à fatura, com o registro antigo (15/11) ou o novo (12/12)', () => {
    const antiga = montarProvisaoGerencial(d, parcela(2, '2026-11-15'), { id: 'x', origin: 'etapa_a' })
    const nova = montarProvisaoGerencial(d, parcela(2, '2026-12-12'), { id: 'x', origin: 'etapa_a' })
    expect(antiga).not.toBeNull()
    expect(nova.tx.date).toBe('2026-11-15')
    expect(antiga.tx.date).toBe(nova.tx.date)
    expect(montarProvisaoGerencial(d, parcela(3, '2027-01-12'), { id: 'y', origin: 'etapa_a' }).tx.date).toBe('2026-12-15')
  })
  it('parcela 1 / à vista: a data da compra (= registro)', () => {
    const p1 = montarProvisaoGerencial(d, parcela(1, '2026-11-12'), { id: 'z', origin: 'etapa_a' })
    expect(p1).not.toBeNull()
    expect(p1.tx.date).toBe('2026-11-12')
  })
  it('resgate: no vencimento da própria fatura, qualquer que seja a data de registro', () => {
    expect(Object.values(FATURA_DA_PARCELA).map(f => faturaToDate(f, VENCE))).toEqual(['2026-11-20', '2026-12-20', '2027-01-20'])
  })
})

describe('"Gerar parcelas faltantes" (buildSeries) usa a data da compra da série', () => {
  it('faltante 3/3 vai para o mesmo dia da compra, 2 meses depois, e leva a data da compra', () => {
    const acc = { id: CARD, closingDay: FECHA, dueDay: VENCE }
    const p1 = { id: 'a1', accountId: CARD, type: 'expense', description: 'LOJA EXEMPLO 01/03', amount: 100, date: '2026-11-12', dateCartao: '2026-11-12', dataCompra: '2026-11-12', faturaMonthYear: '2026-11', installmentNum: 1, installmentTotal: 3, serieId: 's1' }
    const p2 = { ...p1, id: 'a2', description: 'LOJA EXEMPLO 02/03', date: '2026-12-12', dateCartao: null, faturaMonthYear: '2026-12', installmentNum: 2 }
    const s = buildSeries(p1, [p1, p2], acc, INICIO_MES)
    expect(s.missing).toEqual([expect.objectContaining({ num: 3, date: '2027-01-12', dataCompra: '2026-11-12', faturaMonthYear: '2027-01' })])
  })
})
