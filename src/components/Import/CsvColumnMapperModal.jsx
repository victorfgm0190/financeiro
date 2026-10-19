import { useMemo, useState } from 'react'
import Modal from '../shared/Modal'
import { fmt, fmtDate } from '../shared/utils'
import { palpiteDeModelo, aplicarModelo, cabecalhoDe, assinaturaCabecalho, modeloValido } from '../../lib/importers/index.js'

// Mapeamento de planilha de banco não reconhecida (CSV / XLS / XLSX, cartão ou conta): prévia das
// primeiras linhas, escolha das colunas (data, descrição, valor — ou débito e crédito —, favorecido),
// formato de data, separador decimal, sinal das despesas e linhas a ignorar. A prévia do resultado
// é ao vivo. "Salvar modelo" grava em import_layouts (reconhecido sozinho na próxima vez, pela
// assinatura do cabeçalho); "Importar" usa o modelo só agora.
//   tabela: { linhas }  tipo: 'cartao' | 'conta'
//   onImportar({ modelo, registros })   onSalvar({ nome, banco, tipo, assinatura, mapeamento })
export default function CsvColumnMapperModal({ tabela, tipo = 'cartao', modeloInicial = null, onImportar, onSalvar, onClose }) {
  const [m, setM] = useState(() => modeloInicial || palpiteDeModelo(tabela))
  const [usarDebCred, setUsarDebCred] = useState(() => (modeloInicial || palpiteDeModelo(tabela)).colValor == null)
  const [nome, setNome] = useState('')
  const [banco, setBanco] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const set = (k, v) => setM(x => ({ ...x, [k]: v }))
  const cab = cabecalhoDe(tabela, m.linhaCabecalho ?? 0)
  const colunas = cab.map((h, i) => ({ i, rotulo: h || `Coluna ${i + 1}` }))
  const modelo = useMemo(() => (usarDebCred ? { ...m, colValor: null } : { ...m, colDebito: null, colCredito: null }), [m, usarDebCred])
  const valido = modeloValido(modelo)
  const resultado = useMemo(() => (valido ? aplicarModelo(tabela, modelo) : { registros: [], ignoradas: 0 }), [tabela, modelo, valido])
  const preview = tabela.linhas.slice((m.linhaCabecalho ?? 0) + 1, (m.linhaCabecalho ?? 0) + 6)

  const colSelect = (rotulo, campo, opcional = false) => (
    <div>
      <label className="label">{rotulo}</label>
      <select className="input" value={m[campo] ?? ''} onChange={e => set(campo, e.target.value === '' ? null : Number(e.target.value))}>
        <option value="">{opcional ? '— Nenhuma —' : '— Selecione a coluna —'}</option>
        {colunas.map(c => <option key={c.i} value={c.i}>{c.rotulo}</option>)}
      </select>
    </div>
  )

  const salvar = async () => {
    if (!nome.trim()) { setErro('Dê um nome ao modelo (ex.: "Bradesco cartão").'); return }
    setSalvando(true)
    setErro('')
    try {
      await onSalvar?.({ nome: nome.trim(), banco: banco.trim(), tipo, assinatura: assinaturaCabecalho(cab), mapeamento: modelo })
    } catch (e) {
      setErro(e?.message || 'Não foi possível salvar o modelo.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Mapear arquivo do banco — ${tipo === 'cartao' ? 'cartão' : 'conta corrente'}`} size="xl">
      <div className="space-y-4">
        <p className="text-xs text-texto-2">
          Este arquivo não foi reconhecido. Diga onde está cada informação. Salvando o modelo, o próximo arquivo com o mesmo
          cabeçalho é reconhecido sozinho.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Linha do cabeçalho</label>
            <select className="input" value={m.linhaCabecalho ?? 0} onChange={e => set('linhaCabecalho', Number(e.target.value))}>
              {tabela.linhas.slice(0, 15).map((l, i) => (
                <option key={i} value={i}>{`${i + 1}: ${l.map(c => String(c ?? '')).filter(Boolean).join(' · ').slice(0, 60)}`}</option>
              ))}
            </select>
          </div>
          {colSelect('Data', 'colData')}
          {colSelect('Descrição', 'colDescricao')}
        </div>

        <div className="overflow-x-auto rounded-lg border border-borda">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-borda text-left text-texto-2">
                {colunas.map(c => <th key={c.i} className="px-2 py-1.5 font-medium whitespace-nowrap">{c.rotulo}</th>)}
              </tr>
            </thead>
            <tbody>
              {preview.map((l, i) => (
                <tr key={i} className="border-b border-borda/50">
                  {colunas.map(c => <td key={c.i} className="px-2 py-1.5 text-texto-2 whitespace-nowrap truncate max-w-[160px]">{String(l[c.i] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-3 flex flex-wrap items-center gap-4 text-sm text-texto-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" className="accent-primary" checked={!usarDebCred} onChange={() => setUsarDebCred(false)} /> Uma coluna de valor
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" className="accent-primary" checked={usarDebCred} onChange={() => setUsarDebCred(true)} /> Débito e crédito separados
            </label>
          </div>
          {usarDebCred
            ? <>{colSelect('Débito (saídas)', 'colDebito')}{colSelect('Crédito (entradas)', 'colCredito')}</>
            : colSelect('Valor', 'colValor')}
          {colSelect('Favorecido (opcional)', 'colFavorecido', true)}
          <div>
            <label className="label">Formato da data</label>
            <select className="input" value={m.formatoData} onChange={e => set('formatoData', e.target.value)}>
              <option value="dmy">dia/mês/ano (31/12/2026)</option>
              <option value="ymd">ano-mês-dia (2026-12-31)</option>
              <option value="mdy">mês/dia/ano (12/31/2026)</option>
            </select>
          </div>
          <div>
            <label className="label">Separador decimal</label>
            <select className="input" value={m.decimal} onChange={e => set('decimal', e.target.value)}>
              <option value=",">vírgula (1.234,56)</option>
              <option value=".">ponto (1,234.56)</option>
            </select>
          </div>
          {!usarDebCred && (
            <div>
              <label className="label">Despesas aparecem como</label>
              <select className="input" value={m.sinalDespesa} onChange={e => set('sinalDespesa', e.target.value)}>
                <option value="negativo">valor negativo</option>
                <option value="positivo">valor positivo</option>
              </select>
            </div>
          )}
          <div className="sm:col-span-3">
            <label className="label">Ignorar linhas que contenham (separe por vírgula)</label>
            <input className="input" value={(m.ignorar || []).join(', ')} onChange={e => set('ignorar', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="pagamento efetuado, saldo, subtotal" />
          </div>
        </div>

        <div className="rounded-lg border border-borda-forte p-3 space-y-1.5">
          <p className="text-xs font-semibold text-texto-2">
            Resultado: {resultado.registros.length} lançamento(s){resultado.ignoradas ? ` · ${resultado.ignoradas} linha(s) ignorada(s)` : ''}
          </p>
          {resultado.registros.slice(0, 5).map((r, i) => (
            <p key={i} className="flex gap-2 text-xs text-texto-2">
              <span className="w-20 shrink-0">{fmtDate(r.date)}</span>
              <span className="flex-1 truncate">{r.description}</span>
              <span className={r.type === 'income' ? 'text-receita' : 'text-despesa'}>{r.type === 'income' ? '+' : '−'}{fmt(r.amount)}</span>
            </p>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Nome do modelo</label>
            <input className="input" value={nome} onChange={e => setNome(e.target.value)} placeholder='Ex.: "Bradesco cartão"' />
          </div>
          <div>
            <label className="label">Banco (opcional)</label>
            <input className="input" value={banco} onChange={e => setBanco(e.target.value)} placeholder="Ex.: Bradesco" />
          </div>
        </div>
        {erro && <p className="text-xs text-perigo">{erro}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary text-sm py-2 px-4" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-secondary text-sm py-2 px-4 disabled:opacity-40" disabled={!valido || salvando} onClick={salvar}>
            {salvando ? 'Salvando…' : 'Salvar modelo'}
          </button>
          <button type="button" className="btn-primary text-sm py-2 px-4 disabled:opacity-40" disabled={!valido || !resultado.registros.length} onClick={() => onImportar({ modelo, registros: resultado.registros })}>
            Importar
          </button>
        </div>
      </div>
    </Modal>
  )
}
