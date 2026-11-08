// BUSCA DE REPASSES JÁ LANÇADOS (Etapa 6): contrato de repasse com competências passadas — na conta
// do contrato podem já existir os recebimentos da administradora, lançados à mão antes do contrato.
// Para cada competência com repasse ainda sem baixa, procura o lançamento provável; o usuário confirma,
// troca ou pula cada um. NUNCA vincula sozinho (isto só sugere).
//   Lançamento candidato: receita livre (sem contrato, sem baixa de agendamento) na CONTA do contrato;
//   favorecido (ou descrição) parecido com o da administradora; valor igual ao repasse calculado/
//   conferido (exato ou até ±5%); data a até 7 dias do dia do repasse.
import { mapaVinculos } from '../vinculo.js'
import { lancamentoLivre, similaridadeNome } from './vinculo.js'
import { r2 } from './parcelas.js'

export const TOLERANCIA_VALOR = 0.05
export const JANELA_DIAS = 7
const SEMELHANTE = 0.6
const diasEntre = (a, b) => Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000)
const somarDias = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

// Competência do repasse que ainda espera o recebimento: com repasse, dentro da conta do saldo, sem
// baixa (nem repasse real registrado) e com o dia do repasse já chegado (até a janela).
export const repasseEmAberto = (l, hoje) => !!l && !l.foraDoSaldo && l.repasse > 0 && !l.paga && l.repasseReal == null
  && !!l.vencimento && l.vencimento <= somarDias(hoje, JANELA_DIAS)

// Candidatos de UMA competência, do mais provável ao menos: valor exato antes, depois o mais perto do
// valor, depois a data mais perto. → [{ tx, motivos, dias, difValor }]
export function candidatosRepasse(contrato, linha, transactions, { vinculados } = {}) {
  const valor = r2(linha.repasse)
  const out = []
  for (const tx of transactions || []) {
    if (!lancamentoLivre(tx, contrato, { vinculados })) continue
    const sim = Math.max(similaridadeNome(tx.payee, contrato.favorecido), similaridadeNome(tx.description, contrato.favorecido))
    if (sim < SEMELHANTE) continue
    const difValor = r2(Number(tx.amount) - valor)
    if (!(valor > 0) || Math.abs(difValor) / valor > TOLERANCIA_VALOR + 1e-9) continue
    const dias = diasEntre(tx.date, linha.vencimento)
    if (dias > JANELA_DIAS) continue
    const motivos = [
      sim >= 0.99 ? 'favorecido igual' : 'favorecido parecido',
      Math.abs(difValor) < 0.005 ? 'mesmo valor' : `valor ${difValor > 0 ? '+' : ''}${String(difValor).replace('.', ',')} (até ±5%)`,
      dias === 0 ? 'no dia do repasse' : `${dias} dia(s) do repasse`,
    ]
    out.push({ tx, motivos, dias, difValor })
  }
  return out.sort((a, b) => (Math.abs(a.difValor) < 0.005 ? 0 : 1) - (Math.abs(b.difValor) < 0.005 ? 0 : 1)
    || Math.abs(a.difValor) - Math.abs(b.difValor) || a.dias - b.dias || String(a.tx.date).localeCompare(String(b.tx.date)))
}

// Busca para o contrato inteiro. linhas: competenciasDoRepasse com `paga` (TabelaRepasse).
// → [{ competencia, vencimento, valor, conferida, linha, candidatos, sugestao (txId | null) }] em ordem
//   de competência; um lançamento é sugerido para uma competência só (a primeira em que cabe).
export function buscarRepassesLancados(contrato, linhas, schedules, transactions, { hoje }) {
  const vinculados = mapaVinculos(schedules || [])
  const usados = new Set()
  const out = []
  for (const l of linhas || []) {
    if (!repasseEmAberto(l, hoje)) continue
    const candidatos = candidatosRepasse(contrato, l, transactions, { vinculados })
    const sug = candidatos.find(c => !usados.has(c.tx.id)) || null
    if (sug) usados.add(sug.tx.id)
    out.push({
      competencia: l.competencia, vencimento: l.vencimento, valor: r2(l.repasse), conferida: !!l.linha?.conferencia,
      linha: l, candidatos, sugestao: sug ? sug.tx.id : null,
    })
  }
  return out
}

// Status da competência passada sem baixa: lançamento encontrado na conta (falta vincular) ou não.
export const TEXTO_NAO_ENCONTRADO = 'Pendente — não encontrado na conta'
export const TEXTO_FALTA_VINCULAR = 'Lançado na conta — falta vincular'
