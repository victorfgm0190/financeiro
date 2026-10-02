import { useMemo, useState } from 'react'
import { RefreshCw, Search, Pencil, Merge } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import RenomearFavorecidoModal from '../shared/RenomearFavorecidoModal'
import Toast from '../shared/Toast'
import { contarUsos, listaFavorecidos, nomesFaltando } from '../../lib/favorecidos'
import { normText } from '../../lib/conciliacaoMatch'

// Limite de linhas renderizadas de uma vez — a lista inteira passa de 700 nomes; a busca filtra.
const LIMITE_LISTA = 300

const resumoUso = (u) => [
  u.lancamentos && `${u.lancamentos} lanç.`,
  u.agendamentos && `${u.agendamentos} agend.`,
  u.regras && `${u.regras} regra${u.regras !== 1 ? 's' : ''}`,
].filter(Boolean).join(' · ')

// Cadastros › Favorecidos: sincronizar o cadastro com os nomes em uso, renomear e mesclar.
// A contagem vem do estado do app (lançamentos, agendamentos e regras), igual ao que o banco tem.
export default function FavorecidosPanel() {
  const { data, addPayees } = useApp()
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState(() => new Set())
  const [novoNomeMescla, setNovoNomeMescla] = useState('')
  const [aliasMescla, setAliasMescla] = useState(true)
  const [modal, setModal] = useState(null) // { nomes, nomeInicial, alias, titulo }
  const [sync, setSync] = useState(null)   // Set dos nomes marcados na prévia de sincronização
  const [toast, setToast] = useState(null)

  const usos = useMemo(() => contarUsos({
    transactions: data.transactions, schedules: data.schedules, rules: data.classificationRules,
  }), [data.transactions, data.schedules, data.classificationRules])
  const faltando = useMemo(() => nomesFaltando(data.payees, usos), [data.payees, usos])
  const lista = useMemo(() => listaFavorecidos(data.payees, usos), [data.payees, usos])
  const filtrada = useMemo(() => {
    const q = normText(busca)
    return q ? lista.filter(f => normText(f.nome).includes(q)) : lista
  }, [lista, busca])

  const alternar = (nome) => setMarcados(prev => {
    const n = new Set(prev)
    if (n.has(nome)) n.delete(nome); else n.add(nome)
    return n
  })
  const selecionados = lista.filter(f => marcados.has(f.nome))
  // Sugestão do nome da mescla: o mais usado entre os selecionados.
  const sugestaoMescla = [...selecionados].sort((a, b) => b.usos.total - a.usos.total)[0]?.nome || ''

  const abrirSync = () => setSync(new Set(faltando.map(f => f.nome)))
  const inserirSync = () => {
    const nomes = faltando.filter(f => sync.has(f.nome)).map(f => f.nome)
    addPayees(nomes)
    setSync(null)
    setToast(`${nomes.length} favorecido${nomes.length !== 1 ? 's' : ''} incluído${nomes.length !== 1 ? 's' : ''} no cadastro`)
  }

  const aoAplicar = ({ para, total }) => {
    setMarcados(new Set())
    setNovoNomeMescla('')
    setToast(`"${para}" aplicado em ${total} registro${total !== 1 ? 's' : ''}`)
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-300">Favorecidos ({data.payees.length})</h2>
          <p className="text-xs text-gray-500 mt-0.5">Renomeie e junte favorecidos em lançamentos, agendamentos e regras.</p>
        </div>
        <button type="button" className="btn-secondary min-h-[44px] flex items-center gap-2 text-sm" onClick={abrirSync} disabled={faltando.length === 0}
          title="Inclui no cadastro os nomes usados em lançamentos, agendamentos e regras que ainda não estão nele">
          <RefreshCw size={14} /> Sincronizar com lançamentos{faltando.length > 0 ? ` (${faltando.length})` : ''}
        </button>
      </div>

      {sync && (
        <div className="rounded-xl border border-gray-700 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-200">{faltando.length} nome{faltando.length !== 1 ? 's' : ''} em uso fora do cadastro</p>
            <label className="flex items-center gap-2 text-xs text-gray-400 min-h-[44px] cursor-pointer">
              <input type="checkbox" className="accent-[#0F6E56] w-4 h-4"
                checked={sync.size === faltando.length}
                onChange={e => setSync(e.target.checked ? new Set(faltando.map(f => f.nome)) : new Set())} />
              Todos
            </label>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-800 divide-y divide-gray-800">
            {faltando.map(f => (
              <label key={f.nome} className="flex items-center gap-2 px-2.5 py-2 text-xs cursor-pointer hover:bg-gray-800/40">
                <input type="checkbox" className="accent-[#0F6E56] w-4 h-4 shrink-0" checked={sync.has(f.nome)}
                  onChange={() => setSync(prev => { const n = new Set(prev); if (n.has(f.nome)) n.delete(f.nome); else n.add(f.nome); return n })} />
                <span className="text-gray-200 truncate flex-1">{f.nome}</span>
                <span className="text-gray-500 whitespace-nowrap">{f.usos} uso{f.usos !== 1 ? 's' : ''}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary min-h-[44px]" onClick={() => setSync(null)}>Cancelar</button>
            <button type="button" className="btn-primary min-h-[44px]" disabled={sync.size === 0} onClick={inserirSync}>
              Incluir {sync.size} no cadastro
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input className="input pl-9 min-h-[44px]" placeholder="Buscar favorecido" value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      {selecionados.length >= 2 && (
        <div className="rounded-xl border border-emerald-800/50 bg-[#12302a]/40 p-3 space-y-3">
          <p className="text-sm text-gray-200 flex items-center gap-2"><Merge size={14} /> Mesclar {selecionados.length} nomes em um só</p>
          <div>
            <label className="label" htmlFor="fav-mescla-nome">Novo nome</label>
            <input id="fav-mescla-nome" className="input min-h-[44px]" value={novoNomeMescla || sugestaoMescla}
              onChange={e => setNovoNomeMescla(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300 min-h-[44px] cursor-pointer">
            <input type="checkbox" className="accent-[#0F6E56] w-4 h-4" checked={aliasMescla} onChange={e => setAliasMescla(e.target.checked)} />
            Usar esse nome nas próximas importações
          </label>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-secondary min-h-[44px]" onClick={() => setMarcados(new Set())}>Limpar seleção</button>
            <button type="button" className="btn-primary min-h-[44px]"
              onClick={() => setModal({
                nomes: selecionados.map(f => f.nome), nomeInicial: novoNomeMescla || sugestaoMescla,
                alias: aliasMescla, titulo: `Mesclar ${selecionados.length} favorecidos`,
              })}>
              Ver prévia
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-800 divide-y divide-gray-800">
        {filtrada.slice(0, LIMITE_LISTA).map(f => (
          <div key={f.nome} className="flex items-center gap-2 px-2.5 py-1">
            <input type="checkbox" className="accent-[#0F6E56] w-4 h-4 shrink-0" checked={marcados.has(f.nome)}
              onChange={() => alternar(f.nome)} aria-label={`Selecionar ${f.nome}`} />
            <span className="text-sm text-gray-200 truncate flex-1">{f.nome}</span>
            {!f.noCadastro && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 whitespace-nowrap">fora do cadastro</span>}
            {f.usos.total === 0
              ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-400 whitespace-nowrap">sem uso</span>
              : <span className="text-xs text-gray-500 whitespace-nowrap hidden sm:inline">{resumoUso(f.usos)}</span>}
            <button type="button" className="min-h-[44px] px-2 text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
              onClick={() => setModal({ nomes: [f.nome], nomeInicial: f.nome, alias: true, titulo: 'Renomear favorecido' })}>
              <Pencil size={12} /> Renomear
            </button>
          </div>
        ))}
        {filtrada.length === 0 && <p className="px-3 py-4 text-center text-xs text-gray-500">Nenhum favorecido encontrado.</p>}
      </div>
      {filtrada.length > LIMITE_LISTA && (
        <p className="text-xs text-gray-500">Mostrando {LIMITE_LISTA} de {filtrada.length} — use a busca para encontrar os demais.</p>
      )}

      {modal && (
        <RenomearFavorecidoModal
          open
          onClose={() => setModal(null)}
          nomes={modal.nomes}
          nomeInicial={modal.nomeInicial}
          aliasInicial={modal.alias}
          titulo={modal.titulo}
          onAplicado={aoAplicar}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
