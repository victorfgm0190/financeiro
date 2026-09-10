import { useState, useEffect, useMemo, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { RotateCcw, FileSpreadsheet, ChevronUp, ChevronDown, AlertTriangle, ExternalLink } from 'lucide-react'
import * as XLSX from 'xlsx'
import { fetchReserveLedgerMonths, fetchReserveLedgerSummary } from '../../lib/db'
import { fmt, fmtDate } from '../shared/utils'

// ── Aba "Razão Diário" ──────────────────────────────────────────────────────
// Lê reserve_daily_ledger (uma linha por função por dia) e mostra evolução + tabela.
// Um fetch só: os filtros de mês e função recortam o que já está em memória.
//
// Cores: identidade de série no gráfico usa a paleta categórica do Dashboard. Valores
// seguem a regra do projeto — azul = entrada, laranja = saída. Verde/vermelho NUNCA
// distinguem entrada de saída aqui (ver o comentário da paleta em src/index.css).

const SERIES_COLORS = ['#6366f1', '#f97316', '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#14b8a6']

const LEDGER_DAYS = 120

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const monthLabel = (m) => {
  const [y, mm] = m.split('-')
  return `${MONTH_LABELS[Number(mm) - 1]}/${y}`
}

const num = (v) => Number(v) || 0
// divergencia_pct já é gravado EM PONTOS PERCENTUAIS (-1.22 = −1,22%), não em fração.
const fmtPct = (v) => (v === null || v === undefined ? '—' : `${num(v).toFixed(2)}%`)

// Tooltip no padrão dos outros gráficos do app (fundo surface, sem borda clara).
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-gray-700 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-400 mb-1.5">{fmtDate(label)}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="text-xs flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-gray-400">{p.name}</span>
          <span className="text-gray-100 font-medium ml-auto">{fmt(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

// Uma linha por função. `series` = [{ id, name, color }]; `data` = [{ date, [id]: valor }].
function EvolutionChart({ data, series }) {
  if (data.length === 0 || series.length === 0) return null
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500 mb-3">Evolução do Saldo Atualizado</p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={d => fmtDate(d)?.slice(0, 5)}
            interval={Math.max(0, Math.floor(data.length / 8))}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => `R$${(v / 1000).toFixed(1)}k`}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} iconType="plainline" />
          {series.map(s => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Cabeçalho de coluna clicável, com a seta na coluna ativa.
function Th({ col, label, sortCol, sortDesc, onSort, align = 'right', className = '' }) {
  const ativa = sortCol === col
  return (
    <th
      onClick={() => onSort(col)}
      title="Ordenar por esta coluna"
      className={`px-3 py-2 text-xs font-medium cursor-pointer select-none whitespace-nowrap transition-colors ${
        align === 'left' ? 'text-left' : 'text-right'
      } ${ativa ? 'text-gray-200' : 'text-gray-500 hover:text-gray-300'} ${className}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        {ativa && (sortDesc ? <ChevronDown size={11} /> : <ChevronUp size={11} />)}
      </span>
    </th>
  )
}

export default function RazaoDiarioTab({ functions = [], snapshots = [], onVerPeriodo }) {
  const [ledger, setLedger] = useState([])
  const [months, setMonths] = useState([])
  const [resumo, setResumo] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState('')      // '' = todos
  const [selectedFunctions, setSelectedFunctions] = useState([]) // [] = todas
  const [sortColumn, setSortColumn] = useState('snapshot_date')
  const [sortDesc, setSortDesc] = useState(true)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  // Todo setState acontece no .then/.catch/.finally — nada síncrono, para o efeito de mount
  // não disparar renders em cascata. O state já nasce em `loading`.
  const fetchLedger = useCallback(() => (
    Promise.all([fetchReserveLedgerMonths(), fetchReserveLedgerSummary(LEDGER_DAYS)])
      .then(([ms, dados]) => {
        setMonths(ms?.months || [])
        setLedger(dados?.rows || [])
        setResumo(dados || null)
        setErro('')
      })
      .catch(err => setErro(err?.message || 'Falha ao carregar o razão diário.'))
      .finally(() => setLoading(false))
  ), [])

  useEffect(() => { fetchLedger() }, [fetchLedger])

  const handleRefresh = () => { setLoading(true); fetchLedger() }

  // Nome da função: o join do endpoint (function_name) com fallback na lista em memória —
  // uma função excluída deixa linhas órfãs no razão, e elas devem continuar legíveis.
  const nomeDe = useCallback((row) => {
    if (row.function_name) return row.function_name
    return functions.find(f => f.id === row.function_id)?.name || '(função removida)'
  }, [functions])

  // Funções que realmente aparecem no razão, na ordem em que a tela as lista.
  const funcoesNoRazao = useMemo(() => {
    const vistas = new Map()
    for (const r of ledger) if (!vistas.has(r.function_id)) vistas.set(r.function_id, nomeDe(r))
    const ordem = functions.map(f => f.id)
    return [...vistas.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => {
        const ia = ordem.indexOf(a.id)
        const ib = ordem.indexOf(b.id)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
        return a.name.localeCompare(b.name, 'pt-BR')
      })
  }, [ledger, functions, nomeDe])

  // Períodos JÁ FECHADOS de cada função (dos snapshots de virada), para o link "Ver período":
  // a linha do dia D pertence ao período fechado cujo intervalo contém D. Um dia do período
  // ainda aberto não tem snapshot e por isso não tem link.
  const periodosPorFn = useMemo(() => {
    const m = {}
    for (const sn of (snapshots || [])) {
      if (!sn.function_id || !sn.data_fim) continue
      ;(m[sn.function_id] = m[sn.function_id] || []).push({ inicio: sn.data_inicio, fim: sn.data_fim })
    }
    return m
  }, [snapshots])

  const periodoDe = useCallback((row) => (
    (periodosPorFn[row.function_id] || []).find(p => row.snapshot_date >= p.inicio && row.snapshot_date <= p.fim) || null
  ), [periodosPorFn])

  const corDe = useCallback(
    (fid) => SERIES_COLORS[Math.max(0, funcoesNoRazao.findIndex(f => f.id === fid)) % SERIES_COLORS.length],
    [funcoesNoRazao],
  )

  // Filtros em AND, aplicados sobre os dados já carregados (sem novo fetch).
  const filtered = useMemo(() => ledger.filter(row => {
    const okMes = !selectedMonth || row.snapshot_date.startsWith(selectedMonth)
    const okFn = selectedFunctions.length === 0 || selectedFunctions.includes(row.function_id)
    return okMes && okFn
  }), [ledger, selectedMonth, selectedFunctions])

  const sorted = useMemo(() => {
    const rows = filtered.map(r => ({ ...r, _nome: nomeDe(r), _periodo: periodoDe(r) }))
    return rows.sort((a, b) => {
      let av = sortColumn === 'function_name' ? a._nome : a[sortColumn]
      let bv = sortColumn === 'function_name' ? b._nome : b[sortColumn]
      if (typeof av === 'string' || typeof bv === 'string') {
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'pt-BR')
        return sortDesc ? -cmp : cmp
      }
      const cmp = num(av) - num(bv)
      return sortDesc ? -cmp : cmp
    })
  }, [filtered, sortColumn, sortDesc, nomeDe, periodoDe])

  // Série do gráfico: uma coluna por função, uma linha por dia (ordem cronológica).
  const { chartData, chartSeries } = useMemo(() => {
    const series = (selectedFunctions.length === 0
      ? funcoesNoRazao
      : funcoesNoRazao.filter(f => selectedFunctions.includes(f.id))
    ).map(f => ({ ...f, color: corDe(f.id) }))

    const porDia = new Map()
    for (const r of filtered) {
      if (!porDia.has(r.snapshot_date)) porDia.set(r.snapshot_date, { date: r.snapshot_date })
      porDia.get(r.snapshot_date)[r.function_id] = num(r.saldo_atualizado)
    }
    const data = [...porDia.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
    return { chartData: data, chartSeries: series }
  }, [filtered, funcoesNoRazao, selectedFunctions, corDe])

  const toggleFunction = (fid) => {
    setSelectedFunctions(prev => (prev.includes(fid) ? prev.filter(x => x !== fid) : [...prev, fid]))
  }

  const handleSort = (col) => {
    if (col === sortColumn) setSortDesc(d => !d)
    else { setSortColumn(col); setSortDesc(true) }
  }

  const handleExportExcel = () => {
    const linhas = sorted.map(r => ({
      Data: r.snapshot_date,
      'Função': r._nome,
      Entrada: num(r.entrada_dia),
      'Saída': num(r.saida_dia),
      Ajuste: num(r.ajuste_dia),
      'Saldo Acumulado': num(r.saldo_acumulado),
      'Saldo Atualizado': num(r.saldo_atualizado),
      'Saldo Real da Conta': r.saldo_real_conta === null ? '' : num(r.saldo_real_conta),
      'Fator de Rateio': r.fator_rateio === null ? '' : num(r.fator_rateio),
      'Divergência': num(r.divergencia),
      'Divergência %': r.divergencia_pct === null ? '' : num(r.divergencia_pct),
    }))
    const ws = XLSX.utils.json_to_sheet(linhas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Razão Diário')
    const hoje = new Date()
    const stamp = `${hoje.getFullYear()}${String(hoje.getMonth() + 1).padStart(2, '0')}${String(hoje.getDate()).padStart(2, '0')}`
    XLSX.writeFile(wb, `razao-diario-${stamp}.xlsx`)
  }

  const temFiltro = !!selectedMonth || selectedFunctions.length > 0

  return (
    <div className="space-y-4">
      {/* Cabeçalho + ações */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Razão Diário</h3>
          <p className="text-xs text-gray-600 mt-0.5">
            {resumo?.min_date
              ? <>Um registro por função por dia, de {fmtDate(resumo.min_date)} a {fmtDate(resumo.max_date)} ({resumo.days} dias).</>
              : 'Um registro por função por dia. O razão é gravado uma vez por dia e antes de cada virada.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleRefresh} disabled={loading} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
            <RotateCcw size={12} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
          <button
            onClick={handleExportExcel}
            disabled={sorted.length === 0}
            className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 disabled:opacity-40"
          >
            <FileSpreadsheet size={12} /> Excel
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-3 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-gray-500 shrink-0">Mês</label>
          <select
            className="input w-auto text-xs py-1.5"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
          >
            <option value="">Todos os meses</option>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          {temFiltro && (
            <button
              onClick={() => { setSelectedMonth(''); setSelectedFunctions([]) }}
              className="text-xs text-gray-500 hover:text-gray-300 underline"
            >
              Limpar filtros
            </button>
          )}
          <span className="text-xs text-gray-600 ml-auto">
            {sorted.length} {sorted.length === 1 ? 'linha' : 'linhas'}
          </span>
        </div>

        {funcoesNoRazao.length > 0 && (
          <div className="flex items-start gap-3 flex-wrap">
            <label className="text-xs text-gray-500 shrink-0 pt-1">Funções</label>
            <div className="flex flex-wrap gap-1.5 flex-1">
              {funcoesNoRazao.map(f => {
                const on = selectedFunctions.includes(f.id)
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleFunction(f.id)}
                    className={`text-xs px-2 py-1 rounded-md border transition-colors inline-flex items-center gap-1.5 ${
                      on
                        ? 'border-gray-600 bg-gray-800 text-gray-100'
                        : 'border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: corDe(f.id), opacity: on ? 1 : 0.35 }}
                    />
                    {f.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {erro && (
        <div className="card p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-despesa shrink-0 mt-0.5" />
          <p className="text-xs text-despesa">{erro}</p>
        </div>
      )}

      {loading && ledger.length === 0 && (
        <div className="card p-8 text-center"><p className="text-sm text-gray-500">Carregando o razão…</p></div>
      )}

      <EvolutionChart data={chartData} series={chartSeries} />

      {/* Tabela */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 900 }}>
            <thead>
              <tr className="border-b border-gray-800">
                <Th col="snapshot_date" label="Data" align="left" sortCol={sortColumn} sortDesc={sortDesc} onSort={handleSort} />
                <Th col="function_name" label="Função" align="left" sortCol={sortColumn} sortDesc={sortDesc} onSort={handleSort} />
                <Th col="entrada_dia" label="Entrada (+)" sortCol={sortColumn} sortDesc={sortDesc} onSort={handleSort} />
                <Th col="saida_dia" label="Saída (−)" sortCol={sortColumn} sortDesc={sortDesc} onSort={handleSort} />
                <Th col="ajuste_dia" label="Ajuste" sortCol={sortColumn} sortDesc={sortDesc} onSort={handleSort} />
                <Th col="saldo_acumulado" label="Saldo Acum." sortCol={sortColumn} sortDesc={sortDesc} onSort={handleSort} />
                <Th col="saldo_atualizado" label="Saldo Atual." sortCol={sortColumn} sortDesc={sortDesc} onSort={handleSort} />
                <Th col="divergencia" label="Divergência" sortCol={sortColumn} sortDesc={sortDesc} onSort={handleSort} />
                <Th col="divergencia_pct" label="Div. %" sortCol={sortColumn} sortDesc={sortDesc} onSort={handleSort} />
                <Th col="fator_rateio" label="Fator" sortCol={sortColumn} sortDesc={sortDesc} onSort={handleSort} />
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => {
                const div = num(r.divergencia)
                return (
                  <tr key={`${r.function_id}|${r.snapshot_date}`} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors">
                    <td className="px-3 py-2 text-xs text-gray-300 whitespace-nowrap">{fmtDate(r.snapshot_date)}</td>
                    <td className="px-3 py-2 text-xs text-gray-200">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: corDe(r.function_id) }} />
                        {r._nome}
                      </span>
                    </td>
                    {/* Azul = entrada, laranja = saída (a paleta do app não usa verde/vermelho). */}
                    <td className={`px-3 py-2 text-right text-xs ${num(r.entrada_dia) ? 'text-receita' : 'text-gray-700'}`}>
                      {num(r.entrada_dia) ? fmt(num(r.entrada_dia)) : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right text-xs ${num(r.saida_dia) ? 'text-despesa' : 'text-gray-700'}`}>
                      {num(r.saida_dia) ? fmt(num(r.saida_dia)) : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right text-xs ${num(r.ajuste_dia) ? 'text-reserva' : 'text-gray-700'}`}>
                      {num(r.ajuste_dia) ? fmt(num(r.ajuste_dia)) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-400">{fmt(num(r.saldo_acumulado))}</td>
                    <td className={`px-3 py-2 text-right text-xs font-semibold ${num(r.saldo_atualizado) < 0 ? 'text-despesa' : 'text-gray-100'}`}>
                      {fmt(num(r.saldo_atualizado))}
                    </td>
                    {/* Divergência ≠ 0 chama atenção nos dois sentidos: falta e sobra são igualmente
                        um lançamento que não entrou em nenhuma função. */}
                    <td className={`px-3 py-2 text-right text-xs ${div !== 0 ? 'text-orange-500' : 'text-gray-700'}`}>
                      {div !== 0 ? fmt(div) : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right text-xs ${div !== 0 ? 'text-orange-500' : 'text-gray-700'}`}>
                      {div !== 0 ? fmtPct(r.divergencia_pct) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-600 font-mono">
                      {r.fator_rateio === null || r.fator_rateio === undefined ? '—' : num(r.fator_rateio).toFixed(6)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {r._periodo && onVerPeriodo && (
                        <button
                          onClick={() => onVerPeriodo(r._periodo.fim)}
                          title={`Ver o período fechado ${fmtDate(r._periodo.inicio)} → ${fmtDate(r._periodo.fim)} no Histórico`}
                          className="text-gray-700 hover:text-gray-300 transition-colors p-1"
                        >
                          <ExternalLink size={11} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {!loading && sorted.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-sm text-gray-500">
              {ledger.length === 0 ? 'O razão diário ainda não tem registros.' : 'Nenhuma linha para os filtros escolhidos.'}
            </p>
            {ledger.length === 0 && (
              <p className="text-xs text-gray-600 mt-1">
                Ele é gravado uma vez por dia ao abrir o app e antes de cada virada de saldo.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
