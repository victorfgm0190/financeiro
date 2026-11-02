// Assistente IA — ROTEAMENTO das consultas pelo TEXTO do pedido (não pelo palpite do modelo). PURO e
// seguro para o backend (só texto.js e consultaAgendamento.js; nada de React/utils de tela).
//
// Pergunta (forma interrogativa) sobre:
//   • um agendamento específico (parcelas, quando termina, próxima parcela) → consultar_agendamento
//   • pagos / em aberto / vencidos de um favorecido, categoria ou descrição → consultar_movimentos
// "Paguei 50 no mercado" (afirmação) segue sendo lançamento; "paguei o aluguel" segue sendo baixa.
import { normalizarTermo, txt } from './texto.js'
import { consultaDeAgendamento } from './consultaAgendamento.js'

const QUEM = String.raw`(?:a|ao|aos|a\s+[ao]|pro|pra|pros|pras|para\s+[ao]s?|para|com\s+[ao]|com|d[oa]s?|de)`
// Só pessoa/empresa ("ao João", "pro João"): "quanto falta pagar DO carro" é de UM agendamento.
const PESSOA = String.raw`(?:ao|aos|a\s+[ao]|pro|pra|pros|pras|para\s+[ao]s?|para|com\s+[ao]|com)`
const PERGUNTAS_MOVIMENTO = [
  // "o que já paguei ao João?", "quanto paguei de luz?", "quais pagamentos fiz ao João?"
  /\b(o\s+que|quanto|quais|qual)\b.*\b(ja\s+)?(paguei|pagamos|pago|pagos|recebi|recebemos|gastei|gastamos|fiz|fizemos)\b/,
  // "quanto falta pagar ao João?", "quanto devo pro João?", "o que tenho a pagar pro João?"
  new RegExp(String.raw`\b(quanto|o\s+que)\s+(ainda\s+)?(falta|tenho|devo|resta)\s+(a\s+)?(pagar|receber)?\s*${PESSOA}\s+\w+`),
  // "o que está em aberto com o João?", "contas vencidas da categoria luz"
  new RegExp(String.raw`\b(em\s+aberto|vencid\w*|atrasad\w*|pendente\w*|a\s+pagar|a\s+receber)\b.*\b${QUEM}\s+\w+`),
  // "pagamentos ao João", "pagos da academia"
  new RegExp(String.raw`\b(pagamentos|pagos|recebimentos)\s+${QUEM}\s+\w+`),
]
// Perguntas que são de UM agendamento (parcelas/término), mesmo citando alguém.
const DE_UM_AGENDAMENTO = /\b(parcel\w*|prestac\w*|termina|acaba|encerra|quitad\w*|proxima\s+parcela|ultima\s+parcela)\b/
// Assuntos de outras consultas: ficam com a ferramenta delas.
const OUTROS = /\b(fatura|saldo principal|orcamento|envelope|limite do cartao|saldo d[oa]|meu saldo)\b/

export function ehPerguntaDeMovimentos(texto) {
  const t = normalizarTermo(texto)
  if (!t || OUTROS.test(t) || DE_UM_AGENDAMENTO.test(t)) return false
  return PERGUNTAS_MOVIMENTO.some(re => re.test(t))
}

// Nome citado depois de "ao/pro/pra/para o/com o/do/da/de" (o último), sem o "?" final. O app confere
// contra favorecidos, categorias e descrições (resolverNome) — aqui é só o termo como foi dito.
export function alvoDoTexto(texto) {
  const t = normalizarTermo(texto).replace(/[?!.,]+/g, ' ').replace(/\s+/g, ' ').trim()
  const re = new RegExp(String.raw`(?:^|\s)${QUEM}\s+([a-z0-9][\w\s]*?)(?=\s+(?:este|esse|neste|nesse|no|na|em|desde|ate|de\s+\d)\b|$)`, 'g')
  const m = [...t.matchAll(re)]
  const alvo = m.length ? m[m.length - 1][1].trim() : ''
  if (!alvo || /^(mes|ano|semana|hoje|ontem)\b/.test(alvo)) return null
  // "a pagar pra Maria" → o nome depois da ÚLTIMA preposição.
  // ("posto de gasolina" fica inteiro: só recorta quando o trecho começa pelo verbo.)
  return (/^(pagar|receber)\s/.test(alvo) && alvoDoTexto(alvo.replace(/^(pagar|receber)\s+/, ''))) || alvo.slice(0, 80)
}

// Ferramentas que o modelo às vezes escolhe para uma PERGUNTA e que trocamos pela consulta certa.
const TROCAVEIS = new Set(['buscar_lancamentos', 'baixar_agendamento', 'perguntar', 'abrir_tela', 'consultar_vencimentos', 'consultar_agendamento'])

// Backend: (ferramenta do modelo, input, texto do pedido, podeFn) → { ferramenta, parametros } | null.
// Os parâmetros saem do input do modelo (os nomes citados); o validador do registro limpa depois.
export function rotearConsulta(ferramenta, input, textoPedido, podeFn = () => true) {
  const i = input || {}
  if (!TROCAVEIS.has(ferramenta)) return null
  if (ferramenta === 'abrir_tela' && i.destino !== 'tela_agendamentos' && i.destino !== 'tela_lancamentos') return null
  const podeVer = podeFn('agendamentos', 'ver') && podeFn('lancamentos', 'ver')
  if (podeVer && ehPerguntaDeMovimentos(textoPedido)) {
    const t = normalizarTermo(textoPedido)
    const status = /\b(falta|devo|resta|em aberto|a pagar|a receber|pendente)/.test(t) ? 'em_aberto'
      : /\b(vencid|atrasad)/.test(t) ? 'vencido' : 'pago'
    return {
      ferramenta: 'consultar_movimentos',
      parametros: {
        assunto: 'favorecido', status,
        tipo: /\b(recebi|recebemos|receber|recebimentos)\b/.test(t) ? 'receita' : 'despesa',
        favorecido: txt(i.favorecido, 80) || alvoDoTexto(textoPedido),
        descricao: txt(i.descricao, 80),
      },
    }
  }
  if (ferramenta === 'consultar_vencimentos' || ferramenta === 'consultar_agendamento') return null
  // Situação de UM agendamento (parcelas, término): a regra de consultaAgendamento.js.
  const ag = consultaDeAgendamento(ferramenta, i, textoPedido, podeFn('agendamentos', 'ver'))
  return ag ? { ferramenta: 'consultar_agendamento', parametros: ag } : null
}
