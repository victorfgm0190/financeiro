import { useState, useMemo } from 'react'
import { X, ChevronRight, Calendar, Tag, PencilLine } from 'lucide-react'
import { fmt, fmtDate } from './utils'
import CategorySelect from './CategorySelect'

// Alteração em lote de lançamentos selecionados no extrato.
// Fluxo em dois passos:
//   1) "revisao"   → revisa os lançamentos selecionados antes de alterar.
//   2) "alteracao" → escolhe quais campos alterar (Data e/ou Categoria) e aplica.
// onApply(changes) recebe um objeto contendo APENAS os campos marcados para alteração
// (ex.: { date }, { categoryId } ou ambos). O componente pai aplica aos selecionados.
export default function AlterarLoteModal({ items, categories, onApply, onClose }) {
  const [step, setStep] = useState('revisao')

  const [changeData, setChangeData] = useState(false)
  const [data, setData] = useState('')
  const [changeCategoria, setChangeCategoria] = useState(false)
  const [categoryId, setCategoryId] = useState('')

  const total = useMemo(
    () => items.reduce((s, t) => s + (t.amount || 0), 0),
    [items]
  )

  const catName = (id) => {
    const c = categories.find(c => c.id === id)
    return c ? `${c.icon} ${c.name}` : '—'
  }

  const canApply =
    (changeData && !!data) || (changeCategoria)

  const apply = () => {
    const changes = {}
    if (changeData && data) changes.date = data
    if (changeCategoria) changes.categoryId = categoryId || ''
    if (Object.keys(changes).length === 0) return
    onApply(changes)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h3 className="font-semibold text-gray-100 flex items-center gap-2">
            <PencilLine size={16} className="text-blue-400" />
            {step === 'revisao' ? 'Revisar Selecionados' : 'Alterar Selecionados'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* ── Passo 1: Revisão ── */}
        {step === 'revisao' && (
          <>
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-10">Nenhum lançamento selecionado.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-900">
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium whitespace-nowrap">Data</th>
                      <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Histórico</th>
                      <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Categoria</th>
                      <th className="text-right px-3 py-2.5 text-xs text-gray-400 font-medium whitespace-nowrap">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(t => (
                      <tr key={t.id} className="border-b border-gray-800/50">
                        <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(t.date)}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-200 truncate max-w-0">{t.description || 'Lançamento'}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-400 truncate max-w-0">{catName(t.categoryId)}</td>
                        <td className="px-3 py-2.5 text-right text-xs font-semibold text-gray-200 whitespace-nowrap">{fmt(t.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-between gap-3 shrink-0">
              <span className="text-xs text-gray-500">
                {items.length} selecionado{items.length !== 1 ? 's' : ''} · {fmt(total)}
              </span>
              <div className="flex gap-3">
                <button className="btn-secondary" onClick={onClose}>Cancelar</button>
                <button
                  className="btn-primary flex items-center justify-center gap-2"
                  onClick={() => setStep('alteracao')}
                  disabled={items.length === 0}
                >
                  Continuar <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Passo 2: Alteração ── */}
        {step === 'alteracao' && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <p className="text-xs text-gray-500">
                Marque os campos que deseja alterar em <span className="text-gray-300 font-medium">{items.length}</span> lançamento{items.length !== 1 ? 's' : ''}.
                Campos não marcados permanecem inalterados.
              </p>

              {/* Data */}
              <div className="rounded-lg border border-gray-800 p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={changeData}
                    onChange={e => setChangeData(e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                  />
                  <Calendar size={14} className="text-gray-400" /> Alterar Data
                </label>
                <input
                  type="date"
                  value={data}
                  onChange={e => setData(e.target.value)}
                  disabled={!changeData}
                  className="input w-full disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>

              {/* Categoria */}
              <div className="rounded-lg border border-gray-800 p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={changeCategoria}
                    onChange={e => setChangeCategoria(e.target.checked)}
                    className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                  />
                  <Tag size={14} className="text-gray-400" /> Alterar Categoria
                </label>
                <div className={changeCategoria ? '' : 'opacity-40 pointer-events-none'}>
                  <CategorySelect
                    categories={categories}
                    value={categoryId}
                    onChange={e => setCategoryId(e.target.value)}
                    searchable
                    placeholder="Sem categoria"
                    className="input w-full"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-between gap-3 shrink-0">
              <button className="btn-secondary" onClick={() => setStep('revisao')}>Voltar</button>
              <button
                className="btn-primary flex items-center justify-center gap-2"
                onClick={apply}
                disabled={!canApply}
              >
                <PencilLine size={14} /> Aplicar Alterações
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
