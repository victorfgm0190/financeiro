import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, CreditCard, ChevronRight } from 'lucide-react'
import { fmt } from './utils'
import { ROTULO_PAGAMENTO_CARTAO } from '../../lib/rotuloMovimento'

// Metadados de exibição por tipo de movimentação. Paleta acessível do app:
// receita = azul, despesa = laranja, transferência = cinza, pagamento = esmeralda.
// (sem verde/vermelho como semântica de "bom/ruim" nos valores principais)
const TYPE_META = {
  income:         { label: 'Receita',       Icon: ArrowDownCircle, color: 'text-receita',     bg: 'bg-receita/10' },
  expense:        { label: 'Despesa',        Icon: ArrowUpCircle,   color: 'text-despesa',     bg: 'bg-despesa/10' },
  transfer:       { label: 'Transferência',  Icon: ArrowLeftRight,  color: 'text-transferencia', bg: 'bg-transferencia/10' },
  // Pagamento de fatura (credit_payment antigo ou transferência para o cartão — tipoVisual de
  // src/lib/rotuloMovimento.js): só o rótulo/ícone; por dentro continua transferência.
  credit_payment: { label: ROTULO_PAGAMENTO_CARTAO, Icon: CreditCard, color: 'text-primary-fg', bg: 'bg-primary/10' },
  pagamento_cartao: { label: ROTULO_PAGAMENTO_CARTAO, Icon: CreditCard, color: 'text-primary-fg', bg: 'bg-primary/10' },
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
      className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-borda/60 last:border-0 transition-colors ${
        clickable ? 'cursor-pointer active:bg-surface-hover/50' : ''
      } ${dimmed ? 'opacity-60' : ''}`}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${meta.bg}`}>
        <Icon size={16} className={meta.color} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-texto-3 leading-tight">
          {typeLabel || meta.label}{dateLabel ? ` · ${dateLabel}` : ''}
        </p>
        <p className="text-sm font-semibold text-texto-1 truncate leading-tight mt-0.5">{title}</p>
        {subtitle && <p className="text-xs text-texto-3 truncate leading-tight mt-0.5">{subtitle}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold whitespace-nowrap ${valueColor}`}>{fmt(amount)}</p>
        {trailing}
      </div>
      {leading}
      {clickable && <ChevronRight size={16} className="text-texto-3 shrink-0" />}
    </div>
  )
}
