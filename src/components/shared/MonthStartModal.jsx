import { useState, useMemo, useEffect, useRef } from 'react'
import { X, CheckCircle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { executarTransferenciasInicioMes } from '../../lib/autoRegistro'
import { occEfetiva, proximaEfetiva } from '../../lib/fluxoCaixa'
import { candidatasInicioMes, idsJaExecutadas } from '../../lib/inicioMes'
import { fetchTransferenciasExecutadas } from '../../lib/db'
import { fmt, fmtDate } from './utils'

const SESSION_KEY = 'monthStartModalDismissed'

// Lançamentos do Neon das candidatas no mês delas (todas no mês corrente). Lança se a API falhar.
async function executadasNoBanco(candidatas) {
  if (candidatas.length === 0) return new Set()
  const mes = candidatas[0].mes
  const rows = await fetchTransferenciasExecutadas(candidatas.map(c => c.schedule.id), `${mes}-01`, `${mes}-31`)
  return idsJaExecutadas(candidatas, rows)
}

// Pendentes de verdade: candidatas sem lançamento nem em memória nem no banco.
async function revalidar(candidatas, transactions) {
  const noBanco = await executadasNoBanco(candidatas)
  const emMemoria = idsJaExecutadas(candidatas, transactions)
  return candidatas.filter(c => !noBanco.has(c.schedule.id) && !emMemoria.has(c.schedule.id))
}

export default function MonthStartModal() {
  const {
    schedules, accounts, transactions, settings, dbStatus,
    getNextOccurrences, registerScheduleOccurrence, pode,
  } = useApp()

  const [dismissed, setDismissed] = useState(() => !!sessionStorage.getItem(SESSION_KEY))
  const [selected, setSelected] = useState(null)
  // Ids fixados pela verificação inicial (null = ainda não verificou). O modal só mostra estes —
  // o que virar pendente depois, na mesma sessão, fica para a próxima abertura do app.
  const [idsVerificados, setIdsVerificados] = useState(null)
  const [executando, setExecutando] = useState(false)
  const [erro, setErro] = useState(null)
  const verificacaoRef = useRef(false)

  const today        = new Date()
  const financialStartDay = settings?.financialMonthStartDay || 1
  const isAfterStart = today.getDate() >= financialStartDay
  const podeIncluir  = pode('lancamentos', 'incluir')

  const candidatas = useMemo(
    () => candidatasInicioMes({ schedules, accounts, getNextOccurrences, hoje: new Date(), financialStartDay }),
    [schedules, accounts, getNextOccurrences, financialStartDay],
  )
  // Leitura do estado mais recente dentro das chamadas assíncronas (verificação/execução).
  const latestRef = useRef({ candidatas, transactions })
  useEffect(() => { latestRef.current = { candidatas, transactions } }, [candidatas, transactions])

  // Verificação ÚNICA por sessão, só depois do load do Neon (dbStatus 'connected'): antes disso
  // schedules/transactions ainda são o cache do localStorage — no celular, aberto dias depois,
  // o cache não sabe das transferências já executadas em outro aparelho e o modal as listava.
  // O setTimeout(0) espera o auto-registro (efeito do AppContext no mesmo 'connected'); depois a
  // API confirma no banco o que já tem lançamento. Falha da API → não mostra (sem confirmar no
  // banco, executar poderia duplicar).
  useEffect(() => {
    if (dismissed || verificacaoRef.current || dbStatus !== 'connected' || !podeIncluir) return
    verificacaoRef.current = true
    const encerrar = () => {
      try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* sessão sem storage */ }
      setDismissed(true)
    }
    setTimeout(async () => {
      const { candidatas: lista, transactions: txs } = latestRef.current
      if (lista.length === 0) return encerrar()
      try {
        const pendentes = await revalidar(lista, txs)
        if (pendentes.length === 0) return encerrar()
        setIdsVerificados(new Set(pendentes.map(c => c.schedule.id)))
      } catch (err) {
        console.warn('[início do mês] não foi possível conferir no banco; modal não exibido', err.message)
        encerrar()
      }
    }, 0)
  }, [dbStatus, dismissed, podeIncluir])

  // Lista exibida: as verificadas que AINDA estão pendentes (executadas por outro caminho saem).
  const pendingSchedules = useMemo(() => {
    if (!idsVerificados) return []
    const executadas = idsJaExecutadas(candidatas, transactions)
    return candidatas
      .filter(c => idsVerificados.has(c.schedule.id) && !executadas.has(c.schedule.id))
      .map(c => c.schedule)
  }, [candidatas, transactions, idsVerificados])

  // Executar as transferências grava lançamentos: sem permissão, o modal nem abre.
  if (dismissed || !isAfterStart || pendingSchedules.length === 0 || !podeIncluir) return null

  const selectedSet = selected ?? new Set(pendingSchedules.map(s => s.id))

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setDismissed(true)
  }

  // Antes de gravar, confere de novo no banco e pula as que já têm lançamento (outro aparelho
  // pode ter executado desde a abertura do modal). Sem confirmar no banco, não executa nada.
  const executeSchedules = async (list) => {
    if (executando) return
    setExecutando(true)
    setErro(null)
    try {
      const ids = new Set(list.map(s => s.id))
      const pendentes = await revalidar(latestRef.current.candidatas.filter(c => ids.has(c.schedule.id)), latestRef.current.transactions)
      const puladas = list.length - pendentes.length
      if (puladas > 0) console.info(`[início do mês] ${puladas} transferência(s) já executada(s) — pulada(s)`)
      executarTransferenciasInicioMes(pendentes.map(c => c.schedule), { getNextOccurrences, registerScheduleOccurrence })
      handleDismiss()
    } catch (err) {
      console.error('[início do mês] revalidação falhou', err.message)
      setErro('Não foi possível conferir no banco se estas transferências já foram executadas. Nada foi gravado — tente de novo.')
    } finally {
      setExecutando(false)
    }
  }

  const handleExecuteAll      = () => executeSchedules(pendingSchedules)
  const handleExecuteSelected = () => executeSchedules(pendingSchedules.filter(s => selectedSet.has(s.id)))

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev ?? pendingSchedules.map(s => s.id))
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const monthLabel  = today.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
  const selectedTotal = pendingSchedules
    .filter(s => selectedSet.has(s.id))
    .reduce((sum, s) => {
      const d = getNextOccurrences(s, 1)[0]
      return sum + (Number(d ? occEfetiva(s, d).amount : s.amount) || 0)
    }, 0)

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay" onClick={handleDismiss} />
      <div className="relative bg-surface border border-borda-forte rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-borda shrink-0">
          <div>
            <h3 className="font-semibold text-texto-1">Transferências do início do mês</h3>
            <p className="text-xs text-texto-3 mt-0.5 capitalize">{monthLabel}</p>
          </div>
          <button onClick={handleDismiss} className="p-1 text-texto-3 hover:text-texto-2 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {pendingSchedules.map(sch => {
            const fromAcc  = accounts.find(a => a.id === sch.accountId)
            const toAcc    = accounts.find(a => a.id === sch.toAccountId)
            const prox = proximaEfetiva(sch, getNextOccurrences)
            const nextDate = prox?.date
            const isSelected = selectedSet.has(sch.id)
            return (
              <div
                key={sch.id}
                onClick={() => toggleSelect(sch.id)}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-primary/10 border-primary/20'
                    : 'bg-surface-2/40 border-borda-forte/50 opacity-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(sch.id)}
                  onClick={e => e.stopPropagation()}
                  className="w-4 h-4 rounded accent-primary shrink-0 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-texto-2 font-medium truncate">{sch.description}</p>
                  <p className="text-xs text-texto-3 mt-0.5">
                    {fromAcc?.apelido || fromAcc?.name || '?'}
                    {' → '}
                    {toAcc?.apelido || toAcc?.name || '?'}
                    {nextDate && <span className="ml-2 text-texto-3">· {fmtDate(nextDate)}</span>}
                  </p>
                </div>
                <span className="text-sm font-bold text-transferencia shrink-0">{fmt(prox ? prox.amount : sch.amount)}</span>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-borda space-y-3 shrink-0">
          {erro && <p className="text-xs text-despesa text-center">{erro}</p>}
          {selectedSet.size > 0 && selectedSet.size < pendingSchedules.length && (
            <p className="text-xs text-texto-3 text-center">
              {selectedSet.size} de {pendingSchedules.length} selecionadas · {fmt(selectedTotal)}
            </p>
          )}
          <div className="flex gap-2">
            <button className="btn-secondary shrink-0 px-4" onClick={handleDismiss}>
              Agora não
            </button>
            <button
              className="flex-1 py-2 px-3 text-sm font-medium bg-surface-hover text-texto-1 rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleExecuteSelected}
              disabled={selectedSet.size === 0 || executando}
            >
              Executar selecionadas
            </button>
            <button
              className="btn-primary flex-1 text-sm flex items-center justify-center gap-2"
              onClick={handleExecuteAll}
              disabled={executando}
            >
              <CheckCircle size={14} /> Executar todas
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
