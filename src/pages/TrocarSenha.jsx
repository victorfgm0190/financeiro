import { useState } from 'react'
import { KeyRound, Check, LogOut } from 'lucide-react'
import { AUTH_TOKEN_KEY, clearTokenAndRedirect, getSessao } from '../lib/api'
import { trocarMinhaSenha } from '../lib/usuariosApi'

const SENHA_MIN = 8

// Tela obrigatória quando o usuário foi marcado com "trocar senha no próximo login": o app só
// abre depois da troca. A API devolve um token novo (sem a marca), que substitui o salvo.
export default function TrocarSenha() {
  const sessao = getSessao()
  const [f, setF] = useState({ atual: '', nova: '', repetir: '' })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const set = (k, v) => { setErro(''); setF(p => ({ ...p, [k]: v })) }

  const salvar = async (e) => {
    e.preventDefault()
    if (f.nova.length < SENHA_MIN) return setErro(`A nova senha precisa ter pelo menos ${SENHA_MIN} caracteres.`)
    if (f.nova !== f.repetir) return setErro('A confirmação não confere com a nova senha.')
    setSalvando(true)
    try {
      const r = await trocarMinhaSenha(f.atual, f.nova)
      if (r?.token) localStorage.setItem(AUTH_TOKEN_KEY, r.token)
      window.location.replace('/')
    } catch (err) {
      setErro(err?.message || 'Falha ao trocar a senha.')
      setSalvando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-3">
            <KeyRound size={22} className="text-primary-fg" />
          </div>
          <h1 className="text-lg font-bold text-texto-1">Defina uma nova senha</h1>
          <p className="text-sm text-texto-3 mt-1">
            Olá{sessao?.nome ? `, ${sessao.nome}` : ''}. Por segurança, troque a senha antes de continuar.
          </p>
        </div>
        <form onSubmit={salvar} className="bg-surface border border-borda rounded-xl p-6 space-y-3 shadow-2xl">
          <div>
            <label className="label" htmlFor="ts-atual">Senha atual</label>
            <input id="ts-atual" type="password" autoComplete="current-password" className="input" value={f.atual} onChange={e => set('atual', e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="ts-nova">Nova senha</label>
            <input id="ts-nova" type="password" autoComplete="new-password" className="input" value={f.nova} onChange={e => set('nova', e.target.value)} />
            <p className="text-[11px] text-texto-3 mt-1">Mínimo de {SENHA_MIN} caracteres, diferente da atual.</p>
          </div>
          <div>
            <label className="label" htmlFor="ts-repetir">Confirme a nova senha</label>
            <input id="ts-repetir" type="password" autoComplete="new-password" className="input" value={f.repetir} onChange={e => set('repetir', e.target.value)} />
          </div>
          {erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}
          <button type="submit" disabled={salvando || !f.atual || !f.nova || !f.repetir} className="btn-primary w-full flex items-center justify-center gap-1.5">
            <Check size={14} /> {salvando ? 'Salvando…' : 'Trocar senha e entrar'}
          </button>
          <button type="button" onClick={clearTokenAndRedirect} className="w-full flex items-center justify-center gap-1.5 text-xs text-texto-3 hover:text-texto-1 pt-1">
            <LogOut size={12} /> Sair
          </button>
        </form>
      </div>
    </div>
  )
}
