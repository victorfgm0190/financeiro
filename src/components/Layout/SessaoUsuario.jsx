import { useState } from 'react'
import { createPortal } from 'react-dom'
import { UserCircle2, KeyRound, ShieldAlert, LogOut, Smartphone, CalendarDays, Compass } from 'lucide-react'
import { abrirTour } from '../../lib/boasVindasApi'
import { LINK_REVER_TOUR } from '../../lib/ajudaTelas'
import { getSessao } from '../../lib/api'
import { useSair } from '../Offline/useSair'
import AvisoSairModal from '../Offline/AvisoSairModal'
import TrocarSenhaModal from '../Settings/TrocarSenhaModal'
import AgendaCelularPanel from '../Settings/AgendaCelularPanel'
import Modal from '../shared/Modal'
import { rotuloNivel } from '../../lib/permissoes'
import Toast from '../shared/Toast'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useBackupLocal, podeFazerBackup } from '../../hooks/useBackupLocal'
import { diasDesde, DIAS_LEMBRETE } from '../../lib/backupFormato'
import { configHash } from '../../lib/configRota'

// Quem está logado (Sidebar no desktop, tela "Mais" no mobile): nome, aviso discreto quando a
// sessão veio do login fixo de emergência e "Trocar minha senha" para usuários do cadastro.
export default function SessaoUsuario({ comSair = false }) {
  const [sessao] = useState(getSessao)
  const [trocar, setTrocar] = useState(false)
  const [agenda, setAgenda] = useState(false)
  const [toast, setToast] = useState(null)
  const { sair, saindo, aviso } = useSair()
  const isMobile = useIsMobile()
  const { cfg: backupCfg } = useBackupLocal()
  if (!sessao) return null
  // Lembrete discreto (só no computador): backup feito neste aparelho há mais de 7 dias, ou nunca.
  const diasBackup = backupCfg ? diasDesde(backupCfg.ultimo) : null
  const lembrarBackup = !isMobile && !!backupCfg && podeFazerBackup(sessao) && (diasBackup == null || diasBackup > DIAS_LEMBRETE)
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
      {lembrarBackup && (
        <a href={configHash('dados', 'backup')} className="block text-[10px] text-aviso hover:underline leading-tight">
          {diasBackup == null ? 'Nenhum backup feito neste computador' : `Último backup há ${diasBackup} dias`}
        </a>
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
        <button type="button" onClick={abrirTour} className="flex items-center gap-1 text-[11px] text-texto-3 hover:text-texto-1 min-h-[28px]">
          <Compass size={11} /> {LINK_REVER_TOUR}
        </button>
        <a href="/instalar" className="flex items-center gap-1 text-[11px] text-texto-3 hover:text-texto-1 min-h-[28px]">
          <Smartphone size={11} /> Instalar no celular
        </a>
        {comSair && (
          <button type="button" onClick={sair} disabled={saindo} className="flex items-center gap-1 text-[11px] text-texto-3 hover:text-perigo min-h-[28px] disabled:opacity-50">
            <LogOut size={11} /> {saindo ? 'Saindo…' : 'Sair'}
          </button>
        )}
      </div>
      {/* Janelas no <body>: a Sidebar é sticky (contexto de empilhamento próprio) — dentro dela o
          modal ficava POR BAIXO do conteúdo da página (ex.: cabeçalho preso do calendário). */}
      {createPortal(
        <>
          {/* "Sair" com alterações ainda não enviadas (useSair). */}
          {comSair && <AvisoSairModal {...aviso} />}
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
