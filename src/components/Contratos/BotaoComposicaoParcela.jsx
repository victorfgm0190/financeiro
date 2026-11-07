import { Receipt } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'
import { ehParcelaGerada, parcelaPaga } from '../../lib/contratos/parcelas'
import { temComposicaoInformada } from '../../lib/contratos/composicaoAberta'
import { ehModoRepasse } from '../../lib/contratos/repasse'

// "Informar composição" do boleto do condomínio direto em Agendamentos (desktop e celular): na
// ocorrência PENDENTE de uma parcela de condomínio do contrato, ou na PAGA (txId do pagamento). Abre
// o mesmo modal da ficha (ComposicaoParcelaHost) — o que for informado em um aparece no outro.
export default function BotaoComposicaoParcela({ schedule, txId = null }) {
  const { contratosHabilitado, contratoPorId, abrirComposicaoParcela, transactions, pode } = useApp()
  if (!contratosHabilitado || !schedule?.contratoId) return null
  if (!pode?.('contratos', 'editar')) return null
  const papel = schedule.contratoPapel || 'aluguel'
  const contrato = contratoPorId(schedule.contratoId)
  if (!contrato || (papel === 'condominio' && !contrato.tem_condominio)) return null
  // Repasse de administradora: a composição da competência (pendente ou paga), sempre disponível.
  if (ehModoRepasse(contrato) && papel === 'aluguel' && ehParcelaGerada(schedule, contrato.id)) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); abrirComposicaoParcela(schedule.id, txId ? { txId } : {}) }}
        title="Ver ou editar a composição deste repasse (aluguel, taxas e deduções)"
        className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded whitespace-nowrap font-medium transition-colors shrink-0 bg-primary/15 text-primary-fg hover:bg-primary/25"
      >
        <Receipt size={10} /> Composição
      </button>
    )
  }
  // Aluguel: composição pelo recibo (pendente: valor = total do recibo; paga: lançamento intocado).
  const aluguel = papel === 'aluguel'
  const paga = !!txId
  // Pendente: só a parcela gerada pelo contrato (a série vinculada guarda o histórico).
  if (!paga && (!ehParcelaGerada(schedule, contrato.id) || parcelaPaga(schedule))) return null
  const tx = paga ? (transactions || []).find(t => t.id === txId) : null
  if (paga && !tx) return null
  const temItens = aluguel
    ? !!(paga ? tx.composicao?.informada : schedule.composicao?.informada)
    : (paga ? !!tx.composicao?.itens?.length : temComposicaoInformada(schedule))
  const rotulo = temItens ? 'Composição' : 'Informar composição'
  const titulo = paga
    ? (temItens ? 'Ver ou editar a composição do boleto deste pagamento' : 'Informar os itens do boleto deste pagamento')
    : aluguel
      ? (temItens ? `Recibo informado (${fmt(schedule.composicao.total)}): ver ou editar os itens` : 'O recibo chegou? Informe os itens (digitar, colar, foto ou PDF)')
      : (temItens ? `Boleto informado (${fmt(schedule.composicao.total)}): ver ou editar os itens` : 'O boleto chegou? Informe os itens (digitar, colar, foto ou PDF)')
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); abrirComposicaoParcela(schedule.id, paga ? { txId } : {}) }}
      title={titulo}
      className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded whitespace-nowrap font-medium transition-colors shrink-0 ${temItens ? 'bg-primary/15 text-primary-fg hover:bg-primary/25' : 'bg-surface-2 text-texto-2 ring-1 ring-inset ring-borda-forte hover:bg-surface-hover'}`}
    >
      <Receipt size={10} /> {rotulo}
    </button>
  )
}
