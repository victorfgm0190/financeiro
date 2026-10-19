import { useMemo, useState } from 'react'
import { Send, Download, CloudOff, CheckCircle2, AlertTriangle } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { rotuloDaEntrada } from '../../lib/filaOffline'
import { LIMITE_AVISO_FILA, ehIphoneSemInstalar } from '../../lib/offlineUi'

// Painel do indicador de sincronização: o que está esperando envio, "Enviar agora" e uma cópia de
// segurança das pendências em arquivo. Avisa quando o armazenamento não é persistente.
export default function PainelPendencias({ open, onClose }) {
  const { filaPendentes, enviarPendentes, dbStatus, syncing, erroArmazenamento, armazenamentoPersistente } = useApp()
  const [enviando, setEnviando] = useState(false)
  const online = dbStatus === 'connected'
  const grupos = useMemo(() => {
    const m = new Map()
    for (const e of [...filaPendentes].sort((a, b) => (b.em || 0) - (a.em || 0))) {
      const r = rotuloDaEntrada(e)
      if (!m.has(r.tela)) m.set(r.tela, [])
      m.get(r.tela).push({ ...r, chave: e.chave, em: e.em })
    }
    return [...m]
  }, [filaPendentes])

  const enviar = async () => {
    setEnviando(true)
    try { await enviarPendentes() } finally { setEnviando(false) }
  }

  const baixar = () => {
    const blob = new Blob([JSON.stringify({ _app: 'finup', _pendencias: true, geradoEm: new Date().toISOString(), entradas: filaPendentes }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finup-pendencias-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const hora = (ms) => (ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')

  return (
    <Modal open={open} onClose={onClose} title="Sincronização">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          {!online ? <CloudOff size={16} className="text-aviso" /> : filaPendentes.length ? <Send size={16} className="text-aviso" /> : <CheckCircle2 size={16} className="text-receita" />}
          <span className="text-texto-1">
            {!online ? 'Sem internet — as alterações ficam guardadas no aparelho.' : filaPendentes.length ? `${filaPendentes.length} alteração(ões) aguardando envio.` : 'Tudo sincronizado.'}
          </span>
        </div>

        {filaPendentes.length >= LIMITE_AVISO_FILA && (
          <Aviso>Muitas alterações sem enviar. Conecte-se assim que puder e, por segurança, baixe uma cópia das pendências.</Aviso>
        )}
        {erroArmazenamento && (
          <Aviso perigo>Não foi possível guardar no aparelho{erroArmazenamento === 'quota' ? ' (armazenamento cheio)' : ''}. Não feche o app até as alterações serem enviadas.</Aviso>
        )}
        {armazenamentoPersistente === false && (
          <Aviso>
            Este navegador não garantiu o armazenamento: se faltar espaço, ele pode apagar os dados guardados no aparelho.
            {ehIphoneSemInstalar() ? ' Instale o app (Compartilhar → Adicionar à Tela de Início)' : ' Instale o app'} e envie as pendências sempre que estiver com internet.
          </Aviso>
        )}

        {grupos.length > 0 && (
          <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
            {grupos.map(([tela, itens]) => (
              <div key={tela}>
                <p className="text-[11px] uppercase tracking-wide text-texto-3 mb-1">{tela} ({itens.length})</p>
                <ul className="space-y-1">
                  {itens.map(i => (
                    <li key={i.chave} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 min-w-0 truncate text-texto-1">{i.nome}</span>
                      <span className={i.acao === 'exclusão' ? 'text-despesa' : 'text-texto-3'}>{i.acao}</span>
                      <span className="text-texto-3 tabular-nums">{hora(i.em)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 justify-end">
          {filaPendentes.length > 0 && (
            <button type="button" onClick={baixar} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Download size={14} /> Baixar pendências
            </button>
          )}
          {filaPendentes.length > 0 && (
            <button type="button" onClick={enviar} disabled={!online || enviando || syncing} className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40" title={online ? '' : 'Sem internet'}>
              <Send size={14} /> {enviando || syncing ? 'Enviando…' : 'Enviar agora'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Aviso({ children, perigo = false }) {
  return (
    <p className={`flex gap-2 text-xs rounded-lg px-3 py-2 ${perigo ? 'bg-perigo-bg text-perigo' : 'bg-aviso/10 text-aviso'}`}>
      <AlertTriangle size={14} className="shrink-0 mt-0.5" /> <span>{children}</span>
    </p>
  )
}
