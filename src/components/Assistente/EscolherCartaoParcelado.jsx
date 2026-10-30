import { CreditCard, Landmark } from 'lucide-react'
import { fmt } from '../shared/utils'

// Compra PARCELADA sem conta/cartão citados: "Compra de R$ 300,00 em 3x. Em qual cartão?" — um botão
// por cartão de crédito ativo do perfil (mais usados primeiro, lib/assistente cartoesParaParcelado)
// e "Não foi no cartão" (a prévia pergunta a conta e abre um agendamento parcelado).
export default function EscolherCartaoParcelado({ valor, parcelas, cartoes, onCartao, onSemCartao }) {
  return (
    <div className="rounded-lg border border-aviso/50 bg-aviso/10 px-3 py-2.5 space-y-2">
      <p className="text-sm font-medium text-texto-1">
        Compra de {fmt(Number(valor) || 0)} em {parcelas}x. Em qual cartão?
      </p>
      <div className="flex flex-wrap gap-2">
        {cartoes.map(a => (
          <button key={a.id} type="button" onClick={() => onCartao(a.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-borda-forte bg-surface px-3 min-h-[40px] text-sm text-texto-1 hover:bg-surface-hover">
            <CreditCard size={14} className="text-texto-3" />
            {a.apelido || a.name}
          </button>
        ))}
        <button type="button" onClick={onSemCartao}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 min-h-[40px] text-sm text-primary-fg hover:text-texto-1">
          <Landmark size={14} />
          Não foi no cartão
        </button>
      </div>
    </div>
  )
}
