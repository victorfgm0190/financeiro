// CONTRATO A RECEBER POR ADMINISTRADORA (modo repasse) — funções puras.
// O inquilino paga o aluguel à administradora; ela repassa o líquido ao proprietário num dia fixo,
// N meses depois da competência (repasse_meses_depois, padrão 1 = mês seguinte). Cada competência do
// aluguel vira UM agendamento de recebimento: id ctr_<contrato>_aluguel_<AAAAMM da competência>,
// data = dia do repasse. Por isso, no modo repasse, a competência da parcela vem do id, nunca da data.
// `favorecido` do contrato = a administradora; o inquilino é só informação (contraparte_*).
// Contrato sem modo_repasse (todos os que já existem) não passa por aqui.
import { ymDe, addMeses, diaNoMes, diaDe } from './datas.js'

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100

export const ehModoRepasse = (c) => c?.tipo === 'receber' && !!c?.modo_repasse

export const mesesDepoisDoRepasse = (c) => {
  const n = Number(c?.repasse_meses_depois)
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : 1
}

// Data do repasse da competência 'AAAA-MM' (dia que não existe no mês → último dia).
export function dataRepasse(contrato, competencia) {
  const dia = Number(contrato?.dia_repasse) || Number(contrato?.dia_vencimento) || 1
  return diaNoMes(addMeses(competencia, mesesDepoisDoRepasse(contrato)), dia)
}

// Vencimento do inquilino na competência (só informação na tela).
export function vencimentoInquilino(contrato, competencia) {
  return diaNoMes(competencia, Number(contrato?.dia_vencimento) || 1)
}

const ultimoDia = (ym) => Number(diaNoMes(ym, 31).slice(8, 10))

// Dias cobrados no 1º mês, mês comercial de 30 dias: do dia do início ao fim do mês (no máximo 30).
// Início no dia 1 → null (mês cheio, sem proporcional).
export function diasProporcionais(dataInicio) {
  const dia = diaDe(dataInicio)
  if (!dia || dia === 1) return null
  return Math.min(30, ultimoDia(ymDe(dataInicio)) - dia + 1)
}

// Aluguel proporcional: valor / 30 × dias.
export const valorProporcional = (valor, dias) => r2((Number(valor) || 0) / 30 * dias)

// Valor do 1º mês: o informado no contrato (valor_primeiro_mes) ou o proporcional calculado.
// → null quando o 1º mês é cheio e nada foi informado; senão { valor, calculado, dias, informado }.
export function primeiroMes(contrato, valorBase = contrato?.valor_base) {
  const dias = diasProporcionais(contrato?.data_inicio)
  const calculado = dias ? valorProporcional(valorBase, dias) : null
  const inf = contrato?.valor_primeiro_mes
  const informado = inf != null && inf !== '' && Number.isFinite(Number(inf))
  if (!informado && calculado == null) return null
  return { valor: informado ? r2(inf) : calculado, calculado, dias, informado }
}

// Competências do contrato no modo repasse: { numero, competencia, vencimento (data do repasse),
// vencimentoInquilino }. Mensal sempre, a partir do mês do início; com data_fim, até o mês do fim;
// sem ela, até HORIZONTE meses depois do mês de `hoje`. Mês sem cobrança é pulado sem consumir
// número (com `comPulados`, volta como { numero: null, semCobranca: true }).
export function competenciasRepasse(contrato, { hoje, horizonte = 12, comPulados = false, pular = new Set() } = {}) {
  const inicio = ymDe(contrato.data_inicio)
  if (!inicio) return []
  const fim = contrato.data_fim ? ymDe(contrato.data_fim) : addMeses(ymDe(hoje), horizonte)
  const out = []
  let numero = 0
  for (let ym = inicio, n = 0; ym <= fim && n < 1200; ym = addMeses(ym, 1), n++) {
    const base = { competencia: ym, vencimento: dataRepasse(contrato, ym), vencimentoInquilino: vencimentoInquilino(contrato, ym) }
    if (pular.has(ym)) {
      if (comPulados) out.push({ numero: null, ...base, semCobranca: true })
      continue
    }
    numero += 1
    out.push({ numero, ...base })
  }
  return out
}
