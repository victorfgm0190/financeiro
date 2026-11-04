import { describe, it, expect } from 'vitest'
import { gerarPlanoParcelas, planejarSincronizacao, linhasDoContrato } from './parcelas.js'
import { composicaoCondominio, creditoDaComposicao } from './composicao.js'
import { planejarPosEfetivacao, diferencaDoPagamento, esperadoDoPagamento } from './efetivacao.js'
import { planoPrevisaoCondominio, ultimoCondominioPago, previsaoComComposicao } from './condominio.js'

// Contrato 3.900 com desconto de 200 nos 12 primeiros; condomínio 1.300.
const C = {
  id: 'c1', tipo: 'pagar', modalidade: 'aluguel', objeto: 'Apto', favorecido: 'Imob', data_inicio: '2026-09-15', data_fim: '2028-08-31',
  valor_base: 3900, periodicidade: 'mensal', dia_vencimento: 15, indice_reajuste: 'NENHUM', bonificacao_valor: 200, bonificacao_meses: 12,
  tem_condominio: true, valor_condominio_previsto: 1300, dia_vencimento_condominio: 5, conta_id: 'cc', categoria_id: 'a', categoria_condominio_id: 'b',
}
const HOJE = '2026-10-21'
const plano = gerarPlanoParcelas(C, { hoje: HOJE })
const gerar = () => planejarSincronizacao(C, [], gerarPlanoParcelas(C, { hoje: HOJE, apartirDe: '2026-10' })).criar
const pagar = (s, txId) => ({ ...s, registered: [s.startDate], registeredMeta: { [s.startDate]: { tipo: 'pago', lancamento_id: txId } } })

describe('valor esperado do pagamento (Justificar diferença)', () => {
  it('série vinculada que guardou o valor descontado: esperado = plano da competência → diferença 421,56', () => {
    const serie = {
      id: 'sch_alug', contratoId: 'c1', contratoPapel: 'aluguel', frequency: 'monthly', startDate: '2026-10-15', amount: 3278.44,
      registered: ['2026-10-15'], registeredMeta: { '2026-10-15': { tipo: 'pago', lancamento_id: 'tv' } }, overrides: {}, skipped: [],
    }
    const tx0 = { id: 'tv', date: '2026-10-15', amount: 3278.44, scheduleId: 'sch_alug' }
    const tx = { ...tx0, ...planejarPosEfetivacao({ contrato: C, parcela: serie, tx: tx0 }).lancamento }
    const linha = linhasDoContrato(C, [serie], [tx], { hoje: HOJE, plano }).find(l => l.vinculada && l.paga)
    expect(esperadoDoPagamento(linha, plano)).toBe(3700)
    expect(diferencaDoPagamento(linha.tx, esperadoDoPagamento(linha, plano)).diferenca).toBe(421.56)
    // Sem o plano (comportamento antigo): o valor da série esconderia a diferença.
    expect(diferencaDoPagamento(linha.tx, esperadoDoPagamento(linha)).diferenca).toBe(0)
  })

  it('série vinculada sem plano na competência: mantém o comportamento atual', () => {
    const linha = { vinculada: true, papel: 'aluguel', competencia: '2030-01', schedule: { amount: 3278.44 }, meta: null }
    expect(esperadoDoPagamento(linha, plano)).toBe(3278.44)
  })

  it('parcela gerada de 3.620 (crédito de 80) paga por 3.620: sem diferença', () => {
    const base = gerar().find(s => s.id === 'ctr_c1_aluguel_202611')
    const itens = [...base.composicao.itens, { tipo: 'credito', desc: 'Fundo de obras', valor: -80, credito_id: 'cr80' }]
    const parcela = pagar({ ...base, amount: 3620, composicao: { ...base.composicao, itens, total: 3620 } }, 'tp')
    const tx0 = { id: 'tp', date: parcela.startDate, amount: 3620, scheduleId: parcela.id }
    const tx = { ...tx0, ...planejarPosEfetivacao({ contrato: C, parcela, tx: tx0 }).lancamento }
    const linha = linhasDoContrato(C, [parcela], [tx], { hoje: HOJE, plano }).find(l => l.paga)
    expect(linha.vinculada).toBe(false)
    expect(esperadoDoPagamento(linha, plano)).toBe(3620)
    expect(diferencaDoPagamento(linha.tx, esperadoDoPagamento(linha, plano)).diferenca).toBe(0)
  })
})

