import { genId, num, round2, isIsoDate, criarAgendamentosParcelas, criarRateiosParcela } from './_bem.js'

// Baixa de parcela sem movimento em conta: histórico de abertura e parcela paga fora do Finup. Só o bem
// e a dívida (saldos do backend) mudam. Conta corrente não é tocada; a única exceção é a receita de
// benefício opcional, lançada na própria conta do bem como qualquer "pago por terceiro".

const erro = (status, mensagem) => Object.assign(new Error(mensagem), { status })
const textoOuNull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const TIPOS_PARCELA = new Set(['terceiro', 'conta_externa', 'credito'])

async function moverSaldo(q, contaId, delta) {
  const [c] = await q(`UPDATE contas SET balance = COALESCE(balance, 0) + $2 WHERE id = $1 RETURNING id, balance`, [contaId, round2(delta)])
  return { id: c.id, saldo: num(c.balance) }
}

async function atualizarStatusFinanciamento(q, finId) {
  const [agg] = await q(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'paid')::int AS pagas,
            COUNT(*) FILTER (WHERE status <> 'open')::int AS tocadas
       FROM financing_installments WHERE financing_id = $1`, [finId],
  )
  const status = agg.pagas === agg.total ? 'completed' : (agg.tocadas > 0 ? 'partial' : 'open')
  await q(`UPDATE financing SET status = $2 WHERE id = $1`, [finId, status])
}

async function inserirBaixa(q, b) {
  const id = genId('bbx')
  await q(
    `INSERT INTO bem_baixas (id, bem_id, tipo, data, valor, quantidade_parcelas, cota_numero, parcela_id, schedule_id,
       ocorrencia, favorecido, categoria_id, lancamento_id, descricao, anterior)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id, b.bemId, b.tipo, b.data, round2(b.valor), b.quantidade, b.cotaNumero ?? null, b.parcelaId ?? null, b.scheduleId ?? null,
      b.ocorrencia ?? null, b.favorecido ?? null, b.categoriaId ?? null, b.lancamentoId ?? null, b.descricao ?? null,
      JSON.stringify(b.anterior || {})],
  )
  return id
}

const ANTES_PARCELA = ['principal_pago', 'juros_pago', 'total_pago', 'desvio_juros', 'status', 'saldo_restante', 'desconto_antecipacao']

async function quitarParcela(q, parcela, { valor, data, tipo }) {
  const principal = num(parcela.principal_provisioned)
  const principalPago = Math.min(valor, principal)
  await q(
    `UPDATE financing_installments SET principal_pago = $2, juros_pago = $3, total_pago = $4, desvio_juros = 0,
       data_pagamento = $5, status = 'paid', saldo_restante = 0, desconto_antecipacao = 0, baixa_tipo = $6
     WHERE id = $1`,
    [parcela.id, round2(principalPago), round2(Math.max(0, valor - principal)), round2(valor), data, tipo],
  )
}

const parcelaAnterior = (p) => ({
  ...Object.fromEntries(ANTES_PARCELA.map(k => [k, p[k]])),
  data_pagamento: p.data_pagamento_iso ?? null,
})

async function restaurarParcela(q, id, a) {
  await q(
    `UPDATE financing_installments SET principal_pago = $2, juros_pago = $3, total_pago = $4, desvio_juros = $5, status = $6,
       saldo_restante = $7, desconto_antecipacao = $8, data_pagamento = $9, baixa_tipo = NULL
     WHERE id = $1`,
    [id, num(a.principal_pago), num(a.juros_pago), num(a.total_pago), num(a.desvio_juros), a.status,
      num(a.saldo_restante), num(a.desconto_antecipacao), a.data_pagamento],
  )
}

const SELECT_PARCELA = `SELECT p.*, to_char(p.data_vencimento::date, 'YYYY-MM-DD') AS venc_iso,
       to_char(p.data_pagamento::date, 'YYYY-MM-DD') AS data_pagamento_iso, f.bem_id, f.conta_divida_id
  FROM financing_installments p JOIN financing f ON f.id = p.financing_id`

