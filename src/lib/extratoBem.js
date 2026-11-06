// Extrato do bem: a leitura ÚNICA de onde saem a Visão Bem (Resumo do bem) e a Visão Caixa (relatório
// "Bens e investimentos"). Nada é gravado nem duplicado: é derivado dos lançamentos, dos trade-ins e
// das parcelas, sempre pela data REAL do pagamento.
//
// Regra de classificação de cada lançamento:
//   transferência para o bem, parcela paga (principal)    → principal, recursos próprios
//   parcela paga (juros)                                  → juros, recursos próprios
//   receita lançada na conta do bem                       → pago por terceiro (sem saída de caixa)
//   receita em outra conta ligada ao bem; saída do bem    → devolução
//   rendimento manual; despesa lançada na conta do bem    → ajuste de avaliação (não é pagamento)
// Fora dos lançamentos: bem dado na troca (sem caixa) e desconto de antecipação (informativo).
// Ficam de fora os espelhos (reserva_auto) e o ganho/perda da troca (patrimonio_auto): não são pagamento.

export const CLASSE = {
  PRINCIPAL: 'principal',
  JUROS: 'juros',
  DESCONTO: 'desconto',
  TERCEIRO: 'terceiro',
  DEVOLUCAO: 'devolucao',
  TROCA: 'troca',
  AJUSTE: 'ajuste',
}

export const ROTULO_CLASSE = {
  principal: 'Principal',
  juros: 'Juros',
  desconto: 'Desconto de antecipação',
  terceiro: 'Pago por terceiro',
  devolucao: 'Devolução',
  troca: 'Bem dado na troca',
  ajuste: 'Ajuste de avaliação',
}

export const ORIGEM = { PROPRIOS: 'proprios', TERCEIRO: 'terceiro' }

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const dia = (d) => String(d || '').slice(0, 10)
const TIPOS_SEM_CAIXA = new Set(['asset', 'liability'])

function classificar(l, bem) {
  const naConta = l.account_id === bem.id
  const paraOBem = l.to_account_id === bem.id
  if (l.type === 'transfer') {
    if (paraOBem) {
      return { classe: CLASSE.PRINCIPAL, origem: ORIGEM.PROPRIOS, caixa: !TIPOS_SEM_CAIXA.has(l.origem_tipo) }
    }
    if (naConta) return { classe: CLASSE.DEVOLUCAO, origem: null, caixa: !TIPOS_SEM_CAIXA.has(l.destino_tipo) }
    return null
  }
  if (l.type === 'income') {
    if (l.origin === 'rendimento_manual') return { classe: CLASSE.AJUSTE, origem: null, caixa: false }
    if (naConta) return { classe: CLASSE.TERCEIRO, origem: ORIGEM.TERCEIRO, caixa: false }
    return { classe: CLASSE.DEVOLUCAO, origem: null, caixa: true }
  }
  if (l.type === 'expense') {
    if (l.origin === 'pagamento_divida') {
      const juros = /- Juros$/.test(l.description || '')
        || (l.category_id && l.category_id === bem.categoria_taxa_id && l.category_id !== bem.categoria_prestacao_id)
      return { classe: juros ? CLASSE.JUROS : CLASSE.PRINCIPAL, origem: ORIGEM.PROPRIOS, caixa: !!l.account_id }
    }
    if (naConta) return { classe: CLASSE.AJUSTE, origem: null, caixa: false, sinal: -1 }
    return { classe: CLASSE.PRINCIPAL, origem: ORIGEM.PROPRIOS, caixa: !!l.account_id }
  }
  return null
}

