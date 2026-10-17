import { useEffect, useState } from 'react'
import { Lock, User, LogIn, UserPlus, Building2, Mail, ArrowLeft } from 'lucide-react'
import { AUTH_TOKEN_KEY } from '../lib/api'
import { ambienteDoHost } from '../lib/ambienteHost'

// Último ambiente digitado no www (só conveniência deste navegador).
const ULTIMO_AMBIENTE_KEY = 'finup_ultimo_ambiente'
const lerUltimoAmbiente = () => { try { return localStorage.getItem(ULTIMO_AMBIENTE_KEY) || '' } catch { return '' } }
const gravarUltimoAmbiente = (v) => { try { localStorage.setItem(ULTIMO_AMBIENTE_KEY, v) } catch { /* ignore */ } }

// Mesma resposta da API para qualquer caso (não revela se o usuário ou o ambiente existe).
const MSG_ESQUECI = 'Se o usuário existir, enviaremos um link para o e-mail cadastrado.'
const parametro = (nome) => new URLSearchParams(window.location.search).get(nome)

const CLASSE_CAMPO = 'w-full pl-9 pr-3 py-2 rounded-lg bg-surface border border-borda-campo text-texto-1 text-sm focus:outline-none focus:border-primary transition-colors'

// Campo Ambiente (www / vercel.app / localhost) ou o rótulo "Ambiente: XX" (<sigla>.finup.app.br).
function CampoAmbiente({ doEndereco, valor, onChange, autoFocus }) {
  if (!doEndereco.principal) {
    return doEndereco.sigla
      ? <p className="text-xs text-texto-2">Ambiente: <span className="font-mono font-semibold text-texto-1">{doEndereco.sigla.toUpperCase()}</span></p>
      : null
  }
  return (
    <div>
      <label htmlFor="ambiente" className="block text-xs text-texto-2 mb-1.5">Ambiente</label>
      <div className="relative">
        <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-3" />
        <input
          name="ambiente"
          id="ambiente"
          type="text"
          autoComplete="organization"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={20}
          placeholder="Ex.: VM"
          value={valor.toUpperCase()}
          onChange={e => onChange(e.target.value.replace(/[^a-z0-9]/gi, '').toLowerCase())}
          className={`${CLASSE_CAMPO} uppercase`}
          autoFocus={autoFocus}
        />
      </div>
    </div>
  )
}

const Aviso = ({ children, perigo = false }) => (
  <p className={`text-xs rounded-lg px-3 py-2 border ${perigo ? 'text-perigo bg-perigo-bg border-perigo/30' : 'text-texto-1 bg-primary/10 border-primary/30'}`}>{children}</p>
)

