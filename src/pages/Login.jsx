import { useState } from 'react'
import { Lock, User, LogIn } from 'lucide-react'
import { AUTH_TOKEN_KEY } from '../lib/api'

// Tela de login (cadastro de usuários; o login fixo de emergência é decidido na API). POST /api/auth → salva o JWT em localStorage['auth_token'] e
// recarrega em '/' — o PrivateRoute lê o token salvo e monta o app. Dark theme, consistente com o app.
export default function Login() {
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
        body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
      })
      if (!res.ok) {
        setError(res.status === 401 ? 'Usuário ou senha inválidos.' : 'Falha ao entrar. Tente novamente.')
        return
      }
      const { token } = await res.json()
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
                autoFocus
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
            disabled={loading || !username || !password}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <LogIn size={15} /> {loading ? 'Entrando…' : 'Entrar'}
          </button>
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