// dados = resposta de GET /api/bem/extrato: { lancamentos, trocas, parcelas }. → linhas por data.
export function extratoDoBem(bem, dados) {
  const linhas = []
  for (const l of dados.lancamentos || []) {
    if (l.bem_id !== bem.id && l.to_account_id !== bem.id && l.account_id !== bem.id) continue
    if (l.reserva_auto || l.origin === 'patrimonio_auto') continue
    const c = classificar(l, bem)
    if (!c) continue
    linhas.push({
      id: l.id,
      data: dia(l.date),
      classe: c.classe,
      origem: c.origem,
      caixa: c.caixa,
      valor: r2(l.amount) * (c.sinal || 1),
      descricao: l.description || l.payee || '',
    })
  }
  for (const t of dados.trocas || []) {
    if (t.bem_id !== bem.id) continue
    linhas.push({
      id: t.id, data: dia(t.data), classe: CLASSE.TROCA, origem: ORIGEM.PROPRIOS, caixa: false,
      valor: r2(t.valor), descricao: t.descricao || '',
    })
  }
  for (const p of dados.parcelas || []) {
    if (p.bem_id !== bem.id || !(Number(p.desconto_antecipacao) > 0) || !p.data_pagamento) continue
    linhas.push({
      id: `${p.id}:desconto`, data: dia(p.data_pagamento), classe: CLASSE.DESCONTO, origem: null, caixa: false,
      valor: r2(p.desconto_antecipacao), descricao: `Parcela ${p.numero}`,
    })
  }
  return linhas.sort((a, b) => a.data.localeCompare(b.data))
}

const somar = (linhas, ...classes) => r2(linhas.filter(l => classes.includes(l.classe)).reduce((s, l) => s + l.valor, 0))

// Falta pagar: a definição ÚNICA do app. Soma o que resta nas parcelas em aberto, com juros previstos e
// já considerando os descontos (parcela quitada com desconto não deve mais nada).
export function faltaPagar(parcelas = []) {
  return r2(parcelas
    .filter(p => p.status !== 'paid')
    .reduce((s, p) => s + Math.max(0, (Number(p.total_provisioned) || 0) - (Number(p.total_pago) || 0)), 0))
}

export function resumoDoBem(bem, linhas, parcelas = []) {
  const valorBem = r2(bem.valor_nota_fiscal)
  const principal = somar(linhas, CLASSE.PRINCIPAL)
  const juros = somar(linhas, CLASSE.JUROS)
  const terceiros = somar(linhas, CLASSE.TERCEIRO)
  const troca = somar(linhas, CLASSE.TROCA)
  const devolucoes = somar(linhas, CLASSE.DEVOLUCAO)
  const descontos = somar(linhas, CLASSE.DESCONTO)
  const pagoSemJuros = r2(principal + terceiros + troca)
  const pagoComJuros = r2(pagoSemJuros + juros)
  const proprios = r2(pagoComJuros - terceiros)
  const jurosPrevistos = r2(parcelas.reduce((s, p) => s + (Number(p.juros_provisioned) || 0), 0))
  return {
    valorBem,
    pagoSemJuros,
    pagoComJuros,
    terceiros,
    proprios,
    devolucoes,
    custoProprioLiquido: r2(proprios - devolucoes),
    jurosPagos: juros,
    descontos,
    faltaPagar: faltaPagar(parcelas),
    // juros_pago já vem líquido do desconto: subtrair de novo contaria o desconto duas vezes.
    custoFinalRealizado: r2(valorBem + juros),
    custoFinalProjetado: r2(valorBem + jurosPrevistos - descontos),
  }
}

const proximoMes = (mes) => {
  const [a, m] = mes.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}

