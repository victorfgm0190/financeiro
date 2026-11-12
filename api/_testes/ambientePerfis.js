import process from 'node:process'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'
import { vi } from 'vitest'
import { abrirPGlite } from './bancoTeste.js'
import { SQL_CENTRAL, usarBancos } from './pglite.js'
import { _limparCacheSessoes } from '../_sessao.js'

// SÓ PARA TESTES (pasta com "_": a Vercel não publica como rota).
// Ambiente com DOIS perfis para os testes de permissão (auditoria 11/2026): handlers e _db.js de
// verdade (PGlite), sessão conferida pelo comAmbiente.
//   prf_a (conta conta_a, função de reserva rf_a) — o perfil do usuário restrito
//   prf_b (conta conta_b, função de reserva rf_b) — de outra pessoa
// Usuários: ver USUARIOS abaixo. Nada aqui é de um cliente real.

const SECRET = 'segredo-de-teste'
const raiz = fileURLToPath(new URL('../../supabase/', import.meta.url))
const ESTRUTURA = readFileSync(raiz + 'estrutura_base.sql', 'utf-8')
const MIGRACOES = readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync(raiz + 'migrations/' + f, 'utf-8')).join('\n')

const SO = (modulos) => Object.fromEntries(modulos.map(([m, ...acoes]) => [m, Object.fromEntries(acoes.map(a => [a, true]))]))

export const USUARIOS = {
  admin: { sub: 'u_admin', nivel: 'admin', perfis: 'todos', username: 'admin', permissoes: {} },
  // Operador restrito ao perfil A.
  restrito: { sub: 'u_restrito', nivel: 'operador', perfis: ['prf_a'], username: 'restrito', permissoes: {} },
  // Administrador restrito ao perfil A (item 3: não pode se dar "todos").
  adminRestrito: { sub: 'u_admin_r', nivel: 'admin', perfis: ['prf_a'], username: 'adminr', permissoes: {} },
  // Personalizado: só edita Orçamento (nenhum lançamento/agendamento).
  soOrcamento: { sub: 'u_orc', nivel: 'personalizado', perfis: 'todos', username: 'orc', permissoes: SO([['orcamento', 'ver', 'editar']]) },
  // Personalizado: vê e edita só Agendamentos.
  soAgendamentos: { sub: 'u_ag', nivel: 'personalizado', perfis: 'todos', username: 'ag', permissoes: SO([['agendamentos', 'ver', 'incluir', 'editar']]) },
  // Consulta (só ver) restrita ao perfil A.
  consulta: { sub: 'u_cons', nivel: 'consulta', perfis: ['prf_a'], username: 'cons', permissoes: {} },
}

export async function montarAmbiente(sqlExtra = '') {
  const central = abrirPGlite()
  await central.exec(SQL_CENTRAL)
  await central.exec("UPDATE ambientes SET database_name = 'banco_vm' WHERE sigla = 'vm'")
  const amb = (await central.query("SELECT id FROM ambientes WHERE sigla = 'vm'")).rows[0].id
  const banco = abrirPGlite()
  await banco.exec(ESTRUTURA + '\n' + MIGRACOES)
  const valores = Object.values(USUARIOS).map(u => `('${u.sub}', '${u.username}', '${u.username}', '${u.username}@t.local', 'x', '${u.nivel}')`).join(', ')
  await banco.exec(`
    INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES ${valores};
    INSERT INTO perfis (id, name) VALUES ('prf_a', 'Perfil A'), ('prf_b', 'Perfil B');
    INSERT INTO contas (id, name, type, profile_id) VALUES ('conta_a', 'Conta A', 'checking', 'prf_a'), ('conta_b', 'Conta B', 'checking', 'prf_b');
    INSERT INTO reserve_functions (id, name, account_id) VALUES ('rf_a', 'Função A', 'conta_a'), ('rf_b', 'Função B', 'conta_b');
    INSERT INTO lancamentos (id, type, amount, date, account_id, description, category_id) VALUES
      ('l_a', 'expense', 10, '2026-10-01', 'conta_a', 'Mercado', 'c1'),
      ('l_b', 'expense', 20, '2026-10-02', 'conta_b', 'Mercado', 'c1');
    INSERT INTO agendamentos (id, description, transaction_type, amount, frequency, start_date, account_id) VALUES
      ('ag_a', 'Ag A', 'expense', 1, 'monthly', '2026-10-01', 'conta_a'),
      ('ag_b', 'Ag B', 'expense', 1, 'monthly', '2026-10-01', 'conta_b');
    ${sqlExtra}
  `)
  const q = async (sql, p = []) => (await banco.query(sql, p)).rows
  return { central, banco, amb, q }
}

// beforeEach dos arquivos de teste: segredo, bancos e console calado.
export function prepararChamadas(amb) {
  process.env.JWT_SECRET = SECRET
  usarBancos({ central: amb.central, banco_vm: amb.banco })
  _limparCacheSessoes()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

export async function chamar(amb, handler, quem, { method = 'POST', url = '/api/x', body, headers = {} } = {}) {
  const res = {
    statusCode: 200, body: undefined, headers: {},
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    send(b) { this.body = b; return this },
    end() { return this },
    setHeader(k, v) { this.headers[k] = v },
    getHeader(k) { return this.headers[k] },
  }
  const tk = jwt.sign({ ...quem, org: 'o1', origem: 'db', amb: amb.amb, amb_sigla: 'vm' }, SECRET)
  await handler({
    method, url, body, query: Object.fromEntries(new URL(url, 'http://x').searchParams),
    headers: { host: 'www.finup.app.br', authorization: `Bearer ${tk}`, ...headers },
  }, res)
  return res
}
