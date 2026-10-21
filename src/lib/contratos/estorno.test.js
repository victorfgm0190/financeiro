import { describe, it, expect } from 'vitest'
import { analisarEstorno, cancelarOcorrencia, pendentesForaDaVigencia } from './estorno.js'
import { reabrirBaixasDoLancamento } from '../scheduleBaixa.js'
import { computeOccurrences } from '../occurrences.js'
import { linhasDoContrato } from './parcelas.js'

// Caso do teste1: condomínio de 05/12 pago, contrato depois rescindido, lançamento estornado.
const contratos = {
  k1: { id: 'k1', status: 'rescindido', objeto: 'Apto' },
  k2: { id: 'k2', status: 'ativo' },
}
const porId = (id) => contratos[id] || null
const parcela = (o = {}) => ({
  id: 'ctr_k1_condominio_202612', contratoId: 'k1', contratoPapel: 'condominio', frequency: 'once', startDate: '2026-12-05',
  amount: 1300, registered: ['2026-12-05'], registeredMeta: { '2026-12-05': { tipo: 'pago', lancamento_id: 'tx_c' } },
  skipped: [], overrides: {}, ...o,
})
const tx = { id: 'tx_c', scheduleId: 'ctr_k1_condominio_202612', date: '2026-12-05', dataOcorrencia: '2026-12-05', amount: 1300 }

describe('estorno de parcela de contrato', () => {
  it('rescindido: pergunta, com a ocorrência que será reaberta', () => {
    const a = analisarEstorno(tx, [parcela()], porId)
    expect(a).toMatchObject({ perguntar: true, ocorrencia: '2026-12-05' })
    expect(a.contrato.id).toBe('k1')
  })

  it('ativo: não pergunta; lançamento fora de contrato: nada', () => {
    expect(analisarEstorno(tx, [parcela({ contratoId: 'k2' })], porId).perguntar).toBe(false)
    expect(analisarEstorno({ ...tx, scheduleId: 'sch_x' }, [{ id: 'sch_x', registered: ['2026-12-05'] }], porId)).toBeNull()
  })

  it('"Não": estorno + ocorrência cancelada → nenhuma pendência solta', () => {
    const [reaberta] = reabrirBaixasDoLancamento([parcela()], tx)
    expect(computeOccurrences(reaberta, 1)).toEqual(['2026-12-05'])
    const cancelada = cancelarOcorrencia(reaberta, '2026-12-05')
    expect(computeOccurrences(cancelada, 1)).toEqual([])
    expect(cancelada.skipped).toEqual(['2026-12-05'])
  })

  it('"Sim": volta a pendente e a ficha avisa (pendente em contrato rescindido)', () => {
    const [reaberta] = reabrirBaixasDoLancamento([parcela()], tx)
    const linhas = linhasDoContrato(contratos.k1, [reaberta], [])
    expect(pendentesForaDaVigencia(contratos.k1, linhas)).toHaveLength(1)
    expect(pendentesForaDaVigencia(contratos.k2, linhas)).toEqual([])
  })

  it('série vinculada recorrente: acha a ocorrência pela meta', () => {
    const serie = { id: 'sch_v', contratoId: 'k1', contratoPapel: 'aluguel', frequency: 'monthly', startDate: '2026-11-15', registered: ['2026-11-15'], registeredMeta: { '2026-11-15': { lancamento_id: 'tx_v' } }, skipped: [], overrides: {} }
    expect(analisarEstorno({ id: 'tx_v', scheduleId: null, date: '2026-11-16' }, [serie], porId)).toMatchObject({ perguntar: true, ocorrencia: '2026-11-15' })
  })
})
