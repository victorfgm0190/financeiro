import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSessao } from '../lib/api'
import { temTodosPerfis } from '../lib/permissoes'
import { backendBackup, nomeDoBancoBackup, lerConfig, salvarConfig } from '../lib/backupPasta'

// Quem pode exportar/restaurar backup (a API confere de novo): administrador com todos os perfis.
export const podeFazerBackup = (sessao = getSessao()) => sessao?.nivel === 'admin' && temTodosPerfis(sessao?.perfis)

// Preferências do backup NESTE aparelho (pasta, perguntar ao sair, quantos manter, último backup).
// cfg = null só enquanto carrega — e isso tem prazo (lerConfig nunca fica pendurada). `atualizar` muda a
// tela na hora e grava em segundo plano (com prazo): quem chama nunca fica esperando o IndexedDB.
export function useBackupLocal() {
  const sessao = useMemo(() => getSessao(), [])
  const backend = useMemo(() => backendBackup(nomeDoBancoBackup(sessao)), [sessao])
  const [cfg, setCfg] = useState(null)
  const atualRef = useRef(null)
  const carregou = useRef(false)
  useEffect(() => {
    let vivo = true
    lerConfig(backend).then(c => {
      if (!vivo) return
      // Algo já foi alterado antes da leitura terminar: o que a tela tem vale mais.
      const final = atualRef.current ? { ...c, ...atualRef.current } : c
      atualRef.current = final
      carregou.current = true
      setCfg(final)
    })
    return () => { vivo = false }
  }, [backend])
  const atualizar = useCallback(async (parcial) => {
    const novo = { ...(atualRef.current || {}), ...parcial }
    atualRef.current = novo
    setCfg(c => ({ ...(c || {}), ...parcial }))
    // Antes da leitura terminar, grava por cima do que estiver guardado (sem apagar o resto).
    salvarConfig(backend, parcial, carregou.current ? novo : null)
    return novo
  }, [backend])
  return { cfg, atualizar, sessao }
}
