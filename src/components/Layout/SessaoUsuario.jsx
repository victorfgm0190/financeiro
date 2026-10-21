import { useState } from 'react'
import { createPortal } from 'react-dom'
import { UserCircle2, KeyRound, ShieldAlert, LogOut, Smartphone, CalendarDays, Trash2 } from 'lucide-react'
import { getSessao } from '../../lib/api'
import SairModal from '../Offline/SairModal'
import { useSair } from '../Offline/useSair'
import TrocarSenhaModal from '../Settings/TrocarSenhaModal'
import AgendaCelularPanel from '../Settings/AgendaCelularPanel'
import Modal from '../shared/Modal'
import { rotuloNivel } from '../../lib/permissoes'
import Toast from '../shared/Toast'

// Quem está logado (Sidebar no desktop, tela "Mais" no mobile): nome, aviso discreto quando a
// sessão veio do login fixo de emergência e "Trocar minha senha" para usuários do cadastro.
export default function SessaoUsuario({ comSair = false }) {
  const [sessao] = useState(getSessao)
  const [trocar, setTrocar] = useState(false)
  const [agenda, setAgenda] = useState(false)
  const [toast, setToast] = useState(null)
  const [apagar, setApagar] = useState(false)
  const { sair, saindo } = useSair()
  if (!sessao) return null
  const emergencia = sessao.origem === 'env'

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 min-w-0">
        <UserCircle2 size={14} className="shrink-0 text-texto-2" />
        <span className="text-xs text-texto-1 font-medium truncate" title={sessao.username || ''}>{sessao.nome}</span>
        {sessao.nivel && <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-texto-3">{rotuloNivel(sessao.nivel)}</span>}
      </div>
      {sessao.ambSigla && (
        <p className="text-[10px] text-texto-3 leading-tight font-mono" title="Ambiente (banco de dados) desta sessão">Ambiente {sessao.ambSigla.toUpperCase()}</p>
      )}
      {emergencia && (
        <p className="flex items-center gap-1.5 text-[11px] text-aviso leading-tight">
          <ShieldAlert size={12} className="shrink-0" /> Logado com acesso de emergência
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3">
        {!emergencia && (
          <button type="button" onClick={() => setTrocar(true)} className="flex items-center gap-1 text-[11px] text-texto-3 hover:text-texto-1 min-h-[28px]">
            <KeyRound size={11} /> Trocar minha senha
          </button>
        )}
        {!emergencia && (
          <button type="button" onClick={() => setAgenda(true)} className="flex items-center gap-1 text-[11px] text-texto-3 hover:text-texto-1 min-h-[28px]">
            <CalendarDays size={11} /> Agenda no celular
          </button>
        )}
        <a href="/instalar" className="flex items-center gap-1 text-[11px] text-texto-3 hover:text-texto-1 min-h-[28px]">
          <Smartphone size={11} /> Instalar no celular
        </a>
        {comSair && (
          <button type="button" onClick={sair} disabled={saindo} className="flex items-center gap-1 text-[11px] text-texto-3 hover:text-perigo min-h-[28px] disabled:opacity-50">
            <LogOut size={11} /> {saindo ? 'Saindo…' : 'Sair'}
          </button>
        )}
      </div>
      {/* Opção separada e discreta, logo abaixo de "Sair" (no celular, a última do menu Mais). */}
      {comSair && (
        <button type="button" onClick={() => setApagar(true)} disabled={saindo} className="flex items-center gap-1 text-[10px] text-perigo/80 hover:text-perigo min-h-[24px] disabled:opacity-50">
          <Trash2 size={10} /> Sair e apagar dados deste aparelho
        </button>
      )}
      {/* Janelas no <body>: a Sidebar é sticky (contexto de empilhamento próprio) — dentro dela o
          modal ficava POR BAIXO do conteúdo da página (ex.: cabeçalho preso do calendário). */}
      {createPortal(
        <>
          <SairModal open={apagar} onClose={() => setApagar(false)} />
          {/* Agenda no celular: janela (vale para qualquer nível — Configurações › Geral pode estar fechada). */}
          <Modal open={agenda} onClose={() => setAgenda(false)} title="Agenda no celular">
            {agenda && <AgendaCelularPanel emJanela />}
          </Modal>
          <TrocarSenhaModal open={trocar} onClose={() => setTrocar(false)} onTrocada={() => setToast('Senha alterada.')} />
        </>,
        document.body,
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
