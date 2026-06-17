import { useMemo, useState, useRef, useEffect } from 'react'
import { format, addDays } from 'date-fns'
import { Wallet, ArrowDownCircle, ArrowUpCircle, Calendar, ChevronDown, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate, accountsForView, groupedAccountOptions } from '../shared/utils'
import { computeFluxoCaixa } from '../../lib/fluxoCaixa'
import { useIsMobile } from '../../hooks/useIsMobile'
import DateInput from '../shared/DateInput'

const round2 = n => Math.round(n * 100) / 100
const todayStr = () => format(new Date(), 'yyyy-MM-dd')

// Salva uma matriz (array de arrays) como .xlsx — mesmo padrão usado em Reservas → Fluxo Futuro.
function exportSheet(rows, filename) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Fluxo de Caixa')
  XLSX.writeFile(wb, filename)
}

// Token de visão para o nome do arquivo.
const VISAO_FILE = { conta: 'PorConta', grupo: 'PorGrupo', principais: 'ContasPrincipais' }

const VISOES = [
  { id: 'conta',      label: 'Por Conta' },
  { id: 'grupo',      label: 'Por Grupo' },
  { id: 'principais', label: 'Contas Principais' },
]

// Persistência da última seleção do relatório (aba, contas, grupo, datas) entre navegações
// e reloads. Só leitura/escrita de UI — não afeta dados nem cálculo.
const SELECAO_STORAGE_KEY = 'finup_relatorio_fluxo_selecao'
function loadSelecaoSalva() {
  try {
    const raw = localStorage.getItem(SELECAO_STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    return o && typeof o === 'object' ? o : null
  } catch { return null }
}

export default function FluxoCaixaPorConta() {
  const { profileAccounts: accounts, profileTransactions: transactions, profileSchedules: schedules, accountGroups, envelopes, categories, reserveFunctions, getNextOccurrences } = useApp()

  // Última seleção salva (lida uma vez na montagem); cai no padrão atual quando ausente.
  const [selecaoSalva] = useState(loadSelecaoSalva)
  const [visao, setVisao] = useState(() =>
    VISOES.some(v => v.id === selecaoSalva?.visao) ? selecaoSalva.visao : 'conta')
  // Visão "Por Conta" permite selecionar múltiplas contas (fluxo combinado).
  const [selectedAccountIds, setSelectedAccountIds] = useState(() =>
    Array.isArray(selecaoSalva?.selectedAccountIds)
      ? selecaoSalva.selectedAccountIds
      : (accounts[0]?.id ? [accounts[0].id] : []))
  const [contaDropOpen, setContaDropOpen] = useState(false)
  const [groupId, setGroupId] = useState(() => selecaoSalva?.groupId || '')
  const [start, setStart] = useState(() => selecaoSalva?.start || todayStr())
  const [end, setEnd] = useState(() => selecaoSalva?.end || format(addDays(new Date(), 30), 'yyyy-MM-dd'))
  const [includeSchedules, setIncludeSchedules] = useState(true)
  const [hideReserva, setHideReserva] = useState(false)
  const [hidePatrimonio, setHidePatrimonio] = useState(false)

  // Salva a seleção sempre que aba/contas/grupo/datas mudarem (inclui a montagem, gravando
  // o estado restaurado ou o padrão). Falhas de localStorage são ignoradas silenciosamente.
  useEffect(() => {
    try {
      localStorage.setItem(SELECAO_STORAGE_KEY, JSON.stringify({ visao, selectedAccountIds, groupId, start, end }))
    } catch { /* storage indisponível — ignora */ }
  }, [visao, selectedAccountIds, groupId, start, end])

  const accById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])
  const isMobile = useIsMobile()
  const reservaSet = useMemo(() => new Set(accounts.filter(a => a.isReserva).map(a => a.id)), [accounts])
  const patrimonioSet = useMemo(() => new Set(accounts.filter(a => a.vinculoTipo === 'patrimonio').map(a => a.id)), [accounts])
  const accName = (id) => { const a = accById.get(id); return a ? (a.apelido || a.name) : '—' }
  const catById = useMemo(() => new Map((categories || []).map(c => [c.id, c])), [categories])
  const catName = (id) => { const c = catById.get(id); return c ? c.name : '' }
  const funcById = useMemo(() => new Map((reserveFunctions || []).map(f => [f.id, f])), [reserveFunctions])
  const funcName = (id) => { const f = funcById.get(id); return f ? f.name : '' }

  const groups = useMemo(
    () => [...accountGroups].filter(g => !g.inibido).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [accountGroups],
  )

  const selectedAccounts = useMemo(() => {
    if (visao === 'conta')      return accounts.filter(a => selectedAccountIds.includes(a.id))
    if (visao === 'grupo')      return accounts.filter(a => a.accountGroupId === groupId)
    // 'principais': contas do Fluxo de Caixa Principal (badge FC), não-cartão — mesmo
    // conjunto usado no Saldo Principal do Dashboard / Posição Financeira.
    return accounts.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit')
  }, [visao, selectedAccountIds, groupId, accounts])

  const accountIds = useMemo(() => new Set(selectedAccounts.map(a => a.id)), [selectedAccounts])
  const currentBalance = useMemo(() => selectedAccounts.reduce((s, a) => s + (a.balance || 0), 0), [selectedAccounts])

  // Fonte ÚNICA do cálculo (compartilhada com os KPIs FINAL CICLO/PROJETADO do Painel Geral).
  const { rows, saldoAnterior } = useMemo(() => {
    const r = computeFluxoCaixa({
      accountIds, currentBalance, start, end,
      transactions, schedules, envelopes, reserveFunctions,
      getNextOccurrences, includeSchedules,
      hideReserva, hidePatrimonio, reservaSet, patrimonioSet,
    })
    return { rows: r.rows, saldoAnterior: r.saldoAnterior }
  }, [transactions, schedules, accountIds, start, end, includeSchedules, currentBalance, getNextOccurrences, hideReserva, reservaSet, hidePatrimonio, patrimonioSet, envelopes, reserveFunctions])

  const totalEntrada = round2(rows.reduce((s, r) => s + r.entrada, 0))
  const totalSaida = round2(rows.reduce((s, r) => s + r.saida, 0))
  const saldoFinal = rows.length ? rows[rows.length - 1].saldo : saldoAnterior
  // Dia imediatamente anterior à data inicial (rótulo do saldo base).
  const prevDayStr = start ? format(addDays(new Date(start + 'T00:00:00'), -1), 'yyyy-MM-dd') : ''

  const movimentacao = (r) => {
    if (r.type === 'transfer') return `${accName(r.fromAccountId)} → ${accName(r.toAccountId)}`
    if (r.entrada > 0) return `→ ${accName(r.fromAccountId)}`   // entrada na conta
    return `${accName(r.fromAccountId)} →`                       // saída da conta
  }

  const statusBadge = (status) => {
    if (status === 'Registrada') return 'bg-gray-600/30 text-gray-300'
    if (status === 'A receber')  return 'bg-receita/20 text-receita'
    if (status === 'Projetado')  return 'bg-indigo-500/20 text-indigo-400'
    return 'bg-despesa/20 text-despesa' // A pagar
  }

  // Conta De / Conta Para na perspectiva do conjunto selecionado (mesma semântica da coluna
  // "Movimentação" da tabela): transferência → De/Para reais; entrada → vem de externo,
  // entra na conta; saída → sai da conta, vai para externo.
  const contaDe = (r) => {
    if (r.type === 'transfer') return accName(r.fromAccountId)
    return r.entrada > 0 ? '' : accName(r.fromAccountId)
  }
  const contaPara = (r) => {
    if (r.type === 'transfer') return accName(r.toAccountId)
    return r.entrada > 0 ? accName(r.fromAccountId) : ''
  }
  // Coluna "Conta Reserva": prioriza a FUNÇÃO de reserva vinculada (ex.: "Salão GI"),
  // depois o nome da conta de reserva envolvida (origem/destino, ex.: "CA"), senão vazio.
  const contaReserva = (r) => {
    if (r.reservaFuncaoId) {
      const nome = funcName(r.reservaFuncaoId)
      if (nome) return nome
    }
    if (reservaSet.has(r.fromAccountId)) return accName(r.fromAccountId)
    if (reservaSet.has(r.toAccountId)) return accName(r.toAccountId)
    return ''
  }

  // Exporta EXATAMENTE as linhas visíveis na tabela (já refletem filtros de data, toggles de
  // ocultar reserva/patrimônio e a visão selecionada). Inclui a linha de Saldo anterior e o Total.
  const handleExport = () => {
    const header = ['Data', 'Descrição', 'Conta De', 'Conta Para', 'Categoria', 'Conta Reserva', 'Entrada (R$)', 'Saída (R$)', 'Saldo (R$)', 'Status']
    const aoa = [header]
    aoa.push([prevDayStr ? fmtDate(prevDayStr) : '', 'Saldo anterior', '', '', '', '', '', '', round2(saldoAnterior), ''])
    rows.forEach(r => {
      aoa.push([
        fmtDate(r.date),
        r.description,
        contaDe(r),
        contaPara(r),
        catName(r.categoryId),
        contaReserva(r),
        r.entrada > 0 ? round2(r.entrada) : '',
        r.saida > 0 ? round2(r.saida) : '',
        round2(r.saldo),
        r.status,
      ])
    })
    aoa.push(['', 'Total', '', '', '', '', round2(totalEntrada), round2(totalSaida), round2(saldoFinal), ''])
    exportSheet(aoa, `FluxoCaixa_${VISAO_FILE[visao] || visao}_${start}_${end}.xlsx`)
  }

  const noSelection = accountIds.size === 0

  // Multi-select de contas (visão "Por Conta")
  const contaDropRef = useRef(null)
  useEffect(() => {
    if (!contaDropOpen) return
    const onDoc = (e) => { if (contaDropRef.current && !contaDropRef.current.contains(e.target)) setContaDropOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [contaDropOpen])
  const pickableAccounts = accountsForView(accounts, isMobile)
  // Agrupadas e ordenadas pela ordem dos Grupos de Contas (Config.) e, dentro de cada grupo,
  // pela ordem das contas — mesma sequência exibida em Configurações → Grupos de Contas.
  const pickableGroups = useMemo(
    () => groupedAccountOptions(pickableAccounts, accountGroups),
    [pickableAccounts, accountGroups],
  )
  const toggleAccount = (id) => setSelectedAccountIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  const contaLabel = selectedAccountIds.length === 0
    ? 'Selecione...'
    : selectedAccountIds.length === 1
      ? accName(selectedAccountIds[0])
      : `${selectedAccountIds.length} contas selecionadas`

  return (
    <div className="space-y-4">
      {/* Filtros — fixos no topo ao rolar apenas no desktop (md+) */}
      <div className="card space-y-3 md:sticky md:top-0 md:z-20">
        {/* Visão (toggle) */}
        <div className="flex gap-1 bg-gray-800/60 rounded-lg p-1 w-full sm:w-auto">
          {VISOES.map(v => (
            <button
              key={v.id}
              onClick={() => setVisao(v.id)}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                visao === v.id ? 'bg-[#0F6E56] text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {visao === 'conta' && (
            <div className="lg:col-span-2 relative" ref={contaDropRef}>
              <label className="label">Contas</label>
              <button
                type="button"
                onClick={() => setContaDropOpen(o => !o)}
                className={`input flex items-center justify-between gap-2 text-left w-full ${selectedAccountIds.length === 0 ? 'text-gray-500' : ''}`}
              >
                <span className="truncate min-w-0">{contaLabel}</span>
                <ChevronDown size={14} className={`text-gray-500 shrink-0 transition-transform ${contaDropOpen ? 'rotate-180' : ''}`} />
              </button>
              {contaDropOpen && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-surface border border-gray-700 rounded-lg shadow-2xl max-h-60 overflow-y-auto overscroll-contain">
                  <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-800 sticky top-0 bg-surface">
                    <button type="button" onClick={() => setSelectedAccountIds(pickableAccounts.map(a => a.id))} className="text-xs text-[#0F6E56] hover:underline">Todas</button>
                    <span className="text-gray-700">·</span>
                    <button type="button" onClick={() => setSelectedAccountIds([])} className="text-xs text-gray-500 hover:text-gray-300">Nenhuma</button>
                  </div>
                  {pickableGroups.map(({ group, accounts: groupAccs }) => (
                    <div key={group?.id || 'sem-grupo'}>
                      <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide font-semibold text-gray-500 border-t border-gray-800/60 first:border-t-0">
                        {group?.name || 'Sem grupo'}
                      </p>
                      {groupAccs.map(a => (
                        <label key={a.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-800 cursor-pointer">
                          <input
                            type="checkbox"
                            className="accent-[#0F6E56] w-3.5 h-3.5 shrink-0"
                            checked={selectedAccountIds.includes(a.id)}
                            onChange={() => toggleAccount(a.id)}
                          />
                          <span className="text-sm text-gray-300 truncate">{a.apelido || a.name}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                  {pickableAccounts.length === 0 && (
                    <p className="text-xs text-gray-600 px-3 py-3 text-center">Nenhuma conta</p>
                  )}
                </div>
              )}
            </div>
          )}
          {visao === 'grupo' && (
            <div className="lg:col-span-2">
              <label className="label">Grupo de Contas</label>
              <select className="input" value={groupId} onChange={e => setGroupId(e.target.value)}>
                <option value="">Selecione...</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          {visao === 'principais' && (
            <div className="lg:col-span-2 flex items-end">
              <p className="text-xs text-gray-500">
                Soma automática das contas do Fluxo de Caixa Principal (FC):{' '}
                <span className="text-gray-300">{selectedAccounts.length} conta{selectedAccounts.length !== 1 ? 's' : ''}</span>
              </p>
            </div>
          )}
          <div>
            <label className="label">Data inicial</label>
            <DateInput className="input" value={start} onChange={e => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label">Data final</label>
            <DateInput className="input" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-5 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative shrink-0">
                <input type="checkbox" checked={includeSchedules} onChange={e => setIncludeSchedules(e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-[#0F6E56] transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-sm text-gray-300 select-none">Incluir agendamentos (transações futuras)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative shrink-0">
                <input type="checkbox" checked={hideReserva} onChange={e => setHideReserva(e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-[#0F6E56] transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-sm text-gray-300 select-none">Ocultar movimentos de reserva</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="relative shrink-0">
                <input type="checkbox" checked={hidePatrimonio} onChange={e => setHidePatrimonio(e.target.checked)} className="sr-only peer" />
                <div className="w-9 h-5 bg-gray-700 rounded-full peer-checked:bg-[#0F6E56] transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
              </div>
              <span className="text-sm text-gray-300 select-none">Ocultar movimentos de patrimônio</span>
            </label>
          </div>
          {!noSelection && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <Wallet size={13} /> Saldo anterior: <span className="font-semibold text-gray-200">{fmt(saldoAnterior)}</span>
            </span>
          )}
        </div>
      </div>

      {/* KPIs */}
      {!noSelection && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card">
            <div className="flex items-center gap-2 mb-1 text-blue-600"><ArrowDownCircle size={14} /><p className="text-xs text-gray-400 uppercase tracking-wide">Entradas</p></div>
            <p className="text-xl font-bold text-blue-600">{fmt(totalEntrada)}</p>
          </div>
          <div className="card">
            <div className="flex items-center gap-2 mb-1 text-orange-600"><ArrowUpCircle size={14} /><p className="text-xs text-gray-400 uppercase tracking-wide">Saídas</p></div>
            <p className="text-xl font-bold text-orange-600">{fmt(totalSaida)}</p>
          </div>
          <div className="card">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Saldo Projetado</p>
            <p className={`text-xl font-bold mt-1 ${saldoFinal >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(saldoFinal)}</p>
          </div>
        </div>
      )}

      {!noSelection && (
        <p className="text-xs text-gray-600 leading-relaxed">
          O <span className="text-gray-400">saldo</span> parte do <span className="text-gray-400">saldo anterior</span> (dia imediatamente anterior à data inicial)
          e acumula todos os movimentos do período — tanto os já <span className="text-gray-400">Registrados</span> quanto os projetados (agendamentos/envelopes).
        </p>
      )}

      {/* Tabela */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3">
          <Calendar size={14} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-300">Movimentações</h2>
          <span className="text-xs text-gray-500 ml-auto">{rows.length} linha{rows.length !== 1 ? 's' : ''}</span>
          {!noSelection && rows.length > 0 && (
            <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5 text-xs py-1">
              <FileSpreadsheet size={12} /> <span className="hidden sm:inline">Exportar Excel</span><span className="sm:hidden">Excel</span>
            </button>
          )}
        </div>

        {noSelection ? (
          <div className="text-center py-10 text-gray-500 text-sm">
            {visao === 'principais' ? 'Nenhuma conta marcada como Fluxo de Caixa Principal (FC).' : 'Selecione uma conta/grupo para ver o fluxo.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 820 }}>
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium w-24">Data</th>
                  <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Descrição</th>
                  <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Movimentação</th>
                  <th className="text-right px-3 py-2.5 text-xs text-orange-600 font-medium w-28">Pagamento</th>
                  <th className="text-right px-3 py-2.5 text-xs text-blue-600 font-medium w-28">Depósito</th>
                  <th className="text-right px-3 py-2.5 text-xs text-gray-400 font-medium w-28">Saldo</th>
                  <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {/* Saldo anterior (dia imediatamente anterior à data inicial) */}
                <tr className="border-b border-gray-800/50 bg-gray-800/20">
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{prevDayStr ? fmtDate(prevDayStr) : '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-400 italic" colSpan={4}>Saldo anterior</td>
                  <td className={`px-3 py-2 text-right text-xs font-bold ${saldoAnterior >= 0 ? 'text-gray-200' : 'text-orange-600'}`}>{fmt(saldoAnterior)}</td>
                  <td className="px-3 py-2" />
                </tr>
                {rows.map(r => (
                  <tr key={r._key} className={`border-b border-gray-800/40 ${r.real ? 'hover:bg-gray-800/20' : 'bg-indigo-500/5 hover:bg-indigo-500/10'}`}>
                    <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-200 max-w-xs truncate" title={r.description}>{r.description}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{movimentacao(r)}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-semibold text-orange-600 whitespace-nowrap">{r.saida > 0 ? fmt(r.saida) : ''}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-semibold text-blue-600 whitespace-nowrap">{r.entrada > 0 ? fmt(r.entrada) : ''}</td>
                    <td className={`px-3 py-2.5 text-right text-xs font-bold whitespace-nowrap ${r.saldo >= 0 ? 'text-gray-300' : 'text-orange-600'}`}>{fmt(r.saldo)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${statusBadge(r.status)}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-500 text-sm">Nenhuma movimentação no período.</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-700 bg-gray-800/20">
                    <td colSpan={3} className="px-3 py-2.5 text-xs font-semibold text-gray-400">Total</td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-orange-600">{fmt(totalSaida)}</td>
                    <td className="px-3 py-2.5 text-right text-xs font-bold text-blue-600">{fmt(totalEntrada)}</td>
                    <td className={`px-3 py-2.5 text-right text-xs font-bold ${saldoFinal >= 0 ? 'text-gray-200' : 'text-orange-600'}`}>{fmt(saldoFinal)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
