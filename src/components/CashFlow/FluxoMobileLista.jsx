import { useState } from 'react'
import { ChevronDown, ChevronRight, CalendarClock, RotateCcw, CheckCircle2, Pencil, Trash2, CircleCheck, CircleDashed } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'
import { agruparPorDia } from '../../lib/fluxoMobile'
import { STATUS_CONFIRMACAO } from '../../lib/fluxoStatus'
import TipoDocumentoBadge from '../shared/TipoDocumentoBadge'
import BottomSheet from '../shared/BottomSheet'

// Bottom sheet dos filtros/consultas do Fluxo no celular (componente compartilhado).
export const FluxoSheet = BottomSheet

const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

// Valor da linha: entrada (+, azul) ou saída (−, laranja) — as mesmas cores das colunas do desktop.
function valor(r, apagado) {
  if (r.entrada > 0) return <span className={`text-sm font-semibold whitespace-nowrap ${apagado ? 'text-gray-500' : 'text-blue-500'}`}>+{fmt(r.entrada)}</span>
  if (r.saida > 0) return <span className={`text-sm font-semibold whitespace-nowrap ${apagado ? 'text-gray-500' : 'text-orange-600'}`}>−{fmt(r.saida)}</span>
  return <span className="text-sm text-gray-500">—</span>
}

// Status da linha no celular: só o ícone (Confirmado = check azul, A confirmar = círculo tracejado âmbar).
function iconeStatus(status) {
  if (!status) return null
  const ok = status === STATUS_CONFIRMACAO.CONFIRMADO
  const rotulo = ok ? 'Confirmado' : 'A confirmar'
  const Icone = ok ? CircleCheck : CircleDashed
  return (
    <span role="img" aria-label={rotulo} title={rotulo} className={`inline-flex align-middle ${ok ? 'text-blue-400' : 'text-amber-400'}`}>
      <Icone size={13} aria-hidden="true" />
    </span>
  )
}

