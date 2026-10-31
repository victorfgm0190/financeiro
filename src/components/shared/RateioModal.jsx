import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, X } from 'lucide-react'
import { fmt } from './utils'
import { validarRateio } from '../../lib/rateio'
import CategorySelect from './CategorySelect'
import InputMoeda from './InputMoeda'

let _k = 0
const mkRow = (r = {}) => ({
  _k: ++_k,
  categoriaId: r.categoriaId || '',
  valor: r.valor != null && r.valor !== '' ? String(r.valor) : '',
  descricao: r.descricao || '',
})

const parseV = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n }
const round2 = n => Math.round(n * 100) / 100

// Modal "Dividir em categorias": divide o `total` do lançamento em linhas (lib/rateio). Só grava
// quando a soma fecha o total ("Restante a distribuir" em tempo real; "Completar com o restante"
// numa linha). onSave(rateios) recebe [{ categoriaId, valor, descricao }] — uma linha só o
// chamador transforma em lançamento comum; onDeleteAll() limpa tudo.
export default function RateioModal({ total = 0, categories = [], categoryType = null, initial = [], onSave, onDeleteAll, onClose, perfilId }) {
  const [rows, setRows] = useState(() => (initial.length > 0 ? initial.map(mkRow) : [mkRow(), mkRow()]))

  const setRow = (k, patch) => setRows(rs => rs.map(r => r._k === k ? { ...r, ...patch } : r))
  const addRow = () => setRows(rs => [...rs, mkRow()])
  const removeRow = (k) => setRows(rs => rs.filter(r => r._k !== k))

  const atribuido = round2(rows.reduce((s, r) => s + parseV(r.valor), 0))
  const naoAtribuido = round2(total - atribuido)
  const preenchidas = rows.filter(r => r.categoriaId || parseV(r.valor) > 0)
  const validacao = validarRateio(preenchidas.map(r => ({ categoriaId: r.categoriaId, valor: parseV(r.valor) })), total)
  const podeGravar = preenchidas.length > 0 && validacao.ok
  const completar = (k) => {
    const outros = round2(rows.reduce((s, r) => (r._k === k ? s : s + parseV(r.valor)), 0))
    const v = round2(total - outros)
    if (v > 0) setRow(k, { valor: String(v) })
  }

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
          <h3 className="text-sm font-semibold text-texto-1">Dividir em categorias</h3>
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
              <InputMoeda
                min="0"
                value={r.valor}
                onChange={e => setRow(r._k, { valor: e.target.value })}
                placeholder="0,00"
                className="input w-28 text-xs"
              />
              <input
                type="text"
                value={r.descricao}
                onChange={e => setRow(r._k, { descricao: e.target.value })}
                placeholder="Descrição"
                className="input flex-1 min-w-[90px] text-xs"
              />
              {naoAtribuido > 0.004 && (
                <button type="button" onClick={() => completar(r._k)} title="Completar com o restante" className="text-[11px] text-primary-fg underline shrink-0 whitespace-nowrap">
                  Completar com o restante
                </button>
              )}
              <button type="button" onClick={() => removeRow(r._k)} title="Remover" className="p-2 text-texto-3 hover:text-perigo shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={addRow} className="btn-secondary text-xs flex items-center gap-1.5">
          <Plus size={12} /> Categoria
        </button>

        <div className="flex items-center justify-between text-xs border-t border-borda pt-3 flex-wrap gap-3">
          <span className="text-texto-2">
            Total atribuído: <span className="font-semibold text-receita">{fmt(atribuido)}</span>
          </span>
          <span className="text-texto-2">
            Restante a distribuir:{' '}
            <span className={`font-semibold ${Math.abs(naoAtribuido) < 0.005 ? 'text-texto-2' : naoAtribuido < 0 ? 'text-despesa' : 'text-aviso'}`}>
              {fmt(naoAtribuido)}
            </span>
          </span>
        </div>

        <div className="flex gap-2 justify-end flex-wrap pt-1">
          <button type="button" onClick={onDeleteAll} className="btn-secondary text-xs text-perigo hover:text-texto-1">
            Excluir Tudo e Sair
          </button>
          {!podeGravar && preenchidas.length > 0 && <span className="text-[11px] text-aviso self-center">{validacao.motivo}</span>}
          <button type="button" onClick={handleSave} disabled={!podeGravar} className="btn-primary text-xs disabled:opacity-50">
            Gravar e Sair
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
