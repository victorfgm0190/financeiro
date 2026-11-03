// Marca-d'água devocional inspirada no monograma da Medalha Milagrosa (cruz, haste até a barra, barra
// entrelaçada no "M") com "TOTUS TUUS, MARIA" embaixo. PERMANENTE por decisão do dono do sistema: sem
// opção de ligar/desligar (exceção consciente à regra de recurso atrás de opção).
// Um componente só, em três lugares (variant): "header" (cabeçalho do desktop), "mobile" (topo do Início
// no celular) e "login" (acima do título na tela de login).
// Só decoração: aria-hidden, sem cliques, sem seleção, sem data-guia (fora dos tours, tarefas e Central de
// Ajuda), fora da impressão. Cor = token de texto do tema (currentColor). Símbolo e frase têm opacidades
// SEPARADAS (nada de opacidade no <svg>, para não multiplicar): símbolo 8% claro / 10% escuro, frase
// 22% claro / 28% escuro — a frase é mais visível que o símbolo.
// viewBox -22..122 na horizontal (o desenho de referência usa -12..112): com fonte 10.5 e espaçamento 1.8
// a frase mede ~138 unidades (-19..118 em Georgia) e era cortada nas pontas.
// Login no celular: 90px (no 375x667 o formulário cabe sem rolagem); 120px a partir de md.
const ALTURA = {
  header: 'h-[52px]',
  mobile: 'h-[64px]',
  login: 'h-[90px] md:h-[120px]',
}

export default function MarcaDagua({ variant = 'header', className = '' }) {
  return (
    <svg
      viewBox="-22 0 144 122"
      aria-hidden="true"
      focusable="false"
      data-marca-dagua={variant}
      className={`${ALTURA[variant] || ALTURA.header} w-auto text-texto-1 pointer-events-none select-none print:hidden ${className}`}
    >
      <g className="opacity-[0.08] [[data-theme=dark]_&]:opacity-[0.10]">
        <rect x="47" y="2" width="6" height="46" fill="currentColor" />
        <rect x="34" y="14" width="32" height="6" fill="currentColor" />
        <path d="M27 90 V34 L50 80 L73 34 V90" fill="none" stroke="currentColor" strokeWidth="6" strokeLinejoin="miter" />
        <path d="M20 90 H34 M66 90 H80 M20 34 H30 M70 34 H80" fill="none" stroke="currentColor" strokeWidth="3" />
        <rect x="17" y="46" width="66" height="6" fill="currentColor" />
      </g>
      <text
        x="50" y="114" textAnchor="middle" fontSize="10.5" letterSpacing="1.8" fill="currentColor" fontWeight="500"
        fontFamily="Georgia, 'Times New Roman', serif"
        className="opacity-[0.22] [[data-theme=dark]_&]:opacity-[0.28]"
      >
        TOTUS TUUS, MARIA
      </text>
    </svg>
  )
}
