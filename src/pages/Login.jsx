import { useState } from 'react'
import { Lock, User, LogIn, UserPlus, Building2 } from 'lucide-react'
import { AUTH_TOKEN_KEY } from '../lib/api'
import { ambienteDoHost } from '../lib/ambienteHost'

// Último ambiente digitado no www (só conveniência deste navegador).
const ULTIMO_AMBIENTE_KEY = 'finup_ultimo_ambiente'
const lerUltimoAmbiente = () => { try { return localStorage.getItem(ULTIMO_AMBIENTE_KEY) || '' } catch { return '' } }
const gravarUltimoAmbiente = (v) => { try { localStorage.setItem(ULTIMO_AMBIENTE_KEY, v) } catch { /* ignore */ } }

// Tela de login (cadastro de usuários; o login fixo de emergência é decidido na API). POST /api/auth → salva o JWT em localStorage['auth_token'] e
// recarrega em '/' — o PrivateRoute lê o token salvo e monta o app. Dark theme, consistente com o app.
// AMBIENTE (docs/ambientes.md): no www (e no vercel.app/localhost) há o campo Ambiente; em
// <sigla>.finup.app.br o ambiente vem do endereço. Login no www com o ambiente de um cliente → a API
// devolve { redirect } para o endereço do cliente (código de passagem) e a tela navega para lá.
export default function Login() {
  const [doEndereco] = useState(() => ambienteDoHost(window.location.host))
  const [ambiente, setAmbiente] = useState(() => (doEndereco.principal ? lerUltimoAmbiente() : ''))
  const [esqueci, setEsqueci] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Usuário ou e-mail, sem diferenciar maiúsculas (VMOREIRA = vmoreira); a senha vai como digitada.
        body: JSON.stringify({
          username: username.trim().toLowerCase(), password,
          ...(doEndereco.principal ? { ambiente: ambiente.trim().toLowerCase() } : {}),
        }),
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

        {/* method/action marcam um envio de formulário de verdade para o gerenciador de senhas; o
            onSubmit com preventDefault continua fazendo o login por fetch. */}
        <form method="post" action="/api/auth" onSubmit={handleSubmit} className="bg-surface border border-borda rounded-xl p-6 space-y-4 shadow-2xl">
          {doEndereco.principal ? (
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
                  value={ambiente.toUpperCase()}
                  onChange={e => setAmbiente(e.target.value.replace(/[^a-z0-9]/gi, '').toLowerCase())}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface border border-borda-campo text-texto-1 text-sm uppercase focus:outline-none focus:border-primary transition-colors"
                  autoFocus={!ambiente}
                />
              </div>
            </div>
          ) : doEndereco.sigla && (
            <p className="text-xs text-texto-2">Ambiente: <span className="font-mono font-semibold text-texto-1">{doEndereco.sigla.toUpperCase()}</span></p>
          )}

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
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface border border-borda-campo text-texto-1 text-sm focus:outline-none focus:border-primary transition-colors"
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
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface border border-borda-campo text-texto-1 text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password || (doEndereco.principal && !ambiente)}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <LogIn size={15} /> {loading ? 'Entrando…' : 'Entrar'}
          </button>
          <div className="text-center">
            <button type="button" onClick={() => setEsqueci(v => !v)} className="text-xs text-texto-3 hover:text-texto-1 underline underline-offset-2">
              Esqueci minha senha
            </button>
            {esqueci && <p className="mt-2 text-xs text-texto-2">Fale com o administrador do seu ambiente.</p>}
          </div>
          {doEndereco.principal && (
            <a href="/quero-ser-cliente" className="btn-secondary w-full flex items-center justify-center gap-2">
              <UserPlus size={15} /> Quero me tornar cliente
            </a>
          )}
        </form>

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
