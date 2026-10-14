import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, X } from 'lucide-react'
import { fmt } from './utils'
import CategorySelect from './CategorySelect'

let _k = 0
const mkRow = (r = {}) => ({
  _k: ++_k,
  categoriaId: r.categoriaId || '',
  valor: r.valor != null && r.valor !== '' ? String(r.valor) : '',
  descricao: r.descricao || '',
})

const parseV = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n }
const round2 = n => Math.round(n * 100) / 100

// Modal de rateio: divide o `total` do lançamento em várias categorias.
// onSave(rateios) recebe [{ categoriaId, valor, descricao }]; onDeleteAll() limpa tudo.
export default function RateioModal({ total = 0, categories = [], categoryType = null, initial = [], onSave, onDeleteAll, onClose, perfilId }) {
  const [rows, setRows] = useState(() => (initial.length > 0 ? initial.map(mkRow) : [mkRow(), mkRow()]))

  const setRow = (k, patch) => setRows(rs => rs.map(r => r._k === k ? { ...r, ...patch } : r))
  const addRow = () => setRows(rs => [...rs, mkRow()])
  const removeRow = (k) => setRows(rs => rs.filter(r => r._k !== k))

  const atribuido = round2(rows.reduce((s, r) => s + parseV(r.valor), 0))
  const naoAtribuido = round2(total - atribuido)

  const handleSave = () => {
    const clean = rows
      .filter(r => r.categoriaId && parseV(r.valor) > 0)
      .map(r => ({ categoriaId: r.categoriaId, valor: parseV(r.valor), descricao: (r.descricao || '').trim() }))
    onSave(clean)
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div className="relative bg-surface border border-borda-forte rounded-2xl shadow-2xl w-full max-w-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-texto-1">Rateio do lançamento</h3>
          <button type="button" onClick={onClose} className="text-texto-3 hover:text-texto-2"><X size={16} /></button>
        </div>
        <p className="text-xs text-texto-3">
          Total do lançamento: <span className="text-texto-1 font-semibold">{fmt(total)}</span>
        </p>

        <div className="space-y-2">
          {rows.map(r => (
            <div key={r._k} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <CategorySelect
                  categories={categories}
                  perfilId={perfilId}
                  type={categoryType}
                  className="input text-xs w-full"
                  value={r.categoriaId}
                  onChange={e => setRow(r._k, { categoriaId: e.target.value })}
                  placeholder="Categoria"
                  searchable
                />
              </div>
              <input
                type="number" step="0.01" min="0"
                value={r.valor}
                onChange={e => setRow(r._k, { valor: e.target.value })}
                placeholder="Valor"
                className="input w-28 text-xs"
              />
              <input
                type="text"
                value={r.descricao}
                onChange={e => setRow(r._k, { descricao: e.target.value })}
                placeholder="Descrição (opcional)"
                className="input flex-1 min-w-[90px] text-xs"
              />
              <button type="button" onClick={() => removeRow(r._k)} title="Remover" className="p-2 text-texto-3 hover:text-perigo shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={addRow} className="btn-secondary text-xs flex items-center gap-1.5">
          <Plus size={12} /> Adicionar linha
        </button>

        <div className="flex items-center justify-between text-xs border-t border-borda pt-3 flex-wrap gap-3">
          <span className="text-texto-2">
            Total atribuído: <span className="font-semibold text-receita">{fmt(atribuido)}</span>
          </span>
          <span className="text-texto-2">
            Não atribuído:{' '}
            <span className={`font-semibold ${Math.abs(naoAtribuido) < 0.005 ? 'text-texto-2' : naoAtribuido < 0 ? 'text-despesa' : 'text-aviso'}`}>
              {fmt(naoAtribuido)}
            </span>
          </span>
        </div>

        <div className="flex gap-2 justify-end flex-wrap pt-1">
          <button type="button" onClick={onDeleteAll} className="btn-secondary text-xs text-perigo hover:text-texto-1">
            Excluir Tudo e Sair
          </button>
          <button type="button" onClick={handleSave} className="btn-primary text-xs">
            Gravar e Sair
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
