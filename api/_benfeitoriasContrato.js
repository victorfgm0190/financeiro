import { genId, num, round2 } from './_bem.js'

// BENFEITORIA DO CONTRATO NO CUSTO DO BEM (contrato a receber por administradora). Um item
// 'benfeitoria' da composição de uma competência, com "somar ao custo do bem" e bem ligado ao
// contrato, vira UMA linha em bem_baixas (tipo 'benfeitoria'), sem lançamento de caixa, e soma no
// saldo do bem — como as demais baixas sem movimento em conta. A linha é ligada ao item pela
// origem_ref 'ctr:<contrato>:<AAAA-MM>:<chave>' (índice único): editar o valor atualiza, excluir o
// item ou desmarcar remove, mudar o bem do contrato move. Nunca duplica.

const fmtYm = (ym) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`
const escaparLike = (s) => String(s).replace(/[\\%_]/g, '\\$&')
const refItem = (contratoId, competencia, chave) => `ctr:${contratoId}:${competencia}:${chave}`

export async function temBenfeitoriaNoBem(q) {
  const [r] = await q(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
    AND table_name = 'bem_baixas' AND column_name = 'origem_ref') AS tem`)
  return !!r?.tem
}

async function moverSaldo(q, bemId, delta, tocados) {
  if (!delta) return
  const [c] = await q('UPDATE contas SET balance = COALESCE(balance, 0) + $2 WHERE id = $1 RETURNING id, balance', [bemId, round2(delta)])
  if (c) tocados.set(c.id, num(c.balance))
}

const rotulo = (c) => c?.objeto || (c?.numero ? `Contrato ${c.numero}` : '') || c?.favorecido || 'Contrato'

// Benfeitorias que a competência deve ter no bem: [{ ref, valor, descricao, categoria_id }].
export function benfeitoriasDesejadas(contrato, competencia, itens) {
  if (!contrato?.bem_id) return []
  return (itens || [])
    .filter(i => i.tipo === 'benfeitoria' && i.somar_ao_bem && Math.abs(Number(i.valor) || 0) > 0.004)
    .map(i => ({
      ref: refItem(contrato.id, competencia, i.chave),
      valor: round2(Math.abs(Number(i.valor))),
      descricao: `Benfeitoria — contrato ${rotulo(contrato)}, competência ${fmtYm(competencia)}${i.descricao ? ` · ${i.descricao}` : ''}`,
      categoria_id: i.categoria_id || null,
    }))
}

// Acerta as linhas do bem de UMA competência com os itens dela (itens = [] remove todas).
// → Map(bemId → saldo novo) dos bens que mudaram.
export async function sincronizarBenfeitorias(q, contrato, competencia, itens, tocados = new Map()) {
  if (!(await temBenfeitoriaNoBem(q))) return tocados
  const existentes = await q(
    `SELECT id, bem_id, valor, descricao, origem_ref FROM bem_baixas
      WHERE origem_ref LIKE $1 AND estornado_em IS NULL`,
    [`${escaparLike(`ctr:${contrato.id}:${competencia}:`)}%`],
  )
  // Bem ligado precisa existir e ser bem (asset); senão nada soma (a marcação fica guardada).
  const [bem] = contrato.bem_id ? await q(`SELECT id FROM contas WHERE id = $1 AND type = 'asset'`, [contrato.bem_id]) : []
  const desejadas = bem ? benfeitoriasDesejadas(contrato, competencia, itens) : []
  const porRef = new Map(desejadas.map(d => [d.ref, d]))
  const mantidas = new Set()
  for (const e of existentes) {
    const d = porRef.get(e.origem_ref)
    if (!d || e.bem_id !== bem?.id) {
      await q('DELETE FROM bem_baixas WHERE id = $1', [e.id])
      await moverSaldo(q, e.bem_id, -num(e.valor), tocados)
      continue
    }
    mantidas.add(d.ref)
    if (round2(num(e.valor)) !== d.valor || e.descricao !== d.descricao) {
      await q('UPDATE bem_baixas SET valor = $2, descricao = $3, categoria_id = $4 WHERE id = $1', [e.id, d.valor, d.descricao, d.categoria_id])
      await moverSaldo(q, e.bem_id, d.valor - num(e.valor), tocados)
    }
  }
  for (const d of desejadas) {
    if (mantidas.has(d.ref)) continue
    await q(
      `INSERT INTO bem_baixas (id, bem_id, tipo, data, valor, quantidade_parcelas, favorecido, categoria_id, descricao, origem_ref)
       VALUES ($1, $2, 'benfeitoria', $3, $4, 0, $5, $6, $7, $8)`,
      [genId('bbx'), bem.id, `${competencia}-01`, d.valor, contrato.contraparte_nome || null, d.categoria_id, d.descricao, d.ref],
    )
    await moverSaldo(q, bem.id, d.valor, tocados)
  }
  return tocados
}

// Todas as competências do contrato (troca do bem ligado): refaz cada uma pelo que está gravado.
export async function sincronizarBenfeitoriasDoContrato(q, contrato) {
  const tocados = new Map()
  if (!(await temBenfeitoriaNoBem(q)) || !(await q("SELECT to_regclass('contrato_competencias') IS NOT NULL AS t"))[0]?.t) return tocados
  const linhas = await q('SELECT competencia, itens FROM contrato_competencias WHERE contrato_id = $1', [contrato.id])
  for (const l of linhas) await sincronizarBenfeitorias(q, contrato, l.competencia, Array.isArray(l.itens) ? l.itens : [], tocados)
  return tocados
}

// Contrato excluído: as benfeitorias dele saem dos bens.
export async function removerBenfeitoriasDoContrato(q, contratoId) {
  const tocados = new Map()
  if (!(await temBenfeitoriaNoBem(q))) return tocados
  const linhas = await q(`SELECT id, bem_id, valor FROM bem_baixas WHERE origem_ref LIKE $1 AND estornado_em IS NULL`, [`${escaparLike(`ctr:${contratoId}:`)}%`])
  for (const e of linhas) {
    await q('DELETE FROM bem_baixas WHERE id = $1', [e.id])
    await moverSaldo(q, e.bem_id, -num(e.valor), tocados)
  }
  return tocados
}

export const bensDoMapa = (tocados) => [...tocados].map(([id, saldo]) => ({ id, saldo }))
