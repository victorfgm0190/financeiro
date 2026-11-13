import { useId } from 'react'

// Marca-d'água devocional: coroa com cruz dentro de dois círculos com 12 estrelas, com
// "TOTUS TUUS, MARIA" embaixo. PERMANENTE por decisão do dono do sistema: sem opção de ligar/desligar
// (exceção consciente à regra de recurso atrás de opção).
// Um componente só, em três lugares (variant): "header" (cabeçalho do desktop), "mobile" (topo do Início
// no celular) e "login" (acima do título na tela de login).
// Só decoração: aria-hidden, sem cliques, sem seleção, sem data-guia (fora dos tours, tarefas e Central de
// Ajuda), fora da impressão.
// Cor e opacidades vêm de variáveis CSS por tema (src/index.css): --marca-dagua-cor,
// --marca-dagua-opacidade-simbolo e --marca-dagua-opacidade-texto (classes .marca-dagua*). Símbolo e
// frase têm opacidades SEPARADAS (nada de opacidade no <svg>, para não multiplicar) e a frase é sempre
// mais visível que o símbolo. Trocar tema ou cruzar celular × computador muda as variáveis na hora.
// Geometria: viewBox -22..122 na horizontal (com fonte 10.5 e espaçamento 1.8 a frase mede ~138
// unidades e era cortada no -12..112). O símbolo é quadrado (desenho 400×400) e ocupa a caixa 88×88 em
// (6, 2) — o mesmo espaço vertical (y 2..90) do símbolo anterior, então tamanho e posição não mudam.
// Máscaras com id por instância (useId): o componente pode aparecer mais de uma vez na mesma página.
// Login no celular: 90px (no 375x667 o formulário cabe sem rolagem); 120px a partir de md.
const ALTURA = {
  header: 'h-[52px]',
  mobile: 'h-[64px]',
  login: 'h-[90px] md:h-[120px]',
}

// 12 estrelas de 5 pontas no anel (desenho de referência, coordenadas no 400×400).
const ESTRELAS = [
  'M200.0 21.0 L202.2 26.9 L208.6 27.2 L203.6 31.2 L205.3 37.3 L200.0 33.8 L194.7 37.3 L196.4 31.2 L191.4 27.2 L197.8 26.9 Z',
  'M285.0 43.8 L287.2 49.7 L293.6 50.0 L288.6 53.9 L290.3 60.1 L285.0 56.6 L279.7 60.1 L281.4 53.9 L276.4 50.0 L282.8 49.7 Z',
  'M347.2 106.0 L349.5 111.9 L355.8 112.2 L350.8 116.2 L352.5 122.3 L347.2 118.8 L341.9 122.3 L343.6 116.2 L338.7 112.2 L345.0 111.9 Z',
  'M370.0 191.0 L372.2 196.9 L378.6 197.2 L373.6 201.2 L375.3 207.3 L370.0 203.8 L364.7 207.3 L366.4 201.2 L361.4 197.2 L367.8 196.9 Z',
  'M347.2 276.0 L349.5 281.9 L355.8 282.2 L350.8 286.2 L352.5 292.3 L347.2 288.8 L341.9 292.3 L343.6 286.2 L338.7 282.2 L345.0 281.9 Z',
  'M285.0 338.2 L287.2 344.2 L293.6 344.4 L288.6 348.4 L290.3 354.5 L285.0 351.0 L279.7 354.5 L281.4 348.4 L276.4 344.4 L282.8 344.2 Z',
  'M200.0 361.0 L202.2 366.9 L208.6 367.2 L203.6 371.2 L205.3 377.3 L200.0 373.8 L194.7 377.3 L196.4 371.2 L191.4 367.2 L197.8 366.9 Z',
  'M115.0 338.2 L117.2 344.2 L123.6 344.4 L118.6 348.4 L120.3 354.5 L115.0 351.0 L109.7 354.5 L111.4 348.4 L106.4 344.4 L112.8 344.2 Z',
  'M52.8 276.0 L55.0 281.9 L61.3 282.2 L56.4 286.2 L58.1 292.3 L52.8 288.8 L47.5 292.3 L49.2 286.2 L44.2 282.2 L50.5 281.9 Z',
  'M30.0 191.0 L32.2 196.9 L38.6 197.2 L33.6 201.2 L35.3 207.3 L30.0 203.8 L24.7 207.3 L26.4 201.2 L21.4 197.2 L27.8 196.9 Z',
  'M52.8 106.0 L55.0 111.9 L61.3 112.2 L56.4 116.2 L58.1 122.3 L52.8 118.8 L47.5 122.3 L49.2 116.2 L44.2 112.2 L50.5 111.9 Z',
  'M115.0 43.8 L117.2 49.7 L123.6 50.0 L118.6 53.9 L120.3 60.1 L115.0 56.6 L109.7 60.1 L111.4 53.9 L106.4 50.0 L112.8 49.7 Z',
]

