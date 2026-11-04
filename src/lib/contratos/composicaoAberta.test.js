import { describe, it, expect } from 'vitest'
import { gerarPlanoParcelas, planejarSincronizacao, idParcela, valorManual } from './parcelas.js'
import { parcelaDoBoleto, boletoDosParametros } from './boletoParcela.js'
import { normalizarLeitura, extrairItensDeImagem } from './imagemBoleto.js'
import { normalizarSaidaLeitura } from '../../../api/_leituraBoleto.js'
import { planoCreditoDaParcela, composicaoNoPagamento, planoInformarParcela, composicaoDaParcela } from './composicaoAberta.js'
import { planejarReversao } from './efetivacao.js'
import { statusAoReabrir } from './creditos.js'
import { planoPrevisaoCondominio } from './condominio.js'

const C = {
  id: 'c1', tipo: 'pagar', modalidade: 'aluguel', objeto: 'Apto Centro', favorecido: 'Imob Lar', status: 'ativo',
  data_inicio: '2026-09-15', data_fim: '2028-08-31', valor_base: 3900, periodicidade: 'mensal', dia_vencimento: 15,
  indice_reajuste: 'NENHUM', bonificacao_valor: 200, bonificacao_meses: 12, tem_condominio: true, valor_condominio_previsto: 1300,
  dia_vencimento_condominio: 5, favorecido_condominio: 'Condomínio Edifício Sol', conta_id: 'cc', categoria_id: 'cat', credito_abatimento: 'mes_seguinte',
}
const PARCELAS = planejarSincronizacao(C, [], gerarPlanoParcelas(C, { hoje: '2026-11-04', apartirDe: '2026-11' })).criar
const COND = idParcela('c1', 'condominio', '2026-11')

describe('Assistente: boleto → parcela de condomínio aberta', () => {
  it('vencimento perto + nome do condomínio → forte (oferece informar)', () => {
    const r = parcelaDoBoleto({ vencimento: '2026-11-05', valor: 1290, nome: 'CONDOMINIO EDIFICIO SOL' }, [C], PARCELAS)
    expect(r.forte.parcela.id).toBe(COND)
  })
  it('vencimento perto + valor parecido (sem nome) → forte', () => {
    expect(parcelaDoBoleto({ vencimento: '2026-11-07', valor: 1350, nome: 'ADM XYZ' }, [C], PARCELAS).forte.parcela.id).toBe(COND)
  })
  it('só o valor parecido (data longe) → só sugere', () => {
    const r = parcelaDoBoleto({ vencimento: '2026-11-25', valor: 1290, nome: 'ADM XYZ' }, [C], PARCELAS)
    expect(r.forte).toBeNull()
    expect(r.parecidas.length).toBeGreaterThan(0)
  })
  it('nada parecido → nada', () => {
    expect(parcelaDoBoleto({ vencimento: '2026-11-25', valor: 50, nome: 'Academia' }, [C], PARCELAS)).toEqual({ forte: null, parecidas: [] })
  })
  it('parcela já paga ou contrato sem condomínio ficam de fora', () => {
    const pagas = PARCELAS.map(s => (s.id === COND ? { ...s, registered: [s.startDate] } : s))
    expect(parcelaDoBoleto({ vencimento: '2026-11-05', valor: 1290, nome: 'Edifício Sol' }, [C], pagas).forte).toBeNull()
    expect(parcelaDoBoleto({ vencimento: '2026-11-05', valor: 1290, nome: 'Edifício Sol' }, [{ ...C, tem_condominio: false }], PARCELAS).forte).toBeNull()
  })
  it('parâmetros do Assistente → dados do boleto', () => {
    expect(boletoDosParametros({ valor: 1290, documento: { vencimento: '2026-11-05' }, favorecido_novo: 'Cond Sol' }))
      .toEqual({ vencimento: '2026-11-05', valor: 1290, nome: 'Cond Sol' })
  })
})

