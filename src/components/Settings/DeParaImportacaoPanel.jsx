import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { rotulosCategorias } from '../../lib/importacaoPadrao/comum'
import { listarDepara, salvarDepara, editarDepara, excluirDepara } from '../../lib/importacaoApi'

// Configurações › Cadastros › De-para de importação: texto de categoria que vem no arquivo
// (.csv/OFX ou digitado fora da lista do Excel) → categoria do Finup. Criado também na prévia da
// importação ("escolher a correspondente" / "criar nova"). Mexe só nesta tabela.
export default function DeParaImportacaoPanel() {
  const { categories, pode } = useApp()
  const podeEditar = pode('lancamentos', 'incluir')
  const rotulos = useMemo(() => rotulosCategorias(categories), [categories])
  const nome = useMemo(() => new Map(rotulos.map(r => [r.id, r.rotulo])), [rotulos])
  const [itens, setItens] = useState([])
  const [erro, setErro] = useState('')
  const [novo, setNovo] = useState({ origem: '', categoria: '' })

  const carregar = useCallback(() => listarDepara().then(l => { setItens(l); setErro('') }).catch(e => setErro(e.message)), [])
  useEffect(() => { carregar() }, [carregar])
  const agir = async (fn) => { try { await fn(); await carregar() } catch (e) { setErro(e.message) } }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-texto-2">De-para de importação ({itens.length})</h2>
        <button type="button" onClick={carregar} className="p-1.5 rounded text-texto-3 hover:text-texto-1" aria-label="Recarregar"><RefreshCw size={12} /></button>
      </div>
      <p className="text-xs text-texto-3">Quando um arquivo importado (Importar lançamentos) traz uma categoria que não existe no Finup, ela vira a categoria escolhida aqui.</p>
      {erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}
      {podeEditar && (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); agir(async () => { await salvarDepara(novo.origem, novo.categoria); setNovo({ origem: '', categoria: '' }) }) }}>
          <input className="input !py-1.5 max-w-xs" placeholder="Texto no arquivo (ex.: Mercado)" value={novo.origem} onChange={e => setNovo(n => ({ ...n, origem: e.target.value }))} />
          <select className="input !py-1.5 max-w-xs" value={novo.categoria} onChange={e => setNovo(n => ({ ...n, categoria: e.target.value }))}>
            <option value="">Categoria…</option>
            {rotulos.map(r => <option key={r.id} value={r.id}>{r.rotulo}</option>)}
          </select>
          <button className="btn-primary text-xs py-1.5 inline-flex items-center gap-1" disabled={!novo.origem.trim() || !novo.categoria}><Plus size={12} /> Adicionar</button>
        </form>
      )}
      <div className="overflow-x-auto rounded-lg border border-borda">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-texto-3 border-b border-borda"><th className="px-3 py-2 font-medium">Texto no arquivo</th><th className="px-3 py-2 font-medium">Categoria do Finup</th><th /></tr></thead>
          <tbody>
            {itens.map(d => (
              <tr key={d.id} className="border-b border-borda/60 last:border-0">
                <td className="px-3 py-1.5 text-texto-1">{d.nome_exibicao || d.nome_origem}</td>
                <td className="px-3 py-1.5">
                  <select className="input !py-1 max-w-xs" value={d.categoria_id} disabled={!podeEditar} onChange={e => agir(() => editarDepara(d.id, e.target.value))}>
                    {!nome.has(d.categoria_id) && <option value={d.categoria_id}>(categoria apagada)</option>}
                    {rotulos.map(r => <option key={r.id} value={r.id}>{r.rotulo}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5 text-right">
                  {podeEditar && (
                    <button type="button" aria-label="Excluir" title="Excluir" className="p-1.5 rounded text-texto-3 hover:text-perigo"
                      onClick={() => window.confirm(`Excluir o de-para de "${d.nome_exibicao || d.nome_origem}"?`) && agir(() => excluirDepara(d.id))}><Trash2 size={13} /></button>
                  )}
                </td>
              </tr>
            ))}
            {!itens.length && <tr><td colSpan={3} className="px-3 py-4 text-center text-texto-3">Nenhum de-para salvo.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
