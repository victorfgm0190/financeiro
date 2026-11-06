import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import Modal from '../shared/Modal'
import { fmtSinal, fmtDate } from '../shared/utils'
import { useApp } from '../../context/AppContext'
import { definirConfirmadorEstorno, EVENTO_ESTORNO_VIRADA } from '../../lib/api'
import { fetchViradaReservaStatus } from '../../lib/db'
import { agruparItensVirada } from '../../lib/viradaReserva'
import { rotuloMes } from '../../lib/mesFinanceiro'
import ViradaAssistidaModal from './ViradaAssistidaModal'

// Gravação com data em período já virado: o servidor recusa com a prévia e o interceptador de src/lib/api.js
// pergunta aqui. Confirmar reenvia o pedido, e o servidor estorna, grava e refaz numa operação só. Se uma
// virada refeita parar por diferença sem explicação, abre a virada normal, para o usuário decidir.
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const rotuloVirada = (v) => rotuloMes({ inicio: v.data_inicio, fim: v.data_corte })

export function PreviaEstorno({ dados, onConfirmar, onCancelar }) {
  const [enviando, setEnviando] = useState(false)
  const viradas = dados?.previa?.viradas || []
  const grupos = agruparItensVirada(dados?.previa?.itens)
  return (
    <div className="space-y-3 text-sm" data-testid="previa-estorno">
      <p className="text-texto-1 font-medium flex gap-2"><AlertTriangle size={16} className="text-aviso shrink-0 mt-0.5" />{dados?.error}</p>
      <div>
        <p className="text-xs font-semibold text-texto-2 mb-1">Serão estornadas e refeitas, da mais recente até a da data:</p>
        <ul className="text-xs text-texto-1 space-y-0.5" data-testid="previa-viradas">
          {viradas.map(v => <li key={v.data_corte}>{rotuloVirada(v)} (fechamento de {fmtDate(v.data_corte)})</li>)}
        </ul>
      </div>
      <div>
        <p className="text-xs font-semibold text-texto-2 mb-1">O que será gravado nesses períodos:</p>
        <div className="max-h-48 overflow-y-auto space-y-1.5">
          {grupos.map(g => (
            <div key={g.chave} data-testid="previa-grupo">
              <p className="text-[11px] text-texto-3 flex justify-between gap-2"><span>{g.mes.slice(5, 7)}/{g.mes.slice(0, 4)}</span><span>{fmtSinal(g.total)}</span></p>
              {g.itens.map((i, n) => <p key={n} className="text-xs text-texto-1">{i.data ? fmtDate(i.data) : ''} · {i.descricao || 'Lançamento'} · {fmtSinal(i.valor)}</p>)}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-texto-3">É tudo ou nada: se algo falhar, nada muda. Se você não confirmar, nada é gravado. Se uma virada refeita tiver diferença sem explicação, ela para e mostra o valor para você decidir.</p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" disabled={enviando} onClick={onCancelar}>Não gravar</button>
        <button type="button" className="btn-primary" disabled={enviando} onClick={() => { setEnviando(true); onConfirmar() }}>
          {enviando ? <Loader2 size={14} className="animate-spin" /> : 'Estornar, gravar e refazer'}
        </button>
      </div>
    </div>
  )
}

export default function PeriodoViradoHost() {
  const { recarregarHistoricoReservas } = useApp()
  const [pedido, setPedido] = useState(null)
  const [viradaStatus, setViradaStatus] = useState(null)
  const fila = useRef(Promise.resolve())

  useEffect(() => {
    // Um pedido por vez: lotes em sequência não abrem duas janelas.
    const confirmar = (dados) => {
      const resposta = fila.current.then(() => new Promise(resolve => setPedido({ dados, resolve })))
      fila.current = resposta.catch(() => {})
      return resposta
    }
    definirConfirmadorEstorno(confirmar)
    return () => definirConfirmadorEstorno(null)
  }, [])

  useEffect(() => {
    const aoEstornar = async (ev) => {
      try { await recarregarHistoricoReservas?.() } catch { /* a tela recarrega ao abrir Reservas */ }
      if (!ev.detail?.parou) return
      try { setViradaStatus(await fetchViradaReservaStatus(hojeLocal())) } catch { /* a pergunta aparece ao abrir Reservas */ }
    }
    window.addEventListener(EVENTO_ESTORNO_VIRADA, aoEstornar)
    return () => window.removeEventListener(EVENTO_ESTORNO_VIRADA, aoEstornar)
  }, [recarregarHistoricoReservas])

  const responder = (ok) => {
    pedido?.resolve(ok)
    setPedido(null)
  }

  return (
    <>
      <Modal open={!!pedido} onClose={() => responder(false)} title="Período já virado">
        {pedido && <PreviaEstorno dados={pedido.dados} onConfirmar={() => responder(true)} onCancelar={() => responder(false)} />}
      </Modal>
      {viradaStatus && (
        <ViradaAssistidaModal
          status={viradaStatus}
          hoje={hojeLocal()}
          manual
          onVirou={() => recarregarHistoricoReservas?.()}
          onAgoraNao={() => setViradaStatus(null)}
          onFechar={() => setViradaStatus(null)}
        />
      )}
    </>
  )
}
