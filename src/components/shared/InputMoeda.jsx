import { useEffect, useRef, useState } from 'react'
import { parseMoedaBR, formatarMoedaBR, moedaParaEdicao } from '../../lib/valorBR'

// Valor canônico (o que um <input type="number"> entregaria): "1500.5", "-20", "" — os consumidores
// seguem fazendo Number()/parseFloat() como antes. A máscara é só visual.
const canonico = (v) => {
  if (v === '' || v == null) return ''
  const n = typeof v === 'number' ? v : parseMoedaBR(v)
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : ''
}

// O evento real, com `target.value`/`currentTarget.value` trocados pelo canônico: o handler segue
// lendo e.target.value e pode usar e.target.blur(), e.key, e.preventDefault() etc.
const comValor = (e, value) => {
  const trocar = (el) => (el ? new Proxy(el, {
    get(o, k) {
      if (k === 'value') return value
      const v = o[k]
      return typeof v === 'function' ? v.bind(o) : v
    },
  }) : el)
  const target = trocar(e.target)
  const currentTarget = trocar(e.currentTarget)
  return new Proxy(e, {
    get(o, k) {
      if (k === 'target') return target
      if (k === 'currentTarget') return currentTarget
      const v = o[k]
      return typeof v === 'function' ? v.bind(o) : v
    },
  })
}

// Campo de valor em R$ (único para todo o app). Digitação livre (dígitos, vírgula, ponto; sinal só com
// `negativo`); ao sair formata "1.500,50"; ao entrar mostra "1500,50" e seleciona tudo. Colar
// "R$ 1.234,56" funciona. Vazio continua vazio (filtros nunca viram 0,00).
// `value`: número ou texto numérico ("20", 20, ""). `onChange(e)`: e.target.value = canônico.
// `min`/`max`/`required`: validação nativa do formulário (setCustomValidity), como no type="number".
// onBlur/onKeyDown do consumidor recebem o mesmo e.target.value canônico; o blur NÃO chama onChange.
export default function InputMoeda({
  value, onChange, onBlur, onFocus, onKeyDown, negativo = false, min, max, name,
  className = 'input', placeholder = '0,00',
  type: _type, step: _step, ...rest // eslint-disable-line no-unused-vars
}) {
  const ref = useRef(null)
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const atual = canonico(value)

  const exibido = editando ? texto : formatarMoedaBR(atual)

  // Validação nativa (o form barra o submit como fazia o min/max do type="number").
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let msg = ''
    const temDigito = /\d/.test(editando ? texto : atual)
    if (editando && temDigito && !Number.isFinite(parseMoedaBR(texto))) msg = 'Valor inválido'
    else if (atual !== '') {
      const n = Number(atual)
      if (min != null && min !== '' && n < Number(min)) {
        msg = Number(min) > 0 ? 'Informe um valor maior que zero' : `O valor deve ser no mínimo ${formatarMoedaBR(min)}`
      } else if (max != null && max !== '' && n > Number(max)) {
        msg = `O valor deve ser no máximo ${formatarMoedaBR(max)}`
      }
    }
    el.setCustomValidity(msg)
  }, [atual, texto, editando, min, max])

  return (
    <input
      {...rest}
      ref={ref}
      name={name}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={className}
      placeholder={placeholder}
      value={exibido}
      onFocus={(e) => {
        const aoEntrar = moedaParaEdicao(atual)
        setTexto(aoEntrar)
        setEditando(true)
        // Seleciona depois do re-render (o texto muda para a versão sem milhar) — mas só se nada foi
        // digitado nesse meio-tempo, senão a próxima tecla apagaria o que já se digitou.
        const el = e.currentTarget
        requestAnimationFrame(() => { if (document.activeElement === el && el.value === aoEntrar) el.select() })
        onFocus?.(e)
      }}
      onChange={(e) => {
        let t = e.target.value.replace(negativo ? /[^\d.,-]/g : /[^\d.,]/g, '')
        if (negativo) t = (t.trimStart().startsWith('-') || /^\s*(R\$\s*)?-/.test(e.target.value) ? '-' : '') + t.replace(/-/g, '')
        // Vírgula é decimal: no máximo 2 casas depois dela (a 3ª tecla é ignorada; "1,234" colado → "1,23").
        const v = t.lastIndexOf(',')
        if (v >= 0 && t.indexOf('.', v) < 0) t = t.slice(0, v + 1) + t.slice(v + 1).replace(/[^\d]/g, '').slice(0, 2)
        setTexto(t)
        if (!editando) setEditando(true)
        const novo = /\d/.test(t) ? canonico(negativo ? t : t.replace(/-/g, '')) : ''
        if (novo !== atual) onChange?.(comValor(e, novo))
      }}
      onBlur={(e) => {
        setEditando(false)
        onBlur?.(comValor(e, atual))
      }}
      onKeyDown={onKeyDown ? (e) => onKeyDown(comValor(e, editando ? (/\d/.test(texto) ? canonico(texto) : '') : atual)) : undefined}
    />
  )
}
