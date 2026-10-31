// PREFERÊNCIAS APRENDIDAS da prévia do Assistente (item 8, pendências 31/10). Quando o cliente escolhe
// na prévia algo diferente do sugerido (ex.: sugerido "Despesa + agendamento" para a Academia X e ele
// escolheu "Só despesa"), a escolha é gravada em ia_apelidos (tipos 'acao_despesa' e 'recorrencia').
// Depois de MIN_USOS escolhas iguais seguidas para o mesmo favorecido/contrato, sugerirAcaoDespesa
// passa a sugerir a preferência: acima das regras de palavra-chave, abaixo do que estiver explícito
// na frase ("e agende…") e de um contrato cadastrado (fato, não palpite).
// Separado POR PERFIL: o termo leva o perfil ativo ("<perfil>|f:<favorecido>"); cada ambiente é um
// cliente (banco próprio), então um cliente nunca vê a preferência de outro. PURO e testável.
import { normalizarTermo } from './texto.js'
import { chaveNumeroContrato } from '../contratos/numero.js'

export const TIPO_ACAO = 'acao_despesa'
export const TIPO_RECORRENCIA = 'recorrencia'
export const TIPOS_PREFERENCIA = [TIPO_ACAO, TIPO_RECORRENCIA]
export const MIN_USOS = 2

// Termos da preferência, do mais específico ao mais geral: contrato e depois favorecido.
export function termosPreferencia({ perfilId = null, favorecido = '', contrato = '' } = {}) {
  // Mesmo formato que o backend grava (api/ia-apelidos normaliza o termo: minúsculo, sem acento).
  const p = perfilId || '-'
  const out = []
  const c = chaveNumeroContrato(contrato)
  if (c.length >= 3) out.push(normalizarTermo(`${p}|c:${c}`))
  const f = normalizarTermo(favorecido)
  if (f) out.push(normalizarTermo(`${p}|f:${f}`))
  return out
}

// A preferência gravada (mesmo abaixo do mínimo) do 1º termo que tiver uma: { ref, usos, termo } | null.
export function preferenciaDe(apelidos = [], tipo, termos = []) {
  for (const termo of termos) {
    const a = (apelidos || []).find(x => x.tipo === tipo && x.termo === termo)
    if (a) return { ref: a.ref_id, usos: Number(a.usos) || 0, termo }
  }
  return null
}

const ROTULO_ACAO = { so_despesa: 'Só despesa', despesa_agendamento: 'Despesa + agendamento', so_agendamento: 'Só agendamento' }
const ativa = (p) => !!p && p.usos >= MIN_USOS

// Aplica as preferências ATIVAS sobre o resultado de sugerirAcaoDespesa (que já trouxe as regras).
// Contrato cadastrado fica como está. Guarda o que as regras diziam (acaoDasRegras/recorrenciaDasRegras)
// para saber, ao confirmar, se a escolha diferiu do sugerido pelas regras.
export function aplicarPreferencias(r, { acao = null, recorrencia = null, nome = '' } = {}) {
  if (!r) return r
  const out = { ...r, acaoDasRegras: r.acaoSugerida ?? null, recorrenciaDasRegras: r.recorrenciaSugerida ?? null }
  if (r.regra === 'contrato_cadastrado') return out
  if (ativa(acao) && ROTULO_ACAO[acao.ref]) {
    out.acaoSugerida = acao.ref
    out.regra = 'preferencia'
    out.motivo = `Você costuma escolher "${ROTULO_ACAO[acao.ref]}"${nome ? ` para ${nome}` : ''}`
    out.pergunta = null
    if (acao.ref === 'so_despesa') out.recorrenciaSugerida = null
  }
  if (ativa(recorrencia) && out.acaoSugerida !== 'so_despesa') out.recorrenciaSugerida = recorrencia.ref
  return out
}

// O que gravar ao confirmar a prévia. Grava quando a escolha difere do que as REGRAS sugeriram, ou
// quando já existe preferência para o termo (reforça se igual; se mudou, o backend recomeça a contagem).
//   → itens para aprenderApelidos: [{ tipo, termo, ref_id }]
export function preferenciasParaAprender({ termos = [], acaoEscolhida = null, acaoDasRegras = null, prefAcao = null, recEscolhida = null, recDasRegras = null, prefRec = null } = {}) {
  const termo = termos[0]
  if (!termo) return []
  const itens = []
  if (acaoEscolhida && (acaoEscolhida !== acaoDasRegras || prefAcao)) itens.push({ tipo: TIPO_ACAO, termo: prefAcao?.termo || termo, ref_id: acaoEscolhida })
  if (recEscolhida && acaoEscolhida !== 'so_despesa' && (recEscolhida !== recDasRegras || prefRec)) {
    itens.push({ tipo: TIPO_RECORRENCIA, termo: prefRec?.termo || termo, ref_id: recEscolhida })
  }
  return itens
}
