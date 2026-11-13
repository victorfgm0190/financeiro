// Importar Fatura — SUGESTÕES DO ASSISTENTE (Etapa 6c). A IA só sugere: aceitar preenche a linha na
// tela; nada é gravado nem aprendido antes do "Confirmar" da importação. Ver
// docs/importar-fatura-6b-diagnostico.md §4 e api/ia-importacao.js.
//
// Sugestão (uma por linha da fatura), já com ids (o servidor troca os índices locais de volta):
//   {
//     linhaId:     string                    — _id da linha da fatura
//     decisao:     'mesmo' | 'novo' | null   — no cartão "É este?": é o candidato / é outra compra
//     candidatoId: string | null             — o lançamento (ou agendamento) que a sugestão aponta
//     categoriaId: string | null             — nos Novos: categoria sugerida
//     grupoId:     string | null             — nos Novos: grupo gerencial (só com o controle ligado)
//     favorecido:  string | null             — nos Novos: nome de um favorecido do cadastro
//     confianca:   'alta' | 'media' | 'baixa'
//     motivo:      string (até 140 caracteres)
//   }
// validarSugestao confere contra as regras: candidato só da lista permitida (nunca conciliado),
// categoria do cadastro, do tipo da linha e do perfil do cartão, grupo e favorecido só das listas.
// O que não passar é descartado (= "sem sugestão").
import { numeroParcelaDoTx, totalParcelasDoTx } from './revisaoImportacao.js'
import { origemDoLancamento } from './blocosConferencia.js'

export const CONFIANCAS = ['alta', 'media', 'baixa']
export const MOTIVO_MAX = 140
export const MAX_ITENS_IA = 40

// → sugestão normalizada, ou null quando não vale para esta linha.
//   ctx: { linhaId, candidatosIds = [], categoriasIds = null, gruposIds = null, favorecidos = null }
//   (lista null = o campo não se aplica e é recusado)
export function validarSugestao(s, { linhaId, candidatosIds = [], categoriasIds = null, gruposIds = null, favorecidos = null } = {}) {
  if (!s || typeof s !== 'object' || !linhaId || s.linhaId !== linhaId) return null
  if (!CONFIANCAS.includes(s.confianca)) return null
  const motivo = String(s.motivo || '').trim()
  if (!motivo) return null
  const decisao = s.decisao === 'mesmo' || s.decisao === 'novo' ? s.decisao : null
  const candidatoId = s.candidatoId || null
  if (decisao === 'mesmo' && (!candidatoId || !candidatosIds.includes(candidatoId))) return null
  if (decisao !== 'mesmo' && candidatoId) return null
  const categoriaId = s.categoriaId || null
  if (categoriaId && (!categoriasIds || !categoriasIds.includes(categoriaId))) return null
  const grupoId = s.grupoId || null
  if (grupoId && (!gruposIds || !gruposIds.includes(grupoId))) return null
  const favorecido = s.favorecido ? String(s.favorecido) : null
  if (favorecido && (!favorecidos || !favorecidos.includes(favorecido))) return null
  if (!decisao && !categoriaId && !grupoId && !favorecido) return null
  return {
    linhaId, decisao, candidatoId, categoriaId, grupoId, favorecido, confianca: s.confianca,
    motivo: motivo.length > MOTIVO_MAX ? `${motivo.slice(0, MOTIVO_MAX - 1)}…` : motivo,
  }
}

export const ROTULO_CONFIANCA = { alta: 'confiança alta', media: 'confiança média', baixa: 'confiança baixa' }

// ── O que vai para a IA ──────────────────────────────────────────────────────────────────────────
const parcelaLinha = (r) => (r._installment ? `${r._installment.num}/${r._installment.total}` : null)
const parcelaTx = (t) => {
  const n = numeroParcelaDoTx(t)
  if (!n) return null
  const total = totalParcelasDoTx(t)
  return total ? `${n}/${total}` : String(n)
}
const despesa = (r) => (r.type || 'expense') === 'expense'

// Candidatos que a sugestão pode apontar: os da pergunta, nunca conciliado.
export function candidatosPermitidos(pergunta) {
  return (pergunta?.candidatos || []).filter(c => c.agendamento || (c.tx && !c.tx.reconciled))
}

// Linha de Novos que ficou sem resposta das regras e do histórico ("Classificar Auto"): sem categoria,
// sem agendamento que mande na classificação e sem pré-lançamento do Assistente.
export const novoSemResposta = (r) => !r._generated && !r.categoryId && !r._doAgendamento && r._jaLancado?.origem !== 'pre'