// Marca UMA parcela como paga sem sair dinheiro de conta do Finup (ou registra um crédito avulso).
export async function registrarBaixa(q, bem, entrada) {
  const { tipo, data, parcelaId = null, scheduleId = null, ocorrencia = null, gerarReceita = false, categoriaId = null } = entrada
  const valor = round2(Number(entrada.valor))
  const favorecido = textoOuNull(entrada.favorecido)
  const cotaNumero = textoOuNull(entrada.cotaNumero)
  if (!TIPOS_PARCELA.has(tipo)) throw erro(400, 'Escolha o motivo da baixa')
  if (!isIsoDate(data)) throw erro(400, 'Data inválida')
  if (!(valor > 0)) throw erro(400, 'Informe o valor')
  if (tipo === 'terceiro' && !favorecido) throw erro(400, 'Informe quem pagou')
  if (gerarReceita && tipo !== 'terceiro') throw erro(400, 'Só o pagamento por terceiro gera receita')
  if (gerarReceita && !categoriaId) throw erro(400, 'Escolha a categoria da receita')
  if (bem.foi_vendido) throw erro(409, 'Este bem já foi vendido')
  if (scheduleId && !ocorrencia) throw erro(400, 'Informe a ocorrência da parcela')

  const efeitos = {}
  let anterior = {}
  let scheduleFinal = scheduleId
  let ocorrenciaFinal = ocorrencia

  if (parcelaId) {
    const [p] = await q(`${SELECT_PARCELA} WHERE p.id = $1`, [parcelaId])
    if (!p || p.bem_id !== bem.id) throw erro(404, 'Parcela não encontrada neste bem')
    if (p.status !== 'open') throw erro(409, 'Esta parcela já tem pagamento. Pague o restante ou estorne antes.')
    anterior = { parcela: parcelaAnterior(p), principal: num(p.principal_provisioned), financing_id: p.financing_id }
    await quitarParcela(q, p, { valor, data, tipo })
    // A dívida é o saldo do principal: a parcela fechou, então todo o principal dela deixa de ser devido.
    efeitos.divida = await moverSaldo(q, p.conta_divida_id, num(p.principal_provisioned))
    await atualizarStatusFinanciamento(q, p.financing_id)
    scheduleFinal = p.schedule_id || null
    ocorrenciaFinal = p.schedule_id ? p.venc_iso : null
  } else if (scheduleId) {
    const [s] = await q(`SELECT id, to_account_id FROM agendamentos WHERE id = $1`, [scheduleId])
    if (!s || s.to_account_id !== bem.id) throw erro(404, 'Agendamento não encontrado neste bem')
    const [ja] = await q(`SELECT 1 AS sim FROM agendamentos WHERE id = $1 AND COALESCE(registered, '[]'::jsonb) @> to_jsonb($2::text)`, [scheduleId, ocorrencia])
    if (ja) throw erro(409, 'Esta parcela já foi baixada')
  } else if (tipo !== 'credito' && !bem.consorcio) {
    throw erro(400, 'Escolha a parcela')
  }

  if (scheduleFinal) {
    await q(
      `UPDATE agendamentos SET registered = COALESCE(registered, '[]'::jsonb) || to_jsonb($2::text) WHERE id = $1`,
      [scheduleFinal, ocorrenciaFinal],
    )
    efeitos.agendamento = { id: scheduleFinal, ocorrencia: ocorrenciaFinal }
  }

  const descricao = textoOuNull(entrada.descricao)
  let lancamentoId = null
  if (gerarReceita) {
    lancamentoId = genId('tx_baixa')
    const texto = descricao || `Parcela paga por ${favorecido} - ${bem.name}`
    await q(
      `INSERT INTO lancamentos (id, type, account_id, amount, date, description, category_id, payee, bem_id, bem_papel, origin, account_type, reconciled)
       VALUES ($1, 'income', $2, $3, $4, $5, $6, $7, $2, 'terceiro', 'manual', 'asset', FALSE)`,
      [lancamentoId, bem.id, valor, data, texto, categoriaId, favorecido],
    )
    efeitos.lancamento = {
      id: lancamentoId, type: 'income', accountId: bem.id, amount: valor, date: data, description: texto,
      categoryId: categoriaId, payee: favorecido, bemId: bem.id, bemPapel: 'terceiro', origin: 'manual',
    }
  }

  // Sem parcela nem agendamento: crédito só abate valor; os outros motivos quitam uma parcela sem agenda.
  const quantidade = parcelaId || scheduleId || tipo !== 'credito' ? 1 : 0
  const id = await inserirBaixa(q, {
    bemId: bem.id, tipo, data, valor, quantidade, cotaNumero, parcelaId, scheduleId: scheduleFinal, ocorrencia: ocorrenciaFinal,
    favorecido, categoriaId: gerarReceita ? categoriaId : null, lancamentoId, descricao, anterior,
  })
  efeitos.bem = await moverSaldo(q, bem.id, valor)
  return { id, efeitos }
}

