import { CreditCard } from 'lucide-react'
import { ROTULO_PAGAMENTO_CARTAO } from '../../lib/rotuloMovimento'

// Selo do PAGAMENTO DE CARTÃO (pagamento de fatura) — só exibição; por dentro é transferência
// (src/lib/rotuloMovimento.js). Tokens do tema (primary), claro e escuro.
export default function SeloPagamentoCartao({ tamanho = 10, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs bg-primary/15 text-primary-fg px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${className}`}
      title="Pagamento de fatura do cartão — conta como transferência, não como despesa (as compras já contaram)">
      <CreditCard size={tamanho} aria-hidden /> {ROTULO_PAGAMENTO_CARTAO}
    </span>
  )
}
