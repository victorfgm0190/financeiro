// Cadastro de favorecidos: uso por nome, sincronização com o que está em uso, renomear/mesclar e
// alias de importação. Funções puras — o AppContext aplica o resultado num único update(), e o
// sync normal (syncSection / syncPayees) grava só o que mudou.
//
// O "nome" de um favorecido é o texto com TRIM: é assim que ele é comparado em todo lugar daqui.
// Fontes de uso: lancamentos.payee, agendamentos.payee (inclui as parcelas de financiamento, cujo
// favorecido mora ali) e regras_classificacao.payee.
import { normText, stripParcelaSuffix } from './conciliacaoMatch.js'

export const nomeFavorecido = (s) => String(s ?? '').trim()

// Descrição base de um lançamento — o favorecido padrão da importação e o "começa com" da
// renomeação. Mesma função de descrição base do computeDupMatch.
export const baseDoFavorecido = (descricao) => nomeFavorecido(stripParcelaSuffix(descricao))

const vazio = () => ({ lancamentos: 0, agendamentos: 0, regras: 0, total: 0 })

// Map(nome → { lancamentos, agendamentos, regras, total }).
export function contarUsos({ transactions = [], schedules = [], rules = [] }) {
  const m = new Map()
  const soma = (nome, campo) => {
    const n = nomeFavorecido(nome)
    if (!n) return
    if (!m.has(n)) m.set(n, vazio())
    const u = m.get(n)
    u[campo]++
    u.total++
  }
  for (const t of transactions) soma(t.payee, 'lancamentos')
  for (const s of schedules) soma(s.payee, 'agendamentos')
  for (const r of rules) soma(r.payee, 'regras')
  return m
}

// Nomes em uso que faltam no cadastro, do mais usado para o menos. Sem juntar parecidos —
// juntar é trabalho do Mesclar.
export function nomesFaltando(payees, usos) {
  const cadastro = new Set((payees || []).map(nomeFavorecido))
  return [...usos.entries()]
    .filter(([nome]) => !cadastro.has(nome))
    .map(([nome, u]) => ({ nome, usos: u.total, detalhe: u }))
    .sort((a, b) => b.usos - a.usos || a.nome.localeCompare(b.nome, 'pt-BR'))
}

