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
  return { ...comum, type: TIPO_MOV[p.tipo] || 'expense', date: p.data || undefined }
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
export const tipoPreLancamento = (ferramenta) => (ferramenta === 'criar_agendamento' ? 'agendamento' : 'lancamento')
export const ferramentaDoPre = (pre) => pre?.payload?.ferramenta || (pre?.tipo === 'agendamento' ? 'criar_agendamento' : 'registrar_lancamento')

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
