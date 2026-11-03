import { describe, it, expect } from 'vitest'
import {
  vencimentos, gerarPlanoParcelas, planejarSincronizacao, linhasDoContrato, parcelaDeVinculo, inicioDasParcelas,
  idParcela, linhaReal, r2,
} from './parcelas.js'
import { composicaoCondominio, creditoDaComposicao, composicaoEstimada, dividirItem } from './composicao.js'
import { planoCreditosAluguel, destinosCreditos, distribuirCreditos, liberarAdiamento, adiarCredito, marcarValorManual, itensDoCredito } from './creditos.js'
import { planejarPosEfetivacao, planejarJustificativa, diferencaDoPagamento, planejarReversao } from './efetivacao.js'
import { planoPrevisaoCondominio, ultimoCondominioPago } from './condominio.js'
import { candidatosVinculo, candidatosLancamento } from './vinculo.js'
import { rotuloPapel, rotulosContrato } from './rotulos.js'
import { validarEtapa } from './validacao.js'
import { planejarVinculo, planejarDesvinculo } from '../vinculo.js'

// Contrato de aluguel: 3.900 dia 15 com 200 de bonificação nos 12 primeiros; condomínio 1.300 dia 5.
const C = {
  id: 'c1', tipo: 'pagar', modalidade: 'aluguel', objeto: 'Apto', favorecido: 'Imob Lar', data_inicio: '2026-09-15', data_fim: '2028-08-31',
  valor_base: 3900, periodicidade: 'mensal', dia_vencimento: 15, indice_reajuste: 'NENHUM', bonificacao_valor: 200, bonificacao_meses: 12,
  tem_condominio: true, valor_condominio_previsto: 1300, dia_vencimento_condominio: 5, favorecido_condominio: 'Cond Ed Sol',
  conta_id: 'cc', categoria_id: 'cat-alug', categoria_condominio_id: 'cat-cond', credito_abatimento: 'mes_seguinte',
}
const gerar = (c = C, apartirDe = '2026-10') =>
  planejarSincronizacao(c, [], gerarPlanoParcelas(c, { hoje: '2026-10-21', apartirDe })).criar
const pagar = (s, txId) => ({ ...s, registered: [s.startDate], registeredMeta: { [s.startDate]: { tipo: 'pago', lancamento_id: txId } } })
const aplicar = (schedules, mudancas) => schedules.map(s => { const m = mudancas.find(x => x.id === s.id); return m ? { ...s, ...m.changes } : s })
const BOLETO_DEZ = [
  { desc: 'Condomínio', valor: 900, responsavel: 'inquilino' },
  { desc: 'Água', valor: 100, responsavel: 'inquilino' },
  { desc: 'Fundo de reserva', valor: 90, responsavel: 'proprietario' },
  { desc: 'Taxas', valor: 200, responsavel: 'inquilino' },
]

