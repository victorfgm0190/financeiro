import { fmt } from '../shared/utils'

// Rateio pelo Assistente com a soma das partes ≠ total: "Faltam R$ 50,00. Em qual categoria?" (as mais
// prováveis) ou "Ajustar o total para R$ 200,00?". Sobrando (partes > total): só ajustar o total.
export default function RateioFaltando({ faltam, soma, categorias = [], categories = [], onCategoria, onAjustarTotal }) {
  const nome = (id) => categories.find(c => c.id === id)
  return (
    <div role="alert" className="rounded-lg border border-aviso/50 bg-aviso/10 px-3 py-2.5 text-sm text-texto-1 space-y-2">
      <p className="font-medium">
        {faltam > 0 ? `Faltam ${fmt(faltam)}. Em qual categoria?` : `As partes passam do total em ${fmt(-faltam)}.`}
      </p>
      {faltam > 0 && categorias.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categorias.map(id => (
            <button key={id} type="button" className="btn-secondary text-xs min-h-[36px]" onClick={() => onCategoria(id)}>
              {nome(id)?.icon ? `${nome(id).icon} ` : ''}{nome(id)?.name || 'Categoria'}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="text-xs text-primary-fg underline min-h-[32px]" onClick={onAjustarTotal}>
        Ajustar o total para {fmt(soma)}?
      </button>
    </div>
  )
}
