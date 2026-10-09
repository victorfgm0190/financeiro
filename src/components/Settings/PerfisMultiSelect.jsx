import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { rotuloPerfis } from '../../lib/categoriasPerfil'

// Seleção múltipla compacta de perfis (categorias por perfil). Vazio = "Todos".
// O painel é portado para o body: a lista de categorias rola (overflow) e cortaria um absolute.
export default function PerfisMultiSelect({ value, onChange, profiles, className = '' }) {
  const ids = Array.isArray(value) ? value : []
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState(null)
  const btnRef = useRef(null)
  const panelRef = useRef(null)

  const abrir = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.max(r.width, 200)
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8)
    const embaixo = window.innerHeight - r.bottom > 180
    setStyle({
      position: 'fixed', left, width, zIndex: 9999,
      ...(embaixo ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }),
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const fora = (e) => {
      if (btnRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const rolou = (e) => { if (!panelRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', fora)
    window.addEventListener('scroll', rolou, true)
    return () => {
      document.removeEventListener('mousedown', fora)
      window.removeEventListener('scroll', rolou, true)
    }
  }, [open])

  const toggle = (id) => onChange(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  // Perfil já excluído continua no array gravado; não aparece como opção, mas conta no rótulo.
  const rotulo = rotuloPerfis(ids, profiles)

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : abrir())}
        title="Perfis em que esta categoria aparece nas listas de escolha (nenhum = todos)"
        className={`input w-auto text-xs py-1 text-left truncate ${ids.length ? 'text-indigo-300' : 'text-gray-400'} ${className}`}
      >
        Perfis: {rotulo}
      </button>
      {open && style && createPortal(
        <div
          ref={panelRef}
          style={style}
          onClick={e => e.stopPropagation()}
          className="bg-surface border border-gray-700 rounded-lg shadow-2xl py-1"
        >
          <button
            type="button"
            onClick={() => onChange([])}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-800 ${ids.length === 0 ? 'text-indigo-300 font-medium' : 'text-gray-300'}`}
          >
            Todos os perfis
          </button>
          <div className="border-t border-gray-800 my-1" />
          {(profiles || []).length === 0 && (
            <p className="px-3 py-1.5 text-xs text-gray-600">Nenhum perfil cadastrado.</p>
          )}
          {(profiles || []).map(p => (
            <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800 cursor-pointer">
              <input
                type="checkbox"
                className="accent-indigo-500 shrink-0"
                checked={ids.includes(p.id)}
                onChange={() => toggle(p.id)}
              />
              <span className="truncate flex-1">{p.name}</span>
              <span className="text-[10px] text-gray-500 shrink-0">{p.type === 'pj' ? 'CNPJ' : 'CPF'}</span>
            </label>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
