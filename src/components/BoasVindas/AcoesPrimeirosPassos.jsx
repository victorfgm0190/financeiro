// Ações dos "Primeiros passos" (checklist do Painel/Início): abrem os formulários ou as telas que já
// existem — nada de gravação própria. Perfil: cadastro rápido quando ainda não há nenhum; com perfil,
// leva a Configurações › Perfis para conferir.
import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import Modal from '../shared/Modal'
import PerfilRapido from '../shared/PerfilRapido'
import AccountForm from '../Accounts/AccountForm'
import ScheduleForm from '../Schedule/ScheduleForm'
import ProvisaoForm from '../Schedule/ProvisaoForm'
import Assistente from '../Assistente/Assistente'
import { navegarPara } from '../../lib/abrirTela'
import { configHash } from '../../lib/configRota'

const FORMULARIO_DE_CONTA = { conta: ['Nova Conta', 'checking'], cartao: ['Novo cartão de crédito', 'credit'], reserva: ['Nova conta de reserva', 'savings'] }

export function useAcoesPrimeirosPassos() {
  const { profiles = [] } = useApp()
  const [aberto, setAberto] = useState(null) // id da etapa com formulário aberto
  const fechar = () => setAberto(null)
  const executar = (acao) => {
    if (acao === 'perfil' && profiles.length > 0) { navegarPara('settings', { hash: configHash('geral', 'perfis') }); return }
    if (acao === 'importar-fatura') { navegarPara('import'); return }
    if (acao === 'contrato') { navegarPara('contratos'); return }
    setAberto(acao)
  }
  const conta = FORMULARIO_DE_CONTA[aberto]
  const modais = (
    <>
      <PerfilRapido open={aberto === 'perfil'} onClose={fechar} />
      <Modal open={!!conta} onClose={fechar} title={conta?.[0] || ''}>
        {conta && <AccountForm key={aberto} tipoInicial={conta[1]} onClose={fechar} />}
      </Modal>
      <Modal open={aberto === 'agendamento'} onClose={fechar} title="Novo agendamento" size="lg">
        {aberto === 'agendamento' && <ScheduleForm onClose={fechar} />}
      </Modal>
      <Modal open={aberto === 'provisao'} onClose={fechar} title="Nova provisão" size="lg">
        {aberto === 'provisao' && <ProvisaoForm onClose={fechar} />}
      </Modal>
      <Modal open={aberto === 'assistente'} onClose={fechar} title="✨ Assistente" size="lg">
        {aberto === 'assistente' && <Assistente onClose={fechar} onToast={() => {}} />}
      </Modal>
    </>
  )
  return { executar, modais }
}
