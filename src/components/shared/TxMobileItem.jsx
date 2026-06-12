import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, CheckCircle2, ChevronRight } from 'lucide-react'
import { fmt } from './utils'

// Metadados de exibição por tipo de movimentação. Paleta acessível do app:
// receita = azul, despesa = laranja, transferência = cinza, pagamento = esmeralda.
// (sem verde/vermelho como semântica de "bom/ruim" nos valores principais)
const TYPE_META = {
  income:         { label: 'Receita',       Icon: ArrowDownCircle, color: 'text-blue-600',    bg: 'bg-blue-500/10' },
  expense:        { label: 'Despesa',        Icon: ArrowUpCircle,   color: 'text-orange-600',  bg: 'bg-orange-500/10' },
  transfer:       { label: 'Transferência',  Icon: ArrowLeftRight,  color: 'text-gray-400',    bg: 'bg-gray-700/50' },
  credit_payment: { label: 'Pagamento',      Icon: CheckCircle2,    color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
}

// Card de lançamento estilo app bancário — usado apenas no mobile (< md).
// title  = favorecido em destaque (cai para a descrição quando vazio)
// trailing = nó opcional renderizado abaixo do valor (ex.: saldo, badge)
// leading  = nó opcional à esquerda do chevron (ex.: toggle de reconciliação)
export default function TxMobileItem({
  type, typeLabel, title, subtitle, dateLabel,
  amount, amountColor, onClick, trailing, leading, dimmed,
}) {
  const meta = TYPE_META[type] || TYPE_META.expense
  const Icon = meta.Icon
  const valueColor = amountColor || meta.color
  const clickable = !!onClick

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-800/60 last:border-0 transition-colors ${
        clickable ? 'cursor-pointer active:bg-gray-800/50' : ''
      } ${dimmed ? 'opacity-60' : ''}`}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${meta.bg}`}>
        <Icon size={16} className={meta.color} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-gray-500 leading-tight">
          {typeLabel || meta.label}{dateLabel ? ` · ${dateLabel}` : ''}
        </p>
        <p className="text-sm font-semibold text-gray-100 truncate leading-tight mt-0.5">{title}</p>
        {subtitle && <p className="text-xs text-gray-500 truncate leading-tight mt-0.5">{subtitle}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold whitespace-nowrap ${valueColor}`}>{fmt(amount)}</p>
        {trailing}
      </div>
      {leading}
      {clickable && <ChevronRight size={16} className="text-gray-600 shrink-0" />}
    </div>
  )
}
