import { useState } from 'react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { clearTokenAndRedirect } from '../../lib/api'

// "Sair e apagar dados deste aparelho" (computador compartilhado). Com pendências, avisa que elas
// se perdem e oferece "Sincronizar e depois apagar" como ação principal.
export default function SairModal({ open, onClose }) {
  const { filaPendentes, sincronizarAntesDeSair, dbStatus, apagarDadosDoAparelho } = useApp()
  const [ocupado, setOcupado] = useState(null)
  const [erro, setErro] = useState('')
  const pendentes = filaPendentes.length
  const online = dbStatus === 'connected'

  const apagarESair = async () => {
    setOcupado('apagar')
    await apagarDadosDoAparelho()
    clearTokenAndRedirect()
  }
  const sincronizarEApagar = async () => {
    setOcupado('sincronizar')
    setErro('')
    const restam = await sincronizarAntesDeSair()
    if (restam > 0) {
      setOcupado(null)
      setErro('Não foi possível enviar tudo agora. Nada foi apagado.')
      return
    }
    await apagarESair()
  }

  return (
    <Modal open={open} onClose={ocupado ? () => {} : onClose} title="Apagar dados deste aparelho">
      <div className="space-y-4">
        <p className="text-sm text-texto-1">
          Os dados salvos neste aparelho serão apagados e você sairá. Seus dados na nuvem NÃO são afetados.
          Recomendado em computador compartilhado.
        </p>
        {pendentes > 0 && (
          <div className="text-sm text-aviso bg-surface-2 border border-aviso/40 rounded-lg px-3 py-2 space-y-1">
            <p>
              {pendentes === 1
                ? 'Existe 1 alteração ainda não enviada para a nuvem. Se apagar agora, ela será perdida.'
                : `Existem ${pendentes} alterações ainda não enviadas para a nuvem. Se apagar agora, elas serão perdidas.`}
            </p>
            {!online && <p className="text-xs">Sem internet agora: conecte-se para sincronizar antes de apagar.</p>}
          </div>
        )}
        {erro && <p className="text-xs text-perigo">{erro}</p>}
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={!!ocupado}>Cancelar</button>
          <button type="button" className="btn-danger disabled:opacity-40" onClick={apagarESair} disabled={!!ocupado}>
            {ocupado === 'apagar' ? 'Apagando…' : 'Apagar e sair'}
          </button>
          {pendentes > 0 && (
            <button type="button" className="btn-primary disabled:opacity-40" onClick={sincronizarEApagar} disabled={!online || !!ocupado}>
              {ocupado === 'sincronizar' ? 'Sincronizando…' : 'Sincronizar e depois apagar'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
