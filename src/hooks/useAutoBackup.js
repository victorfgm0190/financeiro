import { useEffect, useRef, useCallback } from 'react'
import { loadAccountMappings } from '../lib/db'

const TS_KEY = 'finup_last_backup_ts'
const INTERVAL_24H = 24 * 60 * 60 * 1000

// Gera e baixa o JSON de backup. `accountMapping` (tabela account_mapping do Neon,
// que vive fora do estado `data`) é incluído sob a chave `_accountMapping` quando fornecido.
export function triggerBackupDownload(data, accountMapping = null) {
  const date = new Date().toISOString().split('T')[0]
  const payload = JSON.stringify(
    {
      ...data,
      ...(Array.isArray(accountMapping) ? { _accountMapping: accountMapping } : {}),
      _exportedAt: new Date().toISOString(),
      _app: 'finup',
    },
    null,
    2,
  )
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `finup-backup-${date}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  localStorage.setItem(TS_KEY, String(Date.now()))
}

// Backup COMPLETO: busca a tabela account_mapping no Neon (não está em `data`) e
// inclui no arquivo, garantindo que todas as tabelas citadas no backup sejam exportadas.
export async function downloadFullBackup(data) {
  let accountMapping
  try { accountMapping = await loadAccountMappings() } catch { accountMapping = [] }
  triggerBackupDownload(data, accountMapping)
}

export function getLastBackupTs() {
  const raw = localStorage.getItem(TS_KEY)
  return raw ? Number(raw) : null
}

export function useAutoBackup(data, onAutoBackup) {
  const dataRef = useRef(data)
  useEffect(() => { dataRef.current = data }, [data])
  const intervalRef = useRef(null)

  const doBackup = useCallback(() => {
    downloadFullBackup(dataRef.current)
    onAutoBackup?.()
  }, [onAutoBackup])

  useEffect(() => {
    const last = getLastBackupTs()
    const now = Date.now()

    // Calculate delay until next backup:
    // - Never backed up → wait 24h before first auto-backup
    // - Last backup was > 24h ago → trigger after 30s (let app settle)
    // - Last backup within 24h → wait the remainder
    let delay
    if (!last) {
      delay = INTERVAL_24H
    } else {
      const elapsed = now - last
      delay = elapsed >= INTERVAL_24H ? 30_000 : INTERVAL_24H - elapsed
    }

    const t = setTimeout(() => {
      doBackup()
      intervalRef.current = setInterval(doBackup, INTERVAL_24H)
    }, delay)

    return () => {
      clearTimeout(t)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [doBackup])
}
