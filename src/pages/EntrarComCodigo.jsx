import { useEffect, useState } from 'react'
import { AUTH_TOKEN_KEY, getSessao } from '../lib/api'
import { garantirCacheDoUsuario } from '../lib/armazenamentoLocal'

// /entrar?c=<código> — chegada do login feito no www com o ambiente de um cliente. Troca o código de
// passagem (uso único, 60 s) pelo token DESTE endereço, salva no localStorage daqui, tira o código da
// URL e abre o app. Código inválido/expirado → mensagem e link para entrar de novo.
export default function EntrarComCodigo() {
  // Lido uma vez ao montar; o código sai da URL logo em seguida (histórico, prints, compartilhamento).
  const [codigo] = useState(() => new URLSearchParams(window.location.search).get('c'))
  const [erro, setErro] = useState(() => (codigo ? '' : 'Link de acesso incompleto.'))

  useEffect(() => {
    window.history.replaceState(null, '', '/entrar')
    if (!codigo) return
    fetch('/api/auth?acao=trocar-codigo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo }),
    })
      .then(async (res) => {
        const corpo = await res.json().catch(() => ({}))
        if (!res.ok || !corpo.token) { setErro(corpo.error || 'Não foi possível entrar.'); return }
        localStorage.setItem(AUTH_TOKEN_KEY, corpo.token)
        // Cache local de outro usuário sai antes de o app carregar (computador compartilhado).
        await garantirCacheDoUsuario(getSessao())
        window.location.replace('/')
      })
      .catch(() => setErro('Erro de rede. Verifique sua conexão.'))
  }, [codigo])

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <h1 className="text-2xl font-bold text-texto-1">Finup</h1>
        {erro ? (
          <>
            <p className="text-sm text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>
            <a href="/" className="btn-primary inline-flex">Entrar novamente</a>
          </>
        ) : (
          <p className="text-sm text-texto-3">Entrando…</p>
        )}
      </div>
    </div>
  )
}
