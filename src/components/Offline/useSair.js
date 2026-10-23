import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { clearTokenAndRedirect } from '../../lib/api'

// "Sair" (sidebar, topo, menu Mais). Sem pendências na fila: encerra a sessão DIRETO (antes tenta
// enviar o que estiver em andamento). COM pendências: abre o aviso (AvisoSairModal) — "Sincronizar e
// sair" (padrão; sem internet fica desabilitado), "Sair mesmo assim" ou "Cancelar". Sair nunca apaga
// a fila: ela e o cache ficam no aparelho e vão no próximo login do mesmo usuário. Sem token, o app
// volta ao Login e nada do cache aparece antes de entrar.
export function useSair() {
  const { sincronizarAntesDeSair, filaPendentes, dbStatus } = useApp()
  const [saindo, setSaindo] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState('')
  const pendentes = filaPendentes?.length || 0

  const sair = async () => {
    if (saindo) return
    if (pendentes > 0) { setErro(''); setAberto(true); return }
    setSaindo(true)
    try { await sincronizarAntesDeSair() } catch { /* a fila continua no aparelho */ }
    clearTokenAndRedirect()
  }

  const sincronizarESair = async () => {
    setSaindo(true)
    setErro('')
    let restam = pendentes
    try { restam = await sincronizarAntesDeSair() } catch { /* restam = as de antes */ }
    if (restam > 0) {
      setSaindo(false)
      setErro(restam === 1
        ? 'Não foi possível enviar a alteração agora. Ela continua guardada neste aparelho.'
        : `Não foi possível enviar ${restam} alterações agora. Elas continuam guardadas neste aparelho.`)
      return
    }
    clearTokenAndRedirect()
  }

  const sairMesmoAssim = () => {
    setSaindo(true)
    clearTokenAndRedirect()
  }

  return {
    sair, saindo,
    aviso: {
      aberto, pendentes, online: dbStatus === 'connected', saindo, erro,
      sincronizarESair, sairMesmoAssim, cancelar: () => { if (!saindo) setAberto(false) },
    },
  }
}
