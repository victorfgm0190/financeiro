// Importar Fatura — filtro de EXIBIÇÃO da revisão: Pendentes (pede ação ou conferência) ×
// Conciliados (já bate com um lançamento do banco e não pede nada) × Todos. Só lê as marcas que a
// revisão já pôs na linha (lib/revisaoImportacao.js, lib/casamentoFatura.js); o casamento não muda.
// PURO; o filtro lembrado fica no localStorage por ambiente e usuário (try/catch).

export const FILTROS_REVISAO = ['pendentes', 'conciliados', 'todos']

// Conciliada = já bate e não pede nada:
//   • "✔ Já lançado" / pré-lançamento casado (_jaLancado), inclusive o escolhido entre opções;
//   • "No banco ✓" (colisão sem nenhuma diferença) e "É o mesmo ↻" já confirmado;
//   • "🔴 Já existe" (mesma fatura, valor, descrição-base e parcela).
// Fica pendente se houver aviso "Também em" outra fatura. Todo o resto é pendente: novo, possível
// duplicata, "No banco ↻" com diferença a decidir, "para escolher", estorno, baixa de agendamento.
// `mudancas(row)`: diferenças da colisão (o mudancasColisao do ImportPanel).
export function linhaConciliada(row, { mudancas = () => [] } = {}) {
  if (row._tambemEm?.length) return false
  if (row._jaLancado) return true
  if (row._collisionTx) return !!row._mesmoConfirmado || mudancas(row).length === 0
  return row._dupLevel === 'certeza'
}

export function contarRevisao(rows, opcoes) {
  let conciliados = 0
  for (const r of rows) if (linhaConciliada(r, opcoes)) conciliados++
  return { pendentes: rows.length - conciliados, conciliados, todos: rows.length }
}

export function filtrarRevisao(rows, filtro, opcoes) {
  if (filtro === 'todos') return rows
  const querConciliada = filtro === 'conciliados'
  return rows.filter(r => linhaConciliada(r, opcoes) === querConciliada)
}

// Filtro ao abrir uma fatura: Pendentes sempre que houver pendência; sem pendência, o último
// escolhido pelo usuário (Pendentes mostra "Tudo conciliado").
export const filtroAoAbrir = (pendentes, lembrado) =>
  (pendentes > 0 || !FILTROS_REVISAO.includes(lembrado) ? 'pendentes' : lembrado)

const chave = (sessao) => `finup_filtro_revisao_fatura_${String(sessao?.ambSigla || 'vm').toLowerCase()}_${sessao?.id || 'anon'}`
export function lerFiltroLembrado(sessao, storage = globalThis.localStorage) {
  try { return storage?.getItem(chave(sessao)) || null } catch { return null }
}
export function lembrarFiltro(sessao, filtro, storage = globalThis.localStorage) {
  try { storage?.setItem(chave(sessao), filtro) } catch { /* sem storage: não lembra */ }
}