// Tabela mês a mês, sem buracos: do primeiro lançamento até o último (ou `ate`, se for depois).
export function linhaDoTempo(linhas, parcelas = [], { ate = null } = {}) {
  const pagamentos = [CLASSE.PRINCIPAL, CLASSE.JUROS, CLASSE.TERCEIRO, CLASSE.TROCA]
  const relevantes = linhas.filter(l => pagamentos.includes(l.classe))
  if (relevantes.length === 0) return []
  const totalContratado = parcelas.reduce((s, p) => s + (Number(p.total_provisioned) || 0), 0)
  const primeiro = relevantes[0].data.slice(0, 7)
  let ultimo = relevantes[relevantes.length - 1].data.slice(0, 7)
  if (ate && ate.slice(0, 7) > ultimo) ultimo = ate.slice(0, 7)

  const saida = []
  let acumulado = 0
  let jurosAcumulados = 0
  for (let mes = primeiro; mes <= ultimo; mes = proximoMes(mes)) {
    const doMes = relevantes.filter(l => l.data.slice(0, 7) === mes)
    const pagoNoMes = r2(doMes.reduce((s, l) => s + l.valor, 0))
    acumulado = r2(acumulado + pagoNoMes)
    jurosAcumulados = r2(jurosAcumulados + somar(doMes, CLASSE.JUROS))
    const abatido = parcelas
      .filter(p => p.data_pagamento && dia(p.data_pagamento).slice(0, 7) <= mes)
      .reduce((s, p) => s + (Number(p.total_pago) || 0) + (Number(p.desconto_antecipacao) || 0), 0)
    saida.push({
      mes, pagoNoMes, pagoAcumulado: acumulado, jurosAcumulados,
      faltaPagar: r2(Math.max(0, totalContratado - abatido)),
    })
  }
  return saida
}

// Visão Caixa: { de, ate } em 'YYYY-MM-DD'. bens = [{ bem, linhas }]. → uma linha por bem e mês, só com
// dinheiro real. Troca e ajuste não entram; o que o terceiro pagou e as devoluções vêm em colunas
// próprias, fora do total de saídas.
export function saidasPorMes(bens, { de = null, ate = null } = {}) {
  const linhas = []
  for (const { bem, linhas: extrato } of bens) {
    const porMes = new Map()
    for (const l of extrato) {
      if ((de && l.data < de) || (ate && l.data > ate)) continue
      const saida = l.caixa && (l.classe === CLASSE.PRINCIPAL || l.classe === CLASSE.JUROS)
      const devolucao = l.classe === CLASSE.DEVOLUCAO
      const terceiro = l.classe === CLASSE.TERCEIRO
      if (!saida && !devolucao && !terceiro) continue
      const mes = l.data.slice(0, 7)
      const c = porMes.get(mes) || { bemId: bem.id, bem: bem.nome, mes, principal: 0, juros: 0, total: 0, terceiros: 0, devolucoes: 0 }
      if (saida && l.classe === CLASSE.PRINCIPAL) c.principal = r2(c.principal + l.valor)
      if (saida && l.classe === CLASSE.JUROS) c.juros = r2(c.juros + l.valor)
      if (saida) c.total = r2(c.total + l.valor)
      if (terceiro) c.terceiros = r2(c.terceiros + l.valor)
      if (devolucao) c.devolucoes = r2(c.devolucoes + l.valor)
      porMes.set(mes, c)
    }
    linhas.push(...porMes.values())
  }
  return linhas.sort((a, b) => a.mes.localeCompare(b.mes) || a.bem.localeCompare(b.bem))
}

export function totaisDeSaidas(linhas) {
  return linhas.reduce((t, l) => ({
    principal: r2(t.principal + l.principal),
    juros: r2(t.juros + l.juros),
    total: r2(t.total + l.total),
    terceiros: r2(t.terceiros + l.terceiros),
    devolucoes: r2(t.devolucoes + l.devolucoes),
  }), { principal: 0, juros: 0, total: 0, terceiros: 0, devolucoes: 0 })
}

// Parcela de bem no Demonstrativo: entra no grupo "Bens e investimentos", com principal e juros em
// linhas separadas. `isInvestimentoSombra` vem de quem chama, para esta lib não depender de telas.
export function linhaDeBemNoDemonstrativo(tx, isInvestimentoSombra) {
  if (tx.type !== 'expense') return null
  if (isInvestimentoSombra(tx)) return { sufixo: '' }
  if (tx.origin !== 'pagamento_divida') return null
  return /- Juros$/.test(tx.description || '') ? { sufixo: 'juros' } : { sufixo: 'principal' }
}
