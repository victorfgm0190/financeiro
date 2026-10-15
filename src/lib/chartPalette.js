// Paletas de cor dos GRÁFICOS e das ESCOLHAS de cor (fonte única).
//
// 1) Paleta categórica de gráfico (séries/fatias sem significado próprio): uma variante por tema,
//    escolhida para deuteranopia — entre cores VIZINHAS (ordem de uso) a diferença simulada é
//    ΔE ≥ 40 (escuro) / ≥ 32 (claro) e a de luminosidade ΔL* ≥ 14 / ≥ 17, e todas têm contraste
//    ≥ 3:1 com o fundo do card (#1A2438 / #FFFFFF). Medições na Fase 3 do tema (docs/tema-mapeamento.md).
//    Receita/despesa/reserva/transferência NÃO saem daqui: usam os tokens (useThemeColors).
//
// 2) Paletas de ESCOLHA (cor que o usuário grava como dado: perfil, tipo de documento): sem variante
//    por tema — a cor escolhida é salva no banco e renderizada como está. Cada seletor mantém as
//    cores e a quantidade que sempre ofereceu.

export const PALETA_GRAFICO = {
  dark: ['#E69F00', '#3B82F6', '#FDBA74', '#CC79A7', '#F0E442', '#A99BF5', '#C8CED8', '#F07B5A'],
  light: ['#1E3A8A', '#D97706', '#831843', '#0891B2', '#6D28D9', '#059669', '#7C2D12', '#3B82F6'],
}

// Cor da i-ésima série/fatia no tema efetivo ('light' | 'dark').
export function corSerie(tema, i) {
  const pal = PALETA_GRAFICO[tema === 'light' ? 'light' : 'dark']
  return pal[((i % pal.length) + pal.length) % pal.length]
}

// Espelho (somente leitura) das cores da pizza de despesas por categoria. A fonte continua sendo
// src/lib/despesasPorCategoria.js (decisão D4: aquele arquivo não muda nesta etapa).
export { CORES_TOP, COR_OUTRAS, COR_SEM_CATEGORIA } from './despesasPorCategoria'

// Seletor de cor do perfil (Configurações → Perfis).
export const CORES_PERFIL = ['#6366f1', '#0F6E56', '#3b82f6', '#8b5cf6', '#f97316', '#ec4899', '#06b6d4', '#f59e0b']

// Seletor de cor do tipo de documento (Configurações → Tipos de documento).
export const CORES_TIPO_DOCUMENTO = ['#6366f1', '#8b5cf6', '#f59e0b', '#0ea5e9', '#14b8a6', '#a855f7', '#ef4444', '#64748b', '#10b981', '#f97316', '#9ca3af', '#ec4899']

// Props do <Tooltip> padrão do Recharts no tema efetivo (cor = retorno de useThemeColors()).
// Os itens continuam na cor da própria série (padrão do Recharts).
export function estiloTooltip(cor, fontSize = 12) {
  return {
    contentStyle: { background: cor.surface, border: `1px solid ${cor.bordaForte}`, borderRadius: 8, fontSize, color: cor.texto1 },
    labelStyle: { color: cor.texto2 },
  }
}
