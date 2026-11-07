import { Plus, Trash2 } from 'lucide-react'
import CategorySelect from '../shared/CategorySelect'
import CampoValor from './CampoValor'
import { TIPOS_TAXA, novaTaxaForm, avisoTaxa, parcelasDoTexto } from '../../lib/contratos/taxasRepasseForm'
import { valorBRFormatado } from '../../lib/valorBR'

// Taxas da administradora no cadastro do contrato a receber: tarifa fixa (todo mês, de/até uma
// competência) e taxa única em parcelas de valor livre (ex.: intermediação = 1º aluguel).
export default function TaxasRepasse({ linhas, onChange, categories, perfilId, inicio }) {
  const setL = (i, campos) => onChange(linhas.map((l, j) => (j === i ? { ...l, ...campos } : l)))
  return (
    <div className="sm:col-span-2 space-y-2" data-guia="contrato-form.taxas-repasse">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label mb-0">Tarifas e taxas da administradora</p>
        <div className="flex gap-2">
          {Object.keys(TIPOS_TAXA).map(k => (
            <button key={k} type="button" className="btn-secondary text-xs py-1 flex items-center gap-1" onClick={() => onChange([...linhas, novaTaxaForm(k, inicio)])}>
              <Plus size={12} /> {k === 'tarifa_fixa' ? 'Tarifa fixa' : 'Taxa única'}
            </button>
          ))}
        </div>
      </div>
      {linhas.length === 0 && <p className="text-[11px] text-texto-3">Nenhuma. Tarifa bancária, taxa de intermediação e afins descontadas no repasse.</p>}
      {linhas.map((l, i) => {
        const unica = l.tipo_repasse === 'taxa_unica'
        const aviso = avisoTaxa(l)
        const n = parcelasDoTexto(l.parcelas)?.length || 0
        return (
          <div key={i} className="p-2 rounded-lg bg-surface-2/60 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-texto-3">{TIPOS_TAXA[l.tipo_repasse]}</p>
              <button type="button" className="p-1 text-texto-3 hover:text-perigo" title="Remover" onClick={() => onChange(linhas.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input autoComplete="off" className="input py-1.5 text-sm col-span-2" placeholder={unica ? 'Ex.: Taxa de intermediação' : 'Ex.: Tarifa bancária'}
                aria-label="Descrição da taxa" value={l.descricao} onChange={e => setL(i, { descricao: e.target.value })} maxLength={200} />
              <CampoValor className="input py-1.5 text-sm" placeholder={unica ? 'Total' : 'Valor por mês'} aria-label={unica ? 'Valor total da taxa' : 'Valor da tarifa'}
                value={l.valor} onChange={v => setL(i, { valor: v })} />
              <label className="flex items-center gap-1 text-[11px] text-texto-2">
                <input type="checkbox" className="accent-primary" checked={!!l.dedutivel_ir} onChange={e => setL(i, { dedutivel_ir: e.target.checked })} />
                Dedutível IR
              </label>
              <label className="text-[11px] text-texto-3 col-span-1">
                {unica ? 'Competência da 1ª parcela' : 'A partir da competência'}
                <input type="month" className="input py-1 text-sm" aria-label={unica ? 'Competência da 1ª parcela' : 'Competência inicial'} value={l.vigencia_inicio}
                  onChange={e => setL(i, { vigencia_inicio: e.target.value })} />
              </label>
              {unica ? (
                <label className="text-[11px] text-texto-3 col-span-1 sm:col-span-2">
                  Valor de cada parcela ({n || 0}) — separe com ";"
                  <input autoComplete="off" className="input py-1 text-sm" placeholder="Ex.: 470,00; 865,00; 865,00" aria-label="Valores das parcelas"
                    value={l.parcelas} onChange={e => setL(i, { parcelas: e.target.value })}
                    onBlur={() => { const v = parcelasDoTexto(l.parcelas); if (v) setL(i, { parcelas: v.map(valorBRFormatado).join('; ') }) }} />
                </label>
              ) : (
                <label className="text-[11px] text-texto-3 col-span-1">
                  Até a competência (opcional)
                  <input type="month" className="input py-1 text-sm" aria-label="Competência final" value={l.vigencia_fim}
                    onChange={e => setL(i, { vigencia_fim: e.target.value })} />
                </label>
              )}
              <div className="col-span-2 sm:col-span-1 min-w-0">
                <p className="text-[11px] text-texto-3">Categoria</p>
                <CategorySelect categories={categories} value={l.categoria_id} onChange={e => setL(i, { categoria_id: e.target.value })} type="expense" perfilId={perfilId || null} searchable placeholder="A da taxa de adm." />
              </div>
            </div>
            {aviso && <p className="text-[11px] text-aviso">⚠ {aviso} Dá para gravar assim mesmo.</p>}
          </div>
        )
      })}
    </div>
  )
}
