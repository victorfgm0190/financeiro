import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import Modal from './Modal'
import { fmt, fmtDate } from './utils'
import {
  baseDoFavorecido, criterioComecaCom, criterioExato, nomeFavorecido, selecionarAlvos,
} from '../../lib/favorecidos'

// Renomear / mesclar favorecidos com prévia. Dois modos de escolher os registros:
//   • `nomes` (tela Favorecidos): exatamente esses nomes;
//   • `nomeBase` (Editar Lançamento): o usuário escolhe "exatamente este nome" ou "todos que
//     começam com <base sem sufixo de parcela>".
// A prévia separa lançamentos, agendamentos e regras, cada registro com checkbox. Aplicar faz
// tudo num único update do AppContext (renomearFavorecidos): payee nas três tabelas, cadastro
// (entra o nome novo, saem os antigos que ficaram sem uso) e, se marcado, o alias de importação.
// A descrição dos lançamentos nunca é alterada.
export default function RenomearFavorecidoModal({
  open, onClose, nomes = null, nomeBase = null, nomeInicial = '', aliasInicial = true, titulo, onAplicado,
}) {
  const { data, renomearFavorecidos } = useApp()
  const [para, setPara] = useState(nomeInicial || (nomes?.[0] ?? nomeBase ?? ''))
  const [criterio, setCriterio] = useState('exato')
  const [alias, setAlias] = useState(aliasInicial)
  // Desmarcados (o padrão é aplicar em tudo que a prévia mostra).
  const [fora, setFora] = useState(() => new Set())

  const base = nomeBase ? baseDoFavorecido(nomeBase) : ''
  const alvos = useMemo(() => {
    const crit = nomes ? criterioExato(nomes)
      : criterio === 'comecaCom' ? criterioComecaCom(base)
      : criterioExato([nomeBase])
    return selecionarAlvos({
      transactions: data.transactions, schedules: data.schedules, rules: data.classificationRules,
    }, crit)
  }, [data.transactions, data.schedules, data.classificationRules, nomes, nomeBase, base, criterio])

  const chave = (tabela, id) => `${tabela}:${id}`
  const marcado = (tabela, id) => !fora.has(chave(tabela, id))
  const alternar = (tabela, id) => setFora(prev => {
    const n = new Set(prev)
    const k = chave(tabela, id)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })
  const alternarTodos = (tabela, lista, valor) => setFora(prev => {
    const n = new Set(prev)
    for (const x of lista) { const k = chave(tabela, x.id); if (valor) n.delete(k); else n.add(k) }
    return n
  })

  const selecionados = {
    lancamentos: alvos.lancamentos.filter(x => marcado('lancamentos', x.id)).map(x => x.id),
    agendamentos: alvos.agendamentos.filter(x => marcado('agendamentos', x.id)).map(x => x.id),
    regras: alvos.regras.filter(x => marcado('regras', x.id)).map(x => x.id),
  }
  const totalSel = selecionados.lancamentos.length + selecionados.agendamentos.length + selecionados.regras.length
  const novo = nomeFavorecido(para)
  const podeAplicar = !!novo && (totalSel > 0 || (nomes?.length > 0))

  const aplicar = () => {
    if (!podeAplicar) return
    renomearFavorecidos({ para: novo, ids: selecionados, nomesAntigos: nomes || [nomeBase], alias })
    onAplicado?.({ para: novo, total: totalSel })
    onClose()
  }

  const grupo = (tabela, tituloGrupo, lista, render) => {
    if (lista.length === 0) return null
    const todos = lista.every(x => marcado(tabela, x.id))
    return (
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-300 min-h-[44px] cursor-pointer">
          <input type="checkbox" className="accent-[#0F6E56] w-4 h-4" checked={todos}
            onChange={e => alternarTodos(tabela, lista, e.target.checked)} />
          {tituloGrupo} ({lista.filter(x => marcado(tabela, x.id)).length}/{lista.length})
        </label>
        <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-800 divide-y divide-gray-800">
          {lista.map(x => (
            <label key={x.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-gray-800/40">
              <input type="checkbox" className="accent-[#0F6E56] w-3.5 h-3.5 shrink-0"
                checked={marcado(tabela, x.id)} onChange={() => alternar(tabela, x.id)} />
              {render(x)}
            </label>
          ))}
        </div>
      </div>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title={titulo || 'Renomear favorecido'} size="lg">
      <div className="space-y-4">
        {nomes && nomes.length > 1 && (
          <p className="text-xs text-gray-400">
            Mesclar: {nomes.map(n => <span key={n} className="inline-block bg-gray-800 rounded px-1.5 py-0.5 mr-1 mb-1">{n}</span>)}
          </p>
        )}
        {nomeBase && (
          <div className="space-y-1">
            <p className="label">Aplicar em</p>
            <label className="flex items-center gap-2 text-sm text-gray-300 min-h-[44px] cursor-pointer">
              <input type="radio" name="crit" checked={criterio === 'exato'} onChange={() => setCriterio('exato')} />
              Exatamente &ldquo;{nomeFavorecido(nomeBase)}&rdquo;
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 min-h-[44px] cursor-pointer">
              <input type="radio" name="crit" checked={criterio === 'comecaCom'} onChange={() => setCriterio('comecaCom')} disabled={!base} />
              Todos que começam com &ldquo;{base}&rdquo;
            </label>
          </div>
        )}
        <div>
          <label className="label" htmlFor="fav-novo-nome">Novo nome</label>
          <input id="fav-novo-nome" className="input" value={para} onChange={e => setPara(e.target.value)} autoFocus />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300 min-h-[44px] cursor-pointer">
          <input type="checkbox" className="accent-[#0F6E56] w-4 h-4" checked={alias} onChange={e => setAlias(e.target.checked)} />
          Usar esse nome nas próximas importações
        </label>

        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Prévia — {totalSel} registro{totalSel !== 1 ? 's' : ''} {novo ? <>passa{totalSel !== 1 ? 'm' : ''} a ter o favorecido &ldquo;{novo}&rdquo;</> : 'selecionado(s)'}. A descrição não muda.
          </p>
          {grupo('lancamentos', 'Lançamentos', alvos.lancamentos, t => (
            <>
              <span className="text-gray-500 whitespace-nowrap">{fmtDate(t.date)}</span>
              <span className="text-gray-300 truncate flex-1">{t.description}</span>
              <span className="text-gray-500 truncate max-w-[30%]">{t.payee}</span>
              <span className="text-gray-300 whitespace-nowrap">{fmt(t.amount)}</span>
            </>
          ))}
          {grupo('agendamentos', 'Agendamentos', alvos.agendamentos, s => (
            <>
              <span className="text-gray-300 truncate flex-1">{s.description}</span>
              <span className="text-gray-500 truncate max-w-[40%]">{s.payee}</span>
            </>
          ))}
          {grupo('regras', 'Regras de classificação', alvos.regras, r => (
            <>
              <span className="text-gray-300 truncate flex-1">contém &ldquo;{r.contains}&rdquo;</span>
              <span className="text-gray-500 truncate max-w-[40%]">{r.payee}</span>
            </>
          ))}
          {alvos.lancamentos.length + alvos.agendamentos.length + alvos.regras.length === 0 && (
            <p className="text-xs text-gray-500">Nenhum lançamento, agendamento ou regra usa este nome.</p>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <button type="button" className="btn-secondary min-h-[44px]" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary min-h-[44px]" disabled={!podeAplicar} onClick={aplicar}>
            Aplicar{totalSel > 0 ? ` (${totalSel})` : ''}
          </button>
        </div>
      </div>
    </Modal>
  )
}
