import { AlertTriangle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { perfisSemContaCentral } from '../../lib/contaCentral'
import Modal from './Modal'

// Operação bloqueada por falta de Conta central no perfil do item (lib/contaCentral). Qualquer
// ponto do app chama setAvisoOperacao(mensagem); este modal, montado uma vez no App, mostra.
export function AvisoOperacao() {
  const { avisoOperacao, setAvisoOperacao } = useApp()
  return (
    <Modal open={!!avisoOperacao} onClose={() => setAvisoOperacao(null)} title="Operação bloqueada" size="sm">
      <div className="flex items-start gap-2.5 mb-5">
        <AlertTriangle size={16} className="shrink-0 mt-0.5 text-aviso" />
        <p className="text-sm text-texto-2 leading-relaxed">{avisoOperacao}</p>
      </div>
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setAvisoOperacao(null)}>Entendi</button>
      </div>
    </Modal>
  )
}

// Banner em Contas e no Painel: perfis que têm cartão, reserva, subconta Ger. ou financiamento e
// nenhuma Conta central. Os processos automáticos desses itens ficam parados até definir uma.
export function BannerPerfisSemContaCentral({ className = '' }) {
  const { accounts, schedules, profiles } = useApp()
  const faltando = perfisSemContaCentral({ accounts, schedules, profiles })
  if (!faltando.length) return null
  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg border border-aviso/30 bg-aviso/10 ${className}`} role="alert">
      <AlertTriangle size={14} className="shrink-0 mt-0.5 text-aviso" />
      <div className="text-xs text-aviso leading-relaxed space-y-0.5">
        {faltando.map(f => (
          <p key={f.perfil.id}>
            O perfil <strong className="text-texto-1">{f.nome}</strong> não tem Conta central. Defina em Contas → editar conta.
            <span className="text-texto-3"> ({f.dependentes.join(', ')} sem pagamento de fatura, gerencial ou resgate automáticos)</span>
          </p>
        ))}
      </div>
    </div>
  )
}
