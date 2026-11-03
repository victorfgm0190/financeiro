import { useMemo, useState } from 'react'
import { Send, Download, CloudOff, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { rotuloDaEntrada } from '../../lib/filaOffline'
import { LIMITE_AVISO_FILA, ehIphoneSemInstalar } from '../../lib/offlineUi'
import { MSG_SERVIDOR } from '../../lib/conexao'

// Painel do indicador de sincronização: o que está esperando envio, "Enviar agora" e uma cópia de
// segurança das pendências em arquivo. Avisa quando o armazenamento não é persistente.
export default function PainelPendencias({ open, onClose }) {
  const { filaPendentes, filaErros = [], tentarDeNovoErroFila, descartarErroFila, enviarAgora, dbStatus, syncing, erroArmazenamento, armazenamentoPersistente } = useApp()
  const [enviando, setEnviando] = useState(false)
  const [erroEnviar, setErroEnviar] = useState(null)
  const semRede = dbStatus === 'local'
  const servidor = dbStatus === 'servidor'
  const [confirmarDescarte, setConfirmarDescarte] = useState(null)
  const online = dbStatus === 'connected'
  // Alterações recusadas pelo servidor (AppContext marcarErroFila): à parte, com o motivo.
  const errosPorChave = useMemo(() => new Map(filaErros.map(e => [e.chave, e])), [filaErros])
  const comErro = filaPendentes.filter(e => errosPorChave.has(e.chave))
    .map(e => ({ ...rotuloDaEntrada(e), chave: e.chave, motivo: errosPorChave.get(e.chave).motivo }))
  const grupos = useMemo(() => {
    const m = new Map()
    for (const e of [...filaPendentes].filter(x => !errosPorChave.has(x.chave)).sort((a, b) => (b.em || 0) - (a.em || 0))) {
      const r = rotuloDaEntrada(e)
      if (!m.has(r.tela)) m.set(r.tela, [])
      m.get(r.tela).push({ ...r, chave: e.chave, em: e.em })
    }
    return [...m]
  }, [filaPendentes, errosPorChave])

  // Reconecta se preciso (AppContext.enviarAgora) e mostra o erro real quando não dá.
  const enviar = async () => {
    setEnviando(true)
    setErroEnviar(null)
    try {
      const r = await enviarAgora()
      if (!r?.ok) setErroEnviar(r?.erro || 'Não foi possível enviar')
    } catch (err) {
      setErroEnviar(err?.message || String(err))
    } finally { setEnviando(false) }
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
          {semRede ? <CloudOff size={16} className="text-aviso" /> : servidor ? <RefreshCw size={16} className="text-aviso" /> : filaPendentes.length - comErro.length ? <Send size={16} className="text-aviso" /> : comErro.length ? <AlertTriangle size={16} className="text-perigo" /> : <CheckCircle2 size={16} className="text-receita" />}
          <span className="text-texto-1">
            {semRede ? 'Sem internet — as alterações ficam guardadas no aparelho.'
              : servidor ? `${MSG_SERVIDOR}. As alterações ficam guardadas no aparelho.`
              : filaPendentes.length - comErro.length ? `${filaPendentes.length - comErro.length} alteração(ões) aguardando envio.`
                : comErro.length ? 'Nenhuma outra alteração aguardando envio.' : 'Tudo sincronizado.'}
          </span>
        </div>

        {comErro.length > 0 && (
          <div className="space-y-2" aria-label="Alterações com erro">
            <p className="flex items-start gap-2 text-sm font-medium text-perigo">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{comErro.length === 1 ? '1 alteração com erro' : `${comErro.length} alterações com erro`}: o servidor recusou e o app não tenta mais sozinho.</span>
            </p>
            <ul className="space-y-2">
              {comErro.map(i => (
                <li key={i.chave} className="rounded-lg border border-perigo/40 bg-perigo-bg px-3 py-2 text-xs space-y-1.5">
                  <p className="text-texto-1"><span className="font-medium">{i.tela}</span> · {i.nome} <span className="text-texto-2">({i.acao})</span></p>
                  <p className="text-perigo">Motivo: {i.motivo}.</p>
                  <p className="text-texto-2">Para corrigir, abra o item na tela dele, ajuste e salve: o envio é refeito na hora.</p>
                  {confirmarDescarte === i.chave ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-texto-1">Descartar esta alteração? O item volta a ficar como está gravado no banco.</span>
                      <button type="button" className="btn-danger text-xs py-1" onClick={() => { setConfirmarDescarte(null); descartarErroFila(i.chave) }}>Descartar</button>
                      <button type="button" className="btn-secondary text-xs py-1" onClick={() => setConfirmarDescarte(null)}>Cancelar</button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-secondary text-xs py-1" disabled={!online} onClick={() => tentarDeNovoErroFila(i.chave)}>Tentar de novo</button>
                      <button type="button" className="btn-secondary text-xs py-1" onClick={() => setConfirmarDescarte(i.chave)}>Descartar alteração</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

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

        {erroEnviar && <Aviso perigo>Não foi possível enviar: {erroEnviar}</Aviso>}

        <div className="flex flex-wrap gap-2 justify-end">
          {filaPendentes.length > 0 && (
            <button type="button" onClick={baixar} className="btn-secondary flex items-center gap-1.5 text-sm">
              <Download size={14} /> Baixar pendências
            </button>
          )}
          {filaPendentes.length > 0 && (
            <button type="button" onClick={enviar} disabled={enviando || syncing} className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40">
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
