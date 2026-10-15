import { useState } from 'react'
import { Check } from 'lucide-react'
import Modal from '../shared/Modal'
import { trocarMinhaSenha } from '../../lib/usuariosApi'

const SENHA_MIN = 8

// "Trocar minha senha" — só para quem entrou pelo cadastro (o login fixo não tem senha no banco).
export default function TrocarSenhaModal({ open, onClose, onTrocada }) {
  const [f, setF] = useState({ atual: '', nova: '', repetir: '' })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const set = (k, v) => { setErro(''); setF(p => ({ ...p, [k]: v })) }
  const fechar = () => { setF({ atual: '', nova: '', repetir: '' }); setErro(''); onClose() }

  const salvar = async (e) => {
    e.preventDefault()
    if (f.nova.length < SENHA_MIN) return setErro(`A nova senha precisa ter pelo menos ${SENHA_MIN} caracteres.`)
    if (f.nova !== f.repetir) return setErro('A confirmação não confere com a nova senha.')
    setSalvando(true)
    try {
      await trocarMinhaSenha(f.atual, f.nova)
      fechar()
      onTrocada?.()
    } catch (err) {
      setErro(err?.message || 'Falha ao trocar a senha.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal open={open} onClose={fechar} title="Trocar minha senha" size="sm">
      <form onSubmit={salvar} className="p-5 space-y-3">
        <div>
          <label className="label" htmlFor="senha-atual">Senha atual</label>
          <input id="senha-atual" type="password" autoComplete="current-password" className="input" value={f.atual} onChange={e => set('atual', e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="senha-nova">Nova senha</label>
          <input id="senha-nova" type="password" autoComplete="new-password" className="input" value={f.nova} onChange={e => set('nova', e.target.value)} />
          <p className="text-[11px] text-texto-3 mt-1">Mínimo de {SENHA_MIN} caracteres.</p>
        </div>
        <div>
          <label className="label" htmlFor="senha-repetir">Repita a nova senha</label>
          <input id="senha-repetir" type="password" autoComplete="new-password" className="input" value={f.repetir} onChange={e => set('repetir', e.target.value)} />
        </div>
        {erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={fechar} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={salvando || !f.atual || !f.nova || !f.repetir} className="btn-primary flex items-center gap-1.5">
            <Check size={14} /> {salvando ? 'Salvando…' : 'Trocar senha'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
