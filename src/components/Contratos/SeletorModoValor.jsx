import { useApp } from '../../context/AppContext'
import { MODOS_VALOR } from '../../lib/contratos/despesaReal'
import { ehModoRepasse } from '../../lib/contratos/repasse'

// "Despesa real / Valor pago" dos relatórios por categoria (só aparece com o módulo de Contratos).
// Com contrato a receber por administradora: "Repasse: linha única / por composição" (padrão: linha
// única; por composição = aluguel bruto como receita e as deduções nas categorias delas).
export default function SeletorModoValor({ value, onChange, porComposicao = false, onPorComposicao = null }) {
  const { contratosHabilitado, contratos } = useApp()
  if (!contratosHabilitado) return null
  const temRepasse = !!onPorComposicao && (contratos || []).some(ehModoRepasse)
  return (
    <div className="inline-flex flex-wrap gap-1.5">
    {temRepasse && (
      <div className="inline-flex rounded-lg border border-borda-forte overflow-hidden text-xs" role="group" aria-label="Repasses de aluguel">
        {[[false, 'Repasse: linha única'], [true, 'Por composição']].map(([v, rotulo]) => (
          <button key={rotulo} type="button" onClick={() => onPorComposicao(v)}
            title={v ? 'Aluguel bruto como receita e as deduções da administradora nas categorias delas' : 'O valor que caiu na conta, numa linha só'}
            className={`px-2 py-1 ${porComposicao === v ? 'bg-primary/15 text-primary-fg font-semibold' : 'text-texto-2 hover:bg-surface-hover'}`}>
            {rotulo}
          </button>
        ))}
      </div>
    )}
    <div className="inline-flex rounded-lg border border-borda-forte overflow-hidden text-xs" role="group" aria-label="Valor dos lançamentos de contrato">
      {MODOS_VALOR.map(m => (
        <button key={m.value} type="button" title={m.title} onClick={() => onChange(m.value)}
          className={`px-2 py-1 ${value === m.value ? 'bg-primary/15 text-primary-fg font-semibold' : 'text-texto-2 hover:bg-surface-hover'}`}>
          {m.label}
        </button>
      ))}
    </div>
    </div>
  )
}
