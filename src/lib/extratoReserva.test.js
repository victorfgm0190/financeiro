// Extrato da função de reserva (lib/extratoReserva): a conta do fim de mês é a mesma da grade do
// Fluxo Futuro (saldo de hoje + Σ Dep − Res − Prov, round2 por mês), por função e somada. Dados FICTÍCIOS.
import { describe, it, expect } from 'vitest'
import { extratoDaFuncao, juntarExtratos, realizadosDaFuncao, agruparRendimentos } from './extratoReserva.js'
import { indexarReserva, saldoDaFuncao } from './saldoReserva.js'
import { totaisFluxoFuturo } from './fluxoReservaTotais.js'

const round2 = (n) => Math.round(n * 100) / 100
const MESES = Array.from({ length: 13 }, (_, i) => ({ idx: i, year: 2026 + Math.floor((9 + i) / 12), month0: (9 + i) % 12, label: '' }))

// Réplica da conta da grade (FluxoTab › projecoesCompletas) para conferir.
function grade(saldoHoje, previstos, n) {
  const deps = new Array(n).fill(0), ress = new Array(n).fill(0), provs = new Array(n).fill(0)
  for (const p of previstos) {
    const col = p.tipo === 'deposito' ? deps : p.tipo === 'resgate' ? ress : provs
    col[p.idx] = round2(col[p.idx] + p.amount)
  }
  let bal = saldoHoje
  return Array.from({ length: n }, (_, i) => { if (i > 0) bal = round2(bal + deps[i] - ress[i] - provs[i]); return bal })
}

// Gerador determinístico de previstos com centavos "difíceis".
function previstosAleatorios(semente, n) {
  let x = semente
  const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280 }
  const tipos = ['deposito', 'resgate', 'provisao']
  return Array.from({ length: 40 }, (_, k) => {
    const idx = 1 + Math.floor(rnd() * (n - 1))
    return { idx, date: `2026-12-${String(1 + (k % 28)).padStart(2, '0')}`, label: `m${k}`, amount: round2(rnd() * 999 + 0.01), tipo: tipos[k % 3] }
  }).sort((a, b) => a.idx - b.idx || a.date.localeCompare(b.date))
}

describe('extratoDaFuncao', () => {
  it.each([1, 7, 42, 99])('fim de cada mês = grade (semente %i), período a partir do mês do período aberto', (semente) => {
    const prev = previstosAleatorios(semente, MESES.length)
    const saldoHoje = 361.6667
    const g = grade(saldoHoje, prev, MESES.length)
    const ext = extratoDaFuncao({ id: 'f', nome: 'F', saldoHoje, realizados: { corte: '2026-10-15', itens: [] }, previstos: prev, meses: MESES })
    expect(ext.secoes.map(s => s.saldoFim)).toEqual(g)
  })

  it('período começando mais à frente: saldo inicial = grade no mês anterior', () => {
    const prev = previstosAleatorios(5, MESES.length)
    const g = grade(1000, prev, MESES.length)
    const ext = extratoDaFuncao({ id: 'f', nome: 'F', saldoHoje: 1000, realizados: null, previstos: prev, meses: MESES.slice(4, 8) })
    expect(ext.saldoInicial).toBe(g[3])
    expect(ext.secoes.map(s => s.saldoFim)).toEqual(g.slice(4, 8))
    expect(ext.secoes.every(s => s.itens.every(it => it.previsto))).toBe(true)
  })

  it('TOTAL GERAL = soma das funções, igual ao rodapé da grade (totaisFluxoFuturo)', () => {
    const fns = [3, 8, 13].map((sem, k) => ({ id: `f${k}`, saldoHoje: round2(100 * k + 0.333), prev: previstosAleatorios(sem, MESES.length) }))
    const projections = fns.map(f => ({ f: { id: f.id }, monthly: grade(f.saldoHoje, f.prev, MESES.length).map(saldo => ({ saldo, dep: 0, res: 0, prov: 0 })) }))
    const rodape = totaisFluxoFuturo(projections, () => 0).monthly.map(m => m.saldo)
    const total = juntarExtratos(fns.map(f => extratoDaFuncao({ id: f.id, nome: f.id, saldoHoje: f.saldoHoje, realizados: { corte: '2026-10-15', itens: [] }, previstos: f.prev, meses: MESES })))
    expect(total.secoes.map(s => s.saldoFim)).toEqual(rodape)
    expect(total.saldoFinal).toBe(rodape[rodape.length - 1])
  })
})

