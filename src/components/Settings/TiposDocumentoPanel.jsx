import { useMemo, useState } from 'react'
import { ArrowUp, ArrowDown, Pencil, Trash2, Plus, Check, X, Lock } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import ConfirmDialog from '../shared/ConfirmDialog'
import Toast from '../shared/Toast'
import TipoDocumentoBadge from '../shared/TipoDocumentoBadge'
import { NATUREZAS, SIGLA_MAX, normalizarSigla, moverTipo, soltarTipo } from '../../lib/tiposDocumento'
import { CORES_TIPO_DOCUMENTO } from '../../lib/chartPalette'

const CORES = CORES_TIPO_DOCUMENTO
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
    <form onSubmit={salvar} className="grid grid-cols-2 sm:grid-cols-[1fr_90px_130px] gap-2 items-end p-3 rounded-lg bg-surface-2/60 border border-borda-forte">
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
        <span className="text-xs text-texto-2 mr-1">Cor</span>
        {CORES.map(c => (
          <button key={c} type="button" onClick={() => set('cor', c)} title={c}
            className={`w-6 h-6 rounded-full border-2 ${f.cor === c ? 'border-texto-1' : 'border-transparent'}`} style={{ background: c }} />
        ))}
        <input type="color" value={f.cor || '#9ca3af'} onChange={e => set('cor', e.target.value)} className="w-7 h-7 bg-transparent cursor-pointer" title="Outra cor" />
        <span className="ml-2"><TipoDocumentoBadge tipo={{ sigla: normalizarSigla(f.sigla) || '—', nome: f.nome, cor: f.cor }} /></span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onCancelar} className="btn-secondary text-xs py-1.5 flex items-center gap-1"><X size={12} /> Cancelar</button>
          <button type="submit" disabled={salvando} className="btn-primary text-xs py-1.5 flex items-center gap-1"><Check size={12} /> Salvar</button>
        </div>
      </div>
      {erro && <p className="col-span-2 sm:col-span-3 text-[11px] text-perigo">{erro}</p>}
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
        <h2 className="text-sm font-semibold text-texto-2">Tipos de documento ({tiposDocumento.length})</h2>
        <button type="button" onClick={() => setEditando('novo')} className="ml-auto btn-secondary text-xs py-1.5 flex items-center gap-1.5">
          <Plus size={12} /> Novo tipo
        </button>
      </div>
      <p className="text-xs text-texto-3">
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
              arrastando === t.id ? 'opacity-40 border-transparent bg-surface-2'
                : sobre === t.id ? 'border-primary bg-primary/10'
                  : 'border-transparent bg-surface-2'
            } ${t.ativo ? '' : 'opacity-60'}`}
          >
            <span className="select-none text-base leading-none text-texto-3 hover:text-texto-2 cursor-grab active:cursor-grabbing shrink-0" title="Arrastar para reordenar">⠿</span>
            <div className="flex gap-0.5 shrink-0">
              <button type="button" onClick={() => reordenar(moverTipo(ids, t.id, 'up'))} disabled={i === 0} title="Mover para cima"
                className="p-1 rounded hover:bg-surface-hover disabled:opacity-25 text-texto-2"><ArrowUp size={11} /></button>
              <button type="button" onClick={() => reordenar(moverTipo(ids, t.id, 'down'))} disabled={i === tiposDocumento.length - 1} title="Mover para baixo"
                className="p-1 rounded hover:bg-surface-hover disabled:opacity-25 text-texto-2"><ArrowDown size={11} /></button>
            </div>
            <span className="w-12 shrink-0"><TipoDocumentoBadge tipo={t} /></span>
            <span className="text-sm text-texto-1 truncate min-w-0">{t.nome}</span>
            {t.sistema && <span title="Tipo do sistema: não pode ser excluído"><Lock size={11} className="text-texto-3 shrink-0" /></span>}
            <span className="badge bg-surface-hover text-texto-2 text-xs shrink-0 hidden sm:inline">{rotuloNatureza(t.natureza)}</span>
            {usos.get(t.id) > 0 && <span className="text-[11px] text-texto-3 shrink-0 hidden md:inline">{usos.get(t.id)} uso{usos.get(t.id) !== 1 ? 's' : ''}</span>}
            <div className="ml-auto flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => alternarAtivo(t)}
                className={`text-[11px] px-2 py-0.5 rounded border ${t.ativo ? 'border-primary/50 text-primary-fg' : 'border-borda-forte text-texto-2'}`}
                title={t.ativo ? 'Inativar (some dos formulários)' : 'Ativar'}>
                {t.ativo ? 'Ativo' : 'Inativo'}
              </button>
              <button type="button" onClick={() => setEditando(t.id)} className="p-1.5 rounded text-texto-2 hover:text-texto-1 hover:bg-surface-hover" title="Editar"><Pencil size={12} /></button>
              {!t.sistema && (
                <button type="button" onClick={() => setExcluir(t)} className="p-1.5 rounded text-texto-3 hover:text-perigo hover:bg-surface-hover" title="Excluir"><Trash2 size={12} /></button>
              )}
            </div>
          </div>
        ))}
        {tiposDocumento.length === 0 && <p className="text-xs text-texto-3 text-center py-6">Nenhum tipo cadastrado (o banco ainda não respondeu?).</p>}
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
