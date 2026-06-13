import { useState, useRef, useEffect } from 'react'
import { Calendar } from 'lucide-react'

// ── Helpers ──────────────────────────────────────────────────────────────────
// Valor interno do app é sempre ISO (yyyy-mm-dd), igual ao <input type="date">.
// A exibição é dd/mm/aaaa, e o usuário digita só números (DDMMAAAA).

function isoToDisplay(iso) {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1]}`
}

// Insere as barras conforme os dígitos. Quando `deleting` é true não
// reanexa um separador à direita, para o backspace funcionar corretamente.
function formatDigits(digits, deleting) {
  digits = digits.replace(/\D/g, '').slice(0, 8)
  let out = digits.slice(0, 2)
  if (digits.length >= 2 && !(deleting && digits.length === 2)) out += '/'
  if (digits.length > 2) out += digits.slice(2, 4)
  if (digits.length >= 4 && !(deleting && digits.length === 4)) out += '/'
  if (digits.length > 4) out += digits.slice(4, 8)
  return out
}

// Converte os 8 dígitos para ISO válido, ou '' se incompleto/inválido.
function digitsToIso(digits) {
  digits = digits.replace(/\D/g, '')
  if (digits.length !== 8) return ''
  const dd = digits.slice(0, 2)
  const mm = digits.slice(2, 4)
  const yyyy = digits.slice(4, 8)
  const d = Number(dd), m = Number(mm), y = Number(yyyy)
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1) return ''
  const date = new Date(y, m - 1, d)
  // rejeita datas como 31/02 que "transbordam" para o mês seguinte
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return ''
  return `${yyyy}-${mm}-${dd}`
}

// onChange é chamado no mesmo formato dos call sites antigos (<input type="date">):
//   onChange={e => setX(e.target.value)}   // e.target.value é ISO (ou '')
export default function DateInput({
  value,
  onChange,
  className = 'input',
  required = false,
  disabled = false,
  ...rest
}) {
  const [text, setText] = useState(() => isoToDisplay(value))
  const nativeRef = useRef(null)

  // Sincroniza a exibição quando o valor externo muda (edição, reset de form, etc.)
  // sem atropelar o que o usuário está digitando.
  useEffect(() => {
    const currentIso = digitsToIso(text)
    if ((value || '') !== currentIso) setText(isoToDisplay(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const emit = (iso) => onChange?.({ target: { value: iso } })

  const handleTextChange = (e) => {
    const inputType = e.nativeEvent?.inputType || ''
    const deleting = inputType.startsWith('delete')
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
    setText(formatDigits(digits, deleting))
    emit(digitsToIso(digits))
  }

  const openPicker = () => {
    const el = nativeRef.current
    if (!el) return
    try { el.showPicker() } catch { el.focus() }
  }

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        className={`${className} pr-9`}
        value={text}
        onChange={handleTextChange}
        required={required}
        disabled={disabled}
        {...rest}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={openPicker}
        disabled={disabled}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 disabled:opacity-40"
        aria-label="Abrir calendário"
      >
        <Calendar size={14} />
      </button>
      {/* Fallback nativo: alimenta o seletor de calendário sem aparecer no layout.
          Ocupa a área do ícone (caixa real) para o showPicker() ter onde ancorar. */}
      <input
        ref={nativeRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value || ''}
        onChange={(e) => emit(e.target.value)}
        className="absolute right-0 top-0 h-full w-9 opacity-0 pointer-events-none"
      />
    </div>
  )
}