describe('realizadosDaFuncao', () => {
  it('saldo inicial + realizados = saldo de hoje (mesmos filtros de saldoDaFuncao)', () => {
    const fn = { id: 'f1', accountId: 'r' }
    const idx = indexarReserva({
      periods: [{ function_id: 'f1', data_inicio: '2026-10-15', saldo_inicial: 250 }],
      adjustments: [
        { function_id: 'f1', data: '2026-10-31', valor: 1.27, lancamento_id: 'x' },
        { function_id: 'f1', data: '2026-11-02', valor: -10, observacao: 'Correção' },
        { function_id: 'f1', data: '2026-11-30', valor: 99 }, // futuro: fora
      ],
      transactions: [
        { reservaFuncaoId: 'f1', type: 'transfer', accountId: 'c', toAccountId: 'r', amount: 80, date: '2026-10-20' },
        { reservaFuncaoId: 'f1', type: 'transfer', accountId: 'r', toAccountId: 'c', amount: 30.5, date: '2026-11-03' },
        { reservaFuncaoId: 'f1', type: 'expense', accountId: 'cartao', amount: 500, date: '2026-11-04' }, // provisão: não é movimento
        { reservaFuncaoId: 'f1', type: 'transfer', accountId: 'c', toAccountId: 'r', amount: 5, date: '2026-10-01' }, // antes do período
      ],
    })
    const hoje = '2026-11-14'
    const saldo = saldoDaFuncao(fn, hoje, idx).saldo
    const r = realizadosDaFuncao(fn, '2026-10-01', hoje, idx)
    expect(r.corte).toBe('2026-10-15')
    expect(r.itens.map(i => i.tipo)).toEqual(['Depósito', 'Rendimento', 'Ajuste', 'Resgate'])
    const ext = extratoDaFuncao({ id: 'f1', nome: 'F', saldoHoje: saldo, realizados: r, previstos: [], meses: MESES.slice(0, 2) })
    expect(ext.saldoInicial).toBe(250)
    expect(ext.secoes[0].itens.at(-1).saldo).toBe(round2(saldo))
  })
})

describe('agruparRendimentos', () => {
  const rend = (date, v, fid = 'f1') => ({ date, label: 'Rendimento', tipo: 'Rendimento', entrada: v, saida: 0, functionId: fid, funcao: fid })
  const dep = (date, v, fid = 'f1') => ({ date, label: 'Depósito', tipo: 'Depósito', entrada: v, saida: 0, functionId: fid, funcao: fid })
  const extratoCom = (itens, fid = 'f1', saldoHoje) => extratoDaFuncao({
    id: fid, nome: fid, saldoHoje, realizados: { corte: '2026-10-15', itens }, meses: MESES.slice(0, 3),
    previstos: [{ idx: 1, date: '2026-11-20', label: 'Prov', amount: 100, tipo: 'deposito' }, { idx: 2, date: '2026-12-10', label: 'Res', amount: 30.5, tipo: 'resgate' }],
  })
  const ITENS = [rend('2026-10-16', 2.22), rend('2026-10-20', 1.09), rend('2026-10-29', 1.06), dep('2026-11-01', 142), rend('2026-11-05', 2.21), rend('2026-11-10', 1.33), rend('2026-11-11', 0.49)]
  const mesmosNumeros = (a, b) => {
    expect(a.secoes.map(s => [s.chave, s.entradas, s.saidas, s.saldoFim])).toEqual(b.secoes.map(s => [s.chave, s.entradas, s.saidas, s.saldoFim]))
    expect([a.saldoInicial, a.entradas, a.saidas, a.saldoFinal, a.negativoEm]).toEqual([b.saldoInicial, b.entradas, b.saidas, b.saldoFinal, b.negativoEm])
  }

  it('outro movimento no meio quebra em dois grupos; saldo de cada linha exato; números iguais aos do dia a dia', () => {
    const dia = extratoCom(ITENS, 'f1', 1650.49)
    const ag = agruparRendimentos(dia)
    mesmosNumeros(ag, dia)
    const hoje = ag.secoes[0].itens
    expect(hoje.map(i => [i.date, i.label, i.entrada])).toEqual([
      ['2026-10-29', 'Rendimentos de 16/10 a 29/10', 4.37],
      ['2026-11-01', 'Depósito', 142],
      ['2026-11-11', 'Rendimentos de 05/11 a 11/11', 4.03],
    ])
    // Saldo da linha agrupada = saldo depois do último rendimento do grupo (dia a dia).
    const porData = Object.fromEntries(dia.secoes[0].itens.map(i => [i.date, i.saldo]))
    hoje.forEach(i => expect(i.saldo).toBe(porData[i.date]))
    expect(hoje.at(-1).saldo).toBe(1650.49)
  })

  it('rendimento sozinho fica como está (sem "Rendimentos de")', () => {
    const ag = agruparRendimentos(extratoCom([rend('2026-10-16', 2.22), dep('2026-10-20', 10), rend('2026-10-25', 1)], 'f1', 500))
    expect(ag.secoes[0].itens.map(i => i.label)).toEqual(['Rendimento', 'Depósito', 'Rendimento'])
  })

  it('TOTAL GERAL: uma linha agrupada por função; fim da sequência e números iguais', () => {
    const ea = extratoCom([rend('2026-10-16', 1, 'A'), rend('2026-10-17', 1.5, 'A')], 'A', 100)
    const eb = extratoCom([rend('2026-10-16', 2, 'B'), rend('2026-10-17', 2.5, 'B')], 'B', 50)
    const dia = juntarExtratos([ea, eb])
    const ag = agruparRendimentos(dia)
    mesmosNumeros(ag, dia)
    expect(ag.secoes[0].itens.map(i => [i.funcao, i.label, i.entrada])).toEqual([
      ['A', 'Rendimentos de 16/10 a 17/10', 2.5],
      ['B', 'Rendimentos de 16/10 a 17/10', 4.5],
    ])
    expect(ag.secoes[0].itens.at(-1).saldo).toBe(dia.secoes[0].itens.at(-1).saldo)
  })
})
