// PTAX VENDA do dólar no Banco Central (API Olinda, CotacaoDolarDia, campo cotacaoVenda) — usada pela
// compra em moeda estrangeira (src/lib/cambio.js). Sem cotação no dia (fim de semana, feriado, ou o
// dia ainda sem boletim) → recua um dia, até 7. Cache por data (a PTAX de um dia passado não muda;
// "sem cotação" não fica em cache). PURO (o fetch é injetado): roda no backend (api/cotacao.js).

export const MAX_DIAS_RECUO = 7
const OLINDA = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)'

// 'YYYY-MM-DD' → URL da consulta (a API pede 'MM-DD-YYYY').
export function urlPtax(dataIso) {
  const [y, m, d] = dataIso.split('-')
  return `${OLINDA}?@dataCotacao='${m}-${d}-${y}'&$top=1&$format=json&$select=cotacaoVenda,dataHoraCotacao`
}

export function diaAnterior(dataIso) {
  const t = new Date(`${dataIso}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() - 1)
  return t.toISOString().slice(0, 10)
}

// → { data (dia da cotação usada), venda } ou null (nenhuma cotação nos 7 dias / API fora).
export async function buscarPtax(dataIso, { fetchFn = fetch, cache = new Map() } = {}) {
  let dia = dataIso
  for (let i = 0; i <= MAX_DIAS_RECUO; i++, dia = diaAnterior(dia)) {
    if (cache.has(dia)) return cache.get(dia)
    const resp = await fetchFn(urlPtax(dia))
    if (!resp.ok) throw new Error(`Banco Central respondeu ${resp.status}`)
    const json = await resp.json()
    const venda = Number(json?.value?.[0]?.cotacaoVenda)
    if (venda > 0) {
      const achado = { data: dia, venda }
      cache.set(dia, achado)
      if (dia !== dataIso) cache.set(dataIso, achado)
      return achado
    }
  }
  return null
}
