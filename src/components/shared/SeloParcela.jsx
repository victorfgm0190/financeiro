// Selo "x/N" da parcela de um lançamento gerado por agendamento parcelado (rótulo de
// criarSeloParcela, src/lib/numeroParcela.js). Só exibição; sem rótulo não desenha nada.
export default function SeloParcela({ rotulo }) {
  if (!rotulo) return null
  return (
    <span
      title="Parcela do agendamento que gerou este lançamento"
      className="text-[10px] px-1 py-0.5 rounded bg-surface-hover/60 text-texto-2 font-medium whitespace-nowrap shrink-0"
    >
      {rotulo}
    </span>
  )
}
