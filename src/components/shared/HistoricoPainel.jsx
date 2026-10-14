import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, History, Loader2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import Modal from './Modal'
import { fetchHistorico } from '../../lib/db'
import { agruparPorLote, formatarValorHistorico, rotuloCampo, ROTULO_ESCOPO } from '../../lib/historico'

const quando = (iso) => {
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return iso }
}
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')

// Linha do tempo do histórico de alterações de UM registro (agendamento ou lançamento).
//   entidade/entidadeId: o registro.
//   serieKey: habilita o filtro "Toda a série".
//   origem: { entidade, entidadeId } — para um lançamento gerado por agendamento, mostra também o
//           histórico da parcela de origem.
// Clicar num lote (uma edição) lista todos os itens que aquela edição alterou.
// Componente de CONTEÚDO (sem modal próprio): dentro de um formulário já em modal ele substitui o
// formulário; fora, use HistoricoModal.
export function HistoricoPainel({ entidade, entidadeId, serieKey = null, origem = null, onVoltar = null }) {
  const { categories, accounts, tiposDocumento, gerencialGroups, schedules, transactions } = useApp()
  const ctx = useMemo(() => ({ categorias: categories, contas: accounts, tipos: tiposDocumento, grupos: gerencialGroups }), [categories, accounts, tiposDocumento, gerencialGroups])
  const [filtro, setFiltro] = useState('parcela') // 'parcela' | 'serie'
  const [linhas, setLinhas] = useState(null)
  const [erro, setErro] = useState('')
  const [lote, setLote] = useState(null) // { loteId, linhas }

  useEffect(() => {
    let cancel = false
    const buscas = [filtro === 'serie' && serieKey ? fetchHistorico({ serie_key: serieKey }) : fetchHistorico({ entidade, entidade_id: entidadeId })]
    if (origem?.entidadeId) buscas.push(fetchHistorico({ entidade: origem.entidade, entidade_id: origem.entidadeId }).then(ls => ls.map(l => ({ ...l, _origem: true }))))
    Promise.all(buscas)
      .then(rs => { if (!cancel) { setErro(''); setLinhas(rs.flat()) } })
      .catch(err => { if (!cancel) { setErro(err?.message || 'Falha ao carregar o histórico.'); setLinhas([]) } })
    return () => { cancel = true }
  }, [entidade, entidadeId, serieKey, origem?.entidade, origem?.entidadeId, filtro])

  const lotes = useMemo(() => agruparPorLote(linhas || []), [linhas])
  const nomeItem = (ent, id) => {
    if (ent === 'agendamento') return (schedules || []).find(s => s.id === id)?.description || id
    return (transactions || []).find(t => t.id === id)?.description || id
  }

  const abrirLote = async (loteId) => {
    try { setLote({ loteId, linhas: await fetchHistorico({ lote_id: loteId }) }) } catch (err) { setErro(err?.message || 'Falha ao carregar o lote.') }
  }

  const mudanca = (l) => (
    <div key={l.id} className="text-xs text-texto-2 flex flex-wrap items-center gap-1">
      <span className="text-texto-3">{rotuloCampo(l.campo)}:</span>
      <span className="line-through text-texto-3">{formatarValorHistorico(l.campo, l.valor_anterior, ctx)}</span>
      <ArrowRight size={11} className="text-texto-3" />
      <span className="text-texto-1">{formatarValorHistorico(l.campo, l.valor_novo, ctx)}</span>
      {l.ocorrencia_data && <span className="text-[10px] text-texto-3">(ocorrência {ddmm(l.ocorrencia_data)})</span>}
    </div>
  )

  if (lote) {
    const porItem = new Map()
    for (const l of lote.linhas) {
      const k = `${l.entidade}:${l.entidade_id}`
      if (!porItem.has(k)) porItem.set(k, [])
      porItem.get(k).push(l)
    }
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setLote(null)} className="text-xs text-texto-2 hover:text-texto-1 flex items-center gap-1"><ArrowLeft size={12} /> Voltar à linha do tempo</button>
        <p className="text-sm text-texto-1">{porItem.size} item(ns) alterado(s) nesta edição{lote.linhas[0]?.motivo ? ` — "${lote.linhas[0].motivo}"` : ''}</p>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {[...porItem].map(([k, ls]) => (
            <div key={k} className="p-2.5 rounded-lg bg-surface-2/60 border border-borda-forte/60">
              <p className="text-xs font-medium text-texto-1 mb-1">{nomeItem(ls[0].entidade, ls[0].entidade_id)}</p>
              <div className="space-y-0.5">{ls.map(mudanca)}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {onVoltar && (
          <button type="button" onClick={onVoltar} className="text-xs text-texto-2 hover:text-texto-1 flex items-center gap-1"><ArrowLeft size={12} /> Voltar</button>
        )}
        <p className="text-sm font-semibold text-texto-1 flex items-center gap-1.5"><History size={14} /> Histórico de alterações</p>
        {serieKey && (
          <div className="ml-auto flex rounded-lg overflow-hidden border border-borda-forte text-xs">
            {[['parcela', 'Esta parcela'], ['serie', 'Toda a série']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setFiltro(v)}
                className={`px-2.5 py-1 ${filtro === v ? 'bg-primary text-white' : 'bg-surface-2 text-texto-2 hover:text-texto-1'}`}>{l}</button>
            ))}
          </div>
        )}
      </div>
      {erro && <p className="text-xs text-perigo">{erro}</p>}
      {linhas === null ? (
        <p className="text-xs text-texto-3 flex items-center gap-1.5 py-6 justify-center"><Loader2 size={13} className="animate-spin" /> Carregando…</p>
      ) : lotes.length === 0 ? (
        <p className="text-xs text-texto-3 text-center py-6">Nenhuma alteração registrada.</p>
      ) : (
        <ol className="relative border-l border-borda-forte ml-1.5 space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {lotes.map(g => (
            <li key={g.loteId} className="ml-4">
              <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-primary border border-borda" />
              <button type="button" onClick={() => abrirLote(g.loteId)} className="w-full text-left rounded-lg p-2 hover:bg-surface-hover/60" title="Ver todas as parcelas alteradas nesta edição">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-texto-3">
                  <span>{quando(g.quando)}</span>
                  <span className="px-1.5 py-0.5 rounded bg-surface-hover/60 text-texto-2">{ROTULO_ESCOPO[g.escopo] || g.escopo}</span>
                  {g.nItens > 1 && <span>{g.nItens} itens</span>}
                  {g.linhas.some(l => l._origem) && <span className="text-texto-2">parcela de origem</span>}
                </div>
                {g.motivo && <p className="text-xs text-texto-2 mt-0.5">Motivo: {g.motivo}</p>}
                <div className="mt-1 space-y-0.5">
                  {(filtro === 'serie' ? g.linhas.filter((l, i, arr) => arr.findIndex(x => x.campo === l.campo) === i) : g.linhas.filter(l => l._origem || l.entidade_id === entidadeId)).map(mudanca)}
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default function HistoricoModal({ open, onClose, ...props }) {
  return (
    <Modal open={open} onClose={onClose} title="Histórico de alterações" size="lg">
      {open && <HistoricoPainel {...props} />}
    </Modal>
  )
}
