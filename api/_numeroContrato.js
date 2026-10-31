import { planoMigracaoNumeroContrato } from '../src/lib/contratos/numero.js'
import { inserirHistorico } from './_historico.js'

// MIGRAÇÃO do nº do contrato que o Assistente gravava no texto ("Academia X · Contrato nº 12345" na
// descrição do agendamento; "… · Contrato nº 12345" na observação/descrição do lançamento) para o
// campo próprio numero_contrato, limpando o texto. Cada mudança vai para historico_alteracoes
// (autor 'sistema', mesmo lote). Genérica: roda em qualquer ambiente (scripts/migrar-numero-contrato.mjs).
//   executar=false → só o plano (SELECT). executar=true → UPDATE de cada linha com guarda (o texto ainda
//   é o lido; senão a linha é pulada) + histórico, tudo com o `q` da transação de quem chama.
export const MOTIVO_MIGRACAO = 'Nº do contrato saiu da descrição para o campo próprio'
const FILTRO = "~* 'contrato\\s+n'"

export async function planejarMigracaoNumeroContrato(q) {
  const ags = await q(`SELECT id, description, numero_contrato FROM agendamentos WHERE description ${FILTRO}`)
  const lcs = await q(`SELECT id, description, notes, numero_contrato FROM lancamentos WHERE description ${FILTRO} OR notes ${FILTRO}`)
  return {
    agendamentos: planoMigracaoNumeroContrato(ags, { campos: ['description'] }),
    lancamentos: planoMigracaoNumeroContrato(lcs, { campos: ['description', 'notes'] }),
    antes: { agendamentos: new Map(ags.map(r => [r.id, r])), lancamentos: new Map(lcs.map(r => [r.id, r])) },
  }
}

export async function aplicarMigracaoNumeroContrato(q, plano, { loteId }) {
  const feitos = { agendamentos: 0, lancamentos: 0, pulados: [] }
  const historico = []
  for (const tabela of ['agendamentos', 'lancamentos']) {
    const entidade = tabela === 'agendamentos' ? 'agendamento' : 'lancamento'
    for (const m of plano[tabela].mudar) {
      const antes = plano.antes[tabela].get(m.id)
      const cols = Object.keys(m.campos)
      const sets = cols.map((c, i) => `${c} = $${i + 2}`)
      // Guarda: só se o texto ainda é o lido no plano (o app pode ter editado no meio tempo).
      const guardas = cols.filter(c => c !== 'numero_contrato').map((c, i) => `${c} IS NOT DISTINCT FROM $${cols.length + 2 + i}`)
      const params = [m.id, ...cols.map(c => m.campos[c]), ...cols.filter(c => c !== 'numero_contrato').map(c => antes[c])]
      const r = await q(`UPDATE ${tabela} SET ${sets.join(', ')} WHERE id = $1 AND ${guardas.join(' AND ')} RETURNING id`, params)
      if (!r.length) { feitos.pulados.push(`${tabela}:${m.id}`); continue }
      feitos[tabela] += 1
      for (const h of m.historico) {
        historico.push({
          entidade, entidade_id: m.id, ocorrencia_data: null, serie_key: null, lote_id: loteId,
          escopo: entidade === 'agendamento' ? 'serie' : 'parcela', campo: h.campo,
          valor_anterior: h.de, valor_novo: h.para, motivo: MOTIVO_MIGRACAO, autor: 'sistema',
        })
      }
    }
  }
  await inserirHistorico(q, historico)
  return { ...feitos, historico: historico.length }
}
