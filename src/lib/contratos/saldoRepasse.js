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
  const txPorId = new Map((transactions || []).map(t => [t.id, t]))
  const out = {}
  for (const s of schedules || []) {
    if (s.contratoId !== contrato?.id || (s.contratoPapel || 'aluguel') !== 'aluguel') continue
    if (!String(s.id || '').startsWith(`ctr_${contrato.id}_`)) continue
    const d = (s.registered || [])[0]
    if (!d) continue
    const id = s.registeredMeta?.[d]?.lancamento_id
    const tx = (id && txPorId.get(id)) || (transactions || []).find(t => t.scheduleId === s.id) || null
    out[competenciaDoId(s.id)] = r2(tx ? tx.amount : s.amount)
  }
  return out
}
