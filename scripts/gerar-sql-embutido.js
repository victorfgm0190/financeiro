// Embute o SQL de supabase/estrutura_base.sql e supabase/migrations/*.sql em api/_sqlEmbutido.js.
// A API (provisionamento na Vercel) não lê arquivos fora do bundle: usa este módulo. O teste
// api/provisionar.test.js falha se ele estiver desatualizado em relação aos .sql.
// Uso: node scripts/gerar-sql-embutido.js

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('../supabase/', import.meta.url))
const estrutura = readFileSync(raiz + 'estrutura_base.sql', 'utf-8')
const migracoes = readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql')).sort()
  .map(nome => ({ nome, sql: readFileSync(raiz + 'migrations/' + nome, 'utf-8') }))

const js = `// GERADO por scripts/gerar-sql-embutido.js — não editar à mão.
// Cópia de supabase/estrutura_base.sql e supabase/migrations/*.sql (em ordem de nome).

export const ESTRUTURA_BASE = ${JSON.stringify(estrutura)}

export const MIGRACOES = ${JSON.stringify(migracoes, null, 1)}
`
writeFileSync(fileURLToPath(new URL('../api/_sqlEmbutido.js', import.meta.url)), js)
console.log(`✔ api/_sqlEmbutido.js — estrutura + ${migracoes.length} migrações`)