describe('previsão do condomínio sem itens "Só neste boleto"', () => {
  const ITENS = [
    { desc: 'Taxa de Condomínio', valor: 795.11, responsavel: 'inquilino' },
    { desc: 'Espaço Gourmet', valor: 243.15, responsavel: 'inquilino', so_neste_boleto: true },
    { desc: 'Taxa de Mudança', valor: 162.10, responsavel: 'inquilino', so_neste_boleto: true },
    { desc: 'Fundo de Reserva', valor: 79.10, responsavel: 'proprietario' },
    { desc: 'Controle', valor: 70, responsavel: 'inquilino' },
    { desc: 'Água', valor: 49.46, responsavel: 'inquilino' },
    { desc: 'Fundo Trabalhista', valor: 25.75, responsavel: 'proprietario' },
  ]
  const cenario = (composicao, valor) => {
    const s = gerar().filter(x => x.contratoPapel === 'condominio')
    const pagas = s.map(x => (x.id === 'ctr_c1_condominio_202611' ? pagar(x, 'tc') : x))
    const txs = [{ id: 'tc', date: '2026-11-05', amount: valor, ...(composicao ? { composicao } : {}) }]
    return { pagas, txs }
  }

  it('boleto 1.424,67 com eventuais 162,10 + 243,15 → pendentes em 1.019,42; lançamento e crédito intactos', () => {
    const comp = composicaoCondominio(ITENS)
    expect(comp.total).toBe(1424.67)
    const { pagas, txs } = cenario(comp, 1424.67)
    expect(ultimoCondominioPago(C, pagas, txs)).toMatchObject({ valor: 1019.42, pago: 1424.67 })
    const { valor, atualizar } = planoPrevisaoCondominio(C, pagas, txs)
    expect(valor).toBe(1019.42)
    expect(atualizar.length).toBeGreaterThan(0)
    expect(atualizar.every(m => m.changes.amount === 1019.42)).toBe(true)
    expect(atualizar.some(m => m.id === 'ctr_c1_condominio_202611')).toBe(false) // a paga não muda
    expect(txs[0].amount).toBe(1424.67)
    // A marcação não muda o crédito do proprietário.
    const semMarca = composicaoCondominio(ITENS.map(({ so_neste_boleto, ...i }) => i)) // eslint-disable-line no-unused-vars
    const cred = (c) => creditoDaComposicao(c, { contratoId: 'c1', tx: { id: 'tc', date: '2026-11-05' }, parcela: null }).valor
    expect(cred(comp)).toBe(cred(semMarca))
  })

  it('1.290 sem itens eventuais → 1.290; sem composição → o valor pago', () => {
    const comp = composicaoCondominio([
      { desc: 'Condomínio', valor: 1200, responsavel: 'inquilino' },
      { desc: 'Fundo de reserva', valor: 90, responsavel: 'proprietario' },
    ])
    let { pagas, txs } = cenario(comp, 1290)
    expect(planoPrevisaoCondominio(C, pagas, txs).valor).toBe(1290)
    ;({ pagas, txs } = cenario(null, 1290))
    expect(planoPrevisaoCondominio(C, pagas, txs).valor).toBe(1290)
  })

  it('prévia na composição: valor resultante; com pagamento mais recente, a previsão segue aquele', () => {
    const { pagas, txs } = cenario(null, 1424.67)
    const comp = composicaoCondominio(ITENS)
    expect(previsaoComComposicao(C, pagas, txs, txs[0], { composicao: comp, valor: 1424.67 })).toEqual({ valor: 1019.42, ultimo: true })
    const dez = pagas.map(x => (x.id === 'ctr_c1_condominio_202612' ? pagar(x, 'td') : x))
    const txs2 = [...txs, { id: 'td', date: '2026-12-05', amount: 1300 }]
    expect(previsaoComComposicao(C, dez, txs2, txs[0], { composicao: comp, valor: 1424.67 })).toEqual({ valor: 1300, ultimo: false })
  })
})
