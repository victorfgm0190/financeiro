// Seed do primeiro administrador (ETAPA 1 da comercialização).
// Cria, se ainda não existirem: a organização "Victor", o usuário "vmoreira" (com e-mail e senha bcrypt
// custo 12, digitados no terminal) e o vínculo dele como 'admin' na organização. Rodar de novo não
// duplica nada e NÃO troca a senha de um usuário que já existe (para isso: Configurações › Usuários).
// Se o usuário já existe sem e-mail, o e-mail digitado é gravado.
//
// A senha nunca vai para arquivo, log ou argumento de linha de comando: só é lida do teclado (sem eco)
// e só o hash chega ao banco.
//
// Pré-requisito: migração supabase/migrations/2026-10-14_usuarios.sql aplicada no Neon.
// Uso (PowerShell ou terminal, na raiz do projeto):
//   node --env-file=.env.local scripts/seed-admin.js

import pg from 'pg'
import readline from 'node:readline'
import bcrypt from 'bcryptjs'
import { BCRYPT_CUSTO, SENHA_MIN } from '../api/_usuarios.js'

const ORG_NOME = 'Victor'
const USERNAME = 'vmoreira'
const NOME = 'Victor'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

if (!process.env.NEON_DATABASE_URL) {
  console.error('✖ NEON_DATABASE_URL não definida. Rode com: node --env-file=.env.local scripts/seed-admin.js')
  process.exit(1)
}

function perguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(texto, (r) => { rl.close(); resolve(r) }))
}

// Lê uma linha sem mostrar o que é digitado (mostra * por caractere).
function perguntarOculto(texto) {
  if (!process.stdin.isTTY) {
    console.error('\n✖ Rode num terminal interativo (a senha é digitada, nunca passada por pipe/arquivo).')
    process.exit(1)
  }
  return new Promise((resolve) => {
    process.stdout.write(texto)
    const stdin = process.stdin
    let valor = ''
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.removeListener('data', onData)
          process.stdout.write('\n')
          return resolve(valor)
        }
        if (c === '\u0003') { process.stdout.write('\n'); process.exit(130) } // Ctrl+C
        if (c === '\u007f' || c === '\b') {
          if (valor.length) { valor = valor.slice(0, -1); process.stdout.write('\b \b') }
          continue
        }
        valor += c
        process.stdout.write('*')
      }
    }
    stdin.on('data', onData)
  })
}

const pool = new pg.Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 })

async function main() {
  const host = (() => { try { return new URL(process.env.NEON_DATABASE_URL).host } catch { return '?' } })()
  console.log(`\nBanco: ${host}\n`)

  const { rows: [t] } = await pool.query(
    "SELECT to_regclass('organizacoes') AS o, to_regclass('usuarios') AS u, to_regclass('membros') AS m",
  )
  if (!t.o || !t.u || !t.m) {
    console.error('✖ Tabelas organizacoes/usuarios/membros não encontradas. Rode antes a migração supabase/migrations/2026-10-14_usuarios.sql.')
    process.exit(1)
  }

  const { rows: [org] } = await pool.query('SELECT id FROM organizacoes WHERE nome = $1 ORDER BY created_at, id LIMIT 1', [ORG_NOME])
  const { rows: [user] } = await pool.query('SELECT id, ativo, email FROM usuarios WHERE username = $1', [USERNAME])
  const { rows: [membro] } = org && user
    ? await pool.query('SELECT papel FROM membros WHERE usuario_id = $1 AND organizacao_id = $2', [user.id, org.id])
    : { rows: [] }

  if (org && user?.email && membro?.papel === 'admin') {
    console.log(`✔ Tudo já estava criado (organização ${org.id}, usuário "${USERNAME}" <${user.email}>, papel admin). Nenhuma alteração feita.`)
    return
  }

  // E-mail: pedido quando o usuário vai ser criado ou ainda não tem e-mail.
  let email = user?.email || null
  if (!email) {
    email = (await perguntar(`E-mail do usuário "${USERNAME}" (também serve para entrar): `)).trim().toLowerCase()
    if (!EMAIL_RE.test(email)) { console.error('✖ E-mail inválido.'); process.exit(1) }
    const { rows: [dono] } = await pool.query('SELECT username FROM usuarios WHERE lower(email) = $1', [email])
    if (dono && dono.username !== USERNAME) { console.error(`✖ Esse e-mail já é do usuário "${dono.username}".`); process.exit(1) }
  }

  let senhaHash = null
  if (!user) {
    console.log(`\nSenha do usuário "${USERNAME}" (mínimo ${SENHA_MIN} caracteres; não aparece na tela):`)
    const s1 = await perguntarOculto('  Senha: ')
    if (s1.length < SENHA_MIN) { console.error(`✖ A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`); process.exit(1) }
    const s2 = await perguntarOculto('  Repita a senha: ')
    if (s1 !== s2) { console.error('✖ As senhas não conferem.'); process.exit(1) }
    process.stdout.write('  Gerando hash (bcrypt custo 12)… ')
    senhaHash = await bcrypt.hash(s1, BCRYPT_CUSTO)
    console.log('ok')
  }

  console.log('\nPreview:')
  console.log(`  • Organização "${ORG_NOME}": ${org ? `já existe (id ${org.id}) — nada a fazer` : 'será CRIADA'}`)
  if (user) {
    console.log(`  • Usuário "${USERNAME}": já existe (id ${user.id}${user.ativo ? '' : ', INATIVO'}) — senha NÃO será alterada`)
    console.log(`  • E-mail: ${user.email ? `${user.email} — nada a fazer` : `${email} — será GRAVADO`}`)
  } else {
    console.log(`  • Usuário "${USERNAME}" (nome "${NOME}", e-mail ${email}): será CRIADO com a senha digitada`)
  }
  console.log(`  • Vínculo admin na organização: ${membro ? (membro.papel === 'admin' ? 'já existe — nada a fazer' : `existe como "${membro.papel}" — será PROMOVIDO a admin`) : 'será CRIADO'}`)

  const ok = await perguntar('\nConfirmar e gravar no banco? (s/N) ')
  if (!/^s(im)?$/i.test(ok.trim())) {
    console.log('Cancelado. Nada foi gravado.')
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let orgId = org?.id
    if (!orgId) {
      ;({ rows: [{ id: orgId }] } = await client.query('INSERT INTO organizacoes (nome) VALUES ($1) RETURNING id', [ORG_NOME]))
    }
    let userId = user?.id
    if (!userId) {
      ;({ rows: [{ id: userId }] } = await client.query(
        `INSERT INTO usuarios (username, nome, email, senha_hash, updated_at) VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username RETURNING id`,
        [USERNAME, NOME, email, senhaHash],
      ))
    } else if (!user.email) {
      await client.query('UPDATE usuarios SET email = $2, updated_at = now() WHERE id = $1 AND email IS NULL', [userId, email])
    }
    await client.query(
      `INSERT INTO membros (usuario_id, organizacao_id, papel) VALUES ($1, $2, 'admin')
       ON CONFLICT (usuario_id, organizacao_id) DO UPDATE SET papel = 'admin'`,
      [userId, orgId],
    )
    await client.query('COMMIT')
    console.log(`\n✔ Pronto. Organização ${orgId} · usuário "${USERNAME}" <${email}> (${userId}) · papel admin.`)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

main()
  .catch((err) => { console.error('✖ Falhou:', err.message); process.exitCode = 1 })
  .finally(() => pool.end())
