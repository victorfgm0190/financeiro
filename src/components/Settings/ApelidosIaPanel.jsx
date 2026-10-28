import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2, RefreshCw } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { rotulosCategorias } from '../../lib/importacaoPadrao/comum'
import { listarApelidos, editarApelido, excluirApelido } from '../../lib/assistenteApi'

// Configurações › Cadastros › Apelidos da IA: termo do usuário → cadastro, aprendido quando ele
// corrige a prévia do Assistente. Categoria/conta guardam o id; favorecido, o nome. Apelido que
// aponta para cadastro apagado/renomeado aparece marcado e o assistente o ignora.
const TIPOS = { categoria: 'Categoria', conta: 'Conta', favorecido: 'Favorecido', descricao_fatura: 'Descrição de fatura' }

export default function ApelidosIaPanel() {
  const { categories, accounts, payees, pode } = useApp()
  const podeEditar = pode('cadastros', 'editar')
  const podeExcluir = pode('cadastros', 'excluir')
  const rotulos = useMemo(() => rotulosCategorias(categories), [categories])
  const opcoes = useMemo(() => ({
    categoria: rotulos.map(r => ({ id: r.id, label: r.rotulo })),
    conta: accounts.filter(a => a.active !== false).map(a => ({ id: a.id, label: a.apelido || a.name })),
    favorecido: [...payees].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(n => ({ id: n, label: n })),
  }), [rotulos, accounts, payees])
  const [itens, setItens] = useState([])
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState({}) // id → termo em edição

  const carregar = useCallback(() => listarApelidos().then(l => { setItens(l); setErro('') }).catch(e => setErro(e.message)), [])
  useEffect(() => { carregar() }, [carregar])
  const agir = async (fn) => { try { await fn(); await carregar() } catch (e) { setErro(e.message) } }

  const salvarTermo = (a) => {
    const termo = (editando[a.id] ?? a.termo).trim()
    setEditando(e => { const n = { ...e }; delete n[a.id]; return n })
    if (termo && termo !== a.termo) agir(() => editarApelido(a.id, { termo }))
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-texto-2">Apelidos da IA ({itens.length})</h2>
        <button type="button" onClick={carregar} className="p-1.5 rounded text-texto-3 hover:text-texto-1" aria-label="Recarregar"><RefreshCw size={12} /></button>
      </div>
      <p className="text-xs text-texto-3">
        Quando você corrige uma sugestão do Assistente (ex.: “combustível” → Gasolina), o termo vira um apelido e passa a valer nas próximas vezes.
      </p>
      {erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}
      <div className="overflow-x-auto rounded-lg border border-borda">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-texto-3 border-b border-borda"><th className="px-3 py-2 font-medium">Tipo</th><th className="px-3 py-2 font-medium">Termo</th><th className="px-3 py-2 font-medium">Vai para</th><th className="px-3 py-2 font-medium text-right">Usos</th><th /></tr></thead>
          <tbody>
            {itens.map(a => {
              const lista = opcoes[a.tipo] || []
              const valido = lista.some(o => o.id === a.ref_id)
              return (
                <tr key={a.id} className="border-b border-borda/60 last:border-0">
                  <td className="px-3 py-1.5 text-texto-2 whitespace-nowrap">{TIPOS[a.tipo] || a.tipo}</td>
                  <td className="px-3 py-1.5">
                    <input className="input !py-1 max-w-[180px]" value={editando[a.id] ?? a.termo} disabled={!podeEditar}
                      onChange={e => setEditando(s => ({ ...s, [a.id]: e.target.value }))}
                      onBlur={() => salvarTermo(a)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      placeholder="Digite o termo" />
                  </td>
                  <td className="px-3 py-1.5">
                    {lista.length ? (
                      <select className="input !py-1 max-w-xs" value={a.ref_id} disabled={!podeEditar} onChange={e => agir(() => editarApelido(a.id, { ref_id: e.target.value }))}>
                        {!valido && <option value={a.ref_id}>(cadastro apagado ou renomeado — ignorado)</option>}
                        {lista.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    ) : <span className="text-texto-3">{a.ref_id}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right text-texto-2">{a.usos}</td>
                  <td className="px-2 py-1.5 text-right">
                    {podeExcluir && (
                      <button type="button" aria-label="Excluir" title="Excluir" className="p-1.5 rounded text-texto-3 hover:text-perigo"
                        onClick={() => window.confirm(`Excluir o apelido "${a.termo}"?`) && agir(() => excluirApelido(a.id))}><Trash2 size={13} /></button>
                    )}
                  </td>
                </tr>
              )
            })}
            {!itens.length && <tr><td colSpan={5} className="px-3 py-4 text-center text-texto-3">Nenhum apelido aprendido ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
