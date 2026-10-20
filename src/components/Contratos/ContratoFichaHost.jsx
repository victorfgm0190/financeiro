import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { rotuloContrato } from '../../lib/contratos/parcelas'
import ContratoFicha from './ContratoFicha'

// Ficha do contrato aberta de qualquer tela (selo "Contrato" no Fluxo/Agendamentos, lista de
// Contratos, modal de exclusão) — montada uma vez nos overlays do App, desktop e mobile.
export default function ContratoFichaHost() {
  const { fichaContratoAberta, fecharFichaContrato, contratoPorId, contratosHabilitado } = useApp()
  if (!contratosHabilitado || !fichaContratoAberta) return null
  const c = contratoPorId(fichaContratoAberta.id)
  return (
    <Modal open onClose={fecharFichaContrato} title={c ? `Contrato — ${rotuloContrato(c)}` : 'Contrato'} size="xl">
      <ContratoFicha key={fichaContratoAberta.id} id={fichaContratoAberta.id} acaoInicial={fichaContratoAberta.acao} onClose={fecharFichaContrato} />
    </Modal>
  )
}
