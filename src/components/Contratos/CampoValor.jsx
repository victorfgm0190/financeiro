import InputMoeda from '../shared/InputMoeda'
import { parseValorBR, formatarMoedaBR } from '../../lib/valorBR'

// Campo de valor em R$ do módulo de Contratos: o InputMoeda do app, mas o módulo guarda TEXTO no padrão
// BR ("3.900,00") e o valida com parseValorBR (src/lib/contratos/validacao.js) — então entra e sai
// texto. O texto de exemplo fica mais apagado que um valor.
export default function CampoValor({ value, onChange, placeholder, className = 'input', ...rest }) {
  const n = parseValorBR(value)
  return (
    <InputMoeda
      {...rest}
      className={`${className} placeholder:text-texto-3 placeholder:opacity-60`}
      value={Number.isFinite(n) ? n : ''}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value === '' ? '' : formatarMoedaBR(e.target.value))}
    />
  )
}
