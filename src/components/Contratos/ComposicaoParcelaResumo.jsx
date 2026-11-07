import { fmt } from '../shared/utils'

// Composição da parcela de contrato na confirmação do pagamento (modal "Registrar Agendamento"):
// base, desconto, créditos a abater (os PREVISTOS marcados) e itens do boleto do condomínio
// informado. O pagamento continua UMA linha só; isto só mostra a conta.
export default function ComposicaoParcelaResumo({ schedule }) {
  const c = schedule?.contratoId ? schedule.composicao : null
  const itens = c?.itens || []
  if (itens.length < 2 && !itens.some(i => i.tipo === 'credito')) return null
  const previstos = itens.filter(i => i.previsto)
  const repasse = c.tipo === 'repasse'
  return (
    <div className="rounded-lg border border-borda bg-surface-2/40 px-3 py-2.5 text-xs space-y-0.5" data-testid="composicao-parcela">
      <p className="text-texto-2 mb-1.5">{repasse ? `Composição deste repasse (competência ${String(c.competencia || '').slice(5, 7)}/${String(c.competencia || '').slice(0, 4)})` : 'Composição desta parcela'}{c.informada ? (c.tipo === 'condominio' ? ' (boleto informado)' : ' (recibo informado)') : ''}</p>
      {itens.map((i, k) => (
        <div key={k} className="flex items-center justify-between gap-2">
          <span className={`min-w-0 truncate ${i.previsto ? 'text-aviso' : 'text-texto-2'}`} title={i.desc ?? i.descricao}>{i.desc ?? i.descricao}</span>
          <span className={i.valor < 0 ? (repasse ? 'text-despesa' : 'text-receita') : 'text-texto-1'}>{fmt(i.valor)}</span>
        </div>
      ))}
      {repasse && Math.abs(Number(c.saldo_anterior) || 0) > 0.005 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-texto-2">Saldo anterior com a administradora</span>
          <span className={c.saldo_anterior < 0 ? 'text-despesa' : 'text-texto-1'}>{fmt(c.saldo_anterior)}</span>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-borda-forte mt-1.5 pt-1.5">
        <span className="text-texto-2 font-semibold">Total</span>
        <span className="text-texto-1 font-bold">{fmt(c.total ?? schedule.amount)}</span>
      </div>
      {previstos.length > 0 && (
        <p className="text-aviso pt-1">
          ⚠ Crédito previsto: o condomínio de origem ainda não foi pago. Pagando este valor, o crédito fica registrado como abatido e o pagamento do condomínio não gera outro igual.
        </p>
      )}
    </div>
  )
}
