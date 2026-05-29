import { useEffect, useRef, useCallback } from 'react'

const TS_KEY = 'finup_last_backup_ts'
const INTERVAL_24H = 24 * 60 * 60 * 1000

export function triggerBackupDownload(data) {
  const date = new Date().toISOString().split('T')[0]
  const payload = JSON.stringify(
    { ...data, _exportedAt: new Date().toISOString(), _app: 'finup' },
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

export function getLastBackupTs() {
  const raw = localStorage.getItem(TS_KEY)
  return raw ? Number(raw) : null
}

export function useAutoBackup(data, onAutoBackup) {
  const dataRef = useRef(data)
  useEffect(() => { dataRef.current = data }, [data])
  const intervalRef = useRef(null)

  const doBackup = useCallback(() => {
    triggerBackupDownload(dataRef.current)
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
