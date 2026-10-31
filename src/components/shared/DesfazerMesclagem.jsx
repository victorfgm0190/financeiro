import { useEffect, useState } from 'react'
import { Undo2, AlertTriangle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fetchHistorico } from '../../lib/db'
import { planejarDesfazerMesclagem } from '../../lib/vinculo'
import { formatarValorHistorico, rotuloCampo } from '../../lib/historico'
import { fmt, fmtDate } from './utils'

// "Desfazer mesclagem" na parcela que recebeu um avulso (lib/vinculo): procura no histórico dela a
// última mesclagem ainda não desfeita e, com confirmação, recria o avulso e devolve os valores
// anteriores da parcela. Avisa o que será sobrescrito se a parcela mudou depois da mesclagem.
export default function DesfazerMesclagem({ txId, onFeito, onToast }) {
  const { temHistorico, desfazerMesclagem, transactions, schedules, categories, accounts, tiposDocumento, pode } = useApp()
  const [mescla, setMescla] = useState(null) // { retrato, loteId }
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState('')
  const temHist = temHistorico('lancamento', txId)

  useEffect(() => {
    if (!txId || !temHist) return
    let vivo = true
    fetchHistorico({ entidade: 'lancamento', entidade_id: txId }).then(linhas => {
      if (!vivo) return
      const desfeitos = new Set(linhas.filter(l => l.campo === 'desfazer_mesclagem' && l.valor_novo?.loteOrigem).map(l => l.valor_novo.loteOrigem))
      const ultima = linhas
        .filter(l => l.campo === 'mesclagem' && l.valor_anterior?.avulso && !desfeitos.has(l.lote_id))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
      setMescla(ultima ? { retrato: ultima.valor_anterior, loteId: ultima.lote_id } : null)
    }).catch(() => {})
    return () => { vivo = false }
  }, [txId, temHist])

  if (!mescla || !pode('lancamentos', 'editar')) return null
  if (transactions.some(t => t.id === mescla.retrato.avulso.id)) return null
  const plano = planejarDesfazerMesclagem({ transactions, schedules }, mescla.retrato)
  const av = mescla.retrato.avulso
  const ctx = { categorias: categories, contas: accounts, tipos: tiposDocumento }

  const confirmar = () => {
    const r = desfazerMesclagem(mescla.retrato, { loteOrigem: mescla.loteId })
    if (!r?.ok) { setErro(r?.motivo || 'Não foi possível desfazer.'); return }
    onToast?.('Mesclagem desfeita: o avulso foi recriado e a parcela voltou aos valores anteriores. Histórico registrado.')
    setMescla(null)
    onFeito?.()
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      {!confirmando ? (
        <button type="button" onClick={() => setConfirmando(true)} className="text-xs text-texto-2 hover:text-texto-1 flex items-center gap-1.5"
          title={`Recriar o avulso "${av.description || av.payee || ''}" e devolver à parcela os valores anteriores`}>
          <Undo2 size={13} /> Desfazer mesclagem
        </button>
      ) : (
        <span role="alert" className="block max-w-sm rounded-lg border border-aviso/50 bg-aviso/10 p-2.5 text-xs text-texto-1 space-y-1.5 text-left">
          <span className="flex items-start gap-1.5">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-aviso" />
            <span>O avulso "{av.description || av.payee || '—'}" ({fmt(av.amount)}, {fmtDate(av.date)}) será recriado e esta parcela volta aos valores de antes da mesclagem. Confirmar?</span>
          </span>
          {plano.ok && plano.sobrescritos.length > 0 && (
            <span className="block text-aviso">
              A parcela mudou depois da mesclagem — será sobrescrito:{' '}
              {plano.sobrescritos.map(x => `${rotuloCampo(x.campo)} ${formatarValorHistorico(x.campo, x.atual, ctx)} → ${formatarValorHistorico(x.campo, x.volta, ctx)}`).join('; ')}
            </span>
          )}
          {!plano.ok && <span className="block text-perigo">{plano.motivo}</span>}
          <span className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary text-xs py-1 px-2" onClick={() => setConfirmando(false)}>Cancelar</button>
            <button type="button" className="btn-primary text-xs py-1 px-2" disabled={!plano.ok} onClick={confirmar}>Confirmar</button>
          </span>
          {erro && <span className="block text-perigo">{erro}</span>}
        </span>
      )}
    </span>
  )
}
