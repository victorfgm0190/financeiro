// BOLETO RECEBIDO NO ASSISTENTE → PARCELA DE CONDOMÍNIO ABERTA — função pura.
// O Assistente leu um boleto (criar_agendamento / registrar_lancamento / baixa). Procura, entre as
// parcelas de condomínio PENDENTES dos contratos ativos, a que corresponde a ele:
//   • data: vencimento do boleto a até 7 dias do vencimento da parcela;
//   • nome: favorecido/descrição do boleto parecido com o favorecido do condomínio (ou do contrato);
//   • valor: até 25% de diferença do valor pendente da parcela.
// Forte = data + (nome ou valor), e uma só parcela assim → "Informar composição nesta parcela".
// Parecida = só um critério → apenas sugerir. Nada é gravado aqui.
import { normalizarTexto } from './composicao.js'
import { ehCondominioAberto, vencimentoParcela } from './composicaoAberta.js'
import { ehParcelaGerada, parcelaPaga } from './parcelas.js'

const dias = (a, b) => Math.round((new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 86400000)

const parecido = (a, b) => {
  const x = normalizarTexto(a)
  const y = normalizarTexto(b)
  if (x.length < 3 || y.length < 3) return false
  if (x.includes(y) || y.includes(x)) return true
  const palavras = (t) => t.split(/[^a-z0-9]+/).filter(p => p.length >= 4)
  const py = new Set(palavras(y))
  return palavras(x).some(p => py.has(p))
}

// boleto: { vencimento, valor, nome } → { forte: { parcela, contrato } | null, parecidas: [...] }
export function parcelaDoBoleto(boleto, contratos, schedules) {
  const out = []
  for (const contrato of contratos || []) {
    if (contrato.status !== 'ativo' || !contrato.tem_condominio) continue
    for (const s of schedules || []) {
      if (s.contratoId !== contrato.id || !ehCondominioAberto(s, contrato)) continue
      const venc = vencimentoParcela(s)
      const data = !!boleto?.vencimento && Math.abs(dias(boleto.vencimento, venc)) <= 7
      const nome = !!boleto?.nome && [contrato.favorecido_condominio, s.payee, contrato.favorecido, contrato.objeto].some(n => n && parecido(boleto.nome, n))
      const v = Number(boleto?.valor)
      const valor = v > 0 && Number(s.amount) > 0 && Math.abs(v - Number(s.amount)) <= 0.25 * Number(s.amount)
      const pontos = (data ? 2 : 0) + (nome ? 1 : 0) + (valor ? 1 : 0)
      if (pontos) out.push({ parcela: s, contrato, data, nome, valor, pontos })
    }
  }
  out.sort((a, b) => b.pontos - a.pontos || String(vencimentoParcela(a.parcela)).localeCompare(String(vencimentoParcela(b.parcela))))
  const fortes = out.filter(c => c.data && (c.nome || c.valor))
  return {
    forte: fortes.length === 1 ? { parcela: fortes[0].parcela, contrato: fortes[0].contrato } : null,
    parecidas: (fortes.length === 1 ? out.filter(c => c !== fortes[0]) : out).slice(0, 3).map(c => ({ parcela: c.parcela, contrato: c.contrato })),
  }
}

// Parâmetros do Assistente (criar_agendamento / registrar_lancamento / baixa) → dados do boleto.
export function boletoDosParametros(p = {}) {
  return {
    vencimento: p.documento?.vencimento || p.vencimento || p.data || null,
    valor: Number(p.valor) || null,
    nome: p.favorecido_id || p.favorecido_novo || p.favorecido || p.descricao || '',
  }
}

// RECIBO DE ALUGUEL recebido no Assistente → parcela PRINCIPAL (aluguel) gerada pelo contrato,
// pendente ou já paga (o recibo costuma chegar depois do pagamento). Mesmos critérios (data ±7 dias,
// nome do favorecido, valor ±25%); paga compara com a data e o valor do pagamento.
// → { forte: { parcela, contrato, txId } | null, parecidas: [...] }
export function parcelaAluguelDoRecibo(boleto, contratos, schedules, transactions = []) {
  const txPorId = new Map((transactions || []).map(t => [t.id, t]))
  const out = []
  for (const contrato of contratos || []) {
    if (contrato.status !== 'ativo') continue
    for (const s of schedules || []) {
      if (s.contratoId !== contrato.id || (s.contratoPapel || 'aluguel') !== 'aluguel' || !ehParcelaGerada(s, contrato.id)) continue
      const paga = parcelaPaga(s)
      const txId = paga ? s.registeredMeta?.[s.startDate]?.lancamento_id || null : null
      const tx = txId ? txPorId.get(txId) : null
      if (paga && !tx) continue
      const ref = tx ? tx.date : vencimentoParcela(s)
      const base = tx ? Number(tx.amount) : Number(s.amount)
      const data = !!boleto?.vencimento && Math.abs(dias(boleto.vencimento, ref)) <= 7
      const nome = !!boleto?.nome && [contrato.favorecido, s.payee, contrato.objeto].some(n => n && parecido(boleto.nome, n))
      const v = Number(boleto?.valor)
      const valor = v > 0 && base > 0 && Math.abs(v - base) <= 0.25 * base
      const pontos = (data ? 2 : 0) + (nome ? 1 : 0) + (valor ? 1 : 0)
      if (pontos) out.push({ parcela: s, contrato, txId: tx?.id || null, data, nome, valor, pontos })
    }
  }
  out.sort((a, b) => b.pontos - a.pontos)
  const fortes = out.filter(c => c.data && (c.nome || c.valor))
  const so = (c) => ({ parcela: c.parcela, contrato: c.contrato, txId: c.txId })
  return {
    forte: fortes.length === 1 ? so(fortes[0]) : null,
    parecidas: (fortes.length === 1 ? out.filter(c => c !== fortes[0]) : out).slice(0, 3).map(so),
  }
}
