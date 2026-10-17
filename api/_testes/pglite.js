import process from 'node:process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { _definirFabricaDePool } from '../_conexao.js'
import { _limparCacheAmbientes } from '../_central.js'

// SÓ PARA TESTES (pasta com "_": a Vercel não publica como rota).
// PGlite no lugar do Pool do pg, um por database, para simular o central e os ambientes.

export const SQL_CENTRAL = readFileSync(fileURLToPath(new URL('../../supabase/central/2026-10-17_ambientes.sql', import.meta.url)), 'utf-8')
export const URL_CENTRAL_TESTE = 'postgresql://teste:teste@localhost/central'

// PGlite (ou função que devolve o PGlite atual) → objeto com a cara do Pool do pg.
export function poolPGlite(dbOuGetter) {
  const db = () => (typeof dbOuGetter === 'function' ? dbOuGetter() : dbOuGetter)
  const run = async (sql, params = []) => {
    if (params.length) {
      const r = await db().query(sql, params)
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
    }
    const last = (await db().exec(sql)).at(-1) || { rows: [] }
    return { rows: last.rows, rowCount: last.affectedRows ?? last.rows.length }
  }
  return { query: run, connect: async () => ({ query: run, release() {} }) }
}

// `bancos`: { nomeDoDatabase: PGlite | () => PGlite }. 'central' é o banco central.
// Nome fora do mapa → erro (prova que nada cai num banco que o teste não declarou).
export function usarBancos(bancos, { ambientePadrao = 'vm' } = {}) {
  process.env.CENTRAL_DATABASE_URL = URL_CENTRAL_TESTE
  process.env.AMBIENTE_PADRAO = ambientePadrao
  _limparCacheAmbientes()
  _definirFabricaDePool((nome) => {
    if (!(nome in bancos)) throw new Error(`teste: database "${nome}" não existe`)
    return poolPGlite(bancos[nome])
  })
}

// Testes antigos (um PGlite só, _db.js mockado): o MESMO banco faz de central, com o ambiente 'vm'.
export async function prepararCentralNoMesmoBanco(getDb) {
  await getDb().exec(SQL_CENTRAL)
  usarBancos({ central: getDb })
}