// → itens do pedido (api/ia-importacao.js): perguntas primeiro, depois os Novos sem resposta do maior
// para o menor valor; no máximo MAX_ITENS_IA. Sem ids internos além do da linha e dos candidatos
// (o servidor troca tudo por índices locais antes de chamar a IA).
export function itensParaIa({ perguntas = [], novos = [] }) {
  const out = []
  for (const p of perguntas) {
    const cands = candidatosPermitidos(p)
    if (!cands.length && p.tipo !== 'recorrente') continue
    out.push({
      linhaId: p.row._id, tipo: 'pergunta', despesa: despesa(p.row),
      descricao: p.row.description, valor: Number(p.row.amount) || 0, data: p.row._dateCartao || p.row.date, parcela: parcelaLinha(p.row),
      candidatos: cands.slice(0, 3).map(c => (c.agendamento
        ? { id: c.id, descricao: c.agendamento.descricao, valor: c.agendamento.valorAgendado, data: c.agendamento.ocorrencia, parcela: null, origem: 'agendamento recorrente' }
        : { id: c.tx.id, descricao: c.tx.description, valor: Number(c.tx.amount) || 0, data: c.tx.dateCartao || c.tx.date, parcela: parcelaTx(c.tx), origem: origemDoLancamento(c.tx) })),
    })
  }
  const pendentes = novos.filter(novoSemResposta).sort((a, b) => (Math.abs(Number(b.amount)) || 0) - (Math.abs(Number(a.amount)) || 0))
  for (const r of pendentes) {
    out.push({ linhaId: r._id, tipo: 'novo', despesa: despesa(r), descricao: r.description, valor: Number(r.amount) || 0, data: r._dateCartao || r.date, parcela: parcelaLinha(r) })
  }
  return out.slice(0, MAX_ITENS_IA)
}

// ── Resposta → sugestões válidas para a tela ────────────────────────────────────────────────────
// ctx: { perguntas, linhas (Map/array de rows), categorias, perfilId, gruposIds (null = gerencial
// desligado), favorecidos (nomes do cadastro) } → { porLinha: { [linhaId]: sugestão }, descartadas }
export function sugestoesValidas(sugestoes, { perguntas = [], linhas = [], categorias = [], perfilId = null, gruposIds = null, favorecidos = [] }) {
  const porPergunta = new Map(perguntas.map(p => [p.id, p]))
  const porLinha = new Map(linhas.map(r => [r._id, r]))
  const doPerfil = (c) => !perfilId || !Array.isArray(c.perfilIds) || !c.perfilIds.length || c.perfilIds.includes(perfilId)
  const out = {}
  let descartadas = 0
  for (const s of sugestoes || []) {
    const p = porPergunta.get(s?.linhaId)
    const r = p?.row || porLinha.get(s?.linhaId)
    if (!r) { descartadas++; continue }
    const tipo = despesa(r) ? 'expense' : 'income'
    const v = validarSugestao(s, p
      ? { linhaId: r._id, candidatosIds: candidatosPermitidos(p).map(c => c.id) }
      : {
          linhaId: r._id,
          categoriasIds: categorias.filter(c => c.type === tipo && doPerfil(c)).map(c => c.id),
          gruposIds, favorecidos,
        })
    if (!v || (p && !v.decisao) || (!p && v.decisao)) { descartadas++; continue }
    out[r._id] = v
  }
  return { porLinha: out, descartadas }
}

// ── Aceitar / desfazer nos Novos (só a tela; nada gravado) ──────────────────────────────────────
// Patch da linha ao aceitar: os campos sugeridos e o que havia antes (para "Ignorar" desfazer).
export function aceitarSugestaoNovo(row, s) {
  const antes = { categoryId: row.categoryId || '', grupoGerencial: row.grupoGerencial ?? null, payee: row.payee ?? '' }
  const patch = { _iaAceita: { antes } }
  if (s.categoriaId) { patch.categoryId = s.categoriaId; patch._suggestedCategory = false }
  if (s.grupoId) patch.grupoGerencial = s.grupoId
  if (s.favorecido) patch.payee = s.favorecido
  return patch
}

// "Ignorar" depois de aceitar: a linha volta ao que estava antes.
export function desfazerSugestaoNovo(row) {
  if (!row?._iaAceita) return {}
  return { ...row._iaAceita.antes, _iaAceita: null }
}

// Aprendizado SÓ no "Confirmar": para as linhas gravadas que vieram de uma sugestão aceita, a regra
// do "Classificar Auto" (learnClassification) com a categoria que FICOU na linha (se o usuário trocou
// depois de aceitar, vale a troca). Cancelar a importação não chama isto.
export function regrasDaConfirmacao(linhasGravadas) {
  return (linhasGravadas || [])
    .filter(r => r._iaAceita && r.categoryId)
    .map(r => ({
      description: r.description, categoryId: r.categoryId, payee: r.payee || '',
      opcoes: { dayOfMonth: null, amountApprox: null, grupoGerencial: r.grupoGerencial || null, reservaFuncaoId: r._reservaFuncaoId || null },
    }))
}
