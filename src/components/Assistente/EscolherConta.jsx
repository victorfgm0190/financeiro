import { useState } from 'react'
import { CreditCard, Star } from 'lucide-react'
import { papelDaContaApp } from '../../lib/assistente/contas'

// Prévia do Assistente sem conta (nenhuma citada e sem favorita no perfil ativo, ou perfil "Tudo",
// ou cartão ambíguo): "Em qual conta?" com só as SUGERÍVEIS (cartões de uso comum + favoritas) e
// "Outra conta…", que abre todas as contas ativas — nunca as subcontas gerenciais.
// `opcoes` (ids): "final 4541" de mais de um cartão → pergunta só entre eles.
// `finalSemCartao`: nenhum cartão tem esse final → avisa (a prévia oferece salvar depois).
export default function EscolherConta({ accounts, activeProfileId, onEscolher, opcoes = null, finalSemCartao = null }) {
  const [outra, setOutra] = useState(false)
  const nome = (a) => a.apelido || a.name
  const sugeriveis = (opcoes?.length ? accounts.filter(a => opcoes.includes(a.id)) : accounts.filter(a => papelDaContaApp(a, activeProfileId) === 'sugerivel'))
    .sort((a, b) => (a.type === 'credit') - (b.type === 'credit'))
  const todas = accounts.filter(a => a.active !== false && papelDaContaApp(a) !== 'gerencial')
    .sort((a, b) => nome(a).localeCompare(nome(b), 'pt-BR'))
  return (
    <div className="rounded-lg border border-aviso/50 bg-aviso/10 px-3 py-2.5 space-y-2">
      <p className="text-sm font-medium text-texto-1">
        {opcoes?.length ? 'Mais de um cartão tem esse final. Qual foi?' : 'Em qual conta?'}
      </p>
      {finalSemCartao && <p className="text-xs text-texto-2">Nenhum cartão tem o final {finalSemCartao} cadastrado.</p>}
      <div className="flex flex-wrap gap-2">
        {sugeriveis.map(a => (
          <button key={a.id} type="button" onClick={() => onEscolher(a.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-borda-forte bg-surface px-3 min-h-[40px] text-sm text-texto-1 hover:bg-surface-hover">
            {a.type === 'credit' ? <CreditCard size={14} className="text-texto-3" /> : <Star size={14} className="text-aviso" />}
            {nome(a)}
          </button>
        ))}
        {!outra && (
          <button type="button" onClick={() => setOutra(true)} className="rounded-lg px-3 min-h-[40px] text-sm text-primary-fg hover:text-texto-1">
            Outra conta…
          </button>
        )}
      </div>
      {outra && (
        <select className="input" defaultValue="" onChange={e => e.target.value && onEscolher(e.target.value)} aria-label="Outra conta">
          <option value="" disabled>Escolha a conta…</option>
          {todas.map(a => <option key={a.id} value={a.id}>{nome(a)}</option>)}
        </select>
      )}
    </div>
  )
}
