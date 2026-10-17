import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Check, X, Pause, Play, Ban, Copy, MessageCircle, Pencil } from 'lucide-react'
import Modal from '../shared/Modal'
import Toast from '../shared/Toast'
import {
  listarClientes, detalheCliente, criarCliente, editarCliente, aprovarCliente, mudarStatusCliente, checarSiglaAdmin,
} from '../../lib/clientesApi'
import {
  STATUS_CLIENTE, ROTULO_STATUS, DOMINIO_CLIENTES, formatarDocumento, telefoneWhatsApp, candidatasSigla, normalizarSigla,
} from '../../lib/plataforma'

// CONTROLE DE CLIENTES da plataforma (só o administrador da plataforma — a API devolve 403 para
// qualquer outro). Fase de teste: aprovar NÃO cria usuário nem ambiente; só gera a mensagem.

const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const moeda = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const COR_STATUS = {
  pedido: 'bg-ambar/15 text-ambar', aprovado: 'bg-primary/15 text-primary-fg', ativo: 'bg-receita/15 text-receita',
  suspenso: 'bg-aviso/15 text-aviso', cancelado: 'bg-surface-2 text-texto-3', recusado: 'bg-perigo-bg text-perigo',
}
// Botões por status (mesmas transições da API).
const ACOES = [
  { id: 'aprovar', label: 'Aprovar', icon: Check, de: ['pedido', 'recusado'], classe: 'btn-primary' },
  { id: 'recusar', label: 'Recusar', icon: X, de: ['pedido'], classe: 'btn-secondary' },
  { id: 'suspender', label: 'Suspender', icon: Pause, de: ['aprovado', 'ativo'], classe: 'btn-secondary' },
  { id: 'reativar', label: 'Reativar', icon: Play, de: ['suspenso', 'cancelado'], classe: 'btn-secondary' },
  { id: 'cancelar', label: 'Cancelar', icon: Ban, de: ['pedido', 'aprovado', 'ativo', 'suspenso', 'recusado'], classe: 'btn-danger' },
]
const ROTULO_EVENTO = {
  pedido: 'Pedido recebido', criado: 'Cadastro manual', editado: 'Editado', aprovado: 'Aprovado', recusado: 'Recusado',
  suspenso: 'Suspenso', cancelado: 'Cancelado', boas_vindas: 'Boas-vindas', pedido_repetido: 'Pedido repetido',
}

function StatusBadge({ status }) {
  return <span className={`badge font-medium ${COR_STATUS[status] || ''}`}>{ROTULO_STATUS[status] || status}</span>
}

