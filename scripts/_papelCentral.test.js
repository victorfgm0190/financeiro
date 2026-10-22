import { describe, it, expect } from 'vitest'
import { lerLinhaEnv, removerLinhaEnv, definirLinhaEnv, urlDoPapel, opcoesDaUrl, NOME_ENV_CENTRAL_APP as N } from './_papelCentral.js'

const ADMIN = 'postgresql://neondb_owner:segredo@ep-x.sa-east-1.aws.neon.tech/finup_central?sslmode=require&channel_binding=require'

describe('linha CENTRAL_APP_DATABASE_URL no .env.local', () => {
  it('acrescenta no fim, numa linha própria, sem aspas nem espaço', () => {
    expect(definirLinhaEnv('A=1\nB=2\n', N, 'url')).toBe(`A=1\nB=2\n${N}=url\n`)
  })
  it('arquivo sem quebra no fim: não gruda na última linha', () => {
    expect(definirLinhaEnv('A=1', N, 'url')).toBe(`A=1\n${N}=url\n`)
  })
  it('troca a linha anterior e preserva o resto (inclusive linhas com espaço na frente)', () => {
    const antes = `A=1\n${N}=velha\n   B=2\n`
    expect(definirLinhaEnv(antes, N, 'nova')).toBe(`A=1\n   B=2\n${N}=nova\n`)
  })
  it('mantém \\r\\n', () => {
    expect(definirLinhaEnv('A=1\r\n', N, 'url')).toBe(`A=1\r\n${N}=url\r\n`)
  })
  it('não confunde com a CENTRAL_DATABASE_URL', () => {
    const t = `CENTRAL_DATABASE_URL=admin\n${N}=app\n`
    expect(lerLinhaEnv(t, N)).toBe('app')
    expect(lerLinhaEnv(t, 'CENTRAL_DATABASE_URL')).toBe('admin')
    expect(removerLinhaEnv(t, N)).toBe('CENTRAL_DATABASE_URL=admin\n')
  })
  it('recusa valor com espaço ou aspas', () => {
    expect(() => definirLinhaEnv('', N, 'a b')).toThrow()
    expect(() => definirLinhaEnv('', N, '"a"')).toThrow()
  })
  it('lerLinhaEnv sem a variável → null', () => {
    expect(lerLinhaEnv('A=1\n', N)).toBeNull()
  })
})

describe('URL do papel do central', () => {
  it('troca só usuário e senha; mantém host, banco e TLS', () => {
    const url = urlDoPapel(ADMIN, 'finup_central_app', 'Abc_def-123')
    const u = new URL(url)
    expect(u.username).toBe('finup_central_app')
    expect(u.password).toBe('Abc_def-123')
    expect(u.hostname).toBe('ep-x.sa-east-1.aws.neon.tech')
    expect(u.pathname).toBe('/finup_central')
    expect(u.searchParams.get('sslmode')).toBe('require')
    expect(u.searchParams.get('channel_binding')).toBe('require')
    expect(url).not.toContain('segredo')
    expect(url).not.toContain('neondb_owner')
  })
  it('opcoesDaUrl separa os campos (o verificar troca o database)', () => {
    expect(opcoesDaUrl(urlDoPapel(ADMIN, 'finup_central_app', 'Abc_def-123'))).toEqual({
      host: 'ep-x.sa-east-1.aws.neon.tech', port: 5432, database: 'finup_central', user: 'finup_central_app', password: 'Abc_def-123',
    })
  })
})