// Desfaz qualquer baixa: a parcela volta a pendente e os totais do bem voltam.
export async function estornarBaixa(q, baixa) {
  const a = baixa.anterior || {}
  const efeitos = {}
  if (baixa.tipo === 'abertura' && a.parcelas) {
    const restauradas = await reabrirParcelasDaAbertura(q, a)
    efeitos.divida = restauradas.divida
    efeitos.agendamentos_criados = restauradas.agendamentos
  } else if (baixa.parcela_id) {
    await restaurarParcela(q, baixa.parcela_id, a.parcela)
    const [fin] = await q(`SELECT conta_divida_id FROM financing WHERE id = $1`, [a.financing_id])
    efeitos.divida = await moverSaldo(q, fin.conta_divida_id, -num(a.principal))
    await atualizarStatusFinanciamento(q, a.financing_id)
  }
  if (baixa.schedule_id) {
    await q(
      `UPDATE agendamentos
          SET registered = (SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(COALESCE(registered, '[]'::jsonb)) e WHERE e <> to_jsonb($2::text))
        WHERE id = $1`,
      [baixa.schedule_id, baixa.ocorrencia],
    )
    efeitos.agendamento = { id: baixa.schedule_id, ocorrencia: baixa.ocorrencia }
  }
  if (baixa.lancamento_id) {
    await q(`DELETE FROM lancamentos WHERE id = $1`, [baixa.lancamento_id])
    efeitos.lancamento_removido = baixa.lancamento_id
  }
  efeitos.bem = await moverSaldo(q, baixa.bem_id, -num(baixa.valor))
  await q(`UPDATE bem_baixas SET estornado_em = now() WHERE id = $1`, [baixa.id])
  return efeitos
}

function validarAbertura({ parcelas, valor, data }, prazo = null) {
  const qtd = Number(parcelas)
  if (!Number.isInteger(qtd) || qtd < 1) throw erro(400, 'Informe quantas parcelas já foram pagas')
  if (prazo != null && qtd > prazo) throw erro(400, 'As parcelas já pagas não podem passar do prazo')
  if (!(Number(valor) > 0)) throw erro(400, 'Informe o valor total pago até então')
  if (!isIsoDate(data)) throw erro(400, 'Informe a data de referência')
  return { qtd, valor: round2(Number(valor)), data: String(data).slice(0, 10) }
}

const aberturaVazia = (a) => !a || (!Number(a.parcelas) && !Number(a.valor) && !a.data)

// Consórcio: uma abertura por cota. Sem lançamento e sem agendamento; só soma no bem.
export async function gravarAberturaDaCota(q, bemId, cota) {
  const numero = textoOuNull(cota.numero)
  const entrada = { parcelas: cota.abertura_parcelas, valor: cota.abertura_valor, data: cota.abertura_data }
  const [atual] = await q(`SELECT * FROM bem_baixas WHERE bem_id = $1 AND tipo = 'abertura' AND cota_numero = $2 AND estornado_em IS NULL`, [bemId, numero])
  if (aberturaVazia(entrada)) {
    if (atual) await estornarBaixa(q, atual)
    return
  }
  const prazo = cota.prazo_meses === '' || cota.prazo_meses == null ? null : Number(cota.prazo_meses)
  const a = validarAbertura(entrada, prazo)
  if (atual) {
    await q(`UPDATE bem_baixas SET quantidade_parcelas = $2, valor = $3, data = $4 WHERE id = $1`, [atual.id, a.qtd, a.valor, a.data])
    await moverSaldo(q, bemId, a.valor - num(atual.valor))
  } else {
    await inserirBaixa(q, { bemId, tipo: 'abertura', data: a.data, valor: a.valor, quantidade: a.qtd, cotaNumero: numero, descricao: 'Histórico de abertura' })
    await moverSaldo(q, bemId, a.valor)
  }
}

// Cota que saiu do cadastro leva a abertura junto, para o saldo do bem não ficar com o valor dela.
export async function estornarAberturasOrfas(q, bemId, numeros) {
  const orfas = await q(
    `SELECT * FROM bem_baixas WHERE bem_id = $1 AND tipo = 'abertura' AND estornado_em IS NULL AND NOT (COALESCE(cota_numero, '') = ANY($2))`,
    [bemId, numeros],
  )
  for (const b of orfas) await estornarBaixa(q, b)
}

