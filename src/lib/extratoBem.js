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
// Fora dos lançamentos: bem dado na troca (sem caixa), desconto de antecipação (informativo) e as baixas
// sem movimento em conta (dados.baixas): histórico de abertura, terceiro, conta não controlada e crédito.
// Ficam de fora os espelhos (reserva_auto) e o ganho/perda da troca (patrimonio_auto): não são pagamento.

export const CLASSE = {
  PRINCIPAL: 'principal',
  JUROS: 'juros',
  DESCONTO: 'desconto',
  TERCEIRO: 'terceiro',
  DEVOLUCAO: 'devolucao',
  TROCA: 'troca',
  AJUSTE: 'ajuste',
  VENDA: 'venda',
  FORA: 'fora',
  CREDITO: 'credito',
  ABERTURA: 'abertura',
  // Benfeitoria feita pelo inquilino e abatida do repasse (contrato a receber): custo do bem, sem caixa.
  BENFEITORIA: 'benfeitoria',
}

// Baixa sem movimento em conta (bem_baixas.tipo) → classe do extrato.
const CLASSE_DA_BAIXA = { terceiro: CLASSE.TERCEIRO, conta_externa: CLASSE.FORA, credito: CLASSE.CREDITO, abertura: CLASSE.ABERTURA, benfeitoria: CLASSE.BENFEITORIA }

export const MOTIVOS_BAIXA = [
  { id: 'terceiro', rotulo: 'Paga por terceiro' },
  { id: 'conta_externa', rotulo: 'Paga por conta não controlada no Finup' },
  { id: 'credito', rotulo: 'Abatida por crédito ou rendimento' },
]
export const SELO_BAIXA = {
  terceiro: 'Paga por terceiro',
  conta_externa: 'Paga fora do Finup',
  credito: 'Crédito ou rendimento',
  abertura: 'Histórico de abertura',
  benfeitoria: 'Benfeitoria do contrato',
}

export const ROTULO_CLASSE = {
  venda: 'Venda do bem',
  principal: 'Principal',
  juros: 'Juros',
  desconto: 'Desconto de antecipação',
  terceiro: 'Pago por terceiro',
  devolucao: 'Devolução',
  troca: 'Bem dado na troca',
  ajuste: 'Ajuste de avaliação',
  fora: 'Pago fora do Finup',
  credito: 'Crédito ou rendimento',
  abertura: 'Histórico de abertura',
  benfeitoria: 'Benfeitoria',
}

export const ORIGEM = { PROPRIOS: 'proprios', TERCEIRO: 'terceiro' }

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const dia = (d) => String(d || '').slice(0, 10)
const TIPOS_SEM_CAIXA = new Set(['asset', 'liability'])