// Lista da tela: cadastro ∪ nomes em uso, com a contagem e se está no cadastro.
export function listaFavorecidos(payees, usos) {
  const nomes = new Set([...(payees || []).map(nomeFavorecido).filter(Boolean), ...usos.keys()])
  const cadastro = new Set((payees || []).map(nomeFavorecido))
  return [...nomes]
    .map(nome => ({ nome, usos: usos.get(nome) || vazio(), noCadastro: cadastro.has(nome) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

// Critérios de seleção. `exato`: o favorecido é um dos nomes. `comecaCom`: o favorecido começa com
// a base (sem sufixo de parcela), sem diferenciar maiúsculas/acentos — pega "Yelumseg Parc2",
// "Yelumseg 8/12" e "Yelumseg".
export const criterioExato = (nomes) => {
  const set = new Set((nomes || []).map(nomeFavorecido))
  return (payee) => set.has(nomeFavorecido(payee))
}
export const criterioComecaCom = (base) => {
  const b = normText(baseDoFavorecido(base))
  return (payee) => {
    const p = normText(payee)
    return !!b && !!p && (p === b || p.startsWith(`${b} `))
  }
}

// Registros afetados por um critério, separados por tabela (a prévia mostra os três).
export function selecionarAlvos({ transactions = [], schedules = [], rules = [] }, criterio) {
  return {
    lancamentos: transactions.filter(t => nomeFavorecido(t.payee) && criterio(t.payee)),
    agendamentos: schedules.filter(s => nomeFavorecido(s.payee) && criterio(s.payee)),
    regras: rules.filter(r => nomeFavorecido(r.payee) && criterio(r.payee)),
  }
}

// Padrão de alias a partir dos nomes antigos: as bases distintas (sem sufixo de parcela).
export function padroesDeAlias(nomesAntigos) {
  const vistos = new Map()
  for (const n of nomesAntigos || []) {
    const base = baseDoFavorecido(n)
    if (base && !vistos.has(normText(base))) vistos.set(normText(base), base)
  }
  return [...vistos.values()]
}

// Aplica uma renomeação/mesclagem ao estado do app, numa passada só:
//   • payee = `para` nos lançamentos, agendamentos e regras escolhidos (descrição intocada);
//   • `para` entra no cadastro se não estiver;
//   • nomes antigos que ficaram sem uso saem do cadastro;
//   • com `alias`, grava padrão → favorecido para as próximas importações.
// `ids` = { lancamentos: [], agendamentos: [], regras: [] }.
export function aplicarRenomeacao(d, { para, ids, nomesAntigos = [], alias = false, novoAliasId }) {
  const novo = nomeFavorecido(para)
  if (!novo) return d
  const sel = {
    lancamentos: new Set(ids?.lancamentos || []),
    agendamentos: new Set(ids?.agendamentos || []),
    regras: new Set(ids?.regras || []),
  }
  const antigos = new Set((nomesAntigos || []).map(nomeFavorecido).filter(n => n && n !== novo))
  const troca = (lista, alvo) => lista.map(x => {
    if (!alvo.has(x.id)) return x
    antigos.add(nomeFavorecido(x.payee))
    return x.payee === novo ? x : { ...x, payee: novo }
  })
  const transactions = troca(d.transactions || [], sel.lancamentos)
  const schedules = troca(d.schedules || [], sel.agendamentos)
  const classificationRules = troca(d.classificationRules || [], sel.regras)
  antigos.delete(novo)
  antigos.delete('')

  const usos = contarUsos({ transactions, schedules, rules: classificationRules })
  let payees = (d.payees || []).filter(p => !(antigos.has(nomeFavorecido(p)) && !usos.has(nomeFavorecido(p))))
  if (!payees.some(p => nomeFavorecido(p) === novo)) payees = [...payees, novo]

  let favorecidoAliases = d.favorecidoAliases || []
  if (alias) {
    for (const padrao of padroesDeAlias([...antigos, novo])) {
      const i = favorecidoAliases.findIndex(a => normText(a.padrao) === normText(padrao))
      if (i >= 0) {
        if (favorecidoAliases[i].favorecido !== novo) {
          favorecidoAliases = favorecidoAliases.map((a, k) => (k === i ? { ...a, favorecido: novo } : a))
        }
      } else {
        favorecidoAliases = [...favorecidoAliases, { id: novoAliasId ? novoAliasId(padrao) : `alias_${normText(padrao)}`, padrao, favorecido: novo }]
      }
    }
  }
  return { ...d, transactions, schedules, classificationRules, payees, favorecidoAliases }
}

// Favorecido de um alias para a descrição base de uma linha importada. Casa a base inteira ou o
// começo dela por palavra ("Yelumseg" casa "Yelumseg Seguro"); vence o padrão mais longo.
export function favorecidoPorAlias(descricao, aliases) {
  const base = normText(baseDoFavorecido(descricao))
  if (!base) return null
  let melhor = null
  for (const a of aliases || []) {
    const p = normText(a.padrao)
    if (!p || !a.favorecido) continue
    if (base === p || base.startsWith(`${p} `)) {
      if (!melhor || p.length > normText(melhor.padrao).length) melhor = a
    }
  }
  return melhor?.favorecido || null
}

// Favorecido de uma linha importada, na ordem combinada:
//   regra de classificação > alias > série existente > favorecido do arquivo (Dindin) > descrição base.
export function favorecidoDaImportacao({ descricao, regra, aliases, serie, arquivo }) {
  return nomeFavorecido(regra)
    || favorecidoPorAlias(descricao, aliases)
    || nomeFavorecido(serie)
    || nomeFavorecido(arquivo)
    || baseDoFavorecido(descricao)
    || nomeFavorecido(descricao)
}