export function SimboloCoroa(props) {
  const base = useId()
  const corteCoroa = `${base}corte-coroa`
  const corteBarra = `${base}corte-barra`
  return (
    <svg viewBox="0 0 400 400" fill="currentColor" aria-hidden="true" focusable="false" pointerEvents="none" {...props}>
      <defs>
        <mask id={corteCoroa} maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400">
          <rect width="400" height="400" fill="#fff" />
          <rect x="96" y="203" width="208" height="19" fill="#000" />
          <rect x="189" y="54" width="22" height="202" fill="#000" />
          <rect x="128" y="254" width="144" height="1.5" fill="#000" />
          <rect x="128" y="272.5" width="144" height="1.5" fill="#000" />
          <circle cx="150" cy="264" r="4.5" fill="#000" />
          <ellipse cx="200" cy="264" rx="9" ry="6" fill="#000" />
          <circle cx="250" cy="264" r="4.5" fill="#000" />
        </mask>
        <mask id={corteBarra} maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400">
          <rect width="400" height="400" fill="#fff" />
          <rect x="189" y="54" width="22" height="202" fill="#000" />
        </mask>
      </defs>
      <circle cx="200" cy="200" r="195" fill="none" stroke="currentColor" strokeWidth="4" />
      <circle cx="200" cy="200" r="186" fill="none" stroke="currentColor" strokeWidth="1.6" />
      {ESTRELAS.map(d => <path key={d} d={d} />)}
      <g mask={`url(#${corteCoroa})`}>
        <path d="M128 250 L116 170 Q132 198 140 204 Q150 176 158 152 Q170 188 179 196 Q190 168 200 142 Q210 168 221 196 Q230 188 242 152 Q250 176 260 204 Q268 198 284 170 L272 250 Z" />
        <circle cx="116" cy="165" r="5.5" />
        <circle cx="284" cy="165" r="5.5" />
        <rect x="156.5" y="130" width="3" height="18" />
        <rect x="152" y="135" width="12" height="3" />
        <rect x="240.5" y="130" width="3" height="18" />
        <rect x="236" y="135" width="12" height="3" />
        <rect x="122" y="252" width="156" height="26" rx="4" />
      </g>
      <rect x="100" y="207" width="200" height="11" rx="1.5" mask={`url(#${corteBarra})`} />
      <rect x="193" y="58" width="14" height="194" />
      <rect x="174" y="84" width="52" height="12" />
    </svg>
  )
}

export default function MarcaDagua({ variant = 'header', className = '' }) {
  return (
    <svg
      viewBox="-22 0 144 122"
      aria-hidden="true"
      focusable="false"
      data-marca-dagua={variant}
      className={`marca-dagua ${ALTURA[variant] || ALTURA.header} w-auto pointer-events-none select-none print:hidden ${className}`}
    >
      <SimboloCoroa x="6" y="2" width="88" height="88" className="marca-dagua-simbolo" />
      <text
        x="50" y="114" textAnchor="middle" fontSize="10.5" letterSpacing="1.8" fill="currentColor" fontWeight="500"
        fontFamily="Georgia, 'Times New Roman', serif"
        className="marca-dagua-frase"
      >
        TOTUS TUUS, MARIA
      </text>
    </svg>
  )
}
