import { useState } from 'react'
import { ChevronDown, ChevronRight, CalendarClock, RotateCcw, CheckCircle2, Pencil, Trash2, CircleCheck, CircleDashed } from 'lucide-react'
import { fmt, fmtSinal, fmtDate } from '../shared/utils'
import { agruparPorDia } from '../../lib/fluxoMobile'
import { estadoMarcacao } from '../../lib/fluxoConsultas'
import { STATUS_CONFIRMACAO } from '../../lib/fluxoStatus'
import TipoDocumentoBadge from '../shared/TipoDocumentoBadge'
import BottomSheet from '../shared/BottomSheet'
import { MASCARA } from '../../mobile/ocultarValores'

// Bottom sheet dos filtros/consultas do Fluxo no celular (componente compartilhado).
export const FluxoSheet = BottomSheet

const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

// Valor da linha: entrada (+, azul) ou saída (−, laranja) — as mesmas cores das colunas do desktop.
function valor(r, apagado, oculto) {
  if (r.entrada > 0) return <span className={`text-sm font-semibold whitespace-nowrap ${apagado ? 'text-texto-3' : 'text-receita'}`}>{oculto ? MASCARA : `+${fmt(r.entrada)}`}</span>
  if (r.saida > 0) return <span className={`text-sm font-semibold whitespace-nowrap ${apagado ? 'text-texto-3' : 'text-despesa'}`}>{oculto ? MASCARA : `−${fmt(r.saida)}`}</span>
  return <span className="text-sm text-texto-3">—</span>
}

// Status da linha no celular: só o ícone (Confirmado = check azul, A confirmar = círculo tracejado âmbar).
function iconeStatus(status) {
  if (!status) return null
  const ok = status === STATUS_CONFIRMACAO.CONFIRMADO
  const rotulo = ok ? 'Confirmado' : 'A confirmar'
  const Icone = ok ? CircleCheck : CircleDashed
  return (
    <span role="img" aria-label={rotulo} title={rotulo} className={`inline-flex align-middle ${ok ? 'text-primary-fg' : 'text-texto-3'}`}>
      <Icone size={13} aria-hidden="true" />
    </span>
  )
}

