import { useState } from 'react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { clearTokenAndRedirect } from '../../lib/api'

// Sair com pendências: nunca descarta sem o usuário pedir — "Enviar e sair" (com internet) ou
// "Cancelar". Sem pendências: oferece apagar os dados deste aparelho (computador compartilhado).
export default function SairModal({ open, onClose }) {
  const { filaPendentes, enviarPendentes, dbStatus, apagarDadosDoAparelho } = useApp()
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const pendentes = filaPendentes.length
  const online = dbStatus === 'connected'

  const enviarESair = async () => {
    setOcupado(true)
    setErro('')
    try { await enviarPendentes() } finally { setOcupado(false) }
  }
  const sair = async (apagar) => {
    setOcupado(true)
    if (apagar) await apagarDadosDoAparelho()
    clearTokenAndRedirect()
  }

  return (
    <Modal open={open} onClose={ocupado ? () => {} : onClose} title="Sair">
      {pendentes > 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-texto-1">
            Há {pendentes} {pendentes === 1 ? 'alteração não enviada' : 'alterações não enviadas'} para o banco.
          </p>
          {!online && <p className="text-xs text-aviso">Sem internet agora: conecte-se para enviar antes de sair.</p>}
          {erro && <p className="text-xs text-perigo">{erro}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={ocupado}>Cancelar</button>
            <button type="button" className="btn-primary disabled:opacity-40" onClick={enviarESair} disabled={!online || ocupado}>
              {ocupado ? 'Enviando…' : 'Enviar e sair'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-texto-1">Apagar os dados deste aparelho?</p>
          <p className="text-xs text-texto-3">Recomendado em computador compartilhado. No seu aparelho, manter deixa o app abrir mais rápido e sem internet.</p>
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={ocupado}>Cancelar</button>
            <button type="button" className="btn-secondary" onClick={() => sair(false)} disabled={ocupado}>Não, só sair</button>
            <button type="button" className="btn-primary" onClick={() => sair(true)} disabled={ocupado}>Sim, apagar e sair</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
