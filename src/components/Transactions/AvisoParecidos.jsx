import { AlertTriangle } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'

// Lançamento NOVO parecido com um existente (lib/casamentoFatura parecidosNaCriacao): mesma conta,
// valor ±R$ 0,01, data ±3 dias. Usado no topo da prévia do Assistente e no passo do formulário
// manual. "É o mesmo" não grava nada; "É outro" exige o toque explícito para salvar.
//   onMesmo()      → fecha sem criar (quem chama decide o que fazer com pré-lançamento)
//   onAbrir(tx)    → abre o existente (só lançamentos de verdade, não pré-lançamentos)
//   onOutro()      → salvar mesmo assim
export default function AvisoParecidos({ parecidos, accounts = [], onMesmo, onAbrir, onOutro }) {
  if (!parecidos?.length) return null
  const nomeConta = (id) => { const a = accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : '' }
  const varios = parecidos.length > 1
  return (
    <div role="alert" className="rounded-lg border-2 border-aviso/60 bg-aviso/10 px-3 py-2.5 text-sm text-texto-1 space-y-2">
      <p className="flex items-start gap-2 font-semibold">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-aviso" />
        {varios ? `Já existem ${parecidos.length} lançamentos parecidos:` : 'Já existe um lançamento parecido:'}
      </p>
      <ul className="space-y-1">
        {parecidos.map(t => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6">
            <span className="break-words">
              {t._pre && <span className="text-texto-3">Pré-lançamento: </span>}
              <span className="font-medium">{t.description || t.payee || 'Sem descrição'}</span>
              {' · '}{fmtDate(t.dateCartao ? String(t.dateCartao).slice(0, 10) : t.date)} · {fmt(t.amount)}
              {nomeConta(t.accountId) ? ` · ${nomeConta(t.accountId)}` : ''}
              {t.reconciled ? ' · conciliado' : ''}
            </span>
            {!t._pre && onAbrir && (
              <button type="button" className="text-xs text-primary-fg underline min-h-[32px]" onClick={() => onAbrir(t)}>
                Abrir o existente
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <button type="button" className="btn-secondary flex-1 min-h-[40px]" onClick={onMesmo}>
          É o mesmo — não salvar
        </button>
        <button type="button" className="btn-primary flex-1 min-h-[40px]" onClick={onOutro}>
          É outro — salvar mesmo assim
        </button>
      </div>
    </div>
  )
}
