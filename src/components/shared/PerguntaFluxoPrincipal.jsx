// "Considerar no Fluxo de Caixa principal?" (Sim/Não) — formulário de agendamento e de provisão.
// `pergunta` vem de perguntaFluxoPrincipal (lib/fluxoPrincipal); `valor` null = padrão da pergunta.
export default function PerguntaFluxoPrincipal({ pergunta, valor, onChange, className = '' }) {
  if (!pergunta) return null
  const marcado = valor ?? pergunta.padrao
  return (
    <div className={`flex items-start justify-between gap-3 rounded-lg bg-surface-2/40 px-3 py-2.5 ${className}`}>
      <div className="min-w-0">
        <p className="text-sm text-texto-2">Considerar no Fluxo de Caixa principal?</p>
        {pergunta.dica && <p className="text-[11px] text-texto-3 mt-0.5">{pergunta.dica}</p>}
      </div>
      <div className="flex shrink-0 rounded-lg border border-borda-campo overflow-hidden text-xs" role="group" aria-label="Considerar no Fluxo de Caixa principal">
        {[[true, 'Sim'], [false, 'Não']].map(([v, rotulo]) => (
          <button
            key={rotulo}
            type="button"
            aria-pressed={marcado === v}
            onClick={() => onChange(v)}
            className={`px-3 py-1.5 transition-colors ${marcado === v ? 'bg-primary text-white' : 'text-texto-2 hover:bg-surface-hover'}`}
          >
            {rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}
