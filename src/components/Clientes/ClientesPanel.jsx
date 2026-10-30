import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Check, X, Pause, Play, Ban, Copy, MessageCircle, Pencil, Mail, Loader2, Circle, AlertTriangle, ExternalLink, Unlock, Trash2, BarChart3 } from 'lucide-react'
import Modal from '../shared/Modal'
import Toast from '../shared/Toast'
import AnaliseCliente from './AnaliseCliente'
import {
  listarClientes, detalheCliente, criarCliente, editarCliente, aprovarCliente, mudarStatusCliente, checarSiglaAdmin,
  andamentoProvisionamento, reenviarConviteCliente, tentativasSenha, liberarSenha, excluirClienteApi, salvarLimitesIa,
} from '../../lib/clientesApi'
import {
  STATUS_CLIENTE, ROTULO_STATUS, DOMINIO_CLIENTES, formatarDocumento, linkWhatsApp, candidatasSigla, normalizarSigla,
  mascararTelefone, fixoValido,
} from '../../lib/plataforma'

// CONTROLE DE CLIENTES da plataforma (só o administrador da plataforma — a API devolve 403 para
// qualquer outro). Aprovar CRIA o ambiente do cliente (banco no Neon, estrutura, kit básico, admin e
// convite por e-mail) em passos, com o progresso na tela (api/_provisionar.js). Suspender/cancelar/
// reativar também mudam o ambiente (login e API do cliente); o banco nunca é apagado daqui.

const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const moeda = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const COR_STATUS = {
  pedido: 'bg-ambar/15 text-ambar', aprovado: 'bg-primary/15 text-primary-fg', ativo: 'bg-receita/15 text-receita',
  suspenso: 'bg-aviso/15 text-aviso', cancelado: 'bg-surface-2 text-texto-3', recusado: 'bg-perigo-bg text-perigo',
}
// Convite novo (48 h) + boas-vindas por e-mail (cliente ativo; a API registra no histórico).
async function reenviarConvite(id, onToast) {
  try {
    const r = await reenviarConviteCliente(id)
    onToast({ message: `Convite enviado para ${r.para}` })
    return true
  } catch (e) {
    onToast({ message: `Falha ao enviar o convite: ${e.message}`, variant: 'error' })
    return false
  }
}

