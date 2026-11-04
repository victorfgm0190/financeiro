// GRAVAR VÍNCULO — tudo ou nada.
// "Vincular pagamento" mexe em três lugares: a parcela (criada já paga, ou a pendente baixada), o
// lançamento (data da ocorrência, contrato e composição) e a linha do tempo do contrato (evento).
// Parcela e lançamento vão ao banco pela fila do sync; o evento, pela rota própria. Ordem:
//   1. aplicar()      — muda o estado do app (parcela + lançamento);
//   2. persistir()    — espera essas linhas chegarem ao banco ({ ok } | { ok: false, erro });
//   3. registrarEvento() — só com a parcela gravada;
//   4. depois()       — efeitos que não fazem parte do vínculo (pós-efetivação do contrato).
// Falhou 2 ou 3: desfazer() volta o estado e manda a volta ao banco; o erro sobe para o modal.
// O evento nunca é gravado sem a parcela.

export const ERRO_VINCULO = 'O vínculo não foi gravado'

export async function gravarVinculoNaLinha({ aplicar, persistir, desfazer, registrarEvento, depois = null }) {
  aplicar()
  let r
  try { r = await persistir() } catch (err) { r = { ok: false, erro: err?.message } }
  if (!r?.ok) {
    await desfazerSemFalhar(desfazer)
    throw new Error(`${ERRO_VINCULO}: ${r?.erro || 'o servidor não confirmou'}. Nada foi alterado; tente de novo.`)
  }
  try {
    await registrarEvento()
  } catch (err) {
    await desfazerSemFalhar(desfazer)
    throw new Error(`${ERRO_VINCULO}: a linha do tempo do contrato não respondeu (${err?.message || 'erro'}). Nada foi alterado; tente de novo.`, { cause: err })
  }
  try { depois?.() } catch (err) { console.warn('[contratos] pós-vínculo:', err?.message || err) }
}

const desfazerSemFalhar = async (desfazer) => {
  try { await desfazer() } catch (err) { console.error('[contratos] desfazer vínculo não gravado:', err?.message || err) }
}

// Mesma competência e mesmo lançamento já ligados: não grava de novo (nem parcela, nem evento).
//   schedules: estado atual; parcelaId: id determinístico da competência.
// → null (pode gravar) | mensagem
export function vinculoRepetido(schedules, { parcelaId, txId }) {
  const s = (schedules || []).find(x => x.id === parcelaId)
  if (!s) return null
  const ligado = Object.values(s.registeredMeta || {}).some(m => m?.lancamento_id === txId)
  return ligado ? 'Este pagamento já está vinculado a esta parcela.' : 'Esta competência já tem parcela: atualize a ficha.'
}