function classificar(l, bem) {
  const naConta = l.account_id === bem.id
  const paraOBem = l.to_account_id === bem.id
  if (l.origin === 'venda_bem') return { classe: CLASSE.VENDA, origem: null, caixa: true }
  if (l.type === 'transfer') {
    if (paraOBem) {
      return { classe: CLASSE.PRINCIPAL, origem: ORIGEM.PROPRIOS, caixa: !TIPOS_SEM_CAIXA.has(l.origem_tipo) }
    }
    if (naConta) return { classe: CLASSE.DEVOLUCAO, origem: null, caixa: !TIPOS_SEM_CAIXA.has(l.destino_tipo) }
    return null
  }
  if (l.type === 'income') {
    if (l.origin === 'rendimento_manual') return { classe: CLASSE.AJUSTE, origem: null, caixa: false }
    // A marcação do usuário manda. Sem ela, a regra automática vale só como sugestão a confirmar.
    if (l.bem_papel === 'terceiro') return { classe: CLASSE.TERCEIRO, origem: ORIGEM.TERCEIRO, caixa: false }
    if (l.bem_papel === 'devolucao') return { classe: CLASSE.DEVOLUCAO, origem: null, caixa: true }
    if (naConta) return { classe: CLASSE.TERCEIRO, origem: ORIGEM.TERCEIRO, caixa: false, sugerida: true }
    return { classe: CLASSE.DEVOLUCAO, origem: null, caixa: true, sugerida: true }
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
      receita: l.type === 'income' && c.classe !== CLASSE.AJUSTE,
      sugerida: !!c.sugerida,
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
  for (const b of dados.baixas || []) {
    if (b.bem_id !== bem.id) continue
    // Com receita de benefício, a linha já veio do lançamento: só recebe o selo. Conta uma vez só.
    const doLancamento = b.lancamento_id ? linhas.find(l => l.id === b.lancamento_id) : null
    if (doLancamento) {
      doLancamento.baixaId = b.id
      doLancamento.selo = SELO_BAIXA[b.tipo]
      continue
    }
    linhas.push({
      id: `baixa:${b.id}`, baixaId: b.id, data: dia(b.data), classe: CLASSE_DA_BAIXA[b.tipo],
      origem: b.tipo === 'terceiro' ? ORIGEM.TERCEIRO : null, caixa: false, valor: r2(b.valor),
      descricao: b.descricao || b.favorecido || '', selo: SELO_BAIXA[b.tipo],
    })
  }
  return linhas.sort((a, b) => a.data.localeCompare(b.data))
}

// O que soma no pago acumulado do bem.
const PAGAMENTOS = [CLASSE.PRINCIPAL, CLASSE.JUROS, CLASSE.TERCEIRO, CLASSE.TROCA, CLASSE.FORA, CLASSE.CREDITO, CLASSE.ABERTURA]

const somar = (linhas, ...classes) => r2(linhas.filter(l => classes.includes(l.classe)).reduce((s, l) => s + l.valor, 0))

// Falta pagar: a definição ÚNICA do app. Soma o que resta nas parcelas em aberto, com juros previstos e
// já considerando os descontos (parcela quitada com desconto não deve mais nada).
export function faltaPagar(parcelas = []) {
  return r2(parcelas
    .filter(p => p.status !== 'paid')
    .reduce((s, p) => s + Math.max(0, (Number(p.total_provisioned) || 0) - (Number(p.total_pago) || 0)), 0))
}

// Consórcio com cotas: o valor é o da carta, a falta é o saldo devedor informado pela administradora.
const cotasDoConsorcio = (bem, cotas) => (bem.tipo_bem === 'consorcio' ? (cotas || []).filter(c => c.bem_id === bem.id) : [])

export function resumoDoBem(bem, linhas, parcelas = [], cotas = []) {
  const doConsorcio = cotasDoConsorcio(bem, cotas)
  const ehConsorcio = doConsorcio.length > 0
  const carta = r2(doConsorcio.reduce((s, c) => s + (Number(c.valor_carta) || 0), 0))
  const saldoInformado = r2(doConsorcio.reduce((s, c) => s + (Number(c.saldo_devedor_informado) || 0), 0))
  const valorBem = ehConsorcio ? carta : r2(bem.valor_nota_fiscal)

  // Bem sem nenhum pagamento lançado: vale o valor pago informado à mão, com aviso na tela.
  const semPagamentos = !linhas.some(l => PAGAMENTOS.includes(l.classe))
  if (semPagamentos && bem.valor_pago_manual != null) {
    const informado = r2(bem.valor_pago_manual)
    const benf = somar(linhas, CLASSE.BENFEITORIA)
    return {
      valorBem, pagoSemJuros: informado, pagoComJuros: informado, terceiros: 0, proprios: informado, foraDoFinup: 0, creditos: 0, abertura: 0,
      benfeitorias: benf, devolucoes: 0, custoProprioLiquido: r2(informado + benf), jurosPagos: 0, descontos: 0, faltaPagar: 0,
      custoFinalRealizado: r2(valorBem + benf), custoFinalProjetado: r2(valorBem + benf), valorInformado: true, ehConsorcio,
    }
  }

  const principal = somar(linhas, CLASSE.PRINCIPAL)
  const juros = somar(linhas, CLASSE.JUROS)
  const terceiros = somar(linhas, CLASSE.TERCEIRO)
  const troca = somar(linhas, CLASSE.TROCA)
  const devolucoes = somar(linhas, CLASSE.DEVOLUCAO)
  const descontos = somar(linhas, CLASSE.DESCONTO)
  const foraDoFinup = somar(linhas, CLASSE.FORA)
  const creditos = somar(linhas, CLASSE.CREDITO)
  const abertura = somar(linhas, CLASSE.ABERTURA)
  // Benfeitoria abatida do aluguel: não é pagamento do bem (fica fora do pago e do batimento do
  // consórcio), mas é custo dele — entra no custo próprio e no custo final.
  const benfeitorias = somar(linhas, CLASSE.BENFEITORIA)
  const pagoSemJuros = r2(principal + terceiros + troca + foraDoFinup + creditos + abertura)
  const pagoComJuros = r2(pagoSemJuros + juros)
  const proprios = r2(principal + troca + juros)
  const jurosPrevistos = r2(parcelas.reduce((s, p) => s + (Number(p.juros_provisioned) || 0), 0))
  return {
    valorBem,
    pagoSemJuros,
    pagoComJuros,
    terceiros,
    proprios,
    foraDoFinup,
    creditos,
    abertura,
    benfeitorias,
    devolucoes,
    // O que saiu do bolso: o histórico de abertura e o pago fora do Finup também. Terceiro e crédito não.
    // Benfeitoria abatida do aluguel também (é aluguel que o proprietário deixou de receber).
    custoProprioLiquido: r2(proprios + foraDoFinup + abertura + benfeitorias - devolucoes),
    jurosPagos: juros,
    descontos,
    faltaPagar: ehConsorcio ? saldoInformado : faltaPagar(parcelas),
    // juros_pago já vem líquido do desconto: subtrair de novo contaria o desconto duas vezes.
    // Consórcio: o que já pagou, e o que já pagou mais o saldo informado.
    custoFinalRealizado: r2((ehConsorcio ? pagoComJuros : valorBem + juros) + benfeitorias),
    custoFinalProjetado: r2((ehConsorcio ? pagoComJuros + saldoInformado : valorBem + jurosPrevistos - descontos) + benfeitorias),
    valorInformado: false,
    ehConsorcio,
  }
}

// Por mês, desde o primeiro pagamento e sem buracos: quanto foi pago e quanto saiu do próprio bolso
// (sem terceiros, descontando devoluções). Base do simulador de saída do consórcio.
export function historicoDePagamentos(linhas) {
  const pagos = linhas.filter(l => PAGAMENTOS.includes(l.classe))
  if (pagos.length === 0) return []
  const relevantes = linhas.filter(l => pagos.includes(l) || l.classe === CLASSE.DEVOLUCAO)
  const primeiro = pagos[0].data.slice(0, 7)
  const ultimo = relevantes.reduce((m, l) => (l.data.slice(0, 7) > m ? l.data.slice(0, 7) : m), primeiro)
  const saida = []
  for (let mes = primeiro; mes <= ultimo; mes = proximoMes(mes)) {
    const doMes = relevantes.filter(l => l.data.slice(0, 7) === mes)
    const total = r2(doMes.filter(l => l.classe !== CLASSE.DEVOLUCAO).reduce((s, l) => s + l.valor, 0))
    saida.push({ mes, total, proprio: r2(total - somar(doMes, CLASSE.TERCEIRO, CLASSE.CREDITO) - somar(doMes, CLASSE.DEVOLUCAO)) })
  }
  return saida
}

const proximoMes = (mes) => {
  const [a, m] = mes.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}

// Tabela mês a mês, sem buracos: do primeiro lançamento até o último (ou `ate`, se for depois).
export function linhaDoTempo(linhas, parcelas = [], { ate = null, faltaFixa = null } = {}) {
  const relevantes = linhas.filter(l => PAGAMENTOS.includes(l.classe))
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
      faltaPagar: faltaFixa != null ? faltaFixa : r2(Math.max(0, totalContratado - abatido)),
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
  if (tx.type === 'transfer') return tx.bemId && tx.bemId === tx.toAccountId ? { sufixo: 'entrada' } : null
  if (tx.type !== 'expense') return null
  if (isInvestimentoSombra(tx)) return { sufixo: '' }
  if (tx.origin !== 'pagamento_divida') return null
  return /- Juros$/.test(tx.description || '') ? { sufixo: 'juros' } : { sufixo: 'principal' }
}
