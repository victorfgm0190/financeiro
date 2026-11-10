import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { clearTokenAndRedirect } from '../../lib/api'
import { MOBILE_MEDIA_QUERY } from '../../lib/breakpoints'
import { useBackupLocal, podeFazerBackup } from '../../hooks/useBackupLocal'
import { perguntarAoSair, suportaPasta, permissaoDaPasta, gravarNaPasta, escolherPasta, tipoDeErroDaPasta } from '../../lib/backupPasta'
import { exportarBackup, baixarArquivo } from '../../lib/backupCliente'

// "Sair" (sidebar, topo, menu Mais). Sem pendências na fila: encerra a sessão DIRETO (antes tenta
// enviar o que estiver em andamento). COM pendências: abre o aviso (AvisoSairModal) — "Sincronizar e
// sair" (padrão; sem internet fica desabilitado), "Sair mesmo assim" ou "Cancelar". Sair nunca apaga
// a fila: ela e o cache ficam no aparelho e vão no próximo login do mesmo usuário. Sem token, o app
// volta ao Login e nada do cache aparece antes de entrar. ("Apagar dados do aparelho" é outro botão.)
//
// BACKUP AO SAIR (só no computador, só administrador com todos os perfis, com "Perguntar ao sair"
// ligado em Configurações → Backup): antes de tudo pergunta "Deseja fazer backup antes de sair?".
// Sim → backup completo com progresso, gravado na pasta escolhida (ou baixado para Downloads no
// navegador sem pasta) e depois o Sair normal. Não → Sair normal. Erro → avisa e oferece outra pasta,
// Downloads, tentar de novo ou sair sem backup — o Sair nunca fica preso. No celular não pergunta.
export const noCelular = (w = globalThis.window) => !!w?.matchMedia?.(MOBILE_MEDIA_QUERY).matches

export function deveperguntarBackup({ cfg, sessao, celular }) {
  return !celular && !!cfg && podeFazerBackup(sessao) && perguntarAoSair(cfg)
}

export function useSair() {
  const { sincronizarAntesDeSair, filaPendentes, dbStatus } = useApp()
  const { cfg, atualizar, sessao } = useBackupLocal()
  const [saindo, setSaindo] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState('')
  const [backup, setBackup] = useState(null) // null | { fase: 'pergunta'|'progresso'|'erro', tipo?, mensagem?, prog? }
  const pendentes = filaPendentes?.length || 0

  const sairDeVez = async ({ atraso = 0 } = {}) => {
    if (pendentes > 0) { setErro(''); setAberto(true); return }
    setSaindo(true)
    try { await sincronizarAntesDeSair() } catch { /* a fila continua no aparelho */ }
    // Download para a pasta Downloads: dá tempo do navegador começar a baixar antes de recarregar.
    if (atraso) await new Promise(r => setTimeout(r, atraso))
    clearTokenAndRedirect()
  }

  const sair = async () => {
    if (saindo || backup) return
    if (deveperguntarBackup({ cfg, sessao, celular: noCelular() })) { setBackup({ fase: 'pergunta' }); return }
    await sairDeVez()
  }

  // destino: undefined = o configurado (pasta, se houver e o navegador permitir) | 'downloads' | pasta.
  const fazerBackup = async (destino) => {
    const pasta = destino === 'downloads' ? null : (destino?.kind === 'directory' ? destino : (suportaPasta() ? cfg?.pasta || null : null))
    setBackup({ fase: 'progresso', prog: null })
    try {
      if (pasta) {
        // Primeiro passo do clique em "Sim": o navegador só pede permissão a partir de um clique.
        const perm = await permissaoDaPasta(pasta, { pedir: true })
        if (perm !== 'granted') { setBackup({ fase: 'erro', tipo: 'permissao' }); return }
      }
      const { texto, nome } = await exportarBackup({ onProgresso: (prog) => setBackup({ fase: 'progresso', prog }) })
      if (pasta) await gravarNaPasta(pasta, nome, texto, { ambiente: sessao?.ambSigla, manter: cfg?.manter })
      else baixarArquivo(nome, texto)
      await atualizar({ ultimo: Date.now() })
      setBackup(null)
      await sairDeVez({ atraso: pasta ? 0 : 1500 })
    } catch (err) {
      setBackup({ fase: 'erro', tipo: pasta ? tipoDeErroDaPasta(err) : 'backup', mensagem: err?.message || String(err) })
    }
  }

  const outraPasta = async () => {
    try {
      const p = await escolherPasta()
      await atualizar({ pasta: p, nomePasta: p.name })
      await fazerBackup(p)
    } catch (err) {
      if (err?.name !== 'AbortError') setBackup({ fase: 'erro', tipo: 'pasta', mensagem: err?.message || String(err) })
    }
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
      backup: {
        estado: backup,
        suporte: suportaPasta(),
        nomePasta: cfg?.pasta ? (cfg.nomePasta || cfg.pasta.name) : '',
        sim: () => fazerBackup(),
        nao: () => { setBackup(null); sairDeVez() },
        tentarDeNovo: () => fazerBackup(),
        outraPasta,
        baixar: () => fazerBackup('downloads'),
        sairSemBackup: () => { setBackup(null); sairDeVez() },
        cancelar: () => { if (backup?.fase !== 'progresso') setBackup(null) },
      },
    },
  }
}
