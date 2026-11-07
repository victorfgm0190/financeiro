// SALDO CORRENTE COM A ADMINISTRADORA (contrato a receber por administradora) — funções puras.
//   saldo da competência = saldo transportado da anterior + resultado da composição
//   saldo ≤ 0 → não há repasse: o saldo passa inteiro para a competência seguinte (nenhum
//              agendamento nem lançamento, nem de valor zero ou negativo);
//   saldo > 0 → repasse = saldo; transporta 0. Repasse já registrado com outro valor (sem ajuste na
//              composição): o valor real fica e a diferença (saldo − real) passa para a seguinte.
// Saldo inicial do contrato (saldo_inicial_adm, positivo = a administradora me deve) entra antes da
// competência saldo_inicial_competencia; as competências anteriores a ela ficam fora da conta.

// Competência da parcela gerada pelo id (ctr_<contrato>_<papel>_<AAAAMM>) — sem importar parcelas.js
// (que importa este arquivo).
const competenciaDoId = (id) => {
  const m = /_(\d{4})(\d{2})$/.exec(String(id || ''))
  return m ? `${m[1]}-${m[2]}` : null
}

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100
const POSITIVO = 0.005

// linhas: [{ competencia, resultado, repasseReal? }] em qualquer ordem.
// → mesmas linhas, em ordem, com { foraDoSaldo, saldo_anterior, saldo, repasse, transportado }.
export function calcularSaldos(contrato, linhas) {
  const ini = contrato?.saldo_inicial_competencia || null
  const saldoIni = r2(contrato?.saldo_inicial_adm)
  let anterior = ini ? null : 0
  return [...(linhas || [])].sort((a, b) => a.competencia.localeCompare(b.competencia)).map(l => {
    if (ini && l.competencia < ini) {
      return { ...l, foraDoSaldo: true, saldo_anterior: null, saldo: null, repasse: 0, transportado: null }
    }
    if (anterior == null) anterior = saldoIni
    const saldo = r2(anterior + (Number(l.resultado) || 0))
    const repasse = saldo > POSITIVO ? saldo : 0
    const real = l.repasseReal != null ? r2(l.repasseReal) : null
    const transportado = r2(saldo - (real ?? repasse))
    const out = { ...l, foraDoSaldo: false, saldo_anterior: anterior, saldo, repasse, transportado }
    anterior = transportado
    return out
  })
}

// Repasses já registrados (parcelas geradas pagas): { 'AAAA-MM': valor que caiu no banco }.
// O valor é o do lançamento da baixa; sem ele, o da parcela.
export function repassesRegistrados(contrato, schedules, transactions = []) {
  const out = {}
  for (const [k, r] of Object.entries(repassesComData(contrato, schedules, transactions))) out[k] = r.valor
  return out
}

// Idem, com a data em que o dinheiro caiu (a do lançamento; sem ele, a da baixa):
// { 'AAAA-MM': { valor, data } }.
export function repassesComData(contrato, schedules, transactions = []) {
  const txPorId = new Map((transactions || []).map(t => [t.id, t]))
  const out = {}
  for (const s of schedules || []) {
    if (s.contratoId !== contrato?.id || (s.contratoPapel || 'aluguel') !== 'aluguel') continue
    if (!String(s.id || '').startsWith(`ctr_${contrato.id}_`)) continue
    const d = (s.registered || [])[0]
    if (!d) continue
    const id = s.registeredMeta?.[d]?.lancamento_id
    const tx = (id && txPorId.get(id)) || (transactions || []).find(t => t.scheduleId === s.id) || null
    out[competenciaDoId(s.id)] = { valor: r2(tx ? tx.amount : s.amount), data: (tx?.date || d || '').slice(0, 10) }
  }
  return out
}

// Competências que o repasse de `competencia` quita: as desde o repasse anterior (as sem repasse
// tiveram o saldo transportado até aqui) até ela. → linhas (em ordem) ou null.
export function blocoDoRepasse(linhas, competencia) {
  const i = (linhas || []).findIndex(l => l.competencia === competencia)
  if (i < 0 || linhas[i].foraDoSaldo) return null
  let ini = i
  while (ini > 0 && !linhas[ini - 1].foraDoSaldo && !(linhas[ini - 1].repasse > 0) && linhas[ini - 1].repasseReal == null) ini--
  return linhas.slice(ini, i + 1)
}

// RECEBIMENTO ABERTO PELA COMPOSIÇÃO (relatórios em "visão por composição"): o repasse da competência
// `competencia`, recebido com `valor`, é a soma de tudo o que ele quitou — os itens das competências
// desde o repasse anterior (inclusive as sem repasse, cujo saldo foi transportado até aqui), o saldo
// que vinha de antes (saldo inicial ou diferença de um repasse anterior) e a diferença deste repasse
// (valor real − calculado). A soma das partes é sempre o valor recebido.
//   linhas: competenciasDoRepasse do contrato.
// → [{ tipo, descricao, valor, categoria_id, competencia }] ou null (competência fora da conta).
export function composicaoDoRecebimento(linhas, competencia, valor) {
  const bloco = blocoDoRepasse(linhas, competencia)
  if (!bloco) return null
  const out = bloco.flatMap(l => (l.itens || []).map(it => ({
    tipo: it.tipo, descricao: it.descricao, valor: r2(it.valor), categoria_id: it.categoria_id || null, competencia: l.competencia,
  })))
  const antes = r2(bloco[0].saldo_anterior)
  if (Math.abs(antes) > POSITIVO) out.push({ tipo: 'saldo_anterior', descricao: 'Saldo anterior com a administradora', valor: antes, categoria_id: null, competencia: bloco[0].competencia })
  const soma = r2(out.reduce((a, x) => a + x.valor, 0))
  const dif = r2(Number(valor) - soma)
  if (Math.abs(dif) > POSITIVO) out.push({ tipo: 'diferenca', descricao: 'Diferença no repasse', valor: dif, categoria_id: null, competencia })
  return out
}
