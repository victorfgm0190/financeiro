import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Upload, RefreshCw, Check, X, AlertTriangle, CreditCard, Landmark, Trash2,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import {
  loadAccountMappings, loadImportPendentes, insertImportPendentes,
  updateImportPendentesStatus, clearImportPendentes, confirmImportPendentes,
} from '../../lib/db'
import { parseFile, parseDindinCC, parseDindinCartao, fuzzyMatchAccount } from '../../lib/dindinParse'
import ConfirmDialog from '../shared/ConfirmDialog'

const ORIGEM = 'DINDIN'
const TIPO_FROM_CC = { income: 'receita', expense: 'despesa', transfer: 'transferencia' }
const TIPO_LABEL = { receita: 'Receita', despesa: 'Despesa', transferencia: 'Transferência' }

// id determinístico por linha (re-upload faz upsert, não duplica).
function makeId(parts) {
  const s = parts.join('|')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return 'imp_' + (h >>> 0).toString(36)
}

export default function DindinImportPanel() {
  const { accounts, categories } = useApp()
  const [tab, setTab] = useState('cc') // 'cc' | 'cartao'
  const [pendentes, setPendentes] = useState([])
  const [dbMappings, setDbMappings] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [confirmClear, setConfirmClear] = useState(false)

  const accById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])
  const dbMapIndex = useMemo(() => {
    const idx = {}
    for (const m of dbMappings) if (m.nome_dindin) idx[m.nome_dindin.toLowerCase().trim()] = m
    return idx
  }, [dbMappings])

  // Seleção padrão: linhas pendentes da aba com conta resolvida (não-ambíguas).
  const buildDefaultSelection = useCallback((list, tabId) => {
    const primary = p => (p.tipo === 'receita' ? p.conta_destino_finup : p.conta_origem_finup)
    return new Set(
      list.filter(p => (p.fonte || 'cc') === tabId && p.status === 'pendente' && primary(p)).map(p => p.id),
    )
  }, [])

  const reload = useCallback(async (tabId) => {
    setLoading(true)
    const fetched = await loadImportPendentes({ origem: ORIGEM })
    setPendentes(fetched)
    setSelected(buildDefaultSelection(fetched, tabId ?? tab))
    setLoading(false)
    return fetched
  }, [buildDefaultSelection, tab])

  // Carga inicial — setState ocorre no .then (assíncrono), evitando setState síncrono no efeito.
  useEffect(() => {
    let active = true
    loadAccountMappings().then(m => { if (active) setDbMappings(m) })
    loadImportPendentes({ origem: ORIGEM }).then(fetched => {
      if (!active) return
      setPendentes(fetched)
      setSelected(buildDefaultSelection(fetched, 'cc'))
    })
    return () => { active = false }
  }, [buildDefaultSelection])

  // Resolve um nome Dindin → id de conta Finup (mapeamento DB tem prioridade, depois fuzzy).
  // Retorna { id, nao_criar }. id null quando não resolvido (item ambíguo).
  const resolveFinup = useCallback((name) => {
    if (!name) return { id: null, naoCriar: false }
    const m = dbMapIndex[name.toLowerCase().trim()]
    if (m?.nao_criar) return { id: null, naoCriar: true }
    if (m?.nome_finup) {
      const acc = accounts.find(a => a.name.toLowerCase().trim() === m.nome_finup.toLowerCase().trim())
        || fuzzyMatchAccount(m.nome_finup, accounts)
      if (acc) return { id: acc.id, naoCriar: false }
    }
    const fuzzy = fuzzyMatchAccount(name, accounts)
    return { id: fuzzy?.id || null, naoCriar: false }
  }, [dbMapIndex, accounts])

  async function handleUpload(file, fonte) {
    setError(''); setInfo(''); setBusy('upload')
    try {
      const raw = await parseFile(file)
      const counter = new Map()
      const rows = []

      if (fonte === 'cc') {
        const { rows: parsed } = parseDindinCC(raw)
        for (const r of parsed) {
          const tipo = TIPO_FROM_CC[r.type] || 'despesa'
          const origem = resolveFinup(r.fromAccount)
          const destino = resolveFinup(r.toAccount)
          rows.push(buildRow({
            fonte, data: r.date, descricao: r.description, valor: r.amount, tipo,
            contaOrigemDindin: r.fromAccount || '', contaDestinoDindin: r.toAccount || '',
            contaOrigemFinup: origem.id, contaDestinoFinup: destino.id, categoriaId: '',
          }, counter))
        }
      } else {
        const { rows: parsed, cardName } = parseDindinCartao(raw)
        const cartao = resolveFinup(cardName)
        for (const r of parsed) {
          rows.push(buildRow({
            fonte, data: r.date, descricao: r.description, valor: r.amount, tipo: 'despesa',
            contaOrigemDindin: cardName || '', contaDestinoDindin: '',
            contaOrigemFinup: cartao.id, contaDestinoFinup: null, categoriaId: '',
          }, counter))
        }
      }

      if (rows.length === 0) { setError('Nenhum lançamento encontrado no arquivo.'); setBusy(''); return }
      await insertImportPendentes(rows)
      await reload()
      setInfo(`${rows.length} linha(s) carregada(s) para revisão.`)
    } catch (err) {
      setError('Erro ao processar o arquivo: ' + (err?.message || err))
    } finally {
      setBusy('')
    }
  }

  function buildRow(o, counter) {
    const base = makeId([o.fonte, o.data, o.descricao, o.valor, o.tipo])
    const n = (counter.get(base) || 0) + 1
    counter.set(base, n)
    return {
      id: n > 1 ? `${base}_${n}` : base,
      origem: ORIGEM,
      fonte: o.fonte,
      data: o.data,
      descricao: o.descricao,
      valor: o.valor,
      tipo: o.tipo,
      conta_origem_dindin: o.contaOrigemDindin || null,
      conta_destino_dindin: o.contaDestinoDindin || null,
      conta_origem_finup: o.contaOrigemFinup || null,
      conta_destino_finup: o.contaDestinoFinup || null,
      categoria_id: o.categoriaId || null,
      status: 'pendente',
    }
  }

  // Linhas da aba atual, ainda pendentes, enriquecidas para exibição.
  const rows = useMemo(() => {
    return pendentes
      .filter(p => (p.fonte || 'cc') === tab && p.status === 'pendente')
      .map(p => {
        const primaryFinup = p.tipo === 'receita' ? p.conta_destino_finup : p.conta_origem_finup
        const contaAcc = primaryFinup ? accById.get(primaryFinup) : null
        const cat = p.categoria_id ? categories.find(c => c.id === p.categoria_id) : null
        const ambiguo = !primaryFinup
        return { ...p, contaLabel: contaAcc ? (contaAcc.apelido || contaAcc.name) : null, catLabel: cat ? `${cat.icon || ''} ${cat.name}`.trim() : null, ambiguo }
      })
  }, [pendentes, tab, accById, categories])

  const counts = useMemo(() => {
    const c = { pendente: 0, confirmado: 0, ignorado: 0, ambiguos: 0 }
    pendentes.filter(p => (p.fonte || 'cc') === tab).forEach(p => {
      c[p.status] = (c[p.status] || 0) + 1
      if (p.status === 'pendente') {
        const primary = p.tipo === 'receita' ? p.conta_destino_finup : p.conta_origem_finup
        if (!primary) c.ambiguos++
      }
    })
    return c
  }, [pendentes, tab])

  const changeTab = (tabId) => { setTab(tabId); setSelected(buildDefaultSelection(pendentes, tabId)) }

  const toggle = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allVisibleSelected = rows.length > 0 && rows.every(r => selected.has(r.id))
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(rows.map(r => r.id)))

  async function doConfirm() {
    const ids = [...selected]
    if (ids.length === 0) return
    setBusy('confirm'); setError(''); setInfo('')
    try {
      const res = await confirmImportPendentes(ids)
      await reload()
      setInfo(`${res.inserted || 0} lançamento(s) gravado(s)${res.skipped ? ` · ${res.skipped} sem conta (revisar)` : ''}. Recarregue o app para vê-los.`)
    } catch (err) { setError('Falha ao confirmar: ' + (err?.message || err)) }
    finally { setBusy('') }
  }

  async function doIgnore() {
    const ids = [...selected]
    if (ids.length === 0) return
    setBusy('ignore'); setError(''); setInfo('')
    try {
      await updateImportPendentesStatus(ids, 'ignorado')
      await reload()
      setInfo(`${ids.length} linha(s) ignorada(s).`)
    } catch (err) { setError('Falha ao ignorar: ' + (err?.message || err)) }
    finally { setBusy('') }
  }

  async function doClear() {
    setConfirmClear(false); setBusy('clear'); setError(''); setInfo('')
    try {
      await clearImportPendentes(ORIGEM, 'pendente')
      await reload()
      setInfo('Pendências removidas.')
    } catch (err) { setError('Falha ao limpar: ' + (err?.message || err)) }
    finally { setBusy('') }
  }

  const tabs = [
    { id: 'cc', label: 'Conta Corrente', icon: Landmark },
    { id: 'cartao', label: 'Cartões', icon: CreditCard },
  ]

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <Upload size={15} className="text-indigo-400" />
        <h2 className="text-sm font-semibold text-gray-300">Importação Dindin</h2>
        <button
          onClick={reload}
          className="ml-auto text-gray-500 hover:text-gray-300 disabled:opacity-50"
          title="Recarregar"
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Sub-tabs Conta Corrente | Cartões */}
      <div className="flex items-center gap-1 border-b border-gray-800">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => changeTab(t.id)}
              className={`px-3 pb-2 text-xs font-medium border-b-2 -mb-px flex items-center gap-1.5 transition-colors ${
                tab === t.id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon size={12} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* Upload */}
      <label className={`block border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${busy === 'upload' ? 'border-gray-800 opacity-50 pointer-events-none' : 'border-gray-700 hover:border-indigo-500/60'}`}>
        <Upload size={20} className="text-gray-600 mx-auto mb-1" />
        <p className="text-xs text-gray-400">
          {busy === 'upload' ? 'Processando…' : `Selecionar arquivo Dindin — ${tab === 'cc' ? 'Conta Corrente' : 'Cartões'} (XLS/XLSX)`}
        </p>
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          disabled={busy === 'upload'}
          onChange={e => { const f = e.target.files[0]; if (f) handleUpload(f, tab); e.target.value = '' }}
        />
      </label>

      {error && <p className="text-xs text-orange-400 bg-orange-500/5 border border-orange-500/20 rounded px-3 py-2">{error}</p>}
      {info && <p className="text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded px-3 py-2">{info}</p>}

      {/* Counts */}
      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
        <span><b className="text-gray-300">{counts.pendente}</b> pendentes</span>
        {counts.ambiguos > 0 && <span className="text-amber-400">{counts.ambiguos} sem conta</span>}
        <span>{counts.confirmado} confirmados</span>
        <span>{counts.ignorado} ignorados</span>
      </div>

      {/* Review table */}
      {rows.length === 0 ? (
        <p className="text-xs text-gray-600 text-center py-6">
          {loading ? 'Carregando…' : 'Sem linhas pendentes nesta aba. Faça upload de um arquivo acima.'}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto border border-gray-800 rounded-lg">
            <table className="w-full text-xs" style={{ minWidth: 640 }}>
              <thead>
                <tr className="border-b border-gray-800 bg-gray-800/30 text-gray-400">
                  <th className="px-2 py-2 w-8 text-center">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} />
                  </th>
                  <th className="px-2 py-2 text-left w-24">Data</th>
                  <th className="px-2 py-2 text-left">Descrição</th>
                  <th className="px-2 py-2 text-right w-24">Valor</th>
                  <th className="px-2 py-2 text-left w-40">Conta mapeada</th>
                  <th className="px-2 py-2 text-left w-36">Categoria</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={`border-b border-gray-800/50 ${r.ambiguo ? 'bg-amber-500/5' : 'hover:bg-gray-800/20'}`}>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                    </td>
                    <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap">{fmtDate(r.data)}</td>
                    <td className="px-2 py-1.5 text-gray-200">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-[10px] px-1 rounded bg-gray-700 text-gray-400">{TIPO_LABEL[r.tipo] || r.tipo}</span>
                        <span className="truncate max-w-[280px]" title={r.descricao}>{r.descricao}</span>
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-medium text-gray-200">{fmt(r.valor)}</td>
                    <td className="px-2 py-1.5">
                      {r.contaLabel
                        ? <span className="text-gray-300">{r.contaLabel}</span>
                        : <span className="inline-flex items-center gap-1 text-amber-400"><AlertTriangle size={11} /> não mapeada</span>}
                    </td>
                    <td className="px-2 py-1.5 text-gray-400">{r.catLabel || <span className="text-gray-600">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={doConfirm}
              disabled={selected.size === 0 || busy === 'confirm'}
              className="btn-primary flex items-center gap-1.5 text-xs py-1.5 disabled:opacity-50"
            >
              <Check size={13} /> {busy === 'confirm' ? 'Gravando…' : `Confirmar importação (${selected.size})`}
            </button>
            <button
              onClick={doIgnore}
              disabled={selected.size === 0 || busy === 'ignore'}
              className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 disabled:opacity-50"
            >
              <X size={13} /> Ignorar ({selected.size})
            </button>
            <button
              onClick={() => setConfirmClear(true)}
              disabled={busy === 'clear'}
              className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 ml-auto text-gray-500"
              title="Remove todas as pendências (não afeta lançamentos já confirmados)"
            >
              <Trash2 size={12} /> Limpar pendentes
            </button>
          </div>
        </>
      )}

      <p className="text-xs text-gray-600 leading-relaxed">
        Linhas sem conta mapeada ficam destacadas em amarelo — revise o De-Para de contas
        (account_mapping) e recarregue. "Confirmar" grava os lançamentos com origem DINDIN;
        "Ignorar" descarta sem gravar. Os lançamentos aparecem no app após recarregar.
      </p>

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={doClear}
        title="Limpar pendências"
        message="Remover todas as linhas pendentes desta importação? Lançamentos já confirmados não são afetados."
        danger
        confirmLabel="Limpar"
      />
    </div>
  )
}
