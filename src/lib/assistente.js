// Assistente IA (etapa 1) — regras puras da prévia: sugestão do /api/assistente → `initial` dos
// formulários existentes (TransactionForm / ScheduleForm), campos a conferir e apelidos a aprender
// com as correções do usuário. Nenhuma gravação aqui: o formulário salva pelo fluxo do AppContext.

export const TIPO_MOV = { despesa: 'expense', receita: 'income', transferencia: 'transfer' }

// Confiança abaixo disto (ou campo vazio) → campo destacado na prévia.
export const CONFIANCA_MINIMA = 0.6

const ou = (v, padrao = '') => (v === null || v === undefined ? padrao : v)

// Sugestão → `initial` do formulário. Favorecido novo entra como texto: o próprio formulário o
// cadastra ao salvar (addPayee), como no lançamento manual.
export function initialDaSugestao(ferramenta, p = {}) {
  const comum = {
    amount: p.valor > 0 ? String(p.valor) : '',
    accountId: ou(p.conta_id),
    toAccountId: ou(p.conta_destino_id),
    categoryId: ou(p.categoria_id),
    payee: p.favorecido_id || p.favorecido_novo || '',
    costCenter: ou(p.centro_custo_id),
    description: ou(p.descricao),
  }
  if (ferramenta === 'criar_agendamento') {
    const parcelado = Number(p.parcelas) > 1 && p.recorrencia !== 'once'
    return {
      ...comum,
      transactionType: TIPO_MOV[p.tipo] || 'expense',
      startDate: p.vencimento || p.data || undefined,
      frequency: p.recorrencia || 'once',
      occurrenceType: parcelado ? 'installment' : 'continuous',
      installments: parcelado ? Number(p.parcelas) : 0,
    }
  }
  // Compra parcelada: valor = TOTAL; o formulário (Parcelado + N) divide pelas parcelas.
  const parcelas = p.tipo === 'despesa' && Number(p.parcelas) > 1 ? Number(p.parcelas) : null
  return { ...comum, type: TIPO_MOV[p.tipo] || 'expense', date: p.data || undefined, ...(parcelas ? { installments: parcelas } : {}) }
}

// Campos a conferir (chaves do formulário). Essenciais vazios sempre; opcionais (favorecido,
// centro de custo) só quando foram citados/preenchidos e com confiança baixa.
export function camposParaConferir(ferramenta, p = {}, minimo = CONFIANCA_MINIMA) {
  const c = p.confianca || {}
  const baixa = (k) => !(Number(c[k]) >= minimo)
  const agendamento = ferramenta === 'criar_agendamento'
  const out = []
  if (!(p.valor > 0) || baixa('valor')) out.push('amount')
  if (baixa('data')) out.push(agendamento ? 'startDate' : 'date')
  if (!p.conta_id || baixa('conta')) out.push('accountId')
  if (p.tipo === 'transferencia') {
    if (!p.conta_destino_id || baixa('conta_destino')) out.push('toAccountId')
  } else if (!p.categoria_id || baixa('categoria')) out.push('categoryId')
  const favCitado = !!(p.favorecido_id || p.favorecido_novo || p.termos?.favorecido)
  if (favCitado && (!(p.favorecido_id || p.favorecido_novo) || baixa('favorecido') || p.favorecido_novo)) out.push('payee')
  if (p.centro_custo_id && baixa('centro_custo')) out.push('costCenter')
  if (!p.descricao || baixa('descricao')) out.push('description')
  return out
}

export const ROTULO_CAMPO = {
  amount: 'valor', date: 'data', startDate: 'vencimento', accountId: 'conta', toAccountId: 'conta destino',
  categoryId: 'categoria', payee: 'favorecido', costCenter: 'centro de custo', description: 'descrição',
}

// Ao confirmar: campo categoria/conta/favorecido que o usuário MUDOU em relação à sugestão vira
// apelido (termo citado no pedido → o que ele escolheu). Sem termo citado, nada a aprender.
export function apelidosAprendidos(sugestao = {}, salvo = {}) {
  const termos = sugestao.termos || {}
  const sugerido = {
    categoria: sugestao.categoria_id || '',
    conta: sugestao.conta_id || '',
    favorecido: sugestao.favorecido_id || sugestao.favorecido_novo || '',
  }
  const escolhido = {
    categoria: salvo.categoryId || '',
    conta: salvo.accountId || '',
    favorecido: (salvo.payee || '').trim(),
  }
  const itens = []
  for (const tipo of ['categoria', 'conta', 'favorecido']) {
    const termo = (termos[tipo] || '').trim()
    if (!termo || !escolhido[tipo] || escolhido[tipo] === sugerido[tipo]) continue
    itens.push({ tipo, termo, ref_id: escolhido[tipo] })
  }
  return itens
}

