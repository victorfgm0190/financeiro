import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSessao } from '../lib/api'
import { temTodosPerfis } from '../lib/permissoes'
import { backendBackup, nomeDoBancoBackup, lerConfig, salvarConfig } from '../lib/backupPasta'

// Quem pode exportar/restaurar backup (a API confere de novo): administrador com todos os perfis.
export const podeFazerBackup = (sessao = getSessao()) => sessao?.nivel === 'admin' && temTodosPerfis(sessao?.perfis)

// Preferências do backup NESTE aparelho (pasta, perguntar ao sair, quantos manter, último backup).
// cfg = null enquanto carrega.
export function useBackupLocal() {
  const sessao = useMemo(() => getSessao(), [])
  const backend = useMemo(() => backendBackup(nomeDoBancoBackup(sessao)), [sessao])
  const [cfg, setCfg] = useState(null)
  useEffect(() => {
    let vivo = true
    lerConfig(backend).then(c => { if (vivo) setCfg(c) })
    return () => { vivo = false }
  }, [backend])
  const atualizar = useCallback(async (parcial) => {
    const novo = await salvarConfig(backend, parcial)
    setCfg(novo)
    return novo
  }, [backend])
  return { cfg, atualizar, sessao }
}
