import { useState, useRef, useEffect } from 'react'

export default function FavorecidoAutocomplete({ value, onChange, suggestions, placeholder = 'Nome do favorecido' }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [rect, setRect] = useState(null)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  const q = value.toLowerCase()
  const filtered = (value
    ? suggestions.filter(s => s.toLowerCase().includes(q))
    : suggestions
  ).slice(0, 8)

  const updateRect = () => {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect())
  }

  const handleSelect = (item) => {
    onChange(item)
    setOpen(false)
  }

  const handleKeyDown = (e) => {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, -1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      handleSelect(filtered[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (!inputRef.current?.contains(e.target)) setOpen(false) }
    const onScroll = (e) => { if (dropdownRef.current?.contains(e.target)) return; setOpen(false) }
    document.addEventListener('mousedown', onClick)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onClick)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  return (
    <div>
      <input
        ref={inputRef}
        className="input"
        value={value}
        onChange={e => { onChange(e.target.value); updateRect(); setOpen(true); setActive(-1) }}
        onFocus={() => { updateRect(); setOpen(true); setActive(-1) }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && filtered.length > 0 && rect && (
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', left: rect.left, top: rect.bottom + 4, width: rect.width, zIndex: 9999 }}
          className="bg-surface border border-gray-700 rounded-lg shadow-2xl overflow-y-auto max-h-48"
        >
          {filtered.map((item, i) => (
            <button
              key={item}
              type="button"
              onMouseDown={e => { e.preventDefault(); handleSelect(item) }}
              className={`w-full text-left px-3 py-2 text-sm truncate transition-colors ${
                i === active ? 'bg-gray-700 text-gray-100' : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
