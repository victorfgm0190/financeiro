import { FileSignature } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { parcelaPaga, rotuloContrato, vencimentos, competenciaDaParcela } from '../../lib/contratos/parcelas'
import { lembreteDaParcela } from '../../lib/contratos/conferenciaExtrato'
import { hojeStr } from '../../lib/contratos/datas'

// Nº/total pelo calendário do contrato (competência da parcela): depois de um aditivo de mês sem
// cobrança, a parcela paga mostra a numeração nova (só na tela). Sem contrato carregado: o gravado.
function numeracao(c, s) {
  if (!c || !s?.startDate || (s.frequency || 'once') !== 'once') return { n: s?.composicao?.numero, t: s?.composicao?.total_parcelas }
  const lista = vencimentos(c, s.contratoPapel || 'aluguel', { hoje: s.startDate })
  const v = lista.find(x => x.competencia === competenciaDaParcela(s))
  return { n: v?.numero ?? null, t: c.data_fim ? lista.length : null }
}

// Selos "Contrato n/N" e "Projetado" de uma parcela/agendamento/lançamento de contrato (Fluxo,
// Agendamentos, Lançamentos). Clique abre a ficha do contrato. Sem contrato ou módulo desligado: nada.
export default function SeloContrato({ schedule = null, contratoId = null, comProjetado = true }) {
  const { contratosHabilitado, contratoPorId, abrirFichaContrato } = useApp()
  const id = contratoId || schedule?.contratoId
  if (!id || !contratosHabilitado) return null
  const c = contratoPorId(id)
  const { n, t } = numeracao(c, schedule)
  const rotulo = n ? `Contrato ${n}${t ? `/${t}` : ''}` : 'Contrato'
  const abrir = (e) => { e.stopPropagation(); abrirFichaContrato(id) }
  // Repasse da administradora: "Conferido" (extrato conferido) ou "Projetado" (o Finup calculou);
  // a partir do dia 5 do mês do repasse sem conferir, o lembrete do extrato.
  const repasse = comProjetado && schedule?.composicao?.tipo === 'repasse' && !parcelaPaga(schedule)
  const conferido = repasse && schedule.composicao.conferida === true
  const lembrete = repasse && !conferido ? lembreteDaParcela(c, competenciaDaParcela(schedule), hojeStr()) : null
  const projetado = comProjetado && !parcelaPaga(schedule || {}) && (repasse ? !conferido : schedule?.valorStatus === 'projetado')
  // Repasse sem deduções calculadas: o valor ainda é o aluguel bruto.
  const bruto = comProjetado && schedule?.composicao?.bruto === true && !parcelaPaga(schedule)
  return (
    <>
      <button
        type="button"
        onClick={abrir}
        title={`${c ? rotuloContrato(c) : 'Contrato'} — abrir a ficha`}
        className="inline-flex items-center gap-1 text-xs bg-primary/15 text-primary-fg px-1.5 py-0.5 rounded whitespace-nowrap font-medium hover:bg-primary/25 transition-colors shrink-0"
      >
        <FileSignature size={10} /> {rotulo}
      </button>
      {projetado && (
        <button
          type="button"
          onClick={abrir}
          title={repasse ? 'Valor projetado pelo Finup a partir do contrato — confira com o extrato da administradora' : 'Valor projetado pelo índice de reajuste — confirme na ficha do contrato'}
          className="inline-flex items-center text-xs bg-surface-2 text-aviso outline-dashed outline-1 -outline-offset-1 outline-borda-forte px-1.5 py-0.5 rounded whitespace-nowrap font-medium hover:bg-surface-hover transition-colors shrink-0"
        >
          Projetado
        </button>
      )}
      {conferido && (
        <button type="button" onClick={abrir} title="Valor conferido com o extrato da administradora"
          className="inline-flex items-center text-xs bg-receita/10 text-receita px-1.5 py-0.5 rounded whitespace-nowrap font-medium hover:bg-receita/20 transition-colors shrink-0">
          Conferido
        </button>
      )}
      {lembrete && (
        <button type="button" onClick={abrir} title={lembrete}
          className="inline-flex items-center text-xs bg-aviso/15 text-aviso px-1.5 py-0.5 rounded whitespace-nowrap font-medium hover:bg-aviso/25 transition-colors shrink-0">
          Extrato não conferido
        </button>
      )}
      {bruto && (
        <button
          type="button"
          onClick={abrir}
          title="Valor bruto do aluguel — as deduções da administradora ainda não foram aplicadas"
          className="inline-flex items-center text-xs bg-surface-2 text-aviso outline-dashed outline-1 -outline-offset-1 outline-borda-forte px-1.5 py-0.5 rounded whitespace-nowrap font-medium hover:bg-surface-hover transition-colors shrink-0"
        >
          Valor bruto
        </button>
      )}
    </>
  )
}
