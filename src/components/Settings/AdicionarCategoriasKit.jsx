// Configurações › Cadastros › Categorias: "Adicionar categorias padrão que faltam". Mostra o kit (PF ou
// PJ, pelo tipo do cliente) que não existe no ambiente, por grupo, com checkbox: nada entra sem a pessoa
// escolher (ela pode ter apagado de propósito). Compara nomes sem acento e sem maiúsculas.
import { useMemo, useState } from 'react'
import { ListPlus } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fetchTipoDoKit } from '../../lib/db'
import { categoriasFaltantes } from '../../lib/kitCategorias'
import HelpCampo from '../shared/HelpCampo'

export default function AdicionarCategoriasKit() {
  const { categories, addCategory, pode } = useApp()
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState(null)
  const [erro, setErro] = useState('')
  const [marcadas, setMarcadas] = useState(() => new Set())

  const faltantes = useMemo(() => (tipo ? categoriasFaltantes(tipo, categories) : []), [tipo, categories])
  const grupos = useMemo(() => {
    const m = new Map()
    for (const c of faltantes) {
      const g = c.group || 'Sem grupo'
      if (!m.has(g)) m.set(g, [])
      m.get(g).push(c)
    }
    return [...m.entries()]
  }, [faltantes])

  if (!pode('cadastros', 'incluir')) return null

  const abrir = async () => {
    setAberto(true)
    setErro('')
    setMarcadas(new Set())
    try {
      setTipo((await fetchTipoDoKit())?.tipo || 'PF')
    } catch (err) {
      setErro(err?.message || 'Não foi possível consultar o kit agora.')
    }
  }
  const alternar = (id) => setMarcadas(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const adicionar = () => {
    for (const c of faltantes) if (marcadas.has(c.id)) addCategory(c)
    setAberto(false)
  }

  return (
    <>
      <button type="button" className="btn-secondary text-xs py-1.5 mt-2 flex items-center gap-1.5" onClick={abrir}>
        <ListPlus size={13} aria-hidden="true" /> Adicionar categorias padrão que faltam
      </button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Categorias padrão que faltam">
        <div className="space-y-3" data-testid="kit-categorias">
          {erro && <p className="text-sm text-perigo" role="alert">{erro}</p>}
          {!erro && !tipo && <p className="text-sm text-texto-2">Consultando…</p>}
          {!erro && tipo && faltantes.length === 0 && <p className="text-sm text-texto-2">Nenhuma categoria padrão está faltando.</p>}
          {faltantes.length > 0 && (
            <>
              <div className="flex items-center gap-3 text-xs text-texto-2">
                <span className="flex-1">Kit {tipo === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}: marque as que quer incluir.<HelpCampo campo="kitCategorias.selecionar" /></span>
                <button type="button" className="underline hover:text-texto-1" onClick={() => setMarcadas(new Set(faltantes.map(c => c.id)))}>Marcar todas</button>
                <button type="button" className="underline hover:text-texto-1" onClick={() => setMarcadas(new Set())}>Limpar</button>
              </div>
              <div className="max-h-[50vh] overflow-y-auto space-y-3" data-help-form="kitCategorias" data-help-id="kitCategorias.selecionar">
                {grupos.map(([grupo, itens]) => (
                  <fieldset key={grupo}>
                    <legend className="text-xs font-semibold text-texto-2 uppercase tracking-wide mb-1">{grupo}</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
                      {itens.map(c => (
                        <label key={c.id} className="flex items-center gap-2 text-sm text-texto-1 min-h-[32px] cursor-pointer">
                          <input type="checkbox" className="w-4 h-4 accent-primary" checked={marcadas.has(c.id)} onChange={() => alternar(c.id)} />
                          <span aria-hidden="true">{c.icon}</span> {c.name}
                          <span className="text-[11px] text-texto-3">{c.type === 'income' ? 'Receita' : 'Despesa'}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-secondary" onClick={() => setAberto(false)}>Fechar</button>
            {faltantes.length > 0 && (
              <button type="button" className="btn-primary" disabled={marcadas.size === 0} onClick={adicionar}>
                Adicionar {marcadas.size > 0 ? `(${marcadas.size})` : ''}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}
