// Plano de venda do consórcio: projeção mês a mês até a última venda prevista. Só cálculo, nada é gravado.
import { parcelaDaCota } from './consorcio.js'

// Limite mensal de isenção de ganho de capital para bens de pequeno valor (Lei 9.250/1995, art. 22). É só
// para o aviso informativo; não é cálculo de imposto. Se a lei mudar, é aqui.
export const LIMITE_ISENCAO_PEQUENO_VALOR = 35000
export const AVISO_ISENCAO = 'Vendas no mesmo mês acima de R$ 35.000: o ganho pode ser tributado. Vender em meses diferentes pode manter a isenção. Confirme com seu contador.'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const mesDe = (d) => String(d || '').slice(0, 7)
const proximoMes = (m) => {
  const [a, b] = m.split('-').map(Number)
  return b === 12 ? `${a + 1}-01` : `${a}-${String(b + 1).padStart(2, '0')}`
}

export const cotaVendida = (c, consorcioVendido = false) => consorcioVendido || !!c.vendida_em

// Divide o custo próprio já pago entre as cotas, na proporção das parcelas pagas (por igual sem esse dado).
// A soma fecha com o total.
export function custoAtualPorCota(cotas, custoTotal, pagasPorCota = null) {
  const pesos = cotas.map((_, i) => Math.max(0, Number(pagasPorCota?.[i]) || 0))
  const soma = pesos.reduce((s, p) => s + p, 0)
  const partes = cotas.map((_, i) => r2((Number(custoTotal) || 0) * (soma > 0 ? pesos[i] / soma : 1 / (cotas.length || 1))))
  if (partes.length) partes[partes.length - 1] = r2(partes[partes.length - 1] + (Number(custoTotal) || 0) - partes.reduce((s, p) => s + p, 0))
  return partes
}

// cotas: { numero, valor_parcela_cheia, percentual_parcela, plano_mes, plano_valor, vendida_em, prazo_meses }.
// funcao: { saldo } ou null (sem função vinculada: a projeção mostra só o bem). previsoes: itens de
// previsoesDasFuncoes da função, SEM os agendamentos do próprio consórcio, que já são as parcelas.
// primeiroMesComParcela: mês em que a próxima parcela vence (a do mês atual pode já estar paga).
// A parcela do mês da venda é paga: a venda só tira a cota dos meses seguintes.
export function projetarPlano({
  hoje, cotas = [], custoPorCota = [], restantesPorCota = [], funcao = null, previsoes = [], consorcioVendido = false, primeiroMesComParcela = null,
}) {
  const ativas = cotas
    .map((c, i) => ({ c, i, numero: c.numero, parcela: parcelaDaCota(c), mesVenda: c.plano_mes || null, valorVenda: Number(c.plano_valor) || 0, custo: Number(custoPorCota[i]) || 0, restantes: restantesPorCota[i] ?? null }))
    .filter(x => !cotaVendida(x.c, consorcioVendido))
  const mesHoje = mesDe(hoje)
  const previstas = ativas.filter(x => x.mesVenda && x.mesVenda >= mesHoje)
  const vazio = { meses: [], resultado: { saldoFinal: funcao ? r2(funcao.saldo) : null, ganhoPorCota: [], ganhoTotal: 0 }, avisos: [], temFuncao: !!funcao, cotasAtivas: ativas.map(x => x.numero) }
  if (!previstas.length) return vazio

  const ultimo = previstas.map(x => x.mesVenda).sort().pop()
  const inicioParcelas = primeiroMesComParcela && primeiroMesComParcela > mesHoje ? primeiroMesComParcela : mesHoje
  const custos = new Map(ativas.map(x => [x.i, x.custo]))
  const restantes = new Map(ativas.map(x => [x.i, x.restantes]))
  let saldo = funcao ? Number(funcao.saldo) || 0 : null
  const meses = []
  for (let m = mesHoje; m <= ultimo; m = proximoMes(m)) {
    let parcelas = 0
    let vendas = 0
    const vendidasNoMes = []
    for (const x of ativas) {
      if (x.mesVenda && x.mesVenda < mesHoje) continue
      if (x.mesVenda && m > x.mesVenda) continue
      const falta = restantes.get(x.i)
      if (m >= inicioParcelas && (falta == null || falta > 0)) {
        parcelas += x.parcela
        custos.set(x.i, custos.get(x.i) + x.parcela)
        if (falta != null) restantes.set(x.i, falta - 1)
      }
      if (x.mesVenda === m) {
        vendas += x.valorVenda
        vendidasNoMes.push({ numero: x.numero, valor: x.valorVenda })
      }
    }
    const doMes = previsoes.filter(p => mesDe(p.date) === m)
    const entradasPrevistas = doMes.filter(p => p.tipo === 'deposito').reduce((s, p) => s + p.amount, 0)
    const saidasPrevistas = doMes.filter(p => p.tipo !== 'deposito').reduce((s, p) => s + p.amount, 0)
    if (saldo != null) saldo = r2(saldo + entradasPrevistas - saidasPrevistas - parcelas + vendas)
    meses.push({
      mes: m,
      parcelas: r2(parcelas),
      entradasPrevistas: r2(entradasPrevistas),
      saidasPrevistas: r2(saidasPrevistas),
      vendas: r2(vendas),
      vendidasNoMes,
      saldoFuncao: saldo,
      custoPorCota: ativas.map(x => ({ numero: x.numero, custo: r2(custos.get(x.i)) })),
    })
  }
  const ganhoPorCota = previstas.map(x => ({
    numero: x.numero, mes: x.mesVenda, venda: r2(x.valorVenda), custo: r2(custos.get(x.i)), ganho: r2(x.valorVenda - custos.get(x.i)),
  }))
  const avisos = meses.filter(m => m.vendas > LIMITE_ISENCAO_PEQUENO_VALOR).map(m => ({ mes: m.mes, total: m.vendas, texto: AVISO_ISENCAO }))
  return {
    meses,
    resultado: { saldoFinal: saldo, ganhoPorCota, ganhoTotal: r2(ganhoPorCota.reduce((s, g) => s + g.ganho, 0)) },
    avisos,
    temFuncao: !!funcao,
    cotasAtivas: ativas.map(x => x.numero),
  }
}
