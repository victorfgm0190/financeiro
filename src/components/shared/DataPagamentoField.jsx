import DateInput from './DateInput'
import { fmtDate } from './utils'
import { hojeSP, normalizarVencimento } from '../../lib/dataPagamento'

// Campo de data dos modais de pagamento/confirmação: o DateInput de sempre + atalhos "Hoje" e
// "Vencimento". O valor inicial é do chamador (dataPadraoPagamento(vencimento) em
// lib/dataPagamento.js); aqui só os botões. "Vencimento" só aparece quando há vencimento e a
// data do campo é outra. onChange segue o DateInput: onChange({ target: { value: 'YYYY-MM-DD' } }).
// `compact` = versão de linha de lista (botões menores, sem esticar o campo).
export default function DataPagamentoField({ value, onChange, vencimento, className = 'input', compact = false, disabled = false, ...rest }) {
  const venc = normalizarVencimento(vencimento)
  const hoje = hojeSP()
  const emit = (iso) => onChange?.({ target: { value: iso } })
  const botao = `shrink-0 rounded-md border font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
    compact ? 'px-1.5 py-0.5 text-[11px]' : 'min-h-[44px] md:min-h-0 px-3 md:px-2.5 md:py-1 text-xs'}`
  const neutro = 'border-borda-campo bg-surface-2 text-texto-2 hover:bg-surface-hover hover:text-texto-1'
  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-1 justify-end' : 'gap-1.5'}`}>
      <div className={compact ? 'w-36 shrink-0' : 'flex-1 min-w-[9.5rem]'}>
        <DateInput className={className} value={value} onChange={onChange} disabled={disabled} {...rest} />
      </div>
      <button
        type="button"
        onClick={() => emit(hoje)}
        disabled={disabled}
        aria-pressed={value === hoje}
        className={`${botao} ${value === hoje ? 'border-primary text-primary-fg bg-surface-2' : neutro}`}
        title={`Usar a data de hoje (${fmtDate(hoje)})`}
      >
        Hoje
      </button>
      {venc && value !== venc && (
        <button
          type="button"
          onClick={() => emit(venc)}
          disabled={disabled}
          className={`${botao} ${neutro}`}
          title={`Voltar para o vencimento (${fmtDate(venc)})`}
        >
          Vencimento
        </button>
      )}
    </div>
  )
}
