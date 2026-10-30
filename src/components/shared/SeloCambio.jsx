import { rotuloCambio } from '../../lib/cambio'

// Compra em moeda estrangeira / IOF ainda ESTIMADOS (src/lib/cambio.js): selo "estimado" e o valor
// na moeda × a taxa efetiva ("US$ 20,00 × 5,33"). Só exibição; lançamento comum não desenha nada.
export default function SeloCambio({ tx }) {
  const cambio = rotuloCambio(tx)
  if (!tx?.estimado && !cambio) return null
  return (
    <span className="inline-flex items-center gap-1 shrink-0 align-middle">
      {tx.estimado && (
        <span title="Valor em R$ estimado: a importação da fatura troca pelo valor real" className="text-[10px] px-1 py-0.5 rounded bg-aviso/15 text-aviso font-semibold whitespace-nowrap">estimado</span>
      )}
      {cambio && (
        <span title={tx.cotacao ? `PTAX ${Number(tx.cotacao).toLocaleString('pt-BR', { minimumFractionDigits: 4 })}` : undefined} className="text-[10px] px-1 py-0.5 rounded bg-surface-hover/60 text-texto-2 font-medium whitespace-nowrap">{cambio}</span>
      )}
    </span>
  )
}