describe('D — exemplo obrigatório (condomínio 1.290 com fundo de reserva 90)', () => {
  // Crédito de 80 de um boleto anterior (novembro) + o boleto de dezembro pago em 05/12.
  const credAnterior = { id: 'cr80', contrato_id: 'c1', status: 'aberto', valor: 80, data_origem: '2026-11-05', origem_lancamento_id: 'tx11',
    origem_agendamento_id: 'ctr_c1_condominio_202611', itens: [{ desc: 'Fundo de obras', valor: 80 }] }
  const comp = composicaoCondominio(BOLETO_DEZ)
  const cred90 = { id: 'cr90', status: 'aberto', ...creditoDaComposicao(comp, { contratoId: 'c1', tx: { id: 'tx12', date: '2026-12-05' }, parcela: { id: 'ctr_c1_condominio_202612' } }) }

  it('boleto: 900 + 100 + 90 + 200 = 1.290, crédito do proprietário de 90', () => {
    expect(comp.total).toBe(1290)
    expect(comp.proprietario).toBe(90)
    expect(cred90).toMatchObject({ valor: 90, origem_lancamento_id: 'tx12', origem_agendamento_id: 'ctr_c1_condominio_202612' })
  })

  it("'mes_seguinte': aluguel de dez = 3.900 − 200 − 80 = 3.620; o de jan = 3.900 − 200 − 90 = 3.610", () => {
    const s = gerar()
    const plano = planoCreditosAluguel(C, s, [credAnterior, cred90])
    const dez = plano.find(m => m.id === 'ctr_c1_aluguel_202612')
    const jan = plano.find(m => m.id === 'ctr_c1_aluguel_202701')
    expect(dez.changes.amount).toBe(3620)
    expect(jan.changes.amount).toBe(3610)
    expect(plano.find(m => m.id === 'ctr_c1_aluguel_202611')).toBeUndefined()
  })

  it("'proximo_pendente' (regra antiga): o crédito de 05/12 cai no aluguel de 15/12", () => {
    const c = { ...C, credito_abatimento: 'proximo_pendente' }
    const s = gerar(c)
    const plano = planoCreditosAluguel(c, s, [cred90])
    expect(plano.map(m => [m.id, m.changes.amount])).toEqual([['ctr_c1_aluguel_202612', 3610]])
    // Contrato antigo, sem a coluna: segue a regra antiga.
    const semColuna = { ...C, credito_abatimento: undefined }
    expect([...destinosCreditos(semColuna, gerar(semColuna), [cred90]).values()][0].parcela.id).toBe('ctr_c1_aluguel_202612')
  })

  it('próximo condomínio previsto = 1.290 (último pago); estorno volta ao anterior e, sem nenhum, ao do contrato', () => {
    let s = gerar()
    s = s.map(x => (x.id === 'ctr_c1_condominio_202611' ? pagar(x, 'tx11') : x.id === 'ctr_c1_condominio_202612' ? pagar(x, 'tx12') : x))
    const txs = [{ id: 'tx11', date: '2026-11-05', amount: 1300 }, { id: 'tx12', date: '2026-12-05', amount: 1290 }]
    const { valor, atualizar } = planoPrevisaoCondominio(C, s, txs)
    expect(valor).toBe(1290)
    const jan = atualizar.find(m => m.id === 'ctr_c1_condominio_202701')
    expect(jan.changes.amount).toBe(1290)
    expect(jan.changes.composicao.total).toBe(1290)
    expect(atualizar.some(m => m.id === 'ctr_c1_condominio_202612')).toBe(false) // paga não muda
    // Estorno do de dezembro: volta a 1.300 (o pago anterior).
    expect(planoPrevisaoCondominio(C, aplicar(s, atualizar), txs, { excluirTx: 'tx12' }).valor).toBe(1300)
    // Sem pagamento nenhum: o previsto do contrato.
    const c2 = { ...C, valor_condominio_previsto: 1250 }
    expect(planoPrevisaoCondominio(c2, s, txs, { excluirTx: 'tx12' }).valor).toBe(1300)
    expect(planoPrevisaoCondominio(c2, gerar(c2), []).valor).toBe(1250)
  })

  it('série vinculada também conta como condomínio pago (pela data do lançamento)', () => {
    const serie = { id: 'sch_cond', contratoId: 'c1', contratoPapel: 'condominio', frequency: 'monthly', startDate: '2026-08-05',
      registered: ['2026-09-05'], registeredMeta: { '2026-09-05': { lancamento_id: 'txs' } }, amount: 1280, overrides: {} }
    expect(ultimoCondominioPago(C, [serie, ...gerar()], [{ id: 'txs', date: '2026-09-04', amount: 1275 }])).toMatchObject({ valor: 1275, txId: 'txs' })
  })
})

