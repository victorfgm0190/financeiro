import { useState } from 'react'
import { Lock, User, LogIn } from 'lucide-react'
import { AUTH_TOKEN_KEY } from '../lib/api'

// Tela de login (admin único). POST /api/auth → salva o JWT em localStorage['auth_token'] e
// chama onSuccess (o PrivateRoute re-renderiza e monta o app). Dark theme, consistente com o app.
export default function Login({ onSuccess }) {
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
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        setError(res.status === 401 ? 'Usuário ou senha inválidos.' : 'Falha ao entrar. Tente novamente.')
        return
      }
      const { token } = await res.json()
      if (!token) { setError('Resposta inválida do servidor.'); return }
      localStorage.setItem(AUTH_TOKEN_KEY, token)
      onSuccess?.()
    } catch {
      setError('Erro de rede. Verifique sua conexão.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-100">Finup</h1>
          <p className="text-sm text-gray-500 mt-1">Acesso restrito</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface border border-gray-800 rounded-xl p-6 space-y-4 shadow-2xl">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Usuário</label>
            <div className="relative">
              <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#0F6E56] transition-colors"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Senha</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:border-[#0F6E56] transition-colors"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <LogIn size={15} /> {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
