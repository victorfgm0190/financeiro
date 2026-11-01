// Ações dos "Primeiros passos" (último passo do tour e checklist do Painel): abrem os formulários
// que já existem — nada de gravação própria. Perfil: cadastro rápido quando ainda não há nenhum;
// com perfil, leva a Configurações › Perfis para conferir.
import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import Modal from '../shared/Modal'
import PerfilRapido from '../shared/PerfilRapido'
import AccountForm from '../Accounts/AccountForm'
import ScheduleForm from '../Schedule/ScheduleForm'
import { navegarPara } from '../../lib/abrirTela'
import { configHash } from '../../lib/configRota'

export function useAcoesPrimeirosPassos() {
  const { profiles = [] } = useApp()
  const [aberto, setAberto] = useState(null) // 'perfil' | 'conta' | 'cartao' | 'agendamento'
  const fechar = () => setAberto(null)
  const executar = (acao) => {
    if (acao === 'perfil' && profiles.length > 0) {
      navegarPara('settings', { hash: configHash('geral', 'perfis') })
      return
    }
    setAberto(acao)
  }
  const modais = (
    <>
      <PerfilRapido open={aberto === 'perfil'} onClose={fechar} />
      <Modal open={aberto === 'conta' || aberto === 'cartao'} onClose={fechar} title={aberto === 'cartao' ? 'Novo cartão de crédito' : 'Nova Conta'}>
        {(aberto === 'conta' || aberto === 'cartao') && <AccountForm key={aberto} tipoInicial={aberto === 'cartao' ? 'credit' : 'checking'} onClose={fechar} />}
      </Modal>
      <Modal open={aberto === 'agendamento'} onClose={fechar} title="Novo agendamento" size="lg">
        {aberto === 'agendamento' && <ScheduleForm onClose={fechar} />}
      </Modal>
    </>
  )
  return { executar, modais }
}
