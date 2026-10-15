import { useState } from 'react'
import { UserCircle2, KeyRound, ShieldAlert, LogOut } from 'lucide-react'
import { getSessao, clearTokenAndRedirect } from '../../lib/api'
import TrocarSenhaModal from '../Settings/TrocarSenhaModal'
import Toast from '../shared/Toast'

// Quem está logado (Sidebar no desktop, tela "Mais" no mobile): nome, aviso discreto quando a
// sessão veio do login fixo de emergência e "Trocar minha senha" para usuários do cadastro.
export default function SessaoUsuario({ comSair = false }) {
  const [sessao] = useState(getSessao)
  const [trocar, setTrocar] = useState(false)
  const [toast, setToast] = useState(null)
  if (!sessao) return null
  const emergencia = sessao.origem === 'env'

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 min-w-0">
        <UserCircle2 size={14} className="shrink-0 text-texto-2" />
        <span className="text-xs text-texto-1 font-medium truncate" title={sessao.username || ''}>{sessao.nome}</span>
      </div>
      {emergencia && (
        <p className="flex items-center gap-1.5 text-[11px] text-aviso leading-tight">
          <ShieldAlert size={12} className="shrink-0" /> Logado com acesso de emergência
        </p>
      )}
      <div className="flex items-center gap-3">
        {!emergencia && (
          <button type="button" onClick={() => setTrocar(true)} className="flex items-center gap-1 text-[11px] text-texto-3 hover:text-texto-1 min-h-[28px]">
            <KeyRound size={11} /> Trocar minha senha
          </button>
        )}
        {comSair && (
          <button type="button" onClick={clearTokenAndRedirect} className="flex items-center gap-1 text-[11px] text-texto-3 hover:text-perigo min-h-[28px]">
            <LogOut size={11} /> Sair
          </button>
        )}
      </div>
      <TrocarSenhaModal open={trocar} onClose={() => setTrocar(false)} onTrocada={() => setToast('Senha alterada.')} />
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
