// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { fetchComEstorno, definirConfirmadorEstorno, EVENTO_ESTORNO_VIRADA } from '../../lib/api'
import { enviarFila, enviarFilaIsolando, entradasDoRecusado } from '../../lib/filaOffline'
import { PreviaEstorno } from './PeriodoViradoHost'

// Aviso de período virado: o interceptador de todas as gravações, a fila do app e a janela da prévia.
const PREVIA = {
  codigo: 'periodo_virado', error: 'Esse período já foi virado. Para lançar, é preciso estornar a virada.',
  previa: {
    viradas: [{ data_inicio: '2026-08-15', data_corte: '2026-09-14' }, { data_inicio: '2026-07-15', data_corte: '2026-08-14' }],
    itens: [
      { function_id: 'f', account_id: 'c', data: '2026-08-10', valor: 40, descricao: 'Depósito' },
      { function_id: 'f', account_id: 'c', data: '2026-08-11', valor: 5, descricao: 'Outro' },
      { function_id: 'f', account_id: 'c', data: '2026-09-02', valor: 7, descricao: 'Mais um' },
    ],
  },
}
const resposta = (status, corpo) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
const mockFetch = (...respostas) => {
  const f = vi.fn()
  for (const r of respostas) f.mockResolvedValueOnce(r)
  vi.stubGlobal('fetch', f)
  return f
}
const lancamento = { chave: 'l1', tipo: 'secao', tabela: 'lancamentos', op: 'gravar', id: 't1', item: { id: 't1', type: 'expense', amount: 10, date: '2026-08-10', accountId: 'a' } }
const conta = { chave: 'c1', tipo: 'conta', op: 'gravar', id: 'a', item: { id: 'a', name: 'A', type: 'checking' } }

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); definirConfirmadorEstorno(null) })

