import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Copy } from 'lucide-react'
import { today } from './utils'

// Botão "Duplicar" para uma linha de extrato. Abre um popover compacto pedindo apenas a DATA
// (hoje pré-preenchida); ao confirmar, chama onConfirm(novaData). O componente é autossuficiente
// (estado + posicionamento próprios) para ser reutilizado nos extratos de Contas e de Cartão.
export default function DuplicateButton({ onConfirm, iconSize = 14, className }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(today())
  const btnRef = useRef(null)
  const popRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (popRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const openPopover = (e) => {
    e.stopPropagation()
    setDate(today())
    setOpen(true)
  }

  const confirm = () => {
    if (!date) return
    setOpen(false)
    onConfirm(date)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openPopover}
        title="Duplicar lançamento"
        className={className || 'p-1.5 text-gray-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded transition-colors'}
      >
        <Copy size={iconSize} />
      </button>
      {open && createPortal(
        <>
          {/* Overlay escuro: cobre a viewport e fecha ao clicar fora. */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            className="bg-black/60"
            onClick={() => setOpen(false)}
          />
          {/* Modal centralizado — funciona igual em desktop e mobile (independe da posição do botão). */}
          <div
            ref={popRef}
            style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 9999 }}
            className="bg-surface border border-gray-700 rounded-lg shadow-2xl p-3 w-[232px] max-w-[calc(100vw-2rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <label className="block text-xs text-gray-400 mb-1.5">Data da cópia</label>
          <input
            type="date"
            className="input w-full text-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirm() } }}
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-2.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2.5 py-1 text-xs text-gray-400 hover:text-gray-200 rounded transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirm}
              className="px-3 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors"
            >
              Duplicar
            </button>
          </div>
          </div>
        </>,
        document.body
      )}
    </>
  )
}
