// Período do Fluxo Futuro (Reservas): "De" e "Até" em meses 'YYYY-MM'. Puro, sem React.
//   • `atual` = mês do período ABERTO do Controle de Reservas (início do getFinancialPeriod(), o do
//     topo — ex.: 15/10–14/11 → Out). "De" nunca antes dele; "Até" ≥ "De"; no máximo
//     MAX_MESES_FLUXO meses entre os dois. Padrão e atalhos contam a partir dele.
//   • A projeção começa SEMPRE no saldo de hoje: a janela calculada vai do mês de calendário
//     ANTERIOR ao de hoje (referência, saldo atual) até o "Até"; os meses antes do "De" só ficam
//     escondidos.
//   • A escolha é guardada por usuário em forma relativa (boas_vindas_usuario.progresso.fluxoPeriodo):
//     { de: <meses a partir do atual>, meses: <n> }  → "n meses"
//     { de: <meses a partir do atual>, ate: 'YYYY-MM' } → "até <mês>" (vencido → volta ao padrão)
export const MAX_MESES_FLUXO = 60
export const MESES_PADRAO_FLUXO = 12
const ROTULOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const RE_MES = /^(\d{4})-(0[1-9]|1[0-2])$/

const indice = (ym) => { const [y, m] = ym.split('-').map(Number); return y * 12 + m - 1 }
const doIndice = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
export const ehMes = (ym) => typeof ym === 'string' && RE_MES.test(ym)
export const mesDaData = (d) => doIndice(d.getFullYear() * 12 + d.getMonth())
export const somarMeses = (ym, n) => doIndice(indice(ym) + n)
export const mesesEntre = (de, ate) => indice(ate) - indice(de) + 1
export const rotuloMes = (ym) => `${ROTULOS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`
export const rotuloPeriodo = ({ de, ate }) => `${rotuloMes(de)} – ${rotuloMes(ate)}`

export const periodoPadrao = (atual) => ({ de: atual, ate: somarMeses(atual, MESES_PADRAO_FLUXO - 1) })
export const ehPadrao = (p, atual) => { const d = periodoPadrao(atual); return p.de === d.de && p.ate === d.ate }

// Mensagem de erro do período, ou null se pode aplicar.
export function erroPeriodo({ de, ate }, atual) {
  if (!ehMes(de) || !ehMes(ate)) return 'Escolha o mês e o ano de "De" e "Até".'
  if (de < atual) return `"De" não pode ser anterior a ${rotuloMes(atual)}.`
  if (ate < de) return '"Até" tem que ser igual ou posterior a "De".'
  if (mesesEntre(de, ate) > MAX_MESES_FLUXO) return `O período pode ter no máximo ${MAX_MESES_FLUXO} meses (escolhido: ${mesesEntre(de, ate)}).`
  return null
}

// Atalhos do seletor. Os anos saem do mês atual, nunca fixos.
export function atalhosPeriodo(atual) {
  const ano = Number(atual.slice(0, 4))
  return [
    ...[12, 24, 36].map(meses => ({ id: `${meses}m`, rotulo: `${meses} meses`, meses })),
    ...[2, 3, 4].map(k => ({ id: `dez+${k}`, rotulo: `Até Dez/${ano + k}`, ate: `${ano + k}-12` })),
  ]
}
export const aplicarAtalho = (atalho, de) => (atalho.meses ? somarMeses(de, atalho.meses - 1) : atalho.ate)

// Preferência guardada (relativa) → null se for o padrão. `meses` (opcional) = o usuário escolheu
// "n meses"; sem ele, guarda o "Até" do jeito que foi escolhido ("até Dez/2029").
export function preferenciaDoPeriodo({ de, ate, meses }, atual) {
  if (ehPadrao({ de, ate }, atual)) return null
  const deOffset = mesesEntre(atual, de) - 1
  return meses ? { de: deOffset, meses } : { de: deOffset, ate }
}

// Formato aceito para gravar (servidor e cliente). Inválido → undefined; padrão → null.
export function normalizarPreferenciaPeriodo(p) {
  if (p === null) return null
  if (!p || typeof p !== 'object') return undefined
  const de = p.de
  if (!Number.isInteger(de) || de < 0 || de >= MAX_MESES_FLUXO * 2) return undefined
  if (p.meses !== undefined) return Number.isInteger(p.meses) && p.meses >= 1 && p.meses <= MAX_MESES_FLUXO ? { de, meses: p.meses } : undefined
  return ehMes(p.ate) ? { de, ate: p.ate } : undefined
}

// Preferência guardada → período { de, ate } de hoje. Ausente, inválida ou vencida → padrão.
export function periodoDaPreferencia(pref, atual) {
  const p = normalizarPreferenciaPeriodo(pref)
  if (!p) return periodoPadrao(atual)
  const de = somarMeses(atual, p.de)
  const ate = p.meses ? somarMeses(de, p.meses - 1) : p.ate
  if (ate < atual || erroPeriodo({ de, ate }, atual)) return periodoPadrao(atual)
  return { de, ate }
}

// Janela calculada: de `inicio` (o mês de calendário anterior ao de hoje — índice 0, saldo de hoje,
// a mesma âncora da projeção de sempre) até o "Até". `primeiro` = índice do "De" na janela (as
// colunas visíveis são de `primeiro` em diante).
export function janelaDoPeriodo({ de, ate }, inicio) {
  return { inicio, meses: mesesEntre(inicio, ate), primeiro: Math.max(0, mesesEntre(inicio, de) - 1) }
}
