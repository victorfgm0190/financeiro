import { useEffect, useState } from 'react'
import { Lock, Check, KeyRound } from 'lucide-react'

// /definir-senha?token=… — link do e-mail ("Esqueci minha senha" ou convite do admin). O token sai da
// URL logo ao montar (histórico, prints, Referer); a API o procura no banco do ambiente DESTE endereço.
// Válido → "Olá, <nome>", nova senha + confirmação; sucesso → login com o aviso "Senha definida".
// Inválido/expirado/já usado → mensagem e link para pedir outro.
const SENHA_MIN = 8

export default function DefinirSenha() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '')
  const [link, setLink] = useState(() => (token ? { carregando: true } : { erro: 'Link incompleto.' }))
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    window.history.replaceState(null, '', '/definir-senha')
    if (!token) return
    fetch(`/api/senha?acao=validar&token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const corpo = await res.json().catch(() => ({}))
        setLink(res.ok && corpo.ok ? { nome: corpo.nome, tipo: corpo.tipo } : { erro: corpo.error || 'Link expirado ou já utilizado' })
      })
      .catch(() => setLink({ erro: 'Erro de rede. Verifique sua conexão e abra o link de novo.' }))
  }, [token])

  const requisitos = [
    { ok: senha.length >= SENHA_MIN, texto: `Pelo menos ${SENHA_MIN} caracteres` },
    { ok: !!senha && senha === confirmar, texto: 'As duas senhas iguais' },
  ]
  const valida = requisitos.every(r => r.ok)

  const salvar = async (e) => {
    e.preventDefault()
    if (!valida) return
    setErro('')
    setSalvando(true)
    try {
      const res = await fetch('/api/senha?acao=definir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, novaSenha: senha }),
      })
      const corpo = await res.json().catch(() => ({}))
      if (res.status === 410) { setLink({ erro: corpo.error || 'Link expirado ou já utilizado' }); return }
      if (!res.ok) { setErro(corpo.error || 'Não foi possível definir a senha.'); return }
      window.location.replace('/?senha=definida')
    } catch {
      setErro('Erro de rede. Verifique sua conexão.')
    } finally {
      setSalvando(false)
    }
  }

  const campo = (id, rotulo, valor, onChange, autoFocus = false) => (
    <div>
      <label htmlFor={id} className="block text-xs text-texto-2 mb-1.5">{rotulo}</label>
      <div className="relative">
        <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-3" />
        <input
          id={id}
          name={id}
          type="password"
          autoComplete="new-password"
          value={valor}
          onChange={e => { setErro(''); onChange(e.target.value) }}
          autoFocus={autoFocus}
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface border border-borda-campo text-texto-1 text-sm focus:outline-none focus:border-primary transition-colors"
        />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-texto-1">Finup</h1>
          <p className="text-sm text-texto-3 mt-1">{link.tipo === 'convite' ? 'Criar senha de acesso' : 'Definir nova senha'}</p>
        </div>

        {link.carregando && <p className="text-sm text-texto-3 text-center">Conferindo o link…</p>}

        {link.erro && (
          <div className="bg-surface border border-borda rounded-xl p-6 space-y-4 shadow-2xl text-center">
            <p className="text-sm text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{link.erro.replace(/\.?$/, '.')}</p>
            <p className="text-xs text-texto-3">Os links valem por tempo limitado e só podem ser usados uma vez.</p>
            <a href="/?esqueci=1" className="btn-primary w-full inline-flex items-center justify-center gap-2">
              <KeyRound size={15} /> Pedir outro link
            </a>
            <a href="/" className="block text-xs text-texto-3 hover:text-texto-1 underline underline-offset-2">Ir para o login</a>
          </div>
        )}

        {link.nome !== undefined && !link.erro && (
          <form onSubmit={salvar} className="bg-surface border border-borda rounded-xl p-6 space-y-4 shadow-2xl">
            <p className="text-sm text-texto-1">Olá, <span className="font-semibold">{link.nome}</span>! Crie a sua {link.tipo === 'convite' ? 'senha de acesso' : 'nova senha'}.</p>
            {campo('nova-senha', 'Nova senha', senha, setSenha, true)}
            {campo('confirmar-senha', 'Confirmar senha', confirmar, setConfirmar)}
            <ul className="space-y-1">
              {requisitos.map(r => (
                <li key={r.texto} className={`flex items-center gap-1.5 text-xs ${r.ok ? 'text-primary-fg' : 'text-texto-3'}`}>
                  <Check size={12} className={r.ok ? '' : 'opacity-30'} /> {r.texto}
                </li>
              ))}
            </ul>
            {erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}
            <button
              type="submit"
              disabled={!valida || salvando}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <KeyRound size={15} /> {salvando ? 'Salvando…' : 'Definir senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
