import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { rotuloContrato } from '../../lib/contratos/parcelas'
import ContratoFicha from './ContratoFicha'
import LimiteDeErro from '../shared/LimiteDeErro'

// Ficha do contrato aberta de qualquer tela (selo "Contrato" no Fluxo/Agendamentos, lista de
// Contratos, modal de exclusão) — montada uma vez nos overlays do App, desktop e mobile.
// Erro de tela dentro da ficha (ou dos modais dela) fica nela: aviso no lugar, o app segue de pé.
export default function ContratoFichaHost() {
  const { fichaContratoAberta, fecharFichaContrato, contratoPorId, contratosHabilitado } = useApp()
  if (!contratosHabilitado || !fichaContratoAberta) return null
  const c = contratoPorId(fichaContratoAberta.id)
  return (
    <Modal open onClose={fecharFichaContrato} title={c ? `Contrato — ${rotuloContrato(c)}` : 'Contrato'} size="xl">
      <LimiteDeErro nome="ficha do contrato" chaveReinicio={fichaContratoAberta.id}>
        <ContratoFicha key={fichaContratoAberta.id} id={fichaContratoAberta.id} acaoInicial={fichaContratoAberta.acao} onClose={fecharFichaContrato} />
      </LimiteDeErro>
    </Modal>
  )
}