// Tela de login (cadastro de usuários; o login fixo de emergência é decidido na API). POST /api/auth → salva o JWT em localStorage['auth_token'] e
// recarrega em '/' — o PrivateRoute lê o token salvo e monta o app. Dark theme, consistente com o app.
// AMBIENTE (docs/ambientes.md): no www (e no vercel.app/localhost) há o campo Ambiente; em
// <sigla>.finup.app.br o ambiente vem do endereço. Login no www com o ambiente de um cliente → a API
// devolve { redirect } para o endereço do cliente (código de passagem) e a tela navega para lá.
// "Esqueci minha senha" troca o formulário pelo pedido de link (POST /api/senha?acao=esqueci, mesmo
// ambiente); /?esqueci=1 abre direto nele e /?senha=definida mostra o aviso após /definir-senha.
export default function Login() {
  const [doEndereco] = useState(() => ambienteDoHost(window.location.host))
  const [ambiente, setAmbiente] = useState(() => (doEndereco.principal ? lerUltimoAmbiente() : ''))
  const [esqueci, setEsqueci] = useState(() => parametro('esqueci') === '1')
  const [aviso] = useState(() => (parametro('senha') === 'definida' ? 'Senha definida, faça login.' : ''))
  const [pedido, setPedido] = useState({ enviando: false, enviado: false, erro: '' })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Os parâmetros (?esqueci, ?senha) já foram lidos: saem da URL.
  useEffect(() => { if (window.location.search) window.history.replaceState(null, '', window.location.pathname) }, [])

  const ambienteDoPedido = () => (doEndereco.principal ? { ambiente: ambiente.trim().toLowerCase() } : {})
  const alternarEsqueci = (v) => { setEsqueci(v); setError(''); setPedido({ enviando: false, enviado: false, erro: '' }) }

  const pedirLink = async (e) => {
    e.preventDefault()
    setPedido({ enviando: true, enviado: false, erro: '' })
    try {
      const res = await fetch('/api/senha?acao=esqueci', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: username.trim().toLowerCase(), ...ambienteDoPedido() }),
      })
      if (!res.ok) throw new Error(String(res.status))
      if (doEndereco.principal) gravarUltimoAmbiente(ambiente.trim().toLowerCase())
      setPedido({ enviando: false, enviado: true, erro: '' })
    } catch {
      setPedido({ enviando: false, enviado: false, erro: 'Não foi possível enviar agora. Tente novamente.' })
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Usuário ou e-mail, sem diferenciar maiúsculas (VMOREIRA = vmoreira); a senha vai como digitada.
        body: JSON.stringify({ username: username.trim().toLowerCase(), password, ...ambienteDoPedido() }),
      })
      if (!res.ok) {
        setError(res.status === 401 ? 'Usuário, senha ou ambiente inválidos.' : 'Falha ao entrar. Tente novamente.')
        return
      }
      if (doEndereco.principal) gravarUltimoAmbiente(ambiente.trim().toLowerCase())
      const { token, redirect } = await res.json()
      // Ambiente de cliente: segue para <sigla>.finup.app.br/entrar?c=<código> (o token nasce lá).
      if (redirect) { window.location.assign(redirect); return }
      if (!token) { setError('Resposta inválida do servidor.'); return }
      localStorage.setItem(AUTH_TOKEN_KEY, token)
      // Navegação REAL, não troca de estado: o Safari do iPhone só oferece "Salvar senha" (Chaves
      // do iCloud / Face ID) quando vê o formulário preenchido sair numa navegação. Os campos não
      // são limpos antes disso de propósito.
      window.location.replace('/')
      return
    } catch {
      setError('Erro de rede. Verifique sua conexão.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-texto-1">Finup</h1>
          <p className="text-sm text-texto-3 mt-1">Acesso restrito</p>
        </div>

        {esqueci ? (
          <form onSubmit={pedirLink} className="bg-surface border border-borda rounded-xl p-6 space-y-4 shadow-2xl">
            <div>
              <h2 className="text-sm font-semibold text-texto-1">Esqueci minha senha</h2>
              <p className="text-xs text-texto-3 mt-1">Informe seu usuário ou e-mail. Se ele existir, enviamos um link para criar uma nova senha.</p>
            </div>
            <CampoAmbiente doEndereco={doEndereco} valor={ambiente} onChange={v => { setAmbiente(v); setPedido(p => ({ ...p, enviado: false })) }} autoFocus={!ambiente} />
            <div>
              <label htmlFor="login-esqueci" className="block text-xs text-texto-2 mb-1.5">Usuário ou e-mail</label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-3" />
                <input
                  id="login-esqueci"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={username}
                  onChange={e => { setUsername(e.target.value); setPedido(p => ({ ...p, enviado: false })) }}
                  className={CLASSE_CAMPO}
                  autoFocus={!doEndereco.principal || !!ambiente}
                />
              </div>
            </div>
            {pedido.enviado && <Aviso>{MSG_ESQUECI}</Aviso>}
            {pedido.erro && <Aviso perigo>{pedido.erro}</Aviso>}
            <button
              type="submit"
              disabled={pedido.enviando || !username.trim() || (doEndereco.principal && !ambiente)}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Mail size={15} /> {pedido.enviando ? 'Enviando…' : pedido.enviado ? 'Enviar de novo' : 'Enviar link'}
            </button>
            <div className="text-center">
              <button type="button" onClick={() => alternarEsqueci(false)} className="text-xs text-texto-3 hover:text-texto-1 underline underline-offset-2 inline-flex items-center gap-1">
                <ArrowLeft size={12} /> Voltar para o login
              </button>
            </div>
          </form>
        ) : (
          /* method/action marcam um envio de formulário de verdade para o gerenciador de senhas; o
             onSubmit com preventDefault continua fazendo o login por fetch. */
          <form method="post" action="/api/auth" onSubmit={handleSubmit} className="bg-surface border border-borda rounded-xl p-6 space-y-4 shadow-2xl">
            {aviso && <Aviso>{aviso}</Aviso>}
            <CampoAmbiente doEndereco={doEndereco} valor={ambiente} onChange={setAmbiente} autoFocus={!ambiente} />

            <div>
              <label htmlFor="username" className="block text-xs text-texto-2 mb-1.5">Usuário ou e-mail</label>
              <div className="relative">
                <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-3" />
                {/* name/id/autoComplete padrão: é o que o Safari usa para oferecer e salvar a senha nas
                    Chaves do iCloud (preenchimento com Face ID). autoCapitalize evita o "Vmoreira". */}
                <input
                  name="username"
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className={CLASSE_CAMPO}
                  autoFocus={!doEndereco.principal || !!ambiente}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs text-texto-2 mb-1.5">Senha</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-3" />
                <input
                  name="password"
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={CLASSE_CAMPO}
                />
              </div>
            </div>

            {error && <Aviso perigo>{error}</Aviso>}

            <button
              type="submit"
              disabled={loading || !username || !password || (doEndereco.principal && !ambiente)}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <LogIn size={15} /> {loading ? 'Entrando…' : 'Entrar'}
            </button>
            <div className="text-center">
              <button type="button" onClick={() => alternarEsqueci(true)} className="text-xs text-texto-3 hover:text-texto-1 underline underline-offset-2">
                Esqueci minha senha
              </button>
            </div>
            {doEndereco.principal && (
              <a href="/quero-ser-cliente" className="btn-secondary w-full flex items-center justify-center gap-2">
                <UserPlus size={15} /> Quero me tornar cliente
              </a>
            )}
          </form>
        )}

        {/* Só em desenvolvimento (o Vite remove este bloco do build de produção): testa o visual
            sem banco — /api bloqueado e dados fictícios em memória. Ver src/dev/modoDev.js. */}
        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={() => import('../dev/modoDev.js').then(m => m.entrarNoModoDev())}
            className="mt-4 w-full text-xs text-texto-3 hover:text-texto-2 underline underline-offset-2"
          >
            Entrar em modo dev (sem banco)
          </button>
        )}
      </div>
    </div>
  )
}
