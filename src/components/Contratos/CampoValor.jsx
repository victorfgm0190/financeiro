import { digitandoValorBR, valorBRFormatado } from '../../lib/valorBR'

// Campo de valor em R$ do módulo de Contratos: aceita só números no padrão BR, no máximo 2 casas,
// e formata ao sair ("3900" → "3.900,00"). O texto de exemplo fica mais apagado que um valor.
export default function CampoValor({ value, onChange, placeholder, className = 'input', ...rest }) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={`${className} placeholder:text-texto-3 placeholder:opacity-60`}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={e => onChange(digitandoValorBR(e.target.value))}
      onBlur={e => { const f = valorBRFormatado(e.target.value); if (f) onChange(f) }}
    />
  )
}