describe('B — meses sem cobrança', () => {
  const S = {
    id: 's1', tipo: 'pagar', modalidade: 'servico', data_inicio: '2026-08-20', data_fim: '2031-08-20', dia_vencimento: 20,
    periodicidade: 'mensal', valor_base: 1000, indice_reajuste: 'FIXO', percentual_fixo: 10, bonificacao_valor: 100, bonificacao_meses: 12,
    meses_sem_cobranca: ['2026-09'], categoria_id: 'x', conta_id: 'cc',
  }
  it('60 parcelas: 1ª 20/08, 2ª 20/10, 3ª 20/11 (setembro pulado sem consumir número)', () => {
    const v = vencimentos(S, 'aluguel')
    expect(v).toHaveLength(60)
    expect(v.slice(0, 3)).toEqual([
      { numero: 1, vencimento: '2026-08-20', competencia: '2026-08' },
      { numero: 2, vencimento: '2026-10-20', competencia: '2026-10' },
      { numero: 3, vencimento: '2026-11-20', competencia: '2026-11' },
    ])
    expect(v.at(-1)).toMatchObject({ numero: 60, vencimento: '2031-08-20' })
    // Sem o mês pulado seriam 61.
    expect(vencimentos({ ...S, meses_sem_cobranca: [] }, 'aluguel')).toHaveLength(61)
  })
  it('desconto nas 12 primeiras COBRADAS; reajuste pelo calendário (ago/2027), sem andar por causa do pulo', () => {
    const plano = gerarPlanoParcelas(S, { hoje: '2026-08-01' })
    const p = (ym) => plano.find(x => x.competencia === ym)
    expect(p('2026-09')).toBeUndefined()
    expect(p('2027-08')).toMatchObject({ numero: 12, total: 60 })
    expect(p('2027-08').composicao.itens.some(i => i.tipo === 'bonificacao')).toBe(true)
    expect(p('2027-09').composicao.itens.some(i => i.tipo === 'bonificacao')).toBe(false)
    expect(p('2027-07').composicao.base).toBe(1000)
    expect(p('2027-08').composicao.base).toBe(1100)
  })
  it('a ficha mostra "Sem cobrança" na competência, fora de pendentes', () => {
    const ag = planejarSincronizacao(S, [], gerarPlanoParcelas(S, { hoje: '2026-08-01' })).criar
    const linhas = linhasDoContrato(S, ag, [], { hoje: '2026-08-01' })
    const set = linhas.find(l => l.competencia === '2026-09')
    expect(set).toMatchObject({ semCobranca: true, numero: null })
    expect(linhaReal(set)).toBe(false)
    expect(linhas.find(l => l.competencia === '2026-10').numero).toBe(2)
  })
  it('aditivo: a pendente da competência pulada sai; a paga fica (sem número) e as outras renumeram', () => {
    const antes = { ...S, meses_sem_cobranca: [] }
    let ag = planejarSincronizacao(antes, [], gerarPlanoParcelas(antes, { hoje: '2026-08-01' })).criar
    ag = ag.map(s => (s.id === idParcela('s1', 'aluguel', '2026-10') ? pagar(s, 'txo') : s))
    const depois = { ...S, meses_sem_cobranca: ['2026-09', '2026-10'] }
    const sync = planejarSincronizacao(depois, ag, gerarPlanoParcelas(depois, { hoje: '2026-08-01' }), { apartirDe: '2026-08' })
    expect(sync.remover.map(s => s.id)).toEqual([idParcela('s1', 'aluguel', '2026-09')])
    expect(sync.atualizar.find(m => m.id === idParcela('s1', 'aluguel', '2026-10'))).toBeUndefined() // paga não muda
    expect(sync.atualizar.find(m => m.id === idParcela('s1', 'aluguel', '2026-11')).changes.composicao.numero).toBe(2)
    const linhas = linhasDoContrato(depois, aplicar(ag, sync.atualizar).filter(s => !sync.remover.includes(s)), [], { hoje: '2026-08-01' })
    expect(linhas.find(l => l.competencia === '2026-10')).toMatchObject({ paga: true, numero: null })
  })
  it('validação: mês inválido é recusado', () => {
    const f = { modalidade: 'servico', conta_id: 'c', categoria_id: 'x', valor_base: '1.000,00', dia_vencimento: '20', meses_sem_cobranca: ['2026-13x'] }
    expect(validarEtapa(1, f)).toBe('Mês sem cobrança inválido.')
  })
})

describe('A — contrato genérico', () => {
  const SV = { ...C, modalidade: 'servico', tem_condominio: false, favorecido_condominio: null }
  it('rótulos: "Parcela" fora do Aluguel (descrição da parcela, desconto, aba de créditos)', () => {
    const [p] = gerar(SV)
    expect(p.description).toBe('Parcela · Apto')
    expect(p.composicao.itens.map(i => i.desc)).toEqual(['Valor contratual', 'Desconto temporário'])
    expect(rotuloPapel(SV, 'aluguel')).toBe('Parcela')
    expect(rotulosContrato(SV)).toMatchObject({ abaCreditos: 'Créditos a abater', favorecido: 'Favorecido', valorPrincipal: 'Valor da parcela' })
    expect(rotulosContrato(C).abaCreditos).toBe('Créditos do proprietário')
    expect(gerar(C)[0].description).toBe('Aluguel · Apto')
  })
  it('busca de vínculo: "aluguel"/"condomínio" na descrição só pontuam no Aluguel', () => {
    const ag = { id: 'a1', description: 'Aluguel do mês', payee: 'Fulano', transactionType: 'expense', frequency: 'monthly', startDate: '2026-09-15', registered: [], skipped: [], amount: 1 }
    expect(candidatosVinculo(C, [ag])).toHaveLength(1)
    expect(candidatosVinculo(SV, [ag])).toHaveLength(0)
  })
  it('validação: modalidade é o primeiro campo obrigatório; mensagens sem "aluguel" fora dele', () => {
    expect(validarEtapa(0, { perfil_id: 'p' })).toBe('Escolha a modalidade do contrato.')
    expect(validarEtapa(1, { modalidade: 'seguro', conta_id: 'c' })).toBe('Escolha a categoria.')
    expect(validarEtapa(3, { modalidade: 'seguro', tem_condominio: true })).toBe('')
  })
})