describe('interceptador', () => {
  it('não mexe em respostas comuns nem em outro 409', async () => {
    const f = mockFetch(resposta(200, { ok: true }), resposta(409, { codigo: 'exclusao_em_massa' }))
    const pergunta = vi.fn()
    definirConfirmadorEstorno(pergunta)
    expect((await fetchComEstorno('/x')).status).toBe(200)
    expect((await fetchComEstorno('/x')).status).toBe(409)
    expect(pergunta).not.toHaveBeenCalled()
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('sem confirmação: uma chamada só, e a recusa volta para quem chamou', async () => {
    const f = mockFetch(resposta(409, PREVIA))
    definirConfirmadorEstorno(async () => false)
    expect((await fetchComEstorno('/api/x', { method: 'POST' })).status).toBe(409)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('com confirmação: reenvia com o cabeçalho e avisa a tela, com a parada da virada', async () => {
    const f = mockFetch(resposta(409, PREVIA), resposta(200, { ok: true, viradaEstorno: { parou: { fim: '2026-08-14' } } }))
    definirConfirmadorEstorno(async () => true)
    const ouvinte = vi.fn()
    window.addEventListener(EVENTO_ESTORNO_VIRADA, ouvinte)
    const r = await fetchComEstorno('/api/x', { method: 'DELETE', headers: { a: '1' } })
    window.removeEventListener(EVENTO_ESTORNO_VIRADA, ouvinte)
    expect(r.status).toBe(200)
    expect(f.mock.calls[1][1].headers).toMatchObject({ a: '1', 'X-Confirmar-Estorno': '1' })
    expect(f.mock.calls[1][1].method).toBe('DELETE')
    expect(ouvinte.mock.calls[0][0].detail.parou.fim).toBe('2026-08-14')
  })
})

describe('fila do app', () => {
  const corpos = (f) => f.mock.calls.map(c => JSON.parse(c[1].body))

  it('confere antes de gravar: recusou, nem o saldo das contas vai; marca para voltar ao banco', async () => {
    const f = mockFetch(resposta(409, PREVIA))
    definirConfirmadorEstorno(async () => false)
    const err = await enviarFilaIsolando([conta, lancamento]).then(() => null, e => e)
    expect(err.periodoRecusado).toBe(true)
    expect(f).toHaveBeenCalledTimes(1)
    expect(corpos(f)[0]).toMatchObject({ table: 'lancamentos', somenteVerificar: true })
  })
  it('recusou com 5 lançamentos de hoje e 1 em período virado: os 5 são gravados, o de período virado não', async () => {
    const hoje = Array.from({ length: 5 }, (_, i) => ({ ...lancamento, chave: `h${i}`, id: `h${i}`, item: { ...lancamento.item, id: `h${i}`, date: '2026-11-06' } }))
    const virado = { ...lancamento, chave: 'v', id: 'v', item: { ...lancamento.item, id: 'v', date: '2026-08-10' } }
    const gravados = []
    const pedidos = []
    vi.stubGlobal('fetch', vi.fn(async (_u, init) => {
      const b = JSON.parse(init.body)
      pedidos.push(b)
      const ids = (b.upsert || []).map(r => r.id)
      if (ids.includes('v')) {
        return resposta(409, { ...PREVIA, previa: { ...PREVIA.previa, itens: [{ lancamento_id: 'v', function_id: 'f', account_id: 'c', data: '2026-08-10', valor: 10, descricao: 'V' }] } })
      }
      if (b.somenteVerificar) return resposta(200, { ok: true, verificado: true })
      gravados.push(...ids)
      return resposta(200, { ok: true, written: { upserted: ids.length, deleted: 0 } })
    }))
    const pergunta = vi.fn(async () => false)
    definirConfirmadorEstorno(pergunta)
    const r = await enviarFilaIsolando([...hoje, virado])
    expect(pergunta).toHaveBeenCalledTimes(1)
    expect(gravados.sort()).toEqual(['h0', 'h1', 'h2', 'h3', 'h4'])
    expect(r.descartadas.map(e => e.chave)).toEqual(['v'])
    expect(r.enviadas.map(e => e.chave).sort()).toEqual(['h0', 'h1', 'h2', 'h3', 'h4'])
    expect(r.falhas).toEqual([])
    expect(pedidos.some(b => !b.somenteVerificar && (b.upsert || []).some(x => x.id === 'v'))).toBe(false)
  })
  it('o que sai junto com o recusado: sombra, espelho, rateio e a baixa no agendamento; o resto fica', () => {
    const tx = (id, extra = {}) => ({ chave: `l:${id}`, tipo: 'secao', tabela: 'lancamentos', op: 'gravar', id, item: { id, ...extra } })
    const ag = (id, extra = {}) => ({ chave: `a:${id}`, tipo: 'secao', tabela: 'agendamentos', op: 'gravar', id, item: { id, ...extra } })
    const entradas = [
      tx('v', { scheduleId: 's1' }), tx('tx_inv_v'), tx('filho', { parentTxId: 'v' }), tx('esp', { espelhoOrigemId: 'v' }), tx('outro'),
      ag('s1'), ag('s2', { registeredMeta: { '2026-08-10': { lancamento_id: 'v' } } }), ag('s3', { registeredMeta: { '2026-08-10': { lancamento_id: 'outro' } } }),
      { chave: 'r:v', tipo: 'rateios', id: 'v', op: 'gravar', item: [] }, { chave: 'r:o', tipo: 'rateios', id: 'outro', op: 'gravar', item: [] },
      conta,
    ]
    const fora = entradasDoRecusado(entradas, [{ lancamento_id: 'v' }]).map(e => e.chave).sort()
    expect(fora).toEqual(['a:s1', 'a:s2', 'l:esp', 'l:filho', 'l:tx_inv_v', 'l:v', 'r:v'].sort())
  })
  it('confirmou: uma confirmação só; contas, depois o lote inteiro numa operação', async () => {
    const lote = Array.from({ length: 700 }, (_, i) => ({ ...lancamento, chave: `l${i}`, id: `t${i}`, item: { ...lancamento.item, id: `t${i}` } }))
    const f = mockFetch(
      resposta(409, PREVIA), resposta(200, { ok: true, verificado: true, estornoConfirmado: true }),
      resposta(200, { ok: true }), resposta(200, { ok: true, written: { upserted: 700, deleted: 0 } }),
    )
    const pergunta = vi.fn(async () => true)
    definirConfirmadorEstorno(pergunta)
    const enviadas = await enviarFila([conta, ...lote])
    expect(pergunta).toHaveBeenCalledTimes(1)
    expect(f).toHaveBeenCalledTimes(4)
    const [, , contas, secao] = corpos(f)
    expect(contas.type).toBe('accounts')
    expect(secao.upsert).toHaveLength(700)
    expect(secao.somenteVerificar).toBeUndefined()
    expect(f.mock.calls[3][1].headers['X-Confirmar-Estorno']).toBe('1')
    expect(enviadas).toHaveLength(701)
  })
  it('período bloqueado: o item fica com o motivo, e os outros seguem', async () => {
    const bloqueio = { codigo: 'periodo_bloqueado', error: 'Não é possível gravar em 10/07/2026.' }
    const f = vi.fn(async (_u, init) => {
      const b = JSON.parse(init.body)
      if (b.table === 'lancamentos') return resposta(409, bloqueio)
      return resposta(200, { ok: true })
    })
    vi.stubGlobal('fetch', f)
    const r = await enviarFilaIsolando([conta, lancamento])
    expect(r.falhas).toHaveLength(1)
    expect(r.falhas[0].entrada.chave).toBe('l1')
    expect(r.falhas[0].err.dados.error).toMatch(/Não é possível gravar/)
    expect(r.enviadas.map(e => e.chave)).toEqual(['c1'])
  })
})

describe('janela da prévia', () => {
  it('mostra o aviso, as viradas na ordem e o lote agrupado por mês', () => {
    render(<PreviaEstorno dados={PREVIA} onConfirmar={() => {}} onCancelar={() => {}} />)
    expect(screen.getByText(/Esse período já foi virado/)).toBeTruthy()
    const viradas = screen.getByTestId('previa-viradas').textContent
    expect(viradas.indexOf('14/09/2026')).toBeLessThan(viradas.indexOf('14/08/2026'))
    expect(screen.getAllByTestId('previa-grupo')).toHaveLength(2)
    expect(screen.getByText(/Depósito/)).toBeTruthy()
  })
  it('confirmar uma vez só; "Não gravar" responde não', async () => {
    const sim = vi.fn()
    const nao = vi.fn()
    render(<PreviaEstorno dados={PREVIA} onConfirmar={sim} onCancelar={nao} />)
    const botao = screen.getByRole('button', { name: 'Estornar, gravar e refazer' })
    fireEvent.click(botao)
    await waitFor(() => expect(sim).toHaveBeenCalledTimes(1))
    expect(botao.disabled).toBe(true)
    cleanup()
    render(<PreviaEstorno dados={PREVIA} onConfirmar={sim} onCancelar={nao} />)
    fireEvent.click(screen.getByRole('button', { name: 'Não gravar' }))
    expect(nao).toHaveBeenCalledTimes(1)
  })
})