// Lista do Fluxo no celular: agrupada por dia, cada item com [doc] [status] descrição, "categoria · conta"
// e valor. O resto (tipo, saldo, incluir no cálculo, ações, doc/status por extenso) abre ao tocar no item.
// Recebe as linhas JÁ calculadas pelo painel — nenhum valor é recalculado aqui.
export default function FluxoMobileLista({
  rowsView, atraso, excluidas, atrasoAtivas, atrasoTotal, base, saldoInicial, minimoKey, horizonte,
  qtdContas, corSaldo, subtitulo, statusCelula, docBadge, tipoBadge, docDaLinha, statusDaLinha, marcadores,
  toggleLinha, toggleAtraso, onMudarData, onDesfazerData, onEfetivar, onEditarProvisorio, onExcluirProvisorio,
}) {
  const [aberta, setAberta] = useState(null)
  const [atrasoAberto, setAtrasoAberto] = useState(false)
  const alternar = (key) => setAberta(k => (k === key ? null : key))
  const grupos = agruparPorDia(rowsView)

  const detalhe = (r, ativa, emAtraso) => {
    const ehMinimo = r._key === minimoKey
    const st = statusDaLinha(r)
    const doc = docDaLinha(r)
    return (
      <div className="px-4 pb-3 pt-1 space-y-2 bg-gray-800/30">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500">Data</span>
          {r._dataOriginal
            ? <span className="text-amber-400 font-semibold">{fmtDate(r.date)} <span className="text-gray-500 font-normal">(era {ddmm(r._dataOriginal)})</span></span>
            : <span className="text-gray-300">{fmtDate(r.date)}</span>}
          {!emAtraso && tipoBadge(r)}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-gray-500">Status</span>{statusCelula(r)}
            {st && <span className="text-gray-300">{st.status === STATUS_CONFIRMACAO.CONFIRMADO ? 'Confirmado' : 'A confirmar'}</span>}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-gray-500">Documento</span>{docBadge(r)}
            {doc && <span className="text-gray-300">{doc.nome}</span>}
          </span>
          {!emAtraso && (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-gray-500">Saldo</span>
              <span className={`font-bold ${!ativa ? 'text-gray-600' : r.saldo >= 0 ? 'text-gray-100' : 'text-red-400'}`}>{ativa ? fmt(r.saldo) : '—'}</span>
              {ehMinimo && ativa && <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.saldo < 0 ? 'bg-red-500/15 text-red-300' : 'bg-blue-500/15 text-blue-300'}`}>mínimo</span>}
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 min-h-[44px] text-xs text-gray-300 cursor-pointer">
          <input type="checkbox" className="accent-[#0F6E56] w-4 h-4" checked={ativa} onChange={() => toggleLinha(r._key)} />
          Incluir no cálculo
        </label>
        {!emAtraso && (
          <div className="flex flex-wrap gap-2">
            {!r._provisorio && (
              <button type="button" onClick={() => onMudarData(r)} className="btn-secondary min-h-[44px] flex items-center gap-1.5 text-xs">
                <CalendarClock size={14} /> Mudar data
              </button>
            )}
            {r._dataOriginal && (
              <button type="button" onClick={() => onDesfazerData(r)} className="btn-secondary min-h-[44px] flex items-center gap-1.5 text-xs text-amber-400">
                <RotateCcw size={14} /> Desfazer data
              </button>
            )}
            {r._provisorio && (
              <>
                <button type="button" onClick={() => onEfetivar(r._provisorio)} className="btn-secondary min-h-[44px] flex items-center gap-1.5 text-xs border-emerald-500/40 text-emerald-300">
                  <CheckCircle2 size={14} /> Efetivar
                </button>
                <button type="button" onClick={() => onEditarProvisorio(r._provisorio)} className="btn-secondary min-h-[44px] flex items-center gap-1.5 text-xs">
                  <Pencil size={14} /> Editar
                </button>
                <button type="button" onClick={() => onExcluirProvisorio(r._provisorio)} className="btn-secondary min-h-[44px] flex items-center gap-1.5 text-xs text-red-400">
                  <Trash2 size={14} /> Excluir
                </button>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  const item = (r, ativa, emAtraso = false) => {
    const ehMinimo = r._key === minimoKey && ativa
    const fundo = ehMinimo ? (r.saldo < 0 ? 'bg-red-500/10' : 'bg-blue-500/10') : r._provisorio ? 'bg-purple-500/10' : ''
    const expandida = aberta === r._key
    const mk = marcadores(r)
    return (
      <li key={r._key} className={`border-b border-gray-800/40 ${fundo}`}>
        <button
          type="button"
          onClick={() => alternar(r._key)}
          aria-expanded={expandida}
          className={`w-full min-h-[52px] px-4 py-2 flex items-center gap-3 text-left ${ativa ? '' : 'opacity-50'}`}
        >
          <div className="min-w-0 flex-1">
            <p className={`text-sm truncate ${ativa ? 'text-gray-200' : 'text-gray-500 line-through'}`}>
              {mk.doc && <><TipoDocumentoBadge tipo={mk.doc} compacto />{' '}</>}
              {mk.status && <>{iconeStatus(mk.status)}{' '}</>}
              {r.description}
            </p>
            <p className="text-[11px] text-gray-500 truncate">{subtitulo(r)}</p>
          </div>
          {valor(r, !ativa)}
          {expandida ? <ChevronDown size={14} className="text-gray-500 shrink-0" /> : <ChevronRight size={14} className="text-gray-500 shrink-0" />}
        </button>
        {expandida && detalhe(r, ativa, emAtraso)}
      </li>
    )
  }

  return (
    <div className="card p-0 overflow-hidden">
      {/* Saldo inicial */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3 bg-gray-800/20">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-400">Hoje · saldo inicial</p>
          <p className="text-[11px] text-gray-500">{qtdContas} conta{qtdContas !== 1 ? 's' : ''}, cada uma no seu último dia</p>
        </div>
        <p className={`text-sm font-bold ${corSaldo(saldoInicial)}`}>{fmt(saldoInicial)}</p>
      </div>

      {/* Pendências em atraso */}
      {atraso.length > 0 && (
        <div className={`border-b border-gray-800 bg-red-500/5 ${atrasoAtivas === 0 ? 'opacity-60' : ''}`}>
          <div className="flex items-center gap-1 pl-2 pr-4">
            <label className="w-11 h-11 flex items-center justify-center cursor-pointer" title={atrasoAtivas > 0 ? 'Tirar as pendências em atraso do cálculo' : 'Voltar a considerar as pendências em atraso'}>
              <input
                type="checkbox"
                className="accent-[#0F6E56] w-4 h-4"
                checked={atrasoAtivas > 0}
                ref={el => { if (el) el.indeterminate = atrasoAtivas > 0 && atrasoAtivas < atraso.length }}
                onChange={toggleAtraso}
                aria-label="Considerar pendências em atraso no cálculo"
              />
            </label>
            <button type="button" onClick={() => setAtrasoAberto(o => !o)} aria-expanded={atrasoAberto} className="flex-1 min-h-[44px] flex items-center gap-2 text-left">
              {atrasoAberto ? <ChevronDown size={14} className="text-red-300" /> : <ChevronRight size={14} className="text-red-300" />}
              <span className="text-sm text-red-300 flex-1">Pendências em atraso ({atraso.length})</span>
              <span className={`text-sm font-semibold ${atrasoTotal >= 0 ? 'text-blue-500' : 'text-orange-600'}`}>{fmt(atrasoTotal)}</span>
            </button>
          </div>
          <p className="px-4 pb-2 -mt-1 text-[11px] text-gray-500">Saldo com atrasos: <span className={`font-semibold ${corSaldo(base)}`}>{fmt(base)}</span></p>
          {atrasoAberto && (
            <ul className="border-t border-gray-800/60">
              {atraso.map(r => item(r, !excluidas.has(r._key), true))}
            </ul>
          )}
        </div>
      )}

      {/* Eventos por dia */}
      {grupos.map(g => (
        <section key={g.date}>
          <h3 className="sticky top-0 z-[1] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-900/95 border-b border-gray-800">
            {fmtDate(g.date)}
          </h3>
          <ul>
            {g.rows.map(r => item(r, r.ativa))}
          </ul>
        </section>
      ))}
      {rowsView.length === 0 && (
        <p className="text-center py-8 text-gray-500 text-sm">Nenhum evento nos próximos {horizonte} dias.</p>
      )}
    </div>
  )
}