describe('C — Nº das linhas, meses faltantes e vínculo de lançamento', () => {
  // Série vinculada pagou setembro; o contrato gerou a partir de novembro → outubro sem nada.
  const serie = {
    id: 'sch_v', contratoId: 'c1', contratoPapel: 'aluguel', frequency: 'monthly', startDate: '2026-09-15',
    registered: ['2026-09-15'], registeredMeta: { '2026-09-15': { lancamento_id: 'tx9' } }, skipped: [], overrides: {},
    amount: 3700, occurrenceType: 'installment', installments: 1, nextOccurrence: '2026-10-15',
  }
  const CA = { ...C, tem_condominio: false }
  const ag = () => [serie, ...gerar(CA, '2026-11')]
  const txs = [{ id: 'tx9', date: '2026-09-14', amount: 3700 }]
  const plano = gerarPlanoParcelas(CA, { hoje: '2026-10-21' })

  it('linha da série vinculada tem Nº/total pelo calendário; outubro aparece "Sem pagamento vinculado"', () => {
    const linhas = linhasDoContrato(CA, ag(), txs, { hoje: '2026-10-21', plano })
    expect(linhas.find(l => l.vinculada)).toMatchObject({ numero: 1, total: 24, paga: true })
    const out = linhas.find(l => l.competencia === '2026-10')
    expect(out).toMatchObject({ semParcela: true, numero: 2, valor: 3700, schedule: null })
    expect(linhas.find(l => l.competencia === '2026-11')).toMatchObject({ numero: 3, semParcela: false })
    expect(linhas.filter(l => linhaReal(l) && !l.paga).some(l => l.semParcela)).toBe(false)
  })

  it('competência sem parcela: parcela criada já paga, regenerar não duplica nem recria os meses do meio', () => {
    const linha = linhasDoContrato(CA, ag(), txs, { hoje: '2026-10-21', plano }).find(l => l.semParcela)
    const tx = { id: 'tx10', date: '2026-10-16', amount: 3650 }
    const item = plano.find(p => p.competencia === linha.competencia)
    const nova = parcelaDeVinculo(CA, item, tx)
    expect(nova).toMatchObject({ id: idParcela('c1', 'aluguel', '2026-10'), registered: ['2026-10-15'], contratoId: 'c1' })
    expect(nova.registeredMeta['2026-10-15']).toMatchObject({ lancamento_id: 'tx10', vinculo: 'manual' })
    const lista = [...ag(), nova]
    // A parcela do vínculo não muda o começo da geração (senão os meses do meio voltariam).
    expect(inicioDasParcelas(CA, lista)).toBe('2026-11')
    const sync = planejarSincronizacao(CA, lista, gerarPlanoParcelas(CA, { hoje: '2026-10-21', apartirDe: '2026-10' }), { apartirDe: '2026-10' })
    expect(sync.criar.find(s => s.id === nova.id)).toBeUndefined()
    expect(sync.remover.find(s => s.id === nova.id)).toBeUndefined()
    const linhas = linhasDoContrato(CA, lista, [...txs, tx], { hoje: '2026-10-21', plano })
    expect(linhas.find(l => l.competencia === '2026-10')).toMatchObject({ paga: true, numero: 2, valor: 3650 })
    // Pós-efetivação: a diferença vira "Diferença no pagamento"; o valor pago é o do lançamento.
    const pos = planejarPosEfetivacao({ contrato: CA, parcela: nova, tx })
    expect(pos.lancamento.composicao.total).toBe(3650)
    expect(pos.lancamento.composicao.itens.at(-1)).toMatchObject({ tipo: 'ajuste', desc: 'Diferença no pagamento', valor: -50 })
    // Desfazer: sem a parcela criada, a competência volta a "Sem pagamento vinculado".
    expect(linhasDoContrato(CA, ag(), txs, { hoje: '2026-10-21', plano }).find(l => l.competencia === '2026-10').semParcela).toBe(true)
  })

  it('linha pendente: vínculo pela baixa normal (sem alterar o lançamento) e desfazer volta a pendente', () => {
    const lista = ag()
    const pend = lista.find(s => s.id === idParcela('c1', 'aluguel', '2026-11'))
    const tx = { id: 'tx11', date: '2026-11-14', amount: 3700, type: 'expense', accountId: 'cc' }
    const d = { schedules: lista, transactions: [...txs, tx] }
    const v = planejarVinculo(d, { txId: 'tx11', scheduleId: pend.id, data: pend.startDate, manter: 'agendamento' })
    expect(v.ok).toBe(true)
    expect(v.schedule.registered).toEqual(['2026-11-15'])
    expect(v.tx.amount).toBe(3700)
    const comVinculo = lista.map(s => (s.id === pend.id ? v.schedule : s))
    expect(linhasDoContrato(CA, comVinculo, d.transactions, { hoje: '2026-10-21', plano }).find(l => l.competencia === '2026-11'))
      .toMatchObject({ paga: true, numero: 3, meta: expect.objectContaining({ vinculo: 'manual' }) })
    // Dois lançamentos na mesma parcela: bloqueado.
    const tx2 = { id: 'tx11b', date: '2026-11-15', amount: 3700 }
    expect(planejarVinculo({ schedules: comVinculo, transactions: [...d.transactions, tx2] }, { txId: 'tx11b', scheduleId: pend.id, data: pend.startDate }).ok).toBe(false)
    const des = planejarDesvinculo({ schedules: comVinculo, transactions: d.transactions }, { scheduleId: pend.id, data: pend.startDate })
    expect(des.ok).toBe(true)
    expect(des.schedule.registered).toEqual([])
  })

  it('candidatos a "Vincular pagamento": favorecido, categoria, valor e data, com o motivo; ignora os já vinculados', () => {
    const linha = { papel: 'aluguel', vencimento: '2026-10-15', valor: 3700 }
    const lista = [
      { id: 'a', type: 'expense', accountId: 'cc', payee: 'Imob. Lar', categoryId: 'cat-alug', amount: 3700, date: '2026-10-14', description: 'Pix' },
      { id: 'b', type: 'expense', accountId: 'cc', payee: 'Padaria', categoryId: 'x', amount: 30, date: '2026-10-15', description: 'Pão' },
      { id: 'c', type: 'expense', accountId: 'outra', payee: 'Imob Lar', amount: 3700, date: '2026-10-14' },
      { id: 'd', type: 'expense', accountId: 'cc', payee: 'Imob Lar', amount: 3700, date: '2026-10-14', contratoId: 'zz' },
      { id: 'tx9', type: 'expense', accountId: 'cc', payee: 'Imob Lar', amount: 3700, date: '2026-09-14' },
    ]
    const r = candidatosLancamento(CA, lista, ag(), linha)
    expect(r.map(c => c.tx.id)).toEqual(['a', 'b'])
    expect(r[0].motivos).toEqual(expect.arrayContaining(['favorecido igual', 'mesma categoria', 'mesmo valor']))
    expect(candidatosLancamento(CA, lista, ag(), linha, { filtro: { texto: 'padaria' } }).map(c => c.tx.id)).toEqual(['b'])
    expect(candidatosLancamento(CA, lista, ag(), linha, { contasDoPerfil: new Set(['outra']) }).map(c => c.tx.id)).toContain('c')
  })
})

