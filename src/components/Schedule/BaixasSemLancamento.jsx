import { useMemo, useState } from 'react'
import { AlertTriangle, Link2, Undo2, CheckCircle } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'
import { useApp } from '../../context/AppContext'
import { revisaoBaixasSemLancamento } from '../../lib/baixasSemLancamento'
import { metaBaixaGerada } from '../../lib/scheduleBaixa'
import VincularLancamento from './VincularLancamento'

// Revisão das baixas sem lançamento (Agendamentos → "Baixas sem lançamento"): cada ocorrência marcada
// como paga sem registro de dinheiro, com o lançamento solto que parece ser o pagamento. Três saídas:
// vincular, desfazer a baixa (volta a pendente) ou manter assim — "pago fora do Finup", gravado no
// registered_meta, e a linha sai do alerta. Nada muda sem o clique do usuário.
export default function BaixasSemLancamento({ schedules }) {
  const {
    transactions, schedules: todos, accounts, rateiosByLancamento, pode,
    markScheduleRegistered, marcarDataOcorrencia, desfazerBaixaOcorrencia, manterBaixaPagoFora,
  } = useApp()
  const podeEditar = pode('agendamentos', 'editar')
  const linhas = useMemo(
    () => revisaoBaixasSemLancamento(schedules, transactions, { rateios: rateiosByLancamento, todos }),
    [schedules, transactions, rateiosByLancamento, todos],
  )
  const [buscando, setBuscando] = useState(null) // key da linha com a busca do Vincular aberta
  const [feito, setFeito] = useState('')
  const conta = (id) => { const a = (accounts || []).find(x => x.id === id); return a ? (a.apelido || a.name) : '—' }
  const vincular = (l, txId) => {
    markScheduleRegistered(l.schedule.id, l.data, metaBaixaGerada(txId))
    marcarDataOcorrencia(txId, l.data)
    setBuscando(null)
    setFeito(`Ocorrência de ${fmtDate(l.data)} (${l.schedule.description}) vinculada ao lançamento.`)
  }

  if (!linhas.length) {
    return (
      <div className="space-y-2">
        {feito && <p className="text-xs text-receita" role="status">{feito}</p>}
        <p className="text-sm text-texto-2 flex items-center gap-2 py-4" data-testid="baixas-sem-lancamento-vazio">
          <CheckCircle size={16} className="text-receita" /> Nenhuma baixa sem lançamento para revisar.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-3" data-testid="baixas-sem-lancamento">
      <p className="text-xs text-texto-2">
        Ocorrências marcadas como pagas sem nenhum lançamento ligado a elas. Para cada uma, vincule ao
        lançamento do pagamento, desfaça a baixa (volta a ficar a pagar) ou mantenha assim, se foi paga fora do Finup.
        Agendamentos automáticos (fatura, devolução gerencial, contrato) não entram aqui.
      </p>
      {feito && <p className="text-xs text-receita" role="status">{feito}</p>}
      <ul className="divide-y divide-borda border border-borda-forte rounded-lg">
        {linhas.map(l => (
          <li key={l.key} className="p-3 space-y-2" data-testid="linha-baixa-sem-lancamento">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-texto-1 font-medium break-words">
                  {l.schedule.description || '(sem descrição)'}
                  {l.total ? <span className="ml-1.5 text-xs text-texto-3 font-normal">{l.parcela}/{l.total}</span> : null}
                </p>
                <p className="text-xs text-texto-2">
                  Ocorrência de {fmtDate(l.data)}
                  {l.vencimento && l.vencimento !== l.data ? ` · vencimento ${fmtDate(l.vencimento)}` : ''}
                  {' · '}{conta(l.schedule.accountId)}
                </p>
              </div>
              <span className="text-sm text-texto-1 font-medium whitespace-nowrap">{fmt(l.valor)}</span>
            </div>
            <p className="text-xs flex items-start gap-1.5">
              <AlertTriangle size={12} className="text-aviso mt-0.5 shrink-0" />
              {l.candidato ? (
                <span className="text-texto-2">
                  Parece ser o pagamento: <span className="text-texto-1">{l.candidato.description || l.candidato.payee || '(sem descrição)'}</span>
                  {' · '}{fmtDate(l.candidato.date)} · {conta(l.candidato.accountId)} · {fmt(l.candidato.amount)}
                </span>
              ) : (
                <span className="text-texto-3">Nenhum lançamento solto com o mesmo valor perto dessa data.</span>
              )}
            </p>
            {podeEditar && (
              <div className="flex flex-wrap gap-2">
                {l.candidato ? (
                  <button type="button" className="btn-primary text-xs py-1 px-2 flex items-center gap-1" onClick={() => vincular(l, l.candidato.id)}>
                    <Link2 size={12} /> Vincular a este lançamento
                  </button>
                ) : null}
                <button type="button" className="btn-secondary text-xs py-1 px-2 flex items-center gap-1" onClick={() => setBuscando(buscando === l.key ? null : l.key)}>
                  <Link2 size={12} /> {l.candidato ? 'Escolher outro' : 'Vincular lançamento'}
                </button>
                <button type="button" className="btn-secondary text-xs py-1 px-2 flex items-center gap-1"
                  onClick={() => { desfazerBaixaOcorrencia(l.schedule.id, l.data); setFeito(`Baixa de ${fmtDate(l.data)} (${l.schedule.description}) desfeita: a ocorrência voltou a ficar a pagar.`) }}>
                  <Undo2 size={12} /> Desfazer baixa
                </button>
                <button type="button" className="btn-secondary text-xs py-1 px-2 flex items-center gap-1"
                  onClick={() => { manterBaixaPagoFora(l.schedule.id, l.data); setFeito(`Baixa de ${fmtDate(l.data)} (${l.schedule.description}) mantida como paga fora do Finup.`) }}>
                  <CheckCircle size={12} /> Manter assim (pago fora do Finup)
                </button>
              </div>
            )}
            {buscando === l.key && (
              <VincularLancamento
                abertoInicial schedule={l.schedule} data={l.data} transactions={transactions} schedules={todos}
                accounts={accounts} rateios={rateiosByLancamento} onVincular={(txId) => vincular(l, txId)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