// Financiamento: as primeiras N parcelas viram pagas, sem lançamento e sem agendamento.
export async function gravarAberturaDoFinanciamento(q, fin, entrada) {
  const [ja] = await q(`SELECT id FROM bem_baixas WHERE bem_id = $1 AND tipo = 'abertura' AND estornado_em IS NULL`, [fin.bem_id])
  if (ja) throw erro(409, 'Este financiamento já tem histórico de abertura. Estorne antes de informar outro.')
  const a = validarAbertura(entrada, num(fin.num_parcelas))
  const parcelas = await q(`${SELECT_PARCELA} WHERE p.financing_id = $1 ORDER BY p.numero_parcela LIMIT $2`, [fin.id, a.qtd])
  if (parcelas.some(p => p.status !== 'open')) throw erro(409, 'Há parcelas já pagas entre as primeiras. Informe a abertura antes de pagar, ou estorne os pagamentos.')

  const removidos = []
  let principal = 0
  const valorPorParcela = (p) => num(p.total_provisioned)
  for (const p of parcelas) {
    principal += num(p.principal_provisioned)
    await quitarParcela(q, p, { valor: valorPorParcela(p), data: a.data, tipo: 'abertura' })
    if (p.schedule_id) {
      await q(`UPDATE financing_installments SET schedule_id = NULL WHERE id = $1`, [p.id])
      await q(`DELETE FROM lancamento_rateios WHERE lancamento_id = $1`, [p.schedule_id])
      await q(`DELETE FROM agendamentos WHERE id = $1`, [p.schedule_id])
      removidos.push(p.schedule_id)
    }
  }
  const divida = await moverSaldo(q, fin.conta_divida_id, principal)
  await atualizarStatusFinanciamento(q, fin.id)
  const id = await inserirBaixa(q, {
    bemId: fin.bem_id, tipo: 'abertura', data: a.data, valor: a.valor, quantidade: a.qtd, descricao: 'Histórico de abertura',
    anterior: { financing_id: fin.id, principal: round2(principal), parcelas: parcelas.map(p => ({ id: p.id, ...parcelaAnterior(p) })) },
  })
  const bem = await moverSaldo(q, fin.bem_id, a.valor)
  return { id, efeitos: { bem, divida, agendamentos_removidos: removidos } }
}

async function reabrirParcelasDaAbertura(q, a) {
  const [fin] = await q(`SELECT f.*, b.name AS bem_nome, b.categoria_prestacao_id, b.categoria_taxa_finan_id FROM financing f JOIN contas b ON b.id = f.bem_id WHERE f.id = $1`, [a.financing_id])
  const ids = a.parcelas.map(p => p.id)
  for (const p of a.parcelas) await restaurarParcela(q, p.id, p)
  const parcelas = await q(
    `SELECT id, numero_parcela AS numero, principal_provisioned, juros_provisioned,
            to_char(data_vencimento::date, 'YYYY-MM-DD') AS data_vencimento
       FROM financing_installments WHERE id = ANY($1) ORDER BY numero_parcela`, [ids],
  )
  const scheduleIds = await criarAgendamentosParcelas(q, {
    parcelas, contaOrigemId: fin.conta_origem_id, contaDestinoId: fin.conta_divida_id, valorParcela: num(fin.valor_parcela),
    descricaoBase: 'Parcela', numParcelas: num(fin.num_parcelas), categoriaPrestacaoId: fin.categoria_prestacao_id, payee: fin.banco,
  })
  for (let i = 0; i < scheduleIds.length; i++) {
    await q(`UPDATE agendamentos SET description = $2 WHERE id = $1`, [scheduleIds[i], `Parcela ${num(parcelas[i].numero)}/${num(fin.num_parcelas)} - ${fin.bem_nome}`])
    await q(`UPDATE financing_installments SET schedule_id = $2 WHERE id = $1`, [parcelas[i].id, scheduleIds[i]])
    await criarRateiosParcela(q, {
      scheduleId: scheduleIds[i], principal: parcelas[i].principal_provisioned, juros: parcelas[i].juros_provisioned,
      categoriaPrestacaoId: fin.categoria_prestacao_id, categoriaTaxaFinanId: fin.categoria_taxa_finan_id,
    })
  }
  const divida = await moverSaldo(q, fin.conta_divida_id, -num(a.principal))
  await atualizarStatusFinanciamento(q, fin.id)
  return { divida, agendamentos: scheduleIds.length }
}