// Tipo do pré-lançamento (ia_pre_lancamentos.tipo) pela ferramenta.
const TIPO_DO_PRE = { criar_agendamento: 'agendamento', baixar_agendamento: 'baixa' }
const FERRAMENTA_DO_TIPO = { agendamento: 'criar_agendamento', baixa: 'baixar_agendamento' }
export const tipoPreLancamento = (ferramenta) => TIPO_DO_PRE[ferramenta] || 'lancamento'
export const ferramentaDoPre = (pre) => pre?.payload?.ferramenta || FERRAMENTA_DO_TIPO[pre?.tipo] || 'registrar_lancamento'

// ─── Baixa de agendamento (etapa 1.1) ────────────────────────────────────────────────────────────

// Candidatos do backend que continuam valendo no estado do app: o agendamento existe e a ocorrência
// ainda é a PRÓXIMA pendente (o que o botão Pagar baixaria). Algo baixado depois da consulta sai.
export function candidatosValidos(candidatos, schedules, getNextOccurrences) {
  const porId = new Map((schedules || []).map(s => [s.id, s]))
  return (candidatos || []).filter(c => {
    const s = porId.get(c.schedule_id)
    return !!s && getNextOccurrences(s, 1)[0] === c.ocorrencia
  })
}

// Valor efetivo da baixa: o informado; numa faixa ("uns 200, 220"), o previsto se cair nela, senão
// o meio da faixa; sem valor citado, o previsto da ocorrência.
export function valorDaBaixa(criterio = {}, candidato = {}) {
  if (criterio.valor_informado > 0) return criterio.valor_informado
  const min = criterio.valor_min
  const max = criterio.valor_max || min
  if (min > 0) {
    if (candidato.valor >= min && candidato.valor <= max) return candidato.valor
    return Math.round(((min + max) / 2) * 100) / 100
  }
  return candidato.valor || null
}

// Nenhum agendamento encontrado → sugestão de lançamento avulso com o que foi dito.
export function sugestaoLancamentoDaBaixa(criterio = {}) {
  const valor = criterio.valor_informado || (criterio.valor_min && criterio.valor_max
    ? Math.round(((criterio.valor_min + criterio.valor_max) / 2) * 100) / 100
    : criterio.valor_min || null)
  return {
    tipo: criterio.tipo || 'despesa', valor, data: criterio.data_pagamento, conta_id: criterio.conta_id || null,
    conta_destino_id: null, categoria_id: null, centro_custo_id: null, favorecido_id: null,
    favorecido_novo: criterio.favorecido || null, descricao: criterio.descricao || criterio.favorecido || null,
    confianca: { valor: criterio.valor_informado ? 0.9 : 0.4, data: 0.8, conta: criterio.conta_id ? 0.7 : 0, categoria: 0, favorecido: 0.5, descricao: 0.5 },
    termos: { favorecido: criterio.favorecido || null },
  }
}

// Payload do pré-lançamento de baixa: o critério, o agendamento escolhido e, no topo, os campos que a
// lista do Início mostra (descrição, valor, data, conta).
export const payloadDaBaixa = (criterio, candidato) => ({
  ferramenta: 'baixar_agendamento', criterio, candidato,
  descricao: candidato.descricao, valor: valorDaBaixa(criterio, candidato),
  data: criterio.data_pagamento || candidato.data, conta_id: criterio.conta_id || candidato.conta_id || null,
})

// Redimensiona a foto para no máximo `lado` px (maior lado) em JPEG, baixando a qualidade até caber
// em `maxBytes`. → { base64, mimeType } (base64 sem o prefixo data:).
export async function comprimirImagem(arquivo, { lado = 1600, maxBytes = 1.9 * 1024 * 1024 } = {}) {
  const url = URL.createObjectURL(arquivo)
  try {
    const img = await new Promise((ok, falha) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => falha(new Error('Não consegui abrir a imagem.'))
      i.src = url
    })
    const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * escala)
    canvas.height = Math.round(img.naturalHeight * escala)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const q of [0.82, 0.7, 0.55, 0.4]) {
      const dataUrl = canvas.toDataURL('image/jpeg', q)
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      if (base64.length * 0.75 <= maxBytes) return { base64, mimeType: 'image/jpeg' }
    }
    throw new Error('Imagem muito grande mesmo depois de comprimida.')
  } finally {
    URL.revokeObjectURL(url)
  }
}
