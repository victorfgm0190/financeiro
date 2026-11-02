// Marca-d'água devocional do cabeçalho do desktop, inspirada no monograma da Medalha Milagrosa (cruz,
// haste até a barra, barra entrelaçada no "M") com "TOTUS TUUS, MARIA" embaixo. PERMANENTE por decisão
// do dono do sistema: sem opção de ligar/desligar (exceção consciente à regra de recurso atrás de opção).
// Só decoração: aria-hidden, sem cliques, sem data-guia (fora dos tours, tarefas e Central de Ajuda),
// fora da impressão. Cor = token de texto do tema (currentColor), opacidade 8% claro / 10% escuro.
export default function MarcaDagua({ className = '' }) {
  return (
    <svg
      viewBox="-10 0 120 118"
      aria-hidden="true"
      focusable="false"
      className={`text-texto-1 opacity-[0.08] [[data-theme=dark]_&]:opacity-[0.10] pointer-events-none select-none print:hidden ${className}`}
    >
      <rect x="47" y="2" width="6" height="46" fill="currentColor" />
      <rect x="34" y="14" width="32" height="6" fill="currentColor" />
      <path d="M27 90 V34 L50 80 L73 34 V90" fill="none" stroke="currentColor" strokeWidth="6" strokeLinejoin="miter" />
      <path d="M20 90 H34 M66 90 H80 M20 34 H30 M70 34 H80" fill="none" stroke="currentColor" strokeWidth="3" />
      <rect x="17" y="46" width="66" height="6" fill="currentColor" />
      <text
        x="50" y="110" textAnchor="middle" fontSize="8.5" letterSpacing="1.6" fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        TOTUS TUUS, MARIA
      </text>
    </svg>
  )
}