function Campo({ label, children, span = 1 }) {
  return (
    <div className={span === 2 ? 'sm:col-span-2' : ''}>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

const VAZIO = {
  nome: '', email: '', telefone: '', tipo_pessoa: 'PF', documento: '', empresa: '', sigla: '', como_conheceu: '',
  plano: '', valor_mensal: '', dia_vencimento: '', limite_usuarios: '', observacoes: '',
}
const paraForm = (c) => Object.fromEntries(Object.keys(VAZIO).map(k => [k, c?.[k] ?? VAZIO[k]]))

// Formulário de novo/edição. A sigla só muda enquanto o cliente não foi aprovado (a API também trava).
function ClienteForm({ inicial, onSalvo, onCancelar }) {
  const novo = !inicial
  const [f, setF] = useState(() => paraForm(inicial))
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [sigla, setSigla] = useState(null)
  const siglaTravada = !novo && !['pedido', 'recusado'].includes(inicial.status)
  const set = (k, v) => { setErro(''); setF(p => ({ ...p, [k]: v })) }

  useEffect(() => {
    if (!f.sigla || siglaTravada || f.sigla === inicial?.sigla) { setSigla(null); return }
    const t = setTimeout(() => {
      checarSiglaAdmin(f.sigla, f.tipo_pessoa === 'PJ' && f.empresa ? f.empresa : f.nome, inicial?.id).then(setSigla).catch(() => setSigla(null))
    }, 400)
    return () => clearTimeout(t)
  }, [f.sigla, f.nome, f.empresa, f.tipo_pessoa, inicial, siglaTravada])

  const salvar = async (e) => {
    e.preventDefault()
    setSalvando(true)
    try {
      const dados = novo ? f : { id: inicial.id, ...f }
      if (siglaTravada) delete dados.sigla
      onSalvo(novo ? await criarCliente(dados) : await editarCliente(dados))
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  const input = (k, props = {}) => <input className="input" value={f[k] ?? ''} onChange={e => set(k, e.target.value)} {...props} />
  return (
    <form onSubmit={salvar} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Nome" span={2}>{input('nome', { autoFocus: novo })}</Campo>
        <Campo label="E-mail">{input('email', { type: 'email' })}</Campo>
        <Campo label="Telefone / WhatsApp">{input('telefone', { type: 'tel' })}</Campo>
        <Campo label="Tipo">
          <select className="input" value={f.tipo_pessoa} onChange={e => set('tipo_pessoa', e.target.value)}>
            <option value="PF">Pessoa física</option>
            <option value="PJ">Pessoa jurídica</option>
          </select>
        </Campo>
        <Campo label={f.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'}>{input('documento', { inputMode: 'numeric' })}</Campo>
        {f.tipo_pessoa === 'PJ' && <Campo label="Empresa" span={2}>{input('empresa')}</Campo>}
        <Campo label="Sigla" span={2}>
          <div className="flex gap-2">
            <input className="input font-mono" value={f.sigla} disabled={siglaTravada}
              onChange={e => set('sigla', normalizarSigla(e.target.value))} />
            {novo && !f.sigla && (
              <button type="button" className="btn-secondary shrink-0"
                onClick={() => set('sigla', candidatasSigla(f.tipo_pessoa === 'PJ' && f.empresa ? f.empresa : f.nome)[0] || '')}>Sugerir</button>
            )}
          </div>
          <p className="text-[11px] mt-1 text-texto-3">
            <span className="font-mono">{f.sigla || 'sigla'}.{DOMINIO_CLIENTES}</span>
            {siglaTravada && ' · não muda depois da aprovação'}
            {sigla && (sigla.disponivel
              ? <span className="text-receita"> · disponível</span>
              : <span className="text-perigo"> · {sigla.motivo}{sigla.sugestao && <> · <button type="button" className="underline" onClick={() => set('sigla', sigla.sugestao)}>usar {sigla.sugestao}</button></>}</span>)}
          </p>
        </Campo>
        <Campo label="Como conheceu" span={2}>{input('como_conheceu')}</Campo>
        <Campo label="Plano">{input('plano')}</Campo>
        <Campo label="Valor mensal (R$)">{input('valor_mensal', { inputMode: 'decimal' })}</Campo>
        <Campo label="Dia de vencimento">{input('dia_vencimento', { type: 'number', min: 1, max: 31 })}</Campo>
        <Campo label="Limite de usuários">{input('limite_usuarios', { type: 'number', min: 1 })}</Campo>
        <Campo label="Observações" span={2}>
          <textarea className="input min-h-[80px]" value={f.observacoes ?? ''} onChange={e => set('observacoes', e.target.value)} />
        </Campo>
      </div>
      {erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  )
}

function Info({ label, valor }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-texto-3">{label}</p>
      <p className="text-sm text-texto-1 break-words">{valor || '—'}</p>
    </div>
  )
}

function DetalheCliente({ id, onMudou, onBoasVindas }) {
  const [dados, setDados] = useState(null)
  const [editando, setEditando] = useState(false)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(() => detalheCliente(id).then(setDados).catch(e => setErro(e.message)), [id])
  useEffect(() => { carregar() }, [carregar])

  const executar = async (acao) => {
    setErro('')
    let motivo
    if (acao !== 'aprovar') {
      motivo = window.prompt(`Motivo (opcional) para ${acao}:`)
      if (motivo === null) return
    }
    setOcupado(true)
    try {
      if (acao === 'aprovar') onBoasVindas(await aprovarCliente(id))
      else await mudarStatusCliente(id, acao, motivo)
      await carregar()
      onMudou()
    } catch (e) {
      setErro(e.message)
    } finally {
      setOcupado(false)
    }
  }

  if (!dados) return <p className="text-sm text-texto-3">{erro || 'Carregando…'}</p>
  const c = dados.cliente
  if (editando) {
    return <ClienteForm inicial={c} onCancelar={() => setEditando(false)} onSalvo={() => { setEditando(false); carregar(); onMudou() }} />
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={c.status} />
        <span className="text-xs text-texto-3">origem: {c.origem === 'manual' ? 'manual' : 'formulário'} · criado {dataHora(c.created_at)}</span>
        <button className="btn-secondary ml-auto inline-flex items-center gap-1.5 !py-1.5" onClick={() => setEditando(true)}><Pencil size={13} /> Editar</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Info label="Nome" valor={c.nome} />
        <Info label="E-mail" valor={c.email} />
        <Info label="Telefone" valor={c.telefone} />
        <Info label={c.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'} valor={c.documento && formatarDocumento(c.documento)} />
        {c.tipo_pessoa === 'PJ' && <Info label="Empresa" valor={c.empresa} />}
        <Info label="Endereço" valor={c.sigla && `${c.sigla}.${DOMINIO_CLIENTES}`} />
        <Info label="Como conheceu" valor={c.como_conheceu} />
        <Info label="Plano" valor={c.plano} />
        <Info label="Valor mensal" valor={c.valor_mensal != null && moeda(c.valor_mensal)} />
        <Info label="Vencimento" valor={c.dia_vencimento && `Dia ${c.dia_vencimento}`} />
        <Info label="Limite de usuários" valor={c.limite_usuarios} />
        <Info label="Aceite dos termos" valor={c.aceite_termos_em && `${dataHora(c.aceite_termos_em)} · IP ${c.aceite_ip || '—'}`} />
      </div>
      {c.observacoes && <div><p className="text-[11px] uppercase tracking-wide text-texto-3">Observações</p><p className="text-sm text-texto-1 whitespace-pre-wrap">{c.observacoes}</p></div>}

      <div className="flex flex-wrap gap-2">
        {ACOES.filter(a => a.de.includes(c.status)).map(({ id: acao, label, icon: Icon, classe }) => (
          <button key={acao} className={`${classe} inline-flex items-center gap-1.5`} disabled={ocupado} onClick={() => executar(acao)}>
            <Icon size={14} /> {label}
          </button>
        ))}
        {c.status === 'aprovado' && (
          <button className="btn-secondary inline-flex items-center gap-1.5" disabled={ocupado} onClick={() => executar('aprovar')}>
            <MessageCircle size={14} /> Mensagem de boas-vindas
          </button>
        )}
      </div>
      {erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}

      <div>
        <h3 className="text-sm font-semibold text-texto-1 mb-2">Histórico</h3>
        <ul className="space-y-2">
          {dados.historico.map(h => (
            <li key={h.id} className="text-xs border-l-2 border-borda-forte pl-3">
              <p className="text-texto-1"><span className="font-medium">{ROTULO_EVENTO[h.evento] || h.evento}</span>{h.detalhe && <span className="text-texto-2"> — {h.detalhe}</span>}</p>
              <p className="text-texto-3">{dataHora(h.created_at)}{h.autor && ` · ${h.autor}`}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function BoasVindasModal({ dados, onFechar }) {
  const [copiado, setCopiado] = useState(false)
  if (!dados) return null
  const fone = telefoneWhatsApp(dados.cliente?.telefone)
  const copiar = async () => {
    try { await navigator.clipboard.writeText(dados.mensagem); setCopiado(true) } catch { setCopiado(false) }
  }
  return (
    <Modal open onClose={onFechar} title="Cliente aprovado — mensagem de boas-vindas">
      <div className="space-y-4">
        <textarea readOnly className="input font-mono text-xs min-h-[220px]" value={dados.mensagem} />
        <p className="text-[11px] text-texto-3">Fase de teste: nenhum usuário nem ambiente foi criado.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-secondary inline-flex items-center gap-1.5" onClick={copiar}><Copy size={14} /> {copiado ? 'Copiado' : 'Copiar'}</button>
          {fone ? (
            <a className="btn-primary inline-flex items-center gap-1.5" target="_blank" rel="noopener noreferrer"
              href={`https://wa.me/${fone}?text=${encodeURIComponent(dados.mensagem)}`}>
              <MessageCircle size={14} /> Abrir no WhatsApp
            </a>
          ) : (
            <span className="text-xs text-texto-3 self-center">Sem telefone cadastrado para o WhatsApp</span>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default function ClientesPanel({ onMudou = () => {} }) {
  const [clientes, setClientes] = useState(null)
  const [filtro, setFiltro] = useState('pedido')
  const [aberto, setAberto] = useState(null)
  const [novo, setNovo] = useState(false)
  const [boasVindas, setBoasVindas] = useState(null)
  const [erro, setErro] = useState('')
  const [toast, setToast] = useState(null)

  const carregar = useCallback(() => listarClientes()
    .then(r => { setClientes(r.clientes); setErro('') })
    .catch(e => setErro(e.message)), [])
  useEffect(() => { carregar() }, [carregar])
  const mudou = useCallback(() => { carregar(); onMudou() }, [carregar, onMudou])

  const contagem = useMemo(() => {
    const n = Object.fromEntries(STATUS_CLIENTE.map(s => [s, 0]))
    for (const c of clientes || []) n[c.status] = (n[c.status] || 0) + 1
    return n
  }, [clientes])
  const lista = useMemo(() => (clientes || []).filter(c => filtro === 'todos' || c.status === filtro), [clientes, filtro])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {['pedido', ...STATUS_CLIENTE.filter(s => s !== 'pedido'), 'todos'].map(s => (
            <button key={s} onClick={() => setFiltro(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${filtro === s ? 'border-primary text-primary-fg bg-primary/10' : 'border-borda text-texto-2 hover:bg-surface-hover'}`}>
              {s === 'todos' ? 'Todos' : ROTULO_STATUS[s]}
              <span className="ml-1.5 text-texto-3">{s === 'todos' ? clientes?.length ?? 0 : contagem[s]}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button className="btn-secondary inline-flex items-center gap-1.5" onClick={mudou} title="Recarregar"><RefreshCw size={14} /></button>
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={() => setNovo(true)}><Plus size={14} /> Novo cliente</button>
        </div>
      </div>
      {contagem.pedido > 0 && (
        <p className="text-sm text-ambar">{contagem.pedido} pedido{contagem.pedido > 1 ? 's' : ''} novo{contagem.pedido > 1 ? 's' : ''} aguardando análise.</p>
      )}
      {erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}

      <div className="card !p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-texto-3 border-b border-borda text-left">
              <th className="font-medium px-4 py-2.5">Cliente</th>
              <th className="font-medium px-4 py-2.5 hidden md:table-cell">Contato</th>
              <th className="font-medium px-4 py-2.5">Sigla</th>
              <th className="font-medium px-4 py-2.5">Status</th>
              <th className="font-medium px-4 py-2.5 hidden md:table-cell">Pedido em</th>
            </tr>
          </thead>
          <tbody>
            {clientes == null && <tr><td colSpan={5} className="px-4 py-6 text-center text-texto-3">Carregando…</td></tr>}
            {clientes && !lista.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-texto-3">Nenhum cliente neste filtro.</td></tr>}
            {lista.map(c => (
              <tr key={c.id} onClick={() => setAberto(c.id)} className="border-b border-borda/60 last:border-0 hover:bg-surface-hover cursor-pointer">
                <td className="px-4 py-2.5">
                  <p className="text-texto-1 font-medium">{c.nome}</p>
                  {c.empresa && <p className="text-xs text-texto-3">{c.empresa}</p>}
                </td>
                <td className="px-4 py-2.5 hidden md:table-cell">
                  <p className="text-texto-2">{c.email}</p>
                  {c.telefone && <p className="text-xs text-texto-3">{c.telefone}</p>}
                </td>
                <td className="px-4 py-2.5 font-mono text-texto-2">{c.sigla || '—'}</td>
                <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
                <td className="px-4 py-2.5 hidden md:table-cell text-texto-3 text-xs">{dataHora(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!aberto} onClose={() => setAberto(null)} title="Cliente" size="lg">
        {aberto && <DetalheCliente id={aberto} onMudou={mudou} onBoasVindas={setBoasVindas} />}
      </Modal>
      <Modal open={novo} onClose={() => setNovo(false)} title="Novo cliente" size="lg">
        {novo && <ClienteForm onCancelar={() => setNovo(false)} onSalvo={(c) => { setNovo(false); setToast('Cliente cadastrado'); mudou(); setAberto(c.id) }} />}
      </Modal>
      <BoasVindasModal dados={boasVindas} onFechar={() => setBoasVindas(null)} />
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
