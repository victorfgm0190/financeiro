import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Check, X, KeyRound, Unlock, Power, RefreshCw } from 'lucide-react'
import Toast from '../shared/Toast'
import { getSessao } from '../../lib/api'
import { listarUsuarios, criarUsuario, editarUsuario } from '../../lib/usuariosApi'

const SENHA_MIN = 8
const PAPEIS = [
  { id: 'admin', label: 'Administrador' },
  { id: 'usuario', label: 'Usuário' },
  { id: 'leitura', label: 'Leitura' },
]
const rotuloPapel = (p) => PAPEIS.find(x => x.id === p)?.label || p
const bloqueado = (u) => !!u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date()
const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

// Formulário de "novo" (com usuário e senha) e de "editar" (nome, e-mail e papel).
function UsuarioForm({ inicial, onSalvar, onCancelar }) {
  const novo = !inicial
  const [f, setF] = useState(() => ({ username: '', nome: '', email: '', senha: '', papel: 'usuario', ...inicial }))
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const set = (k, v) => { setErro(''); setF(p => ({ ...p, [k]: v })) }
  const salvar = async (e) => {
    e.preventDefault()
    if (novo && !f.username.trim()) return setErro('Informe o usuário de acesso.')
    if (novo && f.senha.length < SENHA_MIN) return setErro(`A senha inicial precisa ter pelo menos ${SENHA_MIN} caracteres.`)
    setSalvando(true)
    try { await onSalvar(f) } catch (err) { setErro(err?.message || 'Falha ao salvar.') } finally { setSalvando(false) }
  }
  return (
    <form onSubmit={salvar} className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-lg bg-surface-2/60 border border-borda-forte">
      {novo && (
        <div>
          <label className="label text-xs" htmlFor="u-username">Usuário de acesso</label>
          <input id="u-username" autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false} className="input py-1.5 text-sm"
            value={f.username} maxLength={40} onChange={e => set('username', e.target.value.toLowerCase())} placeholder="ex.: gislaine" />
        </div>
      )}
      <div>
        <label className="label text-xs" htmlFor="u-nome">Nome</label>
        <input id="u-nome" autoFocus={!novo} className="input py-1.5 text-sm" value={f.nome || ''} maxLength={100} onChange={e => set('nome', e.target.value)} />
      </div>
      <div>
        <label className="label text-xs" htmlFor="u-email">E-mail</label>
        <input id="u-email" type="email" className="input py-1.5 text-sm" value={f.email || ''} maxLength={200} onChange={e => set('email', e.target.value)} />
      </div>
      <div>
        <label className="label text-xs" htmlFor="u-papel">Papel</label>
        <select id="u-papel" className="input py-1.5 text-sm" value={f.papel} onChange={e => set('papel', e.target.value)}>
          {PAPEIS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      {novo && (
        <div>
          <label className="label text-xs" htmlFor="u-senha">Senha inicial</label>
          <input id="u-senha" type="password" autoComplete="new-password" className="input py-1.5 text-sm" value={f.senha} onChange={e => set('senha', e.target.value)} />
          <p className="text-[11px] text-texto-3 mt-1">Mínimo de {SENHA_MIN} caracteres. Passe para a pessoa trocar no primeiro acesso.</p>
        </div>
      )}
      {erro && <p className="sm:col-span-2 text-[11px] text-perigo">{erro}</p>}
      <div className="sm:col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="btn-secondary text-xs py-1.5 flex items-center gap-1"><X size={12} /> Cancelar</button>
        <button type="submit" disabled={salvando} className="btn-primary text-xs py-1.5 flex items-center gap-1"><Check size={12} /> {salvando ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </form>
  )
}

// Redefinir a senha de outro usuário (admin): campo inline, sem pedir a senha atual.
function RedefinirSenha({ onSalvar, onCancelar }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const salvar = async (e) => {
    e.preventDefault()
    if (senha.length < SENHA_MIN) return setErro(`Mínimo de ${SENHA_MIN} caracteres.`)
    try { await onSalvar(senha) } catch (err) { setErro(err?.message || 'Falha ao redefinir.') }
  }
  return (
    <form onSubmit={salvar} className="flex flex-wrap items-center gap-2 mt-2">
      <input type="password" autoComplete="new-password" autoFocus className="input py-1.5 text-sm flex-1 min-w-[180px]" placeholder="Nova senha"
        value={senha} onChange={e => { setErro(''); setSenha(e.target.value) }} />
      <button type="button" onClick={onCancelar} className="btn-secondary text-xs py-1.5">Cancelar</button>
      <button type="submit" className="btn-primary text-xs py-1.5">Redefinir</button>
      {erro && <p className="w-full text-[11px] text-perigo">{erro}</p>}
    </form>
  )
}

// Configurações › Usuários (só admin): quem acessa a organização, com papel e status. Tudo pela
// /api/usuarios — a API também barra não-admin e impede deixar a organização sem administrador.
export default function UsuariosPanel() {
  const [sessao] = useState(getSessao)
  const [usuarios, setUsuarios] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erroLista, setErroLista] = useState('')
  const [editando, setEditando] = useState(null) // id | 'novo' | null
  const [senhaDe, setSenhaDe] = useState(null)
  const [toast, setToast] = useState(null)
  const avisar = (message, variant = 'success') => setToast({ message, variant })

  const buscar = useCallback(() => listarUsuarios()
    .then(setUsuarios, err => setErroLista(err?.message || 'Falha ao carregar.'))
    .finally(() => setCarregando(false)), [])
  useEffect(() => { buscar() }, [buscar])
  const carregar = () => { setCarregando(true); setErroLista(''); buscar() }

  const substituir = (u) => setUsuarios(lista => lista.map(x => (x.id === u.id ? u : x)))
  const salvarForm = async (f) => {
    if (editando === 'novo') {
      const u = await criarUsuario({ username: f.username, nome: f.nome, email: f.email, senha: f.senha, papel: f.papel })
      setUsuarios(lista => [...lista, u])
      avisar(`Usuário "${u.username}" criado.`)
    } else {
      substituir(await editarUsuario({ id: editando, nome: f.nome, email: f.email, papel: f.papel }))
      avisar('Usuário atualizado.')
    }
    setEditando(null)
  }
  const acao = async (dados, msg) => {
    try { substituir(await editarUsuario(dados)); avisar(msg) } catch (err) { avisar(err?.message || 'Falha ao alterar.', 'error') }
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-texto-2">Usuários ({usuarios.length})</h2>
        <button type="button" onClick={carregar} title="Recarregar" className="p-1.5 rounded text-texto-3 hover:text-texto-1 hover:bg-surface-hover">
          <RefreshCw size={12} className={carregando ? 'animate-spin' : ''} />
        </button>
        <button type="button" onClick={() => setEditando('novo')} className="ml-auto btn-secondary text-xs py-1.5 flex items-center gap-1.5">
          <Plus size={12} /> Novo usuário
        </button>
      </div>
      <p className="text-xs text-texto-3">
        Quem acessa o Finup. Administrador gerencia usuários; Usuário e Leitura não veem esta tela. Após 5 senhas erradas o
        acesso fica bloqueado por 15 minutos — use "Desbloquear" para liberar antes.
      </p>

      {editando === 'novo' && <UsuarioForm inicial={null} onSalvar={salvarForm} onCancelar={() => setEditando(null)} />}
      {erroLista && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erroLista}</p>}

      <div className="space-y-1.5">
        {usuarios.map(u => editando === u.id ? (
          <UsuarioForm key={u.id} inicial={u} onSalvar={salvarForm} onCancelar={() => setEditando(null)} />
        ) : (
          <div key={u.id} className={`rounded-lg px-3 py-2 bg-surface-2 ${u.ativo ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm text-texto-1 font-medium truncate">{u.nome || u.username}</span>
              <span className="text-xs text-texto-3">@{u.username}</span>
              {u.id === sessao?.id && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary-fg font-medium">você</span>}
              <span className="badge bg-surface-hover text-texto-2 font-medium">{rotuloPapel(u.papel)}</span>
              {!u.ativo && <span className="badge bg-surface-hover text-texto-3 font-medium">Inativo</span>}
              {bloqueado(u) && <span className="badge bg-perigo-bg text-perigo font-medium">Bloqueado até {dataHora(u.bloqueado_ate)}</span>}
              <div className="ml-auto flex items-center gap-0.5">
                {(bloqueado(u) || u.tentativas_falhas > 0) && (
                  <button type="button" title="Desbloquear" onClick={() => acao({ id: u.id, desbloquear: true }, 'Usuário desbloqueado.')}
                    className="p-1.5 rounded hover:bg-surface-hover text-texto-2"><Unlock size={13} /></button>
                )}
                <button type="button" title="Redefinir senha" onClick={() => setSenhaDe(senhaDe === u.id ? null : u.id)}
                  className="p-1.5 rounded hover:bg-surface-hover text-texto-2"><KeyRound size={13} /></button>
                <button type="button" title="Editar" onClick={() => setEditando(u.id)}
                  className="p-1.5 rounded hover:bg-surface-hover text-texto-2"><Pencil size={13} /></button>
                <button type="button" title={u.ativo ? 'Desativar' : 'Ativar'}
                  onClick={() => acao({ id: u.id, ativo: !u.ativo }, u.ativo ? 'Usuário desativado.' : 'Usuário ativado.')}
                  className={`p-1.5 rounded hover:bg-surface-hover ${u.ativo ? 'text-texto-2 hover:text-perigo' : 'text-primary-fg'}`}><Power size={13} /></button>
              </div>
            </div>
            <p className="text-[11px] text-texto-3 mt-0.5">
              {u.email ? `${u.email} · ` : ''}Último acesso: {dataHora(u.ultimo_login)}
            </p>
            {senhaDe === u.id && (
              <RedefinirSenha
                onCancelar={() => setSenhaDe(null)}
                onSalvar={async (novaSenha) => {
                  substituir(await editarUsuario({ id: u.id, novaSenha }))
                  setSenhaDe(null)
                  avisar('Senha redefinida.')
                }}
              />
            )}
          </div>
        ))}
        {!carregando && !erroLista && usuarios.length === 0 && <p className="text-xs text-texto-3">Nenhum usuário cadastrado.</p>}
      </div>

      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
    </div>
  )
}
