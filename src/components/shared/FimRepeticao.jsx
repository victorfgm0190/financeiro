import { useState } from 'react'
import DateInput from './DateInput'
import { ocorrenciasAte } from '../../lib/assistente/prontidao'
import { fmtDate } from './utils'

// Até quando repete: Sem fim | Número de vezes | Até a data. "Até a data" calcula o nº de ocorrências
// a partir de `inicio` (inclusive) e mostra a última. O que fica gravado é o de sempre:
// occurrenceType ('continuous' | 'installment') + installments.
//   onChange({ occurrenceType, installments })
export default function FimRepeticao({ inicio, recorrencia, occurrenceType, installments, onChange, rotuloVezes = 'Nº de vezes', rotuloModoVezes = 'Número de vezes' }) {
  const [modo, setModo] = useState(occurrenceType === 'installment' ? 'vezes' : 'sem')
  const [ate, setAte] = useState('')
  const calc = modo === 'data' && ate ? ocorrenciasAte({ inicio, ate, recorrencia }) : null

  const escolher = (m) => {
    setModo(m)
    if (m === 'sem') onChange({ occurrenceType: 'continuous', installments: 0 })
    else if (m === 'vezes') onChange({ occurrenceType: 'installment', installments: Math.max(2, Number(installments) || 2) })
    else if (ate) mudarAte(ate)
  }
  const mudarAte = (v) => {
    setAte(v)
    const r = v ? ocorrenciasAte({ inicio, ate: v, recorrencia }) : null
    if (r) onChange({ occurrenceType: 'installment', installments: r.n })
  }

  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Até quando" className="flex rounded-lg overflow-hidden border border-borda-forte">
        {[['sem', 'Sem fim'], ['vezes', rotuloModoVezes], ['data', 'Até a data']].map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={modo === v} onClick={() => escolher(v)}
            className={`flex-1 py-2 text-xs sm:text-sm font-medium transition-colors ${modo === v ? 'bg-primary/15 text-primary-fg' : 'bg-surface-2 text-texto-2 hover:bg-surface-hover'}`}>
            {l}
          </button>
        ))}
      </div>
      {modo === 'vezes' && (
        <div className="w-32">
          <label className="label">{rotuloVezes}</label>
          <input className="input text-center" type="number" min="1" max="360" value={installments || ''}
            onChange={e => onChange({ occurrenceType: 'installment', installments: Math.max(1, Number(e.target.value) || 1) })} />
        </div>
      )}
      {modo === 'data' && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <label className="label">Até</label>
            <DateInput className="input" value={ate} onChange={e => mudarAte(e.target.value)} aria-label="Data final" />
          </div>
          <p className="text-xs text-texto-2 pb-2" role="status">
            {calc ? `${calc.n} ${calc.n === 1 ? 'ocorrência' : 'ocorrências'}, última em ${fmtDate(calc.ultima)}` : ate ? 'Data antes do início' : 'Escolha a data final'}
          </p>
        </div>
      )}
    </div>
  )
}
