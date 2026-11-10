// Herança de campos nos registros GERADOS a partir de outro (agendamento → lançamento, parcela 1 →
// parcelas 2..N, linha importada → projeções, lançamento → agendamento duplicado, provisão →
// agendamento efetivado). Funções puras: quem chama decide onde gravar.

// Lançamento criado na baixa de um agendamento (PayModal). O que o modal mostra e o usuário pode
// alterar vem em `modal` — `undefined` = o modal não tem o campo → herda do agendamento.
// `incluirGrupo`: o recebimento não tem o select de grupo, então herda o do agendamento.
export function camposHerdadosNoPagamento(schedule, modal = {}, { incluirGrupo = false } = {}) {
  const s = schedule || {}
  const pick = (k, base) => (modal[k] !== undefined ? (modal[k] || null) : (base || null))
  const out = {
    tipoDocumentoId: pick('tipoDocumentoId', s.tipoDocumentoId),
    costCenter: pick('costCenter', s.costCenter),
  }
  if (incluirGrupo) out.grupoGerencial = pick('grupoGerencial', s.grupoGerencial)
  return out
}

// Parcelas 2..N de uma compra parcelada manual (criarParcelasGerencial): herdam da parcela 1.
export function camposHerdadosParcelaFilha(base) {
  const b = base || {}
  return {
    categoryId: b.categoryId || null,
    payee: b.payee || null,
    costCenter: b.costCenter || null,
    notes: b.notes || null,
    reservaFuncaoId: b.reservaFuncaoId || null,
    tipoDocumentoId: b.tipoDocumentoId || null,
  }
}

// Projeções (parcelas futuras ausentes) da importação de fatura. A linha do arquivo não traz
// centro de custo, observações nem tipo — vêm da linha (se o preview os tiver) ou da irmã já
// gravada da série (_serieAnchor), que é onde o usuário os preencheu.
export function camposHerdadosProjecao(row) {
  const r = row || {}
  const a = r._serieAnchor || {}
  return {
    costCenter: r.costCenter || a.costCenter || null,
    notes: r.notes || a.notes || null,
    tipoDocumentoId: r.tipoDocumentoId || a.tipoDocumentoId || null,
  }
}

// "Duplicar → Criar Agendamento": lançamento → `initial` de um agendamento NOVO (ScheduleForm).
// Só campos de conteúdo; nada de id/parentTxId/origin/installment*. O lançamento usa `type`, o
// agendamento `transactionType`; os demais compartilham o nome.
export function txToScheduleInitial(tx) {
  if (!tx) return null
  return {
    description: tx.description || '',
    transactionType: tx.type || 'expense',
    amount: tx.amount ?? '',
    accountId: tx.accountId || '',
    toAccountId: tx.toAccountId || '',
    categoryId: tx.categoryId || '',
    payee: tx.payee || '',
    costCenter: tx.costCenter || '',
    reservaFuncaoId: tx.reservaFuncaoId || '',
    grupoGerencial: tx.grupoGerencial || null,
    tipoDocumentoId: tx.tipoDocumentoId || null,
    // Transferência entre perfis: a categoria de cada lado (e as antigas, por tipo) vão junto.
    categoriaOrigemId: tx.categoriaOrigemId || null,
    categoriaDestinoId: tx.categoriaDestinoId || null,
    categoriaCnpjId: tx.categoriaCnpjId || null,
    categoriaCpfId: tx.categoriaCpfId || null,
  }
}

// Agendamento NORMAL criado ao efetivar uma ocorrência de provisão recorrente: copia os campos
// definitivos da provisão, com valor/data reais. Não auto-registra.
//
// Data: a DATA REAL informada (`date`). Histórico: em 5b6f3ad passou a usar `occurrenceDate || date`
// porque a modal mandava como data a startDate da provisão (a 1ª ocorrência da série), e o
// agendamento nascia lá atrás. Hoje a modal já abre a Data real na própria ocorrência efetivada
// (vencimento dela, com override) e manda o que o usuário escolheu — usar a ocorrência ignorava
// essa escolha (13/11 efetivada em 16/11 ficava em 13/11). `occurrenceDate` só cobre `date` vazio.
export function agendamentoDaEfetivacao(prov, { id, valor, date, occurrenceDate }) {
  return {
    id,
    description: prov.description,
    transactionType: prov.transactionType || 'expense',
    accountId: prov.accountId,
    accountType: prov.accountType || null,
    toAccountId: prov.toAccountId || '',
    amount: valor,
    categoryId: prov.categoryId || '',
    payee: prov.payee || '',
    costCenter: prov.costCenter || '',
    tipoDocumentoId: prov.tipoDocumentoId || null,
    frequency: 'once',
    startDate: date || occurrenceDate,
    occurrenceType: 'continuous',
    installments: 0,
    registered: [],
    skipped: [],
    remindDaysBefore: prov.remindDaysBefore ?? 3,
    autoRegister: false,
    overrides: {},
    grupoGerencial: prov.grupoGerencial ?? null,
    reservaExpenseCategoryId: prov.reservaExpenseCategoryId ?? null,
    // O resgate da reserva (transferência) é criado à parte; a despesa em si não carrega função.
    reservaFuncaoId: null,
    isProvisao: false,
    provisaoEfetivada: false,
    // "Considerar no Fluxo de Caixa principal?" da provisão (conta não FC marcada Sim/Não).
    considerarFluxoPrincipal: typeof prov.considerarFluxoPrincipal === 'boolean' ? prov.considerarFluxoPrincipal : null,
  }
}

// Resgate da reserva criado na efetivação: transferência (Uma vez) da conta da reserva → conta da
// despesa, com o valor/data REAIS e a mesma função de reserva da provisão. Substitui a projeção
// provisória no Fluxo Futuro da reserva. Data: a mesma regra do agendamento acima (data real).
export function resgateDaEfetivacao(prov, { id, valor, date, occurrenceDate, contaReserva, contaPrincipal }) {
  return {
    id,
    description: `Resgate provisão — ${prov.description}`,
    transactionType: 'transfer',
    accountId: contaReserva.id,
    accountType: contaReserva.type || null,
    toAccountId: contaPrincipal.id,
    amount: valor,
    categoryId: '',
    payee: '',
    costCenter: '',
    frequency: 'once',
    startDate: date || occurrenceDate,
    occurrenceType: 'continuous',
    installments: 0,
    registered: [],
    skipped: [],
    remindDaysBefore: 3,
    autoRegister: true,
    overrides: {},
    grupoGerencial: null,
    reservaExpenseCategoryId: null,
    reservaFuncaoId: prov.reservaFuncaoId,
    isProvisao: false,
    provisaoEfetivada: false,
    // Mesma marca da despesa: conta não FC marcada Sim → o resgate também entra (líquido 0).
    considerarFluxoPrincipal: typeof prov.considerarFluxoPrincipal === 'boolean' ? prov.considerarFluxoPrincipal : null,
  }
}

// Id do agendamento do "Repetir" gerado ANTES do lançamento 1/N, para o lançamento nascer com
// scheduleId (excluí-lo reabre a ocorrência, como nos demais).
export const novoIdAgendamento = () => 'sch_' + Date.now() + '_' + Math.random().toString(36).slice(2)
