import { useMemo, useState } from 'react'
import { ArrowUp, ArrowDown, Pencil, Trash2, Plus, Check, X, Lock } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import ConfirmDialog from '../shared/ConfirmDialog'
import Toast from '../shared/Toast'
import TipoDocumentoBadge from '../shared/TipoDocumentoBadge'
import { NATUREZAS, SIGLA_MAX, normalizarSigla, moverTipo, soltarTipo } from '../../lib/tiposDocumento'

const CORES = ['#6366f1', '#8b5cf6', '#f59e0b', '#0ea5e9', '#14b8a6', '#a855f7', '#ef4444', '#64748b', '#10b981', '#f97316', '#9ca3af', '#ec4899']
const rotuloNatureza = (n) => NATUREZAS.find(x => x.id === n)?.label || n
const VAZIO = { nome: '', sigla: '', natureza: 'ambos', cor: CORES[0] }

// Formulário compartilhado por "novo" e "editar".
function TipoForm({ inicial, onSalvar, onCancelar, salvando }) {
  const [f, setF] = useState(() => ({ ...VAZIO, ...inicial }))
  const [erro, setErro] = useState('')
  const set = (k, v) => { setErro(''); setF(p => ({ ...p, [k]: v })) }
  const salvar = async (e) => {
    e?.preventDefault?.()
    if (!f.nome.trim()) return setErro('Informe o nome.')
    if (!f.sigla.trim()) return setErro('Informe a sigla.')
    try { await onSalvar({ ...f, nome: f.nome.trim(), sigla: normalizarSigla(f.sigla) }) } catch (err) { setErro(err?.message || 'Falha ao salvar.') }
  }
  return (
    <form onSubmit={salvar} className="grid grid-cols-2 sm:grid-cols-[1fr_90px_130px] gap-2 items-end p-3 rounded-lg bg-gray-800/60 border border-gray-700">
      <div className="col-span-2 sm:col-span-1">
        <label className="label text-xs">Nome</label>
        <input autoFocus className="input py-1.5 text-sm" value={f.nome} maxLength={60} onChange={e => set('nome', e.target.value)} placeholder="Ex.: Boleto" />
      </div>
      <div>
        <label className="label text-xs">Sigla (até {SIGLA_MAX})</label>
        <input className="input py-1.5 text-sm uppercase" value={f.sigla} maxLength={SIGLA_MAX} onChange={e => set('sigla', normalizarSigla(e.target.value))} placeholder="BOL" />
      </div>
      <div>
        <label className="label text-xs">Natureza</label>
        <select className="input py-1.5 text-sm" value={f.natureza} onChange={e => set('natureza', e.target.value)}>
          {NATUREZAS.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>
      </div>
      <div className="col-span-2 sm:col-span-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-gray-400 mr-1">Cor</span>
        {CORES.map(c => (
          <button key={c} type="button" onClick={() => set('cor', c)} title={c}
            className={`w-6 h-6 rounded-full border-2 ${f.cor === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} />
        ))}
        <input type="color" value={f.cor || '#9ca3af'} onChange={e => set('cor', e.target.value)} className="w-7 h-7 bg-transparent cursor-pointer" title="Outra cor" />
        <span className="ml-2"><TipoDocumentoBadge tipo={{ sigla: normalizarSigla(f.sigla) || '—', nome: f.nome, cor: f.cor }} /></span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onCancelar} className="btn-secondary text-xs py-1.5 flex items-center gap-1"><X size={12} /> Cancelar</button>
          <button type="submit" disabled={salvando} className="btn-primary text-xs py-1.5 flex items-center gap-1"><Check size={12} /> Salvar</button>
        </div>
      </div>
      {erro && <p className="col-span-2 sm:col-span-3 text-[11px] text-red-400">{erro}</p>}
    </form>
  )
}

// Cadastros › Tipos de documento: lista ordenável (setas e arrastar ⠿, igual Categorias), editar
// nome/sigla/natureza/cor, ativar/inativar e excluir. Excluir um tipo EM USO só inativa (o banco
// decide); o tipo sistema (Fatura de Cartão) não sai.
export default function TiposDocumentoPanel() {
  const { tiposDocumento, addTipoDocumento, updateTipoDocumento, deleteTipoDocumento, reordenarTiposDocumento, data } = useApp()
  const [editando, setEditando] = useState(null) // id | 'novo' | null
  const [salvando, setSalvando] = useState(false)
  const [excluir, setExcluir] = useState(null)
  const [toast, setToast] = useState(null)
  const [arrastando, setArrastando] = useState(null)
  const [sobre, setSobre] = useState(null)

  const ids = useMemo(() => tiposDocumento.map(t => t.id), [tiposDocumento])
  // Contagem local (estado do app) só para informar; quem decide excluir × inativar é o banco.
  const usos = useMemo(() => {
    const m = new Map()
    for (const x of [...(data.schedules || []), ...(data.transactions || [])]) {
      if (x.tipoDocumentoId) m.set(x.tipoDocumentoId, (m.get(x.tipoDocumentoId) || 0) + 1)
    }
    return m
  }, [data.schedules, data.transactions])

  const avisar = (message, variant = 'success') => setToast({ message, variant })
  const reordenar = async (novos) => {
    if (novos === ids) return
    try { await reordenarTiposDocumento(novos) } catch (err) { avisar(err?.message || 'Falha ao reordenar.', 'error') }
  }
  const salvar = async (t) => {
    setSalvando(true)
    try {
      if (editando === 'novo') { await addTipoDocumento(t); avisar(`Tipo "${t.nome}" criado.`) }
      else { await updateTipoDocumento(t); avisar(`Tipo "${t.nome}" atualizado.`) }
      setEditando(null)
    } finally { setSalvando(false) }
  }
  const alternarAtivo = async (t) => {
    try {
      await updateTipoDocumento({ ...t, ativo: !t.ativo })
      avisar(t.ativo ? `"${t.nome}" inativado.` : `"${t.nome}" ativado.`)
    } catch (err) { avisar(err?.message || 'Falha ao alterar.', 'error') }
  }
  const confirmarExcluir = async (t) => {
    try {
      const r = await deleteTipoDocumento(t.id)
      avisar(r.inativado ? `"${t.nome}" está em uso — foi inativado em vez de excluído.` : `"${t.nome}" excluído.`)
    } catch (err) { avisar(err?.message || 'Falha ao excluir.', 'error') }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-300">Tipos de documento ({tiposDocumento.length})</h2>
        <button type="button" onClick={() => setEditando('novo')} className="ml-auto btn-secondary text-xs py-1.5 flex items-center gap-1.5">
          <Plus size={12} /> Novo tipo
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Classificam agendamentos e lançamentos (coluna "Doc." no Fluxo de Caixa e em Agendamentos). Arraste ⠿ ou use ↑↓
        para ordenar. Um tipo em uso não é excluído — é inativado (some dos formulários, mas continua nos registros).
      </p>

      {editando === 'novo' && <TipoForm inicial={null} onSalvar={salvar} onCancelar={() => setEditando(null)} salvando={salvando} />}

      <div className="space-y-1.5">
        {tiposDocumento.map((t, i) => editando === t.id ? (
          <TipoForm key={t.id} inicial={t} onSalvar={salvar} onCancelar={() => setEditando(null)} salvando={salvando} />
        ) : (
          <div
            key={t.id}
            draggable
            onDragStart={e => { setArrastando(t.id); e.dataTransfer.effectAllowed = 'move' }}
            onDragOver={e => { if (arrastando && arrastando !== t.id) { e.preventDefault(); setSobre(t.id) } }}
            onDrop={e => { e.preventDefault(); if (arrastando) reordenar(soltarTipo(ids, arrastando, t.id)); setArrastando(null); setSobre(null) }}
            onDragEnd={() => { setArrastando(null); setSobre(null) }}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 border transition-all ${
              arrastando === t.id ? 'opacity-40 border-transparent bg-gray-800'
                : sobre === t.id ? 'border-[#0F6E56] bg-[#0F6E56]/10'
                  : 'border-transparent bg-gray-800'
            } ${t.ativo ? '' : 'opacity-60'}`}
          >
            <span className="select-none text-base leading-none text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0" title="Arrastar para reordenar">⠿</span>
            <div className="flex gap-0.5 shrink-0">
              <button type="button" onClick={() => reordenar(moverTipo(ids, t.id, 'up'))} disabled={i === 0} title="Mover para cima"
                className="p-1 rounded hover:bg-gray-700 disabled:opacity-25 text-gray-400"><ArrowUp size={11} /></button>
              <button type="button" onClick={() => reordenar(moverTipo(ids, t.id, 'down'))} disabled={i === tiposDocumento.length - 1} title="Mover para baixo"
                className="p-1 rounded hover:bg-gray-700 disabled:opacity-25 text-gray-400"><ArrowDown size={11} /></button>
            </div>
            <span className="w-12 shrink-0"><TipoDocumentoBadge tipo={t} /></span>
            <span className="text-sm text-gray-200 truncate min-w-0">{t.nome}</span>
            {t.sistema && <span title="Tipo do sistema: não pode ser excluído"><Lock size={11} className="text-gray-500 shrink-0" /></span>}
            <span className="badge bg-gray-700 text-gray-400 text-xs shrink-0 hidden sm:inline">{rotuloNatureza(t.natureza)}</span>
            {usos.get(t.id) > 0 && <span className="text-[11px] text-gray-500 shrink-0 hidden md:inline">{usos.get(t.id)} uso{usos.get(t.id) !== 1 ? 's' : ''}</span>}
            <div className="ml-auto flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => alternarAtivo(t)}
                className={`text-[11px] px-2 py-0.5 rounded border ${t.ativo ? 'border-emerald-600/50 text-emerald-300' : 'border-gray-600 text-gray-400'}`}
                title={t.ativo ? 'Inativar (some dos formulários)' : 'Ativar'}>
                {t.ativo ? 'Ativo' : 'Inativo'}
              </button>
              <button type="button" onClick={() => setEditando(t.id)} className="p-1.5 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700" title="Editar"><Pencil size={12} /></button>
              {!t.sistema && (
                <button type="button" onClick={() => setExcluir(t)} className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-gray-700" title="Excluir"><Trash2 size={12} /></button>
              )}
            </div>
          </div>
        ))}
        {tiposDocumento.length === 0 && <p className="text-xs text-gray-600 text-center py-6">Nenhum tipo cadastrado (o banco ainda não respondeu?).</p>}
      </div>

      <ConfirmDialog
        open={!!excluir}
        onClose={() => setExcluir(null)}
        onConfirm={() => confirmarExcluir(excluir)}
        danger
        title="Excluir tipo de documento"
        confirmLabel="Excluir"
        message={`Excluir "${excluir?.nome || ''}"? Se estiver em uso em agendamentos ou lançamentos, ele será apenas inativado.`}
      />
      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
    </div>
  )
}