describe('D — créditos: destino, manual, só neste boleto, justificar', () => {
  const s0 = () => gerar()
  const cred = (o) => ({ id: 'k1', contrato_id: 'c1', status: 'aberto', valor: 50, data_origem: '2026-10-20', itens: [{ desc: 'Reembolso', valor: 50 }], descricao: 'Reembolso', ...o })

  it('troca de destino: o destino escolhido vence a regra e o adiamento nele sai', () => {
    let s = s0()
    const alvo = 'ctr_c1_aluguel_202703'
    s = s.map(x => (x.id === alvo ? { ...x, ...adiarCredito(x, 'k1') } : x))
    const c = cred({ destino_agendamento_id: alvo })
    // Ainda adiado nela: liberarAdiamento (o que a troca faz) devolve o crédito para ela.
    s = s.map(x => (x.id === alvo ? { ...x, ...liberarAdiamento(x, 'k1') } : x))
    expect(destinosCreditos(C, s, [c]).get('k1')).toMatchObject({ fixo: true, parcela: expect.objectContaining({ id: alvo }) })
    expect(planoCreditosAluguel(C, s, [c]).map(m => m.id)).toEqual([alvo])
    // Destino que já foi pago: volta para a regra.
    const pago = s.map(x => (x.id === alvo ? pagar(x, 'tz') : x))
    expect(destinosCreditos(C, pago, [c]).get('k1').fixo).toBe(false)
  })

  it('crédito manual: item com a descrição (sem "cond. dd/mm") e regra mes_seguinte pela data', () => {
    const c = cred()
    expect(itensDoCredito(c)).toEqual([{ tipo: 'credito', desc: 'Reembolso', valor: -50, credito_id: 'k1' }])
    expect(distribuirCreditos(C, s0(), [c]).get('ctr_c1_aluguel_202611')).toHaveLength(1)
  })

  it('destino com valor digitado à mão: bloqueado (aviso) até marcar como manual', () => {
    let s = s0().map(x => (x.id === 'ctr_c1_aluguel_202611' ? { ...x, amount: 3500 } : x))
    const d = destinosCreditos(C, s, [cred()]).get('k1')
    expect(d).toMatchObject({ bloqueado: true, parcela: expect.objectContaining({ id: 'ctr_c1_aluguel_202611' }) })
    expect(planoCreditosAluguel(C, s, [cred()])).toEqual([])
    s = s.map(x => (x.id === 'ctr_c1_aluguel_202611' ? { ...x, ...marcarValorManual(x) } : x))
    const plano = planoCreditosAluguel(C, s, [cred()])
    expect(plano[0]).toMatchObject({ id: 'ctr_c1_aluguel_202611', changes: { amount: 3450 } })
  })

  it('"Só neste boleto": gera crédito, mas não volta na estimativa; dividir item separa as partes', () => {
    const comp = composicaoCondominio([
      { desc: 'Taxa', valor: 1000, responsavel: 'inquilino' },
      { desc: 'Fundo de reserva', valor: 90, responsavel: 'proprietario' },
      { desc: 'Pintura da fachada', valor: 300, responsavel: 'proprietario', so_neste_boleto: true },
    ])
    expect(creditoDaComposicao(comp, { contratoId: 'c1', tx: { id: 't', date: '2026-12-05' }, parcela: null }).valor).toBe(390)
    const est = composicaoEstimada(1300, comp)
    expect(est.itens.map(i => i.desc)).toEqual(['Demais itens (estimado)', 'Fundo de reserva'])
    expect(est.proprietario).toBe(90)
    expect(dividirItem({ desc: 'Taxa extra', valor: 150 }, 100)).toEqual([
      { desc: 'Taxa extra', valor: 50, responsavel: 'inquilino', manual: true },
      { desc: 'Taxa extra', valor: 100, responsavel: 'proprietario', manual: true },
    ])
  })

  it('justificar diferença: créditos ligados até a diferença; o resto continua; valor do lançamento intacto', () => {
    const parcela = gerar().find(x => x.id === 'ctr_c1_aluguel_202611')
    const tx = { id: 'tp', date: '2026-11-15', amount: 3600 }
    const pos = planejarPosEfetivacao({ contrato: C, parcela, tx })
    const txC = { ...tx, composicao: pos.lancamento.composicao }
    expect(diferencaDoPagamento(txC)).toEqual({ previsto: 3700, pago: 3600, diferenca: 100 })
    const r = planejarJustificativa({ tx: txC, ligados: [cred({ valor: 60, itens: [{ desc: 'Reembolso', valor: 60 }] })] })
    expect(r).toMatchObject({ ok: true, diferenca: 100, justificado: 60, restante: 40 })
    expect(r.composicao.total).toBe(3600)
    expect(r2(r.composicao.itens.reduce((a, i) => a + i.valor, 0))).toBe(3600)
    expect(r.composicao.itens.at(-1)).toMatchObject({ tipo: 'ajuste', valor: -40 })
    expect(planejarJustificativa({ tx: txC, ligados: [cred({ valor: 150 })] }).ok).toBe(false)
    const total = planejarJustificativa({ tx: txC, ligados: [cred({ valor: 100, itens: [] })] })
    expect(total.composicao.itens.some(i => i.tipo === 'ajuste')).toBe(false)
    // O crédito manual criado já compensado neste pagamento reabre se o pagamento for estornado.
    expect(planejarReversao({ tx: { id: 'tp' }, creditos: [{ id: 'm', status: 'compensado', compensado_em_lancamento_id: 'tp' }] }).reabrir).toEqual(['m'])
  })
})