// Botões por status (mesmas transições da API).
const ACOES = [
  { id: 'aprovar', label: 'Aprovar', icon: Check, de: ['pedido', 'recusado'], classe: 'btn-primary' },
  { id: 'aprovar', label: 'Continuar ativação', icon: Play, de: ['aprovado'], classe: 'btn-primary' },
  { id: 'recusar', label: 'Recusar', icon: X, de: ['pedido'], classe: 'btn-secondary' },
  { id: 'suspender', label: 'Suspender', icon: Pause, de: ['aprovado', 'ativo'], classe: 'btn-secondary' },
  { id: 'reativar', label: 'Reativar', icon: Play, de: ['suspenso', 'cancelado'], classe: 'btn-secondary' },
  { id: 'cancelar', label: 'Cancelar', icon: Ban, de: ['pedido', 'aprovado', 'ativo', 'suspenso', 'recusado'], classe: 'btn-danger' },
]
const ROTULO_EVENTO = {
  pedido: 'Pedido recebido', criado: 'Cadastro manual', editado: 'Editado', aprovado: 'Aprovado', recusado: 'Recusado',
  suspenso: 'Suspenso', cancelado: 'Cancelado', boas_vindas: 'Boas-vindas', pedido_repetido: 'Pedido repetido',
  email_enviado: 'E-mail enviado', email_falhou: 'E-mail falhou', ativo: 'Ativo',
  prov_ambiente: 'Provisionamento · ambiente', prov_database: 'Provisionamento · banco de dados',
  prov_estrutura: 'Provisionamento · estrutura', prov_kit: 'Provisionamento · kit básico',
  prov_admin: 'Provisionamento · admin', prov_convite: 'Provisionamento · convite',
  prov_ativar: 'Provisionamento · ambiente ativo', prov_falhou: 'Falha no provisionamento',
  convite_reenviado: 'Convite reenviado', senha_liberada: 'Limite de senha liberado',
  excl_database: 'Exclusão · banco de dados', excl_falhou: 'Falha na exclusão',
  analise_acesso: 'Análise do Cliente acessada',
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
const paraForm = (c) => ({
  ...Object.fromEntries(Object.keys(VAZIO).map(k => [k, c?.[k] ?? VAZIO[k]])),
  telefone: mascararTelefone(c?.telefone),
  // Sem coluna própria: fixo gravado só pode ter entrado marcado "não é WhatsApp".
  nao_whatsapp: !!c?.telefone && fixoValido(c.telefone),
})

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
        <Campo label="Telefone / WhatsApp">
          <input className="input" type="tel" value={f.telefone} placeholder="(43) 99999-9999"
            onChange={e => set('telefone', mascararTelefone(e.target.value))} />
          <label className="flex items-center gap-2 text-xs text-texto-3 mt-1.5 cursor-pointer">
            <input type="checkbox" className="w-3.5 h-3.5 accent-primary" checked={f.nao_whatsapp} onChange={e => set('nao_whatsapp', e.target.checked)} />
            Não é WhatsApp (fixo)
          </label>
        </Campo>
        <Campo label="Tipo">
          <select className="input" value={f.tipo_pessoa} onChange={e => set('tipo_pessoa', e.target.value)}>
            <option value="PF">Pessoa física</option>
            <option value="PJ">Pessoa jurídica</option>
          </select>
        </Campo>
        <Campo label={f.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'}>{input('documento', { inputMode: f.tipo_pessoa === 'PJ' ? 'text' : 'numeric', autoCapitalize: 'characters' })}</Campo>
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

const horaBrasilia = (v) => new Date(v).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
const ROTULO_RESULTADO = {
  enviado: 'Enviado', nao_encontrado: 'Login não encontrado', bloqueado_ip: 'Bloqueado (limite por IP)',
  bloqueado_usuario: 'Bloqueado (limite por usuário)', falha_envio: 'Falha no envio do e-mail', em_andamento: 'Em andamento',
}
// Limite diário do Assistente IA por usuário deste cliente (padrão 100/dia, 30 com imagem).
function LimiteIa({ id, limites, onMudou, onToast }) {
  const [diario, setDiario] = useState(String(limites?.diario ?? 100))
  const [imagem, setImagem] = useState(String(limites?.imagem ?? 30))
  const [salvando, setSalvando] = useState(false)
  const salvar = async () => {
    setSalvando(true)
    try {
      await salvarLimitesIa(id, Number(diario), Number(imagem))
      onToast({ message: 'Limite do assistente salvo' })
      onMudou()
    } catch (e) {
      onToast({ message: `Falha ao salvar: ${e.message}`, variant: 'error' })
    } finally {
      setSalvando(false)
    }
  }
  const mudou = String(limites?.diario) !== diario || String(limites?.imagem) !== imagem
  return (
    <div className="border border-borda rounded-lg p-3 space-y-2">
      <h3 className="text-sm font-semibold text-texto-1">Assistente IA: limite por usuário por dia</h3>
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="space-y-1">
          <span className="text-texto-3">Pedidos por dia</span>
          <input className="input w-24 !py-1 text-right" inputMode="numeric" value={diario} onChange={e => setDiario(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="space-y-1">
          <span className="text-texto-3">Dos quais com imagem</span>
          <input className="input w-24 !py-1 text-right" inputMode="numeric" value={imagem} onChange={e => setImagem(e.target.value.replace(/\D/g, ''))} />
        </label>
        <button className="btn-secondary !py-1 text-xs" onClick={salvar} disabled={salvando || !mudou}>Salvar</button>
      </div>
      {limites?.semColuna && <p className="text-[11px] text-aviso">Central sem a migração do limite: valendo o padrão (100/30). Rode scripts/migrar-central.js.</p>}
    </div>
  )
}

const COR_RESULTADO = { enviado: 'text-receita', bloqueado_ip: 'text-perigo', bloqueado_usuario: 'text-perigo', falha_envio: 'text-perigo' }

// Quadro "Tentativas de senha" (pedidos de "Esqueci minha senha" da última hora neste ambiente).
// IP mascarado; nunca token. "Liberar agora" zera só os registros deste ambiente.
function TentativasSenha({ id, onMudou, onToast }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [liberando, setLiberando] = useState(false)
  const carregar = useCallback(() => tentativasSenha(id).then(setDados).catch(e => setErro(e.message)), [id])
  useEffect(() => { carregar() }, [carregar])
  const liberar = async () => {
    if (!window.confirm('Zerar o limite de tentativas de senha deste ambiente?')) return
    setLiberando(true)
    try {
      const r = await liberarSenha(id)
      onToast({ message: `Limite liberado (${r.apagados} registro${r.apagados === 1 ? '' : 's'} apagado${r.apagados === 1 ? '' : 's'})` })
      await carregar()
      onMudou()
    } catch (e) {
      onToast({ message: `Falha ao liberar: ${e.message}`, variant: 'error' })
    } finally {
      setLiberando(false)
    }
  }
  if (erro) return <p className="text-xs text-perigo">{erro}</p>
  if (!dados || dados.semAmbiente) return null
  return (
    <div className="border border-borda rounded-lg p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-texto-1">Tentativas de senha</h3>
        <span className="text-[11px] text-texto-3">limite: {dados.limites.porIpPorHora}/h por IP · {dados.limites.porUsuarioPorHora}/h por usuário</span>
        <button className="btn-secondary ml-auto inline-flex items-center gap-1.5 !py-1 text-xs" onClick={liberar} disabled={liberando}>
          <Unlock size={12} /> Liberar agora
        </button>
      </div>
      {dados.liberadoEm ? (
        <p className="text-xs text-perigo">Pode tentar de novo a partir de {horaBrasilia(dados.liberadoEm)}
          {dados.bloqueios.length > 0 && <span className="text-texto-3"> ({dados.bloqueios.map(b => `${b.tipo === 'ip' ? 'IP' : 'usuário'} ${b.alvo} até ${horaBrasilia(b.ate)}`).join(' · ')})</span>}
        </p>
      ) : (
        <p className="text-xs text-receita">Liberado</p>
      )}
      {dados.pedidos.length === 0 ? (
        <p className="text-xs text-texto-3">Nenhum pedido na última hora.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-texto-3 text-left"><th className="font-medium py-1 pr-3">Horário</th><th className="font-medium py-1 pr-3">Login digitado</th><th className="font-medium py-1 pr-3">Resultado</th><th className="font-medium py-1">IP</th></tr>
            </thead>
            <tbody>
              {dados.pedidos.map((p, i) => (
                <tr key={i} className="border-t border-borda/60">
                  <td className="py-1 pr-3 text-texto-2 whitespace-nowrap">{horaBrasilia(p.quando)}</td>
                  <td className="py-1 pr-3 text-texto-1 break-all">{p.login || '—'}</td>
                  <td className={`py-1 pr-3 whitespace-nowrap ${COR_RESULTADO[p.resultado] || 'text-texto-2'}`}>{ROTULO_RESULTADO[p.resultado] || p.resultado || '—'}</td>
                  <td className="py-1 text-texto-3 font-mono whitespace-nowrap">{p.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// EXCLUIR CLIENTE: explica o que será apagado; o botão só habilita com a sigla exata digitada.
function ExcluirClienteModal({ cliente, ambiente, onFechar, onExcluido }) {
  const [digitado, setDigitado] = useState('')
  const [excluindo, setExcluindo] = useState(false)
  const [erro, setErro] = useState('')
  const confere = digitado.trim().toLowerCase() === String(cliente.sigla || '')
  const excluir = async () => {
    setErro('')
    setExcluindo(true)
    try {
      await excluirClienteApi(cliente.id, digitado.trim().toLowerCase())
      onExcluido()
    } catch (e) {
      setErro(e.message)
    } finally {
      setExcluindo(false)
    }
  }
  return (
    <Modal open onClose={excluindo ? () => {} : onFechar} title="Excluir cliente">
      <div className="space-y-4 text-sm">
        <p className="text-texto-1">Excluir <span className="font-semibold">{cliente.nome}</span> ({String(cliente.sigla).toUpperCase()}) <span className="text-perigo font-medium">de forma definitiva</span>. Será apagado:</p>
        <ul className="list-disc pl-5 space-y-1 text-texto-2 text-xs">
          {ambiente
            ? <li>o banco de dados <span className="font-mono">{ambiente.database_name}</span> no Neon, com tudo o que o cliente lançou (contas, lançamentos, usuários, senhas);</li>
            : <li>nenhum banco de dados (o cliente nunca foi aprovado);</li>}
          <li>no banco central: o ambiente, os códigos de acesso, os registros de tentativas de senha, o histórico e o cadastro do cliente.</li>
          <li>Fica só um registro de auditoria (sigla, nome, data e quem excluiu). A sigla fica livre para outro cliente.</li>
        </ul>
        <div>
          <label className="label">Para confirmar, digite a sigla <span className="font-mono font-semibold">{String(cliente.sigla).toUpperCase()}</span></label>
          <input className="input font-mono uppercase" value={digitado} onChange={e => setDigitado(e.target.value)} autoFocus autoComplete="off" spellCheck={false} />
        </div>
        {erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onFechar} disabled={excluindo}>Cancelar</button>
          <button className="btn-danger inline-flex items-center gap-1.5" disabled={!confere || excluindo} onClick={excluir}>
            <Trash2 size={14} /> {excluindo ? 'Excluindo…' : 'Excluir definitivamente'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function DetalheCliente({ id, onMudou, onProvisionar, onToast, onExcluido, onAnalise }) {
  const [dados, setDados] = useState(null)
  const [editando, setEditando] = useState(false)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  const carregar = useCallback(() => detalheCliente(id).then(setDados).catch(e => setErro(e.message)), [id])
  useEffect(() => { carregar() }, [carregar])

  const reenviar = async () => {
    setOcupado(true)
    await reenviarConvite(id, onToast)
    await carregar()
    setOcupado(false)
  }

  const executar = async (acao) => {
    setErro('')
    // Aprovar abre o provisionamento (progresso passo a passo; ele avisa ao terminar).
    if (acao === 'aprovar') {
      const c = dados?.cliente
      if (c?.status !== 'aprovado' && !window.confirm(`Criar o ambiente ${String(c?.sigla || '').toUpperCase()} e enviar o convite para ${c?.email}?`)) return
      onProvisionar(id)
      return
    }
    const motivo = window.prompt(`Motivo (opcional) para ${acao}:`)
    if (motivo === null) return
    setOcupado(true)
    try {
      await mudarStatusCliente(id, acao, motivo)
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
        <Info label="Telefone" valor={c.telefone && mascararTelefone(c.telefone)} />
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
          <button key={`${acao}-${label}`} className={`${classe} inline-flex items-center gap-1.5`} disabled={ocupado} onClick={() => executar(acao)}>
            <Icon size={14} /> {label}
          </button>
        ))}
        {c.status === 'ativo' && (
          <>
            <button className="btn-secondary inline-flex items-center gap-1.5" disabled={ocupado} onClick={reenviar} title={`Convite novo (48 h) para ${c.email}`}>
              <Mail size={14} /> Reenviar convite
            </button>
            <button className="btn-secondary inline-flex items-center gap-1.5" disabled={ocupado} onClick={() => onProvisionar(id)}>
              <MessageCircle size={14} /> Mensagem de boas-vindas
            </button>
            {c.sigla && (
              <button className="btn-secondary inline-flex items-center gap-1.5" disabled={ocupado} onClick={() => onAnalise(c)}>
                <BarChart3 size={14} /> Análise do Cliente
              </button>
            )}
          </>
        )}
      </div>
      {erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}

      {dados.ambiente && <TentativasSenha id={id} onMudou={carregar} onToast={onToast} />}
      {dados.ambiente && dados.iaLimites && (
        <LimiteIa key={`${dados.iaLimites.diario}-${dados.iaLimites.imagem}`} id={id} limites={dados.iaLimites} onMudou={carregar} onToast={onToast} />
      )}

      {dados.exclusao?.pode ? (
        <div className="flex justify-end">
          <button className="btn-danger inline-flex items-center gap-1.5" disabled={ocupado} onClick={() => setExcluindo(true)}>
            <Trash2 size={14} /> Excluir cliente
          </button>
        </div>
      ) : ['ativo', 'suspenso', 'aprovado'].includes(c.status) && (
        <p className="text-[11px] text-texto-3 text-right">Para excluir, cancele o cliente antes.</p>
      )}
      {excluindo && (
        <ExcluirClienteModal cliente={c} ambiente={dados.ambiente} onFechar={() => setExcluindo(false)}
          onExcluido={() => { setExcluindo(false); onToast({ message: `Cliente ${String(c.sigla).toUpperCase()} excluído` }); onExcluido() }} />
      )}

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

function IconePasso({ estado }) {
  if (estado === 'feito') return <Check size={14} className="text-receita shrink-0" />
  if (estado === 'rodando') return <Loader2 size={14} className="text-primary-fg animate-spin shrink-0" />
  if (estado === 'erro') return <AlertTriangle size={14} className="text-perigo shrink-0" />
  return <Circle size={14} className="text-texto-3 shrink-0" />
}

// Laço do provisionamento: andamento atual e, até concluir, um passo por chamada.
async function rodarProvisionamento(id, { onEstado, onErro, onFim, onMudou }) {
  try {
    let r = await andamentoProvisionamento(id)
    onEstado(r)
    for (let i = 0; !r.concluido && i < 20; i++) {
      r = await aprovarCliente(id)
      onEstado(r)
      onMudou()
    }
  } catch (e) {
    onErro(e.message)
    onMudou()
  } finally {
    onFim()
  }
}

// PROVISIONAMENTO do ambiente: chama a API passo a passo (cada chamada executa o próximo passo
// pendente) e mostra o andamento. Erro → mensagem + "Tentar novamente" (continua do passo que
// falhou; nada é duplicado). Concluído → mensagem de boas-vindas para copiar/WhatsApp.
function ProvisionamentoModal({ id, onFechar, onMudou }) {
  const [estado, setEstado] = useState(null)
  const [rodando, setRodando] = useState(true)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)

  const executar = useCallback(() => rodarProvisionamento(id, { onEstado: setEstado, onErro: setErro, onFim: () => setRodando(false), onMudou }), [id, onMudou])
  useEffect(() => { executar() }, [executar])
  const tentarDeNovo = () => { setErro(''); setRodando(true); executar() }

  const c = estado?.cliente
  const whatsapp = estado?.mensagem ? linkWhatsApp(c?.telefone, estado.mensagem) : null
  const copiar = async () => {
    try { await navigator.clipboard.writeText(estado.mensagem); setCopiado(true) } catch { setCopiado(false) }
  }
  const estadoDoPasso = (p) => (p.feito ? 'feito' : p.id === estado?.proximo ? (rodando ? 'rodando' : erro ? 'erro' : 'pendente') : 'pendente')

  return (
    <Modal open onClose={rodando ? () => {} : onFechar} title={estado?.concluido ? 'Ambiente pronto' : 'Criando o ambiente do cliente'}>
      <div className="space-y-4">
        {c && <p className="text-sm text-texto-2"><span className="font-semibold text-texto-1">{c.nome}</span> · {c.sigla}.{DOMINIO_CLIENTES}</p>}
        {!estado && !erro && <p className="text-sm text-texto-3">Carregando…</p>}
        {estado && (
          <ol className="space-y-2">
            {estado.passos.map(p => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <IconePasso estado={estadoDoPasso(p)} />
                <span className={p.feito ? 'text-texto-1' : 'text-texto-2'}>{p.rotulo}</span>
              </li>
            ))}
          </ol>
        )}
        {erro && (
          <div className="space-y-2">
            <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>
            <button className="btn-primary inline-flex items-center gap-1.5" onClick={tentarDeNovo} disabled={rodando}>
              <RefreshCw size={14} /> Tentar novamente
            </button>
          </div>
        )}
        {estado?.concluido && (
          <>
            <p className="text-sm text-receita">Ambiente ativo. O e-mail de boas-vindas com o botão &quot;Criar minha senha&quot; foi enviado para {c?.email}.</p>
            <textarea readOnly className="input font-mono text-xs min-h-[200px]" value={estado.mensagem} />
            <div className="flex flex-wrap justify-end gap-2">
              <a className="btn-secondary inline-flex items-center gap-1.5" href={estado.endereco} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Abrir endereço</a>
              <button className="btn-secondary inline-flex items-center gap-1.5" onClick={copiar}><Copy size={14} /> {copiado ? 'Copiado' : 'Copiar'}</button>
              {whatsapp ? (
                <a className="btn-primary inline-flex items-center gap-1.5" target="_blank" rel="noopener noreferrer" href={whatsapp}>
                  <MessageCircle size={14} /> Abrir no WhatsApp
                </a>
              ) : (
                <button type="button" disabled className="btn-primary inline-flex items-center gap-1.5" title="O telefone cadastrado não é um celular">
                  <MessageCircle size={14} /> Abrir no WhatsApp
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export default function ClientesPanel({ onMudou = () => {} }) {
  const [clientes, setClientes] = useState(null)
  const [filtro, setFiltro] = useState('pedido')
  const [aberto, setAberto] = useState(null)
  const [novo, setNovo] = useState(false)
  const [provisionando, setProvisionando] = useState(null) // id do cliente
  // Análise do Cliente aberta: { sigla, nome } (só cliente ativo, com ambiente).
  const [analise, setAnalise] = useState(null)
  const abrirAnalise = useCallback((c) => setAnalise({ sigla: c.sigla, nome: c.empresa || c.nome }), [])
  const [erro, setErro] = useState('')
  const [toast, setToast] = useState(null)
  const fecharToast = useCallback(() => setToast(null), [])
  // Recarrega o detalhe aberto (status/histórico) depois do provisionamento.
  const [detalheVersao, setDetalheVersao] = useState(0)

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
              <th className="w-12"><span className="sr-only">Análise</span></th>
            </tr>
          </thead>
          <tbody>
            {clientes == null && <tr><td colSpan={6} className="px-4 py-6 text-center text-texto-3">Carregando…</td></tr>}
            {clientes && !lista.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-texto-3">Nenhum cliente neste filtro.</td></tr>}
            {lista.map(c => (
              <tr key={c.id} onClick={() => setAberto(c.id)} className="border-b border-borda/60 last:border-0 hover:bg-surface-hover cursor-pointer">
                <td className="px-4 py-2.5">
                  <p className="text-texto-1 font-medium">{c.nome}</p>
                  {c.empresa && <p className="text-xs text-texto-3">{c.empresa}</p>}
                </td>
                <td className="px-4 py-2.5 hidden md:table-cell">
                  <p className="text-texto-2">{c.email}</p>
                  {c.telefone && <p className="text-xs text-texto-3">{mascararTelefone(c.telefone)}</p>}
                </td>
                <td className="px-4 py-2.5 font-mono text-texto-2">{c.sigla || '—'}</td>
                <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
                <td className="px-4 py-2.5 hidden md:table-cell text-texto-3 text-xs">{dataHora(c.created_at)}</td>
                <td className="pr-2 py-1 text-right">
                  {c.status === 'ativo' && c.sigla && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); abrirAnalise(c) }}
                      aria-label={`Análise do Cliente ${c.sigla}`} title="Análise do Cliente"
                      className="w-11 h-11 inline-flex items-center justify-center rounded-lg text-texto-2 hover:text-primary-fg hover:bg-surface-hover">
                      <BarChart3 size={18} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!aberto} onClose={() => setAberto(null)} title="Cliente" size="lg">
        {aberto && <DetalheCliente key={detalheVersao} id={aberto} onMudou={mudou} onProvisionar={setProvisionando} onToast={setToast} onExcluido={() => { setAberto(null); mudou() }} onAnalise={(c) => { setAberto(null); abrirAnalise(c) }} />}
      </Modal>
      <Modal open={novo} onClose={() => setNovo(false)} title="Novo cliente" size="lg">
        {novo && <ClienteForm onCancelar={() => setNovo(false)} onSalvo={(c) => { setNovo(false); setToast({ message: 'Cliente cadastrado' }); mudou(); setAberto(c.id) }} />}
      </Modal>
      {provisionando && (
        <ProvisionamentoModal id={provisionando} onFechar={() => { setProvisionando(null); setDetalheVersao(v => v + 1) }} onMudou={mudou} />
      )}
      <Modal open={!!analise} onClose={() => setAnalise(null)} title="Análise do Cliente" size="xl">
        {analise && <AnaliseCliente sigla={analise.sigla} nome={analise.nome} />}
      </Modal>
      {toast && <Toast message={toast.message} variant={toast.variant} onClose={fecharToast} />}
    </div>
  )
}