// Lista do Fluxo no celular: agrupada por dia, cada item com [doc] [status] descrição, "categoria · conta"
// e valor. O resto (tipo, saldo, incluir no cálculo, ações, doc/status por extenso) abre ao tocar no item.
// Recebe as linhas JÁ calculadas pelo painel — nenhum valor é recalculado aqui.
export default function FluxoMobileLista({
  rowsView, atraso, excluidas, atrasoAtivas, atrasoTotal, base, saldoInicial, minimoKey, saldoDoDia, oculto, horizonte,
  qtdContas, corSaldo, subtitulo, statusCelula, docBadge, tipoBadge, docDaLinha, statusDaLinha, marcadores,
  toggleLinha, toggleAtraso, marcarVarias, onMudarData, onDesfazerData, onEfetivar, onEditarProvisorio, onExcluirProvisorio,
}) {
  const [aberta, setAberta] = useState(null)
  const [atrasoAberto, setAtrasoAberto] = useState(false)
  const alternar = (key) => setAberta(k => (k === key ? null : key))
  const grupos = agruparPorDia(rowsView)
  // Valores respeitam o "olho" do mobile (oculto → máscara).
  const vf = (n, f = fmtSinal) => (oculto ? MASCARA : f(n))
  // Checkbox de vários eventos (todos os visíveis, ou os de um dia): marcado só com todos no
  // cálculo; indeterminado com parte deles.
  const caixaVarias = (linhas, rotulo, tamanho = 'w-4 h-4') => {
    const m = estadoMarcacao(linhas, excluidas)
    return (
      <input
        type="checkbox"
        className={`accent-primary ${tamanho}`}
        checked={m.todas}
        ref={el => { if (el) el.indeterminate = m.parcial }}
        onChange={() => marcarVarias(linhas, !m.todas)}
        aria-label={rotulo}
      />
    )
  }
  const marcacao = estadoMarcacao(rowsView, excluidas)

  const detalhe = (r, ativa, emAtraso) => {
    const ehMinimo = r._key === minimoKey
    const st = statusDaLinha(r)
    const doc = docDaLinha(r)
    return (
      <div className="px-4 pb-3 pt-1 space-y-2 bg-surface-2/30">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-texto-3">Data</span>
          {r._dataOriginal
            ? <span className="text-texto-1 font-semibold underline decoration-dashed decoration-borda-campo underline-offset-2">{fmtDate(r.date)} <span className="text-texto-3 font-normal">(era {ddmm(r._dataOriginal)})</span></span>
            : <span className="text-texto-2">{fmtDate(r.date)}</span>}
          {!emAtraso && tipoBadge(r)}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-texto-3">Status</span>{statusCelula(r)}
            {st && <span className="text-texto-2">{st.status === STATUS_CONFIRMACAO.CONFIRMADO ? 'Confirmado' : 'A confirmar'}</span>}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-texto-3">Documento</span>{docBadge(r)}
            {doc && <span className="text-texto-2">{doc.nome}</span>}
          </span>
          {!emAtraso && (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-texto-3">Saldo</span>
              <span className={`font-bold ${!ativa ? 'text-texto-3' : r.saldo >= 0 ? 'text-texto-1' : 'text-despesa'}`}>{ativa ? vf(r.saldo) : '—'}</span>
              {ehMinimo && ativa && <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.saldo < 0 ? 'bg-despesa/15 text-despesa' : 'bg-receita/15 text-receita'}`}>mínimo</span>}
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 min-h-[44px] text-xs text-texto-2 cursor-pointer">
          <input type="checkbox" className="accent-primary w-4 h-4" checked={ativa} onChange={() => toggleLinha(r._key)} />
          Incluir no cálculo
        </label>
        <div className="flex flex-wrap gap-2">
          {!r._provisorio && onMudarData && (
            <button type="button" onClick={() => onMudarData(r)} className="btn-secondary min-h-[44px] flex items-center gap-1.5 text-xs">
              <CalendarClock size={14} /> Mudar data
            </button>
          )}
          {r._dataOriginal && onDesfazerData && (
            <button type="button" onClick={() => onDesfazerData(r)} className="btn-secondary min-h-[44px] flex items-center gap-1.5 text-xs text-ambar">
              <RotateCcw size={14} /> Desfazer data
            </button>
          )}
          {r._provisorio && (
            <>
              {onEfetivar && (
              <button type="button" onClick={() => onEfetivar(r._provisorio)} className="btn-secondary min-h-[44px] flex items-center gap-1.5 text-xs border-primary/40 text-primary-fg">
                <CheckCircle2 size={14} /> Efetivar
              </button>
              )}
              {onEditarProvisorio && (
              <button type="button" onClick={() => onEditarProvisorio(r._provisorio)} className="btn-secondary min-h-[44px] flex items-center gap-1.5 text-xs">
                <Pencil size={14} /> Editar
              </button>
              )}
              {onExcluirProvisorio && (
              <button type="button" onClick={() => onExcluirProvisorio(r._provisorio)} className="btn-secondary min-h-[44px] flex items-center gap-1.5 text-xs text-perigo">
                <Trash2 size={14} /> Excluir
              </button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  const item = (r, ativa, emAtraso = false) => {
    const ehMinimo = r._key === minimoKey && ativa
    const fundo = ehMinimo ? (r.saldo < 0 ? 'bg-despesa/10' : 'bg-receita/10') : r._provisorio ? 'bg-surface-2/60' : ''
    const expandida = aberta === r._key
    const mk = marcadores(r)
    return (
      <li key={r._key} className={`border-b border-borda/40 ${fundo}`}>
        <button
          type="button"
          onClick={() => alternar(r._key)}
          aria-expanded={expandida}
          className={`w-full min-h-[52px] px-4 py-2 flex items-center gap-3 text-left ${ativa ? '' : 'opacity-50'}`}
        >
          <div className="min-w-0 flex-1">
            <p className={`text-sm truncate ${ativa ? 'text-texto-1' : 'text-texto-3 line-through'}`}>
              {mk.doc && <><TipoDocumentoBadge tipo={mk.doc} compacto />{' '}</>}
              {mk.status && <>{iconeStatus(mk.status)}{' '}</>}
              {r.description}
            </p>
            <p className="text-[11px] text-texto-3 truncate">{subtitulo(r)}</p>
          </div>
          {valor(r, !ativa, oculto)}
          {expandida ? <ChevronDown size={14} className="text-texto-3 shrink-0" /> : <ChevronRight size={14} className="text-texto-3 shrink-0" />}
        </button>
        {expandida && detalhe(r, ativa, emAtraso)}
      </li>
    )
  }

  return (
    <div className="card p-0 overflow-hidden">
      {/* Saldo inicial */}
      <div className="px-4 py-3 border-b border-borda flex items-center gap-3 bg-surface-2/20">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-texto-2">Hoje · saldo inicial</p>
          <p className="text-[11px] text-texto-3">{qtdContas} conta{qtdContas !== 1 ? 's' : ''}, cada uma no seu último dia</p>
        </div>
        <p className={`text-sm font-bold ${corSaldo(saldoInicial)}`}>{vf(saldoInicial)}</p>
      </div>

      {/* Pendências em atraso */}
      {atraso.length > 0 && (
        <div className={`border-b border-borda bg-perigo/5 ${atrasoAtivas === 0 ? 'opacity-60' : ''}`}>
          <div className="flex items-center gap-1 pl-2 pr-4">
            <label className="w-11 h-11 flex items-center justify-center cursor-pointer" title={atrasoAtivas > 0 ? 'Tirar as pendências em atraso do cálculo' : 'Voltar a considerar as pendências em atraso'}>
              <input
                type="checkbox"
                className="accent-primary w-4 h-4"
                checked={atrasoAtivas > 0}
                ref={el => { if (el) el.indeterminate = atrasoAtivas > 0 && atrasoAtivas < atraso.length }}
                onChange={toggleAtraso}
                aria-label="Considerar pendências em atraso no cálculo"
              />
            </label>
            <button type="button" onClick={() => setAtrasoAberto(o => !o)} aria-expanded={atrasoAberto} className="flex-1 min-h-[44px] flex items-center gap-2 text-left">
              {atrasoAberto ? <ChevronDown size={14} className="text-perigo" /> : <ChevronRight size={14} className="text-perigo" />}
              <span className="text-sm text-perigo flex-1">⚠ Pendências em atraso ({atraso.length})</span>
              <span className={`text-sm font-semibold ${atrasoTotal >= 0 ? 'text-receita' : 'text-despesa'}`}>{vf(atrasoTotal)}</span>
            </button>
          </div>
          <p className="px-4 pb-2 -mt-1 text-[11px] text-texto-3">Saldo com atrasos: <span className={`font-semibold ${corSaldo(base)}`}>{vf(base, fmt)}</span></p>
          {atrasoAberto && (
            <ul className="border-t border-borda/60">
              {atraso.map(r => item(r, !excluidas.has(r._key), true))}
            </ul>
          )}
        </div>
      )}

      {/* Marcar todos (só os eventos visíveis no prazo e filtros atuais) */}
      {rowsView.length > 0 && (
        <label className="flex items-center gap-3 min-h-[44px] px-4 border-b border-borda text-sm text-texto-2 cursor-pointer">
          {caixaVarias(rowsView, 'Marcar todos os eventos')}
          <span className="flex-1">Marcar todos</span>
          <span className="text-xs text-texto-3">{marcacao.ativas}/{marcacao.total} no cálculo</span>
        </label>
      )}

      {/* Eventos por dia */}
      {grupos.map(g => (
        <section key={g.date}>
          <h3 className="sticky top-0 z-[1] pl-1 pr-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-texto-2 bg-surface/95 border-b border-borda">
            <label className="w-9 h-9 shrink-0 flex items-center justify-center cursor-pointer" title="Marcar / desmarcar os eventos deste dia">
              {caixaVarias(g.rows, `Marcar os eventos de ${fmtDate(g.date)}`, 'w-3.5 h-3.5')}
            </label>
            <span className="shrink-0">{fmtDate(g.date)}</span>
            <span aria-hidden="true" className="flex-1 min-w-2 border-b border-dotted border-borda-forte" />
            {saldoDoDia?.has(g.date) && (
              <span className="shrink-0 normal-case tracking-normal whitespace-nowrap">
                <span className="font-normal text-texto-3">Saldo </span>
                <span className={`font-bold ${saldoDoDia.get(g.date) >= 0 ? 'text-receita' : 'text-despesa'}`}>{vf(saldoDoDia.get(g.date))}</span>
              </span>
            )}
          </h3>
          <ul>
            {g.rows.map(r => item(r, r.ativa))}
          </ul>
        </section>
      ))}
      {rowsView.length === 0 && (
        <p className="text-center py-8 text-texto-3 text-sm">Nenhum evento nos próximos {horizonte} dias.</p>
      )}
    </div>
  )
}
