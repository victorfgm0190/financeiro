import { useState } from 'react'
import Modal from '../shared/Modal'
import { guessMapping } from '../../lib/parsers/genericCsvParser'

// ITEM 8 — mapeador de colunas para CSV genérico (banco não reconhecido). Mostra a prévia das
// primeiras linhas e deixa o usuário dizer qual coluna é Data / Valor / Descrição. Só leitura +
// escolha; a conversão e o import acontecem no chamador (ImportPanel) via onConfirm(mapping).
export default function CsvColumnMapperModal({ headers = [], previewRows = [], initialMapping, onConfirm, onSave, onClose }) {
  const [map, setMap] = useState(() => initialMapping || guessMapping(headers))
  const set = (k, v) => setMap(m => ({ ...m, [k]: v }))
  const valido = map.dateCol && map.amountCol && map.descCol

  // Helper de render (NÃO é componente: chamado como {colSelect(...)}, não <colSelect/>) —
  // evita recriar um componente a cada render.
  const colSelect = (label, field) => (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={map[field] || ''} onChange={e => set(field, e.target.value)}>
        <option value="">— Selecione a coluna —</option>
        {headers.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  )

  return (
    <Modal open onClose={onClose} title="Mapear colunas do CSV" size="lg">
      <div className="space-y-4">
        <p className="text-xs text-gray-400">
          Este CSV não foi reconhecido automaticamente. Indique quais colunas correspondem a cada campo.
          O mapeamento fica salvo para os próximos arquivos com o mesmo formato.
        </p>

        {/* Prévia das primeiras linhas */}
        {previewRows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-left text-gray-400">
                  {headers.map(h => <th key={h} className="px-2 py-1.5 font-medium whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    {headers.map(h => <td key={h} className="px-2 py-1.5 text-gray-300 whitespace-nowrap truncate max-w-[160px]">{String(r[h] ?? '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {colSelect('Qual coluna é a Data?', 'dateCol')}
          {colSelect('Qual coluna é o Valor?', 'amountCol')}
          {colSelect('Qual coluna é a Descrição?', 'descCol')}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 rounded accent-[#0F6E56]"
            checked={map.negativeIsExpense !== false}
            onChange={e => set('negativeIsExpense', e.target.checked)}
          />
          Valor negativo = despesa
          <span className="text-xs text-gray-500">(desmarque se o banco lista despesas como valores positivos)</span>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary text-sm py-2 px-4" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-secondary text-sm py-2 px-4 disabled:opacity-40" disabled={!valido} onClick={() => onSave?.(map)}>
            Salvar mapeamento
          </button>
          <button type="button" className="btn-primary text-sm py-2 px-4 disabled:opacity-40" disabled={!valido} onClick={() => onConfirm(map)}>
            Importar
          </button>
        </div>
      </div>
    </Modal>
  )
}