describe('leitura do boleto (mock da IA)', () => {
  it('servidor: só o que está escrito; itens sem valor e zero saem; total e data validados', () => {
    expect(normalizarSaidaLeitura({
      vencimento: '05/11/2026', total: '1290.004', beneficiario: ' Cond ',
      itens: [{ descricao: 'Taxa', valor: 900 }, { descricao: 'Encargos', valor: 0 }, { descricao: '', valor: 5 }, { descricao: 'Desconto', valor: -10 }],
    })).toEqual({ vencimento: null, total: 1290, beneficiario: 'Cond', itens: [{ desc: 'Taxa', valor: 900 }, { desc: 'Desconto', valor: -10 }] })
  })
  it('app: normaliza e recusa leitura vazia', async () => {
    expect(normalizarLeitura({ vencimento: '2026-11-05', total: 1290, itens: [{ desc: 'A', valor: 1290 }] }).itens).toHaveLength(1)
    const ler = async () => ({ leitura: { itens: [] } })
    await expect(extrairItensDeImagem({ base64: 'x', mimeType: 'image/png' }, { ler })).rejects.toThrow(/Não consegui ler/)
  })
  it('app: o anexo já preparado vai como está, com a leitura de boleto', async () => {
    const pedidos = []
    const ler = async (p) => { pedidos.push(p); return { leitura: { vencimento: '2026-11-05', total: 100, itens: [{ desc: 'Taxa', valor: 100 }] } } }
    const r = await extrairItensDeImagem({ base64: 'PDF64', mimeType: 'application/pdf' }, { ler })
    expect(pedidos[0]).toEqual({ leitura: 'boleto_condominio', imagemBase64: 'PDF64', mimeType: 'application/pdf' })
    expect(r).toMatchObject({ total: 100, itens: [{ desc: 'Taxa', valor: 100 }] })
  })
})

describe('regras puras da parcela aberta', () => {
  const cond = PARCELAS.find(s => s.id === COND)
  const comp = composicaoDaParcela([{ desc: 'Taxa', valor: 1200, responsavel: 'inquilino' }, { desc: 'Fundo', valor: 90, responsavel: 'proprietario' }])

  it('parcela informada conta como valor manual (sincronização e previsão não sobrescrevem)', () => {
    const informada = { ...cond, ...planoInformarParcela(cond, comp) }
    expect(valorManual(informada)).toBe(true)
    const { atualizar } = planoPrevisaoCondominio(C, PARCELAS.map(s => (s.id === COND ? informada : s)), [])
    expect(atualizar.map(m => m.id)).not.toContain(COND)
  })
  it('valor de ocorrência (override) sai ao informar, a data fica', () => {
    const comOv = { ...cond, overrides: { [cond.startDate]: { amount: 1300, date: '2026-11-06' } } }
    expect(planoInformarParcela(comOv, comp).overrides[cond.startDate]).toEqual({ date: '2026-11-06' })
  })
  it('crédito da parcela: criar / atualizar / remover / conflito quando já abatido', () => {
    const novo = { valor: 90, itens: [{ desc: 'Fundo', valor: 90 }] }
    expect(planoCreditoDaParcela({ atual: null, novo }).acao).toBe('criar')
    expect(planoCreditoDaParcela({ atual: { id: 'k', status: 'previsto', valor: 90 }, novo: { ...novo, valor: 80 } })).toMatchObject({ acao: 'atualizar', id: 'k' })
    expect(planoCreditoDaParcela({ atual: { id: 'k', status: 'previsto', valor: 90 }, novo: null })).toEqual({ acao: 'remover', id: 'k' })
    expect(planoCreditoDaParcela({ atual: { id: 'k', status: 'compensado', valor: 90 }, novo })).toMatchObject({ acao: 'atualizar' })
    expect(planoCreditoDaParcela({ atual: { id: 'k', status: 'compensado', valor: 90 }, novo: null })).toMatchObject({ acao: 'conflito', abatido: 90, novo: 0 })
  })
  it('pagamento: total igual usa os itens; diferente pede (com tela) ou cria a diferença (auto-registro)', () => {
    const p = { ...cond, ...planoInformarParcela(cond, comp) }
    expect(composicaoNoPagamento(p, 1290).composicao).toMatchObject({ total: 1290, proprietario: 90 })
    expect(composicaoNoPagamento(p, 1300)).toMatchObject({ pedir: true, composicao: null })
    expect(composicaoNoPagamento(p, 1300, { auto: true }).composicao).toMatchObject({ total: 1300, proprietario: 90 })
  })
  it('estorno: gerado de parcela informada volta a previsto; reaberto sem lançamento de origem volta a previsto', () => {
    const creditos = [
      { id: 'a', status: 'aberto', origem_lancamento_id: 'tx', origem_agendamento_id: COND },
      { id: 'b', status: 'aberto', origem_lancamento_id: 'tx', origem_agendamento_id: 'outra' },
    ]
    expect(planejarReversao({ tx: { id: 'tx' }, creditos, informadas: new Set([COND]) })).toMatchObject({ voltarPrevisto: ['a'], remover: ['b'] })
    const r = planejarReversao({ tx: { id: 'al' }, creditos: [{ id: 'p', status: 'compensado', compensado_em_lancamento_id: 'al', origem_agendamento_id: COND, origem_lancamento_id: null }] })
    expect(r.statusReabrir).toEqual({ p: 'previsto' })
    expect(statusAoReabrir({ origem_agendamento_id: COND, origem_lancamento_id: 'tx' })).toBe('aberto')
    expect(statusAoReabrir({})).toBe('aberto')
  })
})
