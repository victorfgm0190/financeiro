import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, KeyRound, Unlock, Power, RefreshCw, Check, Mail } from 'lucide-react'
import Toast from '../shared/Toast'
import Modal from '../shared/Modal'
import { getSessao } from '../../lib/api'
import { listarUsuarios, criarUsuario, editarUsuario, enviarLinkSenha } from '../../lib/usuariosApi'
import { MODULOS, NIVEIS, ACOES, rotuloNivel, normalizarPermissao, permissoesDoNivel } from '../../lib/permissoes'

const SENHA_MIN = 8
const bloqueado = (u) => !!u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date()
const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const ROTULO_ACAO = { ver: 'Ver', incluir: 'Incluir', editar: 'Editar', excluir: 'Excluir' }
const AJUDA_NIVEL = {
  admin: 'Tudo, inclusive usuários e configurações do sistema.',
  operador: 'Inclui, edita e exclui em todos os módulos. Só vê os cadastros; não acessa usuários nem configurações do sistema.',
  consulta: 'Só visualiza. Sem acesso a usuários, cadastros e configurações.',
  personalizado: 'Escolha módulo a módulo na grade abaixo.',
}

// Grade módulo × Ver/Incluir/Editar/Excluir (nível personalizado). Marcar incluir/editar/excluir
// marca Ver; desmarcar Ver desmarca o resto.
function GradePermissoes({ valor, onChange }) {
  const marcar = (mod, acao, on) => {
    const atual = valor[mod] || {}
    let prox = { ...atual, [acao]: on }
    if (acao === 'ver' && !on) prox = { ver: false, incluir: false, editar: false, excluir: false }
    onChange({ ...valor, [mod]: normalizarPermissao(prox) })
  }
  return (
    <div className="rounded-lg border border-borda-forte overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-texto-3 border-b border-borda">
            <th className="text-left font-medium px-3 py-2">Módulo</th>
            {ACOES.map(a => <th key={a} className="font-medium px-2 py-2 text-center w-16">{ROTULO_ACAO[a]}</th>)}
          </tr>
        </thead>
        <tbody>
          {MODULOS.map(m => (
            <tr key={m.id} className="border-b border-borda/60 last:border-0">
              <td className="px-3 py-1.5 text-texto-1">{m.label}</td>
              {ACOES.map(a => (
                <td key={a} className="text-center px-2 py-1.5">
                  <input type="checkbox" className="w-4 h-4 accent-primary cursor-pointer" aria-label={`${ROTULO_ACAO[a]} — ${m.label}`}
                    checked={!!valor[m.id]?.[a]} onChange={e => marcar(m.id, a, e.target.checked)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Modal de incluir/editar. Senha (+ confirmar) obrigatória só na inclusão; na edição, preencher
// redefine a senha.
function UsuarioModal({ inicial, perfis, onSalvar, onFechar }) {
  const novo = !inicial
  const [f, setF] = useState(() => ({
    username: '', nome: '', email: '', senha: '', confirmar: '', nivel: 'consulta', ativo: true, trocar_senha: novo,
    ...(inicial || {}),
    perfisTodos: !Array.isArray(inicial?.perfis_permitidos),
    perfisSel: Array.isArray(inicial?.perfis_permitidos) ? inicial.perfis_permitidos : [],
    permissoes: inicial?.nivel === 'personalizado' ? (inicial.permissoes || {}) : permissoesDoNivel('consulta'),
  }))
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const set = (k, v) => { setErro(''); setF(p => ({ ...p, [k]: v })) }
  const ehVoce = inicial?.id && inicial.id === getSessao()?.id

  const salvar = async (e) => {
    e.preventDefault()
    if (novo && !f.username.trim()) return setErro('Informe o usuário de acesso.')
    if (!f.nome?.trim()) return setErro('Informe o nome.')
    if (!f.email?.trim()) return setErro('Informe o e-mail.')
    if (novo || f.senha) {
      if (f.senha.length < SENHA_MIN) return setErro(`A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`)
      if (f.senha !== f.confirmar) return setErro('A confirmação não confere com a senha.')
    }
    if (!f.perfisTodos && f.perfisSel.length === 0) return setErro('Escolha ao menos um perfil, ou marque "Todos os perfis".')
    setSalvando(true)
    try {
      await onSalvar({
        ...(novo ? { username: f.username, senha: f.senha } : { id: inicial.id, ...(f.senha ? { novaSenha: f.senha } : {}) }),
        nome: f.nome, email: f.email, nivel: f.nivel, ativo: f.ativo, trocar_senha: f.trocar_senha,
        perfis_permitidos: f.perfisTodos ? 'todos' : f.perfisSel,
        permissoes: f.nivel === 'personalizado' ? f.permissoes : {},
      })
    } catch (err) {
      setErro(err?.message || 'Falha ao salvar.')
      setSalvando(false)
    }
  }

  return (
    <Modal open onClose={onFechar} title={novo ? 'Novo usuário' : `Editar usuário — ${inicial.username}`} size="lg">
      <form onSubmit={salvar} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="u-nome">Nome *</label>
            <input id="u-nome" autoFocus className="input" value={f.nome || ''} maxLength={100} onChange={e => set('nome', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="u-username">Usuário *</label>
            <input id="u-username" disabled={!novo} autoComplete="off" autoCapitalize="none" spellCheck={false} className="input disabled:opacity-60"
              value={f.username} maxLength={40} onChange={e => set('username', e.target.value.toLowerCase())} placeholder="Digite o nome de usuário" />
            {!novo && <p className="text-[11px] text-texto-3 mt-1">O usuário de acesso não muda.</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="u-email">E-mail *</label>
            <input id="u-email" type="email" className="input" value={f.email || ''} maxLength={200} onChange={e => set('email', e.target.value)} />
            <p className="text-[11px] text-texto-3 mt-1">Também serve para entrar (usuário OU e-mail).</p>
          </div>
          <div>
            <label className="label" htmlFor="u-senha">{novo ? 'Senha *' : 'Nova senha'}</label>
            <input id="u-senha" type="password" autoComplete="new-password" className="input" value={f.senha} onChange={e => set('senha', e.target.value)} placeholder={novo ? '' : 'Deixe em branco para manter'} />
          </div>
          <div>
            <label className="label" htmlFor="u-confirmar">Confirmar senha{novo ? ' *' : ''}</label>
            <input id="u-confirmar" type="password" autoComplete="new-password" className="input" value={f.confirmar} onChange={e => set('confirmar', e.target.value)} />
          </div>
          <p className="sm:col-span-2 -mt-1 text-[11px] text-texto-3">Mínimo de {SENHA_MIN} caracteres.</p>
        </div>

        <div>
          <label className="label" htmlFor="u-nivel">Nível de acesso</label>
          <select id="u-nivel" className="input" value={f.nivel} onChange={e => set('nivel', e.target.value)} disabled={ehVoce && f.nivel === 'admin'}>
            {NIVEIS.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
          <p className="text-[11px] text-texto-3 mt-1">{AJUDA_NIVEL[f.nivel]}</p>
        </div>
        {f.nivel === 'personalizado' && <GradePermissoes valor={f.permissoes} onChange={v => set('permissoes', v)} />}

        <fieldset>
          <legend className="label">Perfis permitidos</legend>
          <label className="flex items-center gap-2 text-sm text-texto-1 mb-1.5">
            <input type="checkbox" className="w-4 h-4 accent-primary" checked={f.perfisTodos} onChange={e => set('perfisTodos', e.target.checked)} />
            Todos os perfis
          </label>
          {!f.perfisTodos && (
            <div className="flex flex-wrap gap-2 pl-6">
              {perfis.map(p => {
                const on = f.perfisSel.includes(p.id)
                return (
                  <label key={p.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer ${on ? 'border-primary bg-primary/10 text-primary-fg' : 'border-borda-forte text-texto-2'}`}>
                    <input type="checkbox" className="sr-only" checked={on}
                      onChange={() => set('perfisSel', on ? f.perfisSel.filter(x => x !== p.id) : [...f.perfisSel, p.id])} />
                    {String(p.name || '').trim()}
                  </label>
                )
              })}
            </div>
          )}
          <p className="text-[11px] text-texto-3 mt-1">Com perfis escolhidos, a pessoa só vê e grava contas, lançamentos e agendamentos desses perfis.</p>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-texto-1">
            <input type="checkbox" className="w-4 h-4 accent-primary" checked={f.ativo} disabled={ehVoce} onChange={e => set('ativo', e.target.checked)} />
            Ativo {ehVoce && <span className="text-[11px] text-texto-3">(você não pode desativar o próprio usuário)</span>}
          </label>
          <label className="flex items-center gap-2 text-sm text-texto-1">
            <input type="checkbox" className="w-4 h-4 accent-primary" checked={!!f.trocar_senha} onChange={e => set('trocar_senha', e.target.checked)} />
            Trocar senha no próximo login
          </label>
        </div>

        {erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onFechar} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={salvando} className="btn-primary flex items-center gap-1.5"><Check size={14} /> {salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  )
}

// Redefinir a senha de outro usuário (admin), sem pedir a atual. Marca "trocar no próximo login".
function RedefinirSenhaModal({ usuario, onSalvar, onFechar }) {
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [trocar, setTrocar] = useState(true)
  const [erro, setErro] = useState('')
  const salvar = async (e) => {
    e.preventDefault()
    if (senha.length < SENHA_MIN) return setErro(`Mínimo de ${SENHA_MIN} caracteres.`)
    if (senha !== confirmar) return setErro('A confirmação não confere.')
    try { await onSalvar(senha, trocar) } catch (err) { setErro(err?.message || 'Falha ao redefinir.') }
  }
  return (
    <Modal open onClose={onFechar} title={`Redefinir senha — ${usuario.username}`} size="sm">
      <form onSubmit={salvar} className="space-y-3">
        <div>
          <label className="label" htmlFor="rs-nova">Nova senha</label>
          <input id="rs-nova" type="password" autoComplete="new-password" autoFocus className="input" value={senha} onChange={e => { setErro(''); setSenha(e.target.value) }} />
        </div>
        <div>
          <label className="label" htmlFor="rs-conf">Confirmar</label>
          <input id="rs-conf" type="password" autoComplete="new-password" className="input" value={confirmar} onChange={e => { setErro(''); setConfirmar(e.target.value) }} />
        </div>
        <label className="flex items-center gap-2 text-sm text-texto-1">
          <input type="checkbox" className="w-4 h-4 accent-primary" checked={trocar} onChange={e => setTrocar(e.target.checked)} />
          Pedir para trocar no próximo login
        </label>
        {erro && <p className="text-xs text-perigo">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="btn-secondary">Cancelar</button>
          <button type="submit" className="btn-primary">Redefinir</button>
        </div>
      </form>
    </Modal>
  )
}

// Configurações › Usuários (só admin): quem acessa, com nível, perfis e status. Tudo pela
// /api/usuarios — que também barra não-admin, o último admin e o admin desativando a si mesmo.
export default function UsuariosPanel() {
  const [sessao] = useState(getSessao)
  const [usuarios, setUsuarios] = useState([])
  const [perfis, setPerfis] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erroLista, setErroLista] = useState('')
  const [editando, setEditando] = useState(null) // usuário | 'novo' | null
  const [senhaDe, setSenhaDe] = useState(null)
  const [toast, setToast] = useState(null)
  const avisar = (message, variant = 'success') => setToast({ message, variant })

  const buscar = useCallback(() => listarUsuarios()
    .then(r => { setUsuarios(r.usuarios); setPerfis(r.perfis) }, err => setErroLista(err?.message || 'Falha ao carregar.'))
    .finally(() => setCarregando(false)), [])
  useEffect(() => { buscar() }, [buscar])
  const carregar = () => { setCarregando(true); setErroLista(''); buscar() }
  const nomePerfil = useMemo(() => new Map(perfis.map(p => [p.id, String(p.name || '').trim()])), [perfis])

  const substituir = (u) => setUsuarios(lista => lista.map(x => (x.id === u.id ? u : x)))
  const salvar = async (dados) => {
    if (editando === 'novo') {
      const u = await criarUsuario(dados)
      setUsuarios(lista => [...lista, u])
      avisar(`Usuário "${u.username}" criado.`)
    } else {
      substituir(await editarUsuario(dados))
      avisar('Usuário atualizado.')
    }
    setEditando(null)
  }
  const acao = async (dados, msg) => {
    try { substituir(await editarUsuario(dados)); avisar(msg) } catch (err) { avisar(err?.message || 'Falha ao alterar.', 'error') }
  }
  const [enviandoLink, setEnviandoLink] = useState(null) // id do usuário
  const enviarLink = async (u) => {
    setEnviandoLink(u.id)
    try {
      const r = await enviarLinkSenha(u.id)
      avisar(`Link de senha enviado para ${r.email || u.email}.`)
    } catch (err) {
      avisar(err?.message || 'Falha ao enviar o link.', 'error')
    } finally {
      setEnviandoLink(null)
    }
  }
  const motivoSemLink = (u) => (!String(u.email || '').trim() ? 'Usuário sem e-mail' : !u.ativo ? 'Usuário inativo' : '')
  const perfisDe = (u) => (Array.isArray(u.perfis_permitidos) ? u.perfis_permitidos.map(id => nomePerfil.get(id) || id).join(', ') : 'Todos')

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-texto-2">Usuários ({usuarios.length})</h2>
        <button type="button" onClick={carregar} title="Recarregar" aria-label="Recarregar" className="p-1.5 rounded text-texto-3 hover:text-texto-1 hover:bg-surface-hover">
          <RefreshCw size={12} className={carregando ? 'animate-spin' : ''} />
        </button>
        <button type="button" onClick={() => setEditando('novo')} className="ml-auto btn-primary text-xs py-1.5 flex items-center gap-1.5">
          <Plus size={12} /> Novo usuário
        </button>
      </div>
      <p className="text-xs text-texto-3">
        Níveis: Administrador (tudo), Operador (grava em tudo, sem usuários e configurações do sistema), Consulta (só vê) e
        Personalizado (módulo a módulo). Após 5 senhas erradas o acesso fica bloqueado por 15 minutos — use "Desbloquear" para
        liberar antes. O ícone de e-mail envia um link (48 h) para a pessoa criar a própria senha. Mudanças de nível valem a partir do próximo login da pessoa.
      </p>
      {erroLista && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erroLista}</p>}

      <div className="overflow-x-auto rounded-lg border border-borda">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-texto-3 text-left border-b border-borda">
              {['Nome', 'Usuário', 'E-mail', 'Nível', 'Perfis', 'Ativo', 'Último acesso', ''].map(h => (
                <th key={h} className="font-medium px-3 py-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.id} className={`border-b border-borda/60 last:border-0 ${u.ativo ? '' : 'opacity-60'}`}>
                <td className="px-3 py-2 text-texto-1 font-medium whitespace-nowrap">
                  {u.nome || u.username}
                  {u.id === sessao?.id && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary-fg font-medium">você</span>}
                  {bloqueado(u) && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-perigo-bg text-perigo" title={`Até ${dataHora(u.bloqueado_ate)}`}>bloqueado</span>}
                  {u.trocar_senha && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-aviso/15 text-aviso">trocar senha</span>}
                </td>
                <td className="px-3 py-2 text-texto-2">@{u.username}</td>
                <td className="px-3 py-2 text-texto-2 max-w-[14rem] truncate" title={u.email || ''}>{u.email || '—'}</td>
                <td className="px-3 py-2 text-texto-2 whitespace-nowrap">{rotuloNivel(u.nivel)}</td>
                <td className="px-3 py-2 text-texto-2 max-w-[10rem] truncate" title={perfisDe(u)}>{perfisDe(u)}</td>
                <td className="px-3 py-2">{u.ativo ? <span className="text-primary-fg">Sim</span> : <span className="text-texto-3">Não</span>}</td>
                <td className="px-3 py-2 text-texto-3 whitespace-nowrap">{dataHora(u.ultimo_login)}</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center justify-end gap-0.5">
                    {(bloqueado(u) || u.tentativas_falhas > 0) && (
                      <button type="button" title="Desbloquear" aria-label="Desbloquear" onClick={() => acao({ id: u.id, desbloquear: true }, 'Usuário desbloqueado.')}
                        className="p-1.5 rounded hover:bg-surface-hover text-texto-2"><Unlock size={13} /></button>
                    )}
                    <button type="button" title={motivoSemLink(u) ? `Enviar link de senha — ${motivoSemLink(u)}` : 'Enviar link de senha por e-mail'}
                      aria-label="Enviar link de senha" disabled={!!motivoSemLink(u) || enviandoLink === u.id} onClick={() => enviarLink(u)}
                      className="p-1.5 rounded hover:bg-surface-hover text-texto-2 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent">
                      <Mail size={13} className={enviandoLink === u.id ? 'animate-pulse' : ''} /></button>
                    <button type="button" title="Redefinir senha" aria-label="Redefinir senha" onClick={() => setSenhaDe(u)}
                      className="p-1.5 rounded hover:bg-surface-hover text-texto-2"><KeyRound size={13} /></button>
                    <button type="button" title="Editar" aria-label="Editar" onClick={() => setEditando(u)}
                      className="p-1.5 rounded hover:bg-surface-hover text-texto-2"><Pencil size={13} /></button>
                    {u.id !== sessao?.id && (
                      <button type="button" title={u.ativo ? 'Desativar' : 'Ativar'} aria-label={u.ativo ? 'Desativar' : 'Ativar'}
                        onClick={() => acao({ id: u.id, ativo: !u.ativo }, u.ativo ? 'Usuário desativado.' : 'Usuário ativado.')}
                        className={`p-1.5 rounded hover:bg-surface-hover ${u.ativo ? 'text-texto-2 hover:text-perigo' : 'text-primary-fg'}`}><Power size={13} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!carregando && !erroLista && usuarios.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-texto-3">Nenhum usuário cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editando && (
        <UsuarioModal inicial={editando === 'novo' ? null : editando} perfis={perfis} onSalvar={salvar} onFechar={() => setEditando(null)} />
      )}
      {senhaDe && (
        <RedefinirSenhaModal
          usuario={senhaDe}
          onFechar={() => setSenhaDe(null)}
          onSalvar={async (novaSenha, trocar) => {
            substituir(await editarUsuario({ id: senhaDe.id, novaSenha, trocar_senha: trocar }))
            setSenhaDe(null)
            avisar('Senha redefinida.')
          }}
        />
      )}
      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
    </div>
  )
}
