export const STORAGE_KEY = 'finup_v1'
const KEY = STORAGE_KEY

export function saveLocal(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch (e) {
    console.warn('[Storage] write failed:', e)
  }
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    console.warn('[Storage] read failed:', e)
    return null
  }
}
