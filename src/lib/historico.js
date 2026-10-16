// Histórico de alterações: montagem das linhas (lado do app) e formatação para a tela.
// Só as edições FEITAS PELO USUÁRIO geram linhas — o motor, recálculos e o sync nunca chamam
// linhasHistorico (e, se chamarem com origem ≠ 'usuario', não sai nada).
import { ROTULO_CAMPO, ESCOPO, ehCampoSerie } from './camposSerie.js'

export const novoLoteId = () => (globalThis.crypto?.randomUUID
  ? globalThis.crypto.randomUUID()
  : 'lote_' + Date.now() + '_' + Math.random().toString(36).slice(2))

// itens: [{ id, ocorrenciaData?, escopo, mudancas: [{ campo, de, para }] }]
// → linhas snake_case para /api/historico (1 por campo e por item, todas com o mesmo lote_id).
export function linhasHistorico({ entidade, itens, serieKey = null, loteId, motivo = null, origem = 'usuario' }) {
  if (origem !== 'usuario') return []
  const out = []
  for (const it of itens || []) {
    for (const m of it.mudancas || []) {
      out.push({
        entidade,
        entidade_id: it.id,
        ocorrencia_data: it.ocorrenciaData || null,
        serie_key: serieKey,
        lote_id: loteId,
        escopo: it.escopo || ESCOPO.PARCELA,
        campo: m.campo,
        valor_anterior: m.de ?? null,
        valor_novo: m.para ?? null,
        motivo: motivo ? String(motivo).trim() || null : null,
      })
    }
  }
  return out
}

export const ROTULO_ESCOPO = { parcela: 'Só esta parcela', proximas: 'Esta e as próximas', serie: 'Série (pendentes)' }

const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)
const ddmmyyyy = (iso) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso)

// Valor legível: nomes no lugar de ids, moeda em R$, datas dd/mm/aaaa. ctx = { categorias,
// contas, tipos, grupos } (listas do app).
export function formatarValorHistorico(campo, v, ctx = {}) {
  if (v === null || v === undefined || v === '') return '—'
  switch (campo) {
    case 'amount': return brl(v)
    case 'date': return ddmmyyyy(v)
    case 'categoryId':
    case 'categoriaCnpjId':
    case 'categoriaCpfId': {
      const c = (ctx.categorias || []).find(x => x.id === v)
      return c ? `${c.icon ? c.icon + ' ' : ''}${c.name}` : '(categoria removida)'
    }
    case 'accountId': {
      const a = (ctx.contas || []).find(x => x.id === v)
      return a ? (a.apelido || a.name) : '(conta removida)'
    }
    case 'tipoDocumentoId': {
      const t = (ctx.tipos || []).find(x => x.id === v)
      return t ? `${t.sigla} — ${t.nome}` : '(tipo removido)'
    }
    case 'faturaMonthYear': return /^\d{4}-\d{2}$/.test(v) ? `${v.slice(5, 7)}/${v.slice(0, 4)}` : String(v)
    // Exclusão (revisão automática): foto do lançamento removido.
    case 'exclusao': return typeof v === 'object'
      ? `${v.description || v.id} · ${brl(v.amount)} · ${ddmmyyyy(v.date)}${v.faturaMonthYear ? ` · fatura ${v.faturaMonthYear.slice(5, 7)}/${v.faturaMonthYear.slice(0, 4)}` : ''}`
      : String(v)
    case 'grupoGerencial': {
      const g = (ctx.grupos || []).find(x => x.id === v)
      return g ? (g.name || String(g.number)) : String(v)
    }
    default: return String(v)
  }
}

// Campos que só aparecem no histórico (correções da revisão automática do cartão).
const ROTULO_EXTRA = { exclusao: 'Lançamento excluído', faturaMonthYear: 'Fatura' }
export const rotuloCampo = (campo) => ROTULO_CAMPO[campo] || ROTULO_EXTRA[campo] || campo

// Agrupa as linhas por lote (uma edição) para a linha do tempo, mais recente primeiro.
export function agruparPorLote(linhas) {
  const m = new Map()
  for (const l of linhas || []) {
    if (!m.has(l.lote_id)) m.set(l.lote_id, { loteId: l.lote_id, quando: l.created_at, motivo: l.motivo, escopo: l.escopo, linhas: [], itens: new Set() })
    const g = m.get(l.lote_id)
    g.linhas.push(l)
    g.itens.add(l.entidade_id)
    if (l.created_at > g.quando) g.quando = l.created_at
    if (!g.motivo && l.motivo) g.motivo = l.motivo
  }
  return [...m.values()]
    .map(g => ({ ...g, nItens: g.itens.size }))
    .sort((a, b) => String(b.quando).localeCompare(String(a.quando)))
}

// Separa cada item em até dois grupos de histórico: campos da SÉRIE (escopo 'serie') e campos da
// PARCELA (o escopo escolhido). entradas: [{ id, ocorrenciaData?, mudancas }].
export function itensPorEscopo(entradas, escopoParcela) {
  const out = []
  for (const e of entradas || []) {
    const serie = (e.mudancas || []).filter(m => ehCampoSerie(m.campo))
    const parcela = (e.mudancas || []).filter(m => !ehCampoSerie(m.campo))
    if (parcela.length) out.push({ id: e.id, ocorrenciaData: e.ocorrenciaData || null, escopo: escopoParcela, mudancas: parcela })
    if (serie.length) out.push({ id: e.id, escopo: ESCOPO.SERIE, mudancas: serie })
  }
  return out
}

// "Gravar no agendamento" / "Aplicar data" (Fluxo de Caixa): a data de uma ocorrência (ou da
// série, modo 'serie') mudou por ação do usuário → linhas de histórico do campo Data.
export function historicoDataAgendamento({ schedule, origDate, de, para, modo, loteId, serieKey = null }) {
  const daSerie = modo === 'serie'
  return linhasHistorico({
    entidade: 'agendamento',
    itens: [{ id: schedule.id, ocorrenciaData: daSerie ? null : origDate, escopo: daSerie ? ESCOPO.PROXIMAS : ESCOPO.PARCELA, mudancas: [{ campo: 'date', de, para }] }],
    serieKey, loteId,
  })
}
