import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import process from 'node:process'
import { _definirFabricaDePool } from './_conexao.js'
import { montarAmbiente, prepararChamadas, chamar, USUARIOS as U } from './_testes/ambientePerfis.js'

// Auditoria 11/2026, item 3 (P1): um administrador só concede perfis que ele mesmo tem (lidos do
// banco); "todos os perfis" só o administrador principal (com "todos"). E não mexe em quem enxerga
// além dele (senão trocaria a senha do principal e entraria como ele).

const usuarios = (await import('./usuarios.js')).default
let amb
beforeAll(async () => {
  amb = await montarAmbiente(`
    INSERT INTO organizacoes (id, nome) VALUES ('o1', 'Org');
    INSERT INTO membros (usuario_id, organizacao_id, papel) SELECT id, 'o1', 'admin' FROM usuarios;
    UPDATE usuarios SET perfis_permitidos = '["prf_a"]'::jsonb WHERE id IN ('u_admin_r', 'u_restrito', 'u_cons');
    UPDATE usuarios SET perfis_permitidos = '"todos"'::jsonb WHERE id IN ('u_admin', 'u_orc', 'u_ag');
  `)
}, 180_000)
let env
beforeEach(() => { env = { ...process.env }; prepararChamadas(amb) })
afterEach(() => { process.env = env; vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

const post = (quem, body) => chamar(amb, usuarios, quem, { url: '/api/usuarios', body })
const patch = (quem, body) => chamar(amb, usuarios, quem, { method: 'PATCH', url: '/api/usuarios', body })
const novo = (username, perfis) => ({ username, nome: username, email: `${username}@t.local`, senha: 'senha-de-teste-1', nivel: 'operador', perfis_permitidos: perfis })
const perfisDe = async (id) => (await amb.q('SELECT perfis_permitidos FROM usuarios WHERE id = $1', [id]))[0].perfis_permitidos

describe('administrador restrito (perfil A)', () => {
  it('não se dá "todos" nem outro perfil', async () => {
    expect((await patch(U.adminRestrito, { id: 'u_admin_r', perfis_permitidos: 'todos' })).statusCode).toBe(403)
    expect((await patch(U.adminRestrito, { id: 'u_admin_r', perfis_permitidos: ['prf_a', 'prf_b'] })).statusCode).toBe(403)
    expect(await perfisDe('u_admin_r')).toEqual(['prf_a'])
  })
  it('não cria usuário com "todos" nem com perfil que não tem', async () => {
    expect((await post(U.adminRestrito, novo('novo1', 'todos'))).statusCode).toBe(403)
    expect((await post(U.adminRestrito, novo('novo2', ['prf_b']))).statusCode).toBe(403)
    // sem perfis informados = "todos" → também recusado
    const semPerfis = novo('novo3', null)
    delete semPerfis.perfis_permitidos
    expect((await post(U.adminRestrito, semPerfis)).statusCode).toBe(403)
    expect(await amb.q("SELECT id FROM usuarios WHERE username IN ('novo1', 'novo2', 'novo3')")).toEqual([])
  })
  it('não altera (senha, perfis, ativo) nem convida quem enxerga além dele', async () => {
    expect((await patch(U.adminRestrito, { id: 'u_admin', novaSenha: 'outra-senha-123' })).statusCode).toBe(403)
    expect((await patch(U.adminRestrito, { id: 'u_admin', perfis_permitidos: ['prf_a'] })).statusCode).toBe(403)
    expect((await patch(U.adminRestrito, { id: 'u_orc', ativo: false })).statusCode).toBe(403)
    expect((await chamar(amb, usuarios, U.adminRestrito, { url: '/api/usuarios?acao=enviar-convite', body: { id: 'u_admin' } })).statusCode).toBe(403)
    expect(await perfisDe('u_admin')).toBe('todos')
  })
  it('concede o que tem: cria e edita usuário só com o perfil A', async () => {
    const r = await post(U.adminRestrito, novo('novo4', ['prf_a']))
    expect(r.statusCode).toBe(200)
    expect((await patch(U.adminRestrito, { id: r.body.usuario.id, nome: 'Novo 4' })).statusCode).toBe(200)
    expect((await patch(U.adminRestrito, { id: 'u_restrito', perfis_permitidos: ['prf_a'] })).statusCode).toBe(200)
  })
})

describe('administrador principal (todos os perfis)', () => {
  it('concede "todos" e qualquer perfil', async () => {
    expect((await post(U.admin, novo('novo5', 'todos'))).statusCode).toBe(200)
    expect((await patch(U.admin, { id: 'u_restrito', perfis_permitidos: ['prf_a', 'prf_b'] })).statusCode).toBe(200)
    expect((await patch(U.admin, { id: 'u_restrito', perfis_permitidos: ['prf_a'] })).statusCode).toBe(200)
  })
  it('vale o perfil gravado no banco, não o do token: token antigo com "todos" de quem foi restringido', async () => {
    const tokenVelho = { ...U.adminRestrito, perfis: 'todos' }
    expect((await patch(tokenVelho, { id: 'u_admin_r', perfis_permitidos: 'todos' })).statusCode).toBe(403)
  })
})
