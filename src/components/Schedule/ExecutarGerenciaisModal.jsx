import { useMemo, useRef, useState } from 'react'
import { X, CheckCircle } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'
import { prevMonthScheduleDate } from '../../lib/fatura'
import { useCamadaModal } from '../../context/atalhosHooks'
import { faturaNoCicloAtual } from '../../lib/cicloFatura'

// "Executar Gerenciais" (Agendamentos e Resumo da Importação): provisões das parcelas do Grupo G
// ainda sem transferência gerencial. A execução é sempre do usuário (Confirmar) e usa o
// executarProvisoesGerenciais de sempre. `preSelecionados` / `filtroInicial` (Resumo da
// Importação → Resolver): abre já no cartão/fatura e com SÓ essas parcelas marcadas.
const MONTHS_PT_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
function faturaLabel(ym) {
  if (!ym) return '—'
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS_PT_FULL[m - 1]}/${y}`
}

// Data real da transferência gerencial de cada parcela (espelha executarProvisoesGerenciais):
//  • parcela 1 (ou sem padrão X/N): data original do gasto
//  • parcelas 2..N: dia financeiro do mês ANTERIOR ao da fatura (prevMonthScheduleDate)
function dataLancamentoProvisao(p, financialMonthStartDay) {
  // Número da parcela: coluna installment_num quando disponível; cai para o "X/N" da descrição
  // (parcelas legadas com sufixo "(i/N)" e sem installment_num gravado).
  let instNum = Number(p.installmentNum) || null
  if (!instNum) {
    const matches = [...(p.description || '').matchAll(/(\d{1,2})\s*\/\s*\d{1,2}/g)]
    instNum = matches.length ? Number(matches[matches.length - 1][1]) : 1
  }
  if (instNum >= 2 && p.faturaMonthYear) {
    const [fy, fm] = p.faturaMonthYear.split('-')
    return prevMonthScheduleDate(`${fm}/${fy}`, financialMonthStartDay)
  }
  return p.date
}

export default function ExecutarGerenciaisModal({ provisoes, faturasInfo = [], accounts, financialMonthStartDay = 1, financialMonthMode = 'custom', onConfirm, onClose, preSelecionados = null, filtroInicial = null }) {
  // Pré-seleção inicial: apenas provisões da fatura do ciclo atual. Passadas/futuras iniciam
  // desmarcadas (o usuário pode marcar manualmente). Filtros de fatura/cartão são independentes.
  // Com `preSelecionados` (Resumo da Importação → Resolver): só essas parcelas marcadas.
  const [selected, setSelected] = useState(
    () => new Set(preSelecionados
      ? provisoes.filter(p => preSelecionados.includes(p.id)).map(p => p.id)
      : provisoes.filter(p => faturaNoCicloAtual(p, accounts, financialMonthStartDay, financialMonthMode)).map(p => p.id))
  )
  const [faturaFiltro, setFaturaFiltro] = useState(filtroInicial?.fatura || '')
  const [cartaoFiltro, setCartaoFiltro] = useState(filtroInicial?.cartao || '')
  // Seletor de Fatura: por padrão esconde faturas já totalmente executadas (todas as parcelas G já
  // têm tx_gerA_). Marcado → mostra todas. Não afeta a lista, só as opções do dropdown.
  const [mostrarExecutadas, setMostrarExecutadas] = useState(false)
  const toggle = (id) => setSelected(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const accName = (id) => { const a = accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : '—' }

  // Opções do seletor de Fatura. Padrão (mostrarExecutadas=false): só faturas PENDENTES (≥1 parcela
  // Grupo G sem tx_gerA_). Marcado: inclui as já executadas. `faturasInfo` traz TODAS as faturas
  // parceladas do Grupo G com a flag `pendente`; fallback p/ as faturas das provisões (compat).
  const faturaOptions = useMemo(() => {
    const base = faturasInfo.length
      ? faturasInfo.filter(f => mostrarExecutadas || f.pendente).map(f => f.ym)
      : provisoes.map(p => p.faturaMonthYear).filter(Boolean)
    return [...new Set(base)].sort() // YYYY-MM ordena cronologicamente
  }, [faturasInfo, provisoes, mostrarExecutadas])
  const cartaoOptions = useMemo(() => {
    const ids = [...new Set(provisoes.map(p => p.cardId).filter(Boolean))]
    return ids
      .map(id => ({ id, name: accName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [provisoes]) // eslint-disable-line react-hooks/exhaustive-deps

  const matchFiltros = (p, fat, cart) =>
    (!fat || p.faturaMonthYear === fat) && (!cart || p.cardId === cart)

  // Lista visível conforme filtros (aplicados em tempo real).
  const visibleProvisoes = useMemo(
    () => provisoes.filter(p => matchFiltros(p, faturaFiltro, cartaoFiltro)),
    [provisoes, faturaFiltro, cartaoFiltro]
  )

  // Ao mudar um filtro, manter checados apenas os que continuam visíveis (nunca re-seleciona).
  // Prune feito no próprio handler (ação do usuário) com os filtros já atualizados.
  const pruneSelected = (fat, cart) => {
    const visibleIds = new Set(provisoes.filter(p => matchFiltros(p, fat, cart)).map(p => p.id))
    setSelected(prev => new Set([...prev].filter(id => visibleIds.has(id))))
  }
  const handleFaturaFiltro = (val) => { setFaturaFiltro(val); pruneSelected(val, cartaoFiltro) }
  const handleCartaoFiltro = (val) => { setCartaoFiltro(val); pruneSelected(faturaFiltro, val) }
  // Ao DESmarcar "mostrar já executadas", se a fatura selecionada era executada (não é mais opção),
  // volta para "Todas as faturas" — evita um filtro apontando p/ uma fatura oculta.
  const handleMostrarExecutadas = (checked) => {
    setMostrarExecutadas(checked)
    if (!checked && faturaFiltro && !faturasInfo.some(f => f.ym === faturaFiltro && f.pendente)) {
      handleFaturaFiltro('')
    }
  }

  // Contador, total e confirmação consideram só itens visíveis E marcados.
  const selectedVisible = visibleProvisoes.filter(p => selected.has(p.id))
  const selCount = selectedVisible.length
  const total = selectedVisible.reduce((s, p) => s + p.amount, 0)

  // Overlay próprio (não usa o Modal): vira camada para os atalhos da tela não dispararem por trás.
  const painelRef = useRef(null)
  useCamadaModal(true, painelRef)
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div ref={painelRef} data-modal-painel="" role="dialog" aria-modal="true" className="relative bg-surface border border-borda-forte rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-borda shrink-0">
          <div>
            <h3 className="font-semibold text-texto-1">Executar Provisões Gerenciais</h3>
            <p className="text-xs text-texto-3 mt-0.5">Transferência imediata Conta Principal → Ger. para cada parcela marcada</p>
          </div>
          <button onClick={onClose} className="p-1 text-texto-3 hover:text-texto-2 rounded transition-colors"><X size={16} /></button>
        </div>

        {/* Filtros (fatura + cartão) — aplicados em tempo real na lista */}
        <div className="px-5 py-3 border-b border-borda shrink-0 space-y-2.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-texto-3 mb-1">Fatura</label>
              <select
                className="input text-sm py-1.5"
                value={faturaFiltro}
                onChange={e => handleFaturaFiltro(e.target.value)}
              >
                <option value="">Todas as faturas</option>
                {faturaOptions.map(ym => (
                  <option key={ym} value={ym}>{faturaLabel(ym)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-texto-3 mb-1">Cartão</label>
              <select
                className="input text-sm py-1.5"
                value={cartaoFiltro}
                onChange={e => handleCartaoFiltro(e.target.value)}
              >
                <option value="">Todos os cartões</option>
                {cartaoOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mostrarExecutadas}
              onChange={e => handleMostrarExecutadas(e.target.checked)}
              className="w-4 h-4 rounded accent-primary cursor-pointer shrink-0"
            />
            <span className="text-xs text-texto-2">Mostrar já executadas</span>
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {visibleProvisoes.length === 0 ? (
            <p className="text-center text-xs text-texto-3 py-8">Nenhuma provisão para os filtros selecionados</p>
          ) : visibleProvisoes.map(p => (
            <label key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-borda hover:bg-surface-hover/30 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggle(p.id)}
                className="w-4 h-4 rounded accent-primary cursor-pointer shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-texto-1 truncate">{p.description}</p>
                <p className="text-xs text-texto-3 mt-0.5 truncate">
                  Fatura {faturaLabel(p.faturaMonthYear)} · {accName(p.contaOrigemId)} → {accName(p.contaDestinoId)}
                </p>
                <p className="text-xs text-texto-3 mt-0.5">
                  Data do lançamento: {fmtDate(dataLancamentoProvisao(p, financialMonthStartDay))}
                </p>
              </div>
              <span className="text-xs font-bold text-despesa shrink-0">{fmt(p.amount)}</span>
            </label>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-borda flex items-center justify-between shrink-0">
          <span className="text-sm text-texto-2">{selCount} selecionada{selCount !== 1 ? 's' : ''}</span>
          <span className="text-base font-bold text-texto-1">{fmt(total)}</span>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-borda shrink-0">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={selCount === 0}
            onClick={() => onConfirm(selectedVisible.map(p => p.id))}
          >
            <CheckCircle size={14} /> Confirmar ({selCount})
          </button>
        </div>
      </div>
    </div>
  )
}
