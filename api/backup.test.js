import process from 'node:process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'
import { abrirPGlite } from './_testes/bancoTeste.js'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'
import {
  gerarManifesto, lerPagina, lerPaginas, gravarParte, aplicarRestauracao, conferirNoBanco, ordenarPorVinculos,
  usuariosComPerfisQueSomem, previa, lerEstrutura,
} from './_backup.js'
import { montarBackup, dividirEmPartes } from '../src/lib/backupMontagem.js'
import { validarArquivo, conferirIntegridade, perfisDoArquivo } from '../src/lib/backupFormato.js'

// BACKUP COMPLETO com Postgres de verdade (PGlite): exporta um banco ("origem") em páginas, monta o
// arquivo, envia em partes para a área de preparo de outro ("destino") e restaura numa transação.

const raiz = fileURLToPath(new URL('../supabase/', import.meta.url))
const ESTRUTURA = readFileSync(raiz + 'estrutura_base.sql', 'utf-8')
const MIGRACOES = readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql')).sort()
const SQL_MIG = (lista) => lista.map(f => readFileSync(raiz + 'migrations/' + f, 'utf-8')).join('\n')
const registrarMig = (lista) => `CREATE TABLE IF NOT EXISTS _migracoes (nome TEXT PRIMARY KEY, aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now(), linha_de_base BOOLEAN NOT NULL DEFAULT false);
  ${lista.map(m => `INSERT INTO _migracoes (nome) VALUES ('${m}') ON CONFLICT DO NOTHING;`).join('\n')}`

const qDe = (db) => async (sql, p = []) => (await db.query(sql, p)).rows
const emTransacao = (db, fn) => db.transaction(async (tx) => fn(qDe(tx)))

async function bancoCompleto() {
  const db = abrirPGlite()
  await db.exec(ESTRUTURA + '\n' + SQL_MIG(MIGRACOES) + '\n' + registrarMig(MIGRACOES))
  return db
}

const SEMENTE_ORIGEM = `
  INSERT INTO contas (id, name, type, balance, created_at) VALUES ('c1', 'Corrente', 'checking', 100.50, '2026-01-02T03:04:05.678Z'), ('cc', 'Cartão', 'credit', 0, now());
  INSERT INTO cartoes (id, credit_limit, closing_day, due_day) VALUES ('cc', 5000.00, 13, 20);
  INSERT INTO lancamentos (id, type, account_id, amount, date, description, origin, updated_at)
    VALUES ('t1', 'expense', 'c1', 10.50, '2026-10-01', 'Padaria "Central" ç', 'manual', '2025-05-05T05:05:05Z'),
           ('t2', 'income', 'c1', 1234.567, '2026-10-02', 'Salário', 'manual', '2025-05-06T00:00:00Z');
  INSERT INTO perfis (id, name, type) VALUES ('p1', 'Pessoal', 'pf'), ('p2', 'Empresa', 'pj');
  INSERT INTO configuracoes (id, rodape_titulo, rodape_frase, cost_centers) VALUES (1, 'Origem S/A', 'Frase da origem', '["Casa"]'::jsonb)
    ON CONFLICT (id) DO UPDATE SET rodape_titulo = EXCLUDED.rodape_titulo, rodape_frase = EXCLUDED.rodape_frase, cost_centers = EXCLUDED.cost_centers;
  INSERT INTO account_mapping (grupo, nome_finup, nome_dindin) VALUES ('G', 'Corrente', 'D1'), ('G', 'Cartão', 'D2');
  INSERT INTO contratos (id, tipo, data_inicio) VALUES ('k1', 'receber', '2026-01-01');
  INSERT INTO contrato_itens (id, contrato_id, descricao) VALUES ('ki1', 'k1', 'Aluguel');
  INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES ('uo', 'origem', 'Usuário da origem', 'o@x.local', 'h', 'admin');`

const SEMENTE_DESTINO = `
  INSERT INTO contas (id, name, type, balance) VALUES ('d1', 'Conta do destino', 'checking', 7);
  INSERT INTO lancamentos (id, type, account_id, amount, date, description, origin) VALUES ('dx', 'expense', 'd1', 7, '2026-09-09', 'Do destino', 'manual');
  INSERT INTO perfis (id, name, type) VALUES ('pX', 'Perfil do destino', 'pf'), ('p1', 'Pessoal (destino)', 'pf');
  INSERT INTO configuracoes (id, rodape_titulo, rodape_frase) VALUES (1, 'Destino Ltda', 'Frase do destino')
    ON CONFLICT (id) DO UPDATE SET rodape_titulo = EXCLUDED.rodape_titulo, rodape_frase = EXCLUDED.rodape_frase;
  INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel, perfis_permitidos) VALUES
    ('u1', 'restrito', 'Restrito', 'r@x.local', 'h', 'operador', '["pX"]'::jsonb),
    ('u2', 'misto', 'Misto', 'm@x.local', 'h', 'operador', '["pX", "p1"]'::jsonb),
    ('u3', 'admin', 'Admin', 'a@x.local', 'h', 'admin', NULL);`

// Exporta `db` com páginas pequenas (força vários lotes) e o mesmo código da tela.
async function exportar(db, { limiteBytes = 300 } = {}) {
  return emTransacao(db, async (q) => montarBackup({
    obterManifesto: () => gerarManifesto(q, { ambiente: 'origem', appHash: 'abc1234' }),
    obterPagina: (t, o) => lerPagina(q, t, o, { limiteBytes }),
  }))
}
async function enviar(db, arq, loteId = 'lote_teste_1', limite = 400) {
  for (const p of dividirEmPartes(arq, limite)) await emTransacao(db, (q) => gravarParte(q, { loteId, ...p }))
}
const fotografia = async (db) => emTransacao(db, async (q) => {
  const m = await gerarManifesto(q, { ambiente: 'x' })
  return Object.fromEntries(Object.entries(m.tabelas).map(([t, i]) => [t, `${i.linhas}:${i.impressao}`]))
})

let origem
beforeAll(async () => {
  origem = await bancoCompleto()
  await origem.exec(SEMENTE_ORIGEM)
}, 180_000)

describe('ordem dos vínculos', () => {
  it('pais antes dos filhos (desempate alfabético); ciclo não trava', () => {
    const arestas = [{ filho: 'cartoes', pai: 'contas' }, { filho: 'contrato_itens', pai: 'contratos' }, { filho: 'financing_installments', pai: 'financing' }, { filho: 'financing', pai: 'contas' }]
    const ordem = ordenarPorVinculos(['financing_installments', 'cartoes', 'contrato_itens', 'contas', 'contratos', 'financing', 'lancamentos'], arestas)
    expect(ordem.indexOf('contas')).toBeLessThan(ordem.indexOf('cartoes'))
    expect(ordem.indexOf('contas')).toBeLessThan(ordem.indexOf('financing'))
    expect(ordem.indexOf('financing')).toBeLessThan(ordem.indexOf('financing_installments'))
    expect(ordem.indexOf('contratos')).toBeLessThan(ordem.indexOf('contrato_itens'))
    expect(ordenarPorVinculos(['a', 'b'], [{ filho: 'a', pai: 'b' }, { filho: 'b', pai: 'a' }])).toEqual(['a', 'b'])
  })
})

describe('exportação em lotes', () => {
  it('todas as tabelas de dados, fora acesso/controle; linhas em vários lotes conferem com o manifesto', async () => {
    const arq = await exportar(origem)
    expect(validarArquivo(arq).ok).toBe(true)
    expect(await conferirIntegridade(arq)).toEqual({ ok: true, divergentes: [] })
    const m = arq.manifesto
    expect(m).toMatchObject({ formato: 'finup-backup', ambiente: 'origem', appHash: 'abc1234' })
    expect(m.schema.migracoes).toEqual(MIGRACOES)
    expect(m.tabelas.lancamentos.linhas).toBe(2)
    expect(m.tabelas.contrato_itens.linhas).toBe(1)
    for (const fora of ['usuarios', 'organizacoes', 'membros', 'senha_tokens', '_migracoes', 'backup_preparo', 'indices_cache']) expect(m.tabelas[fora], fora).toBeUndefined()
    // Identidade do ambiente não viaja.
    expect(m.tabelas.configuracoes.colunas).not.toContain('rodape_titulo')
    expect(arq.tabelas.configuracoes[0]).not.toMatch(/Origem S\/A/)
    // Valores exatos do Postgres (numeric com as casas, acento, aspas).
    expect(arq.tabelas.lancamentos.join('\n')).toMatch(/"amount": 10\.50/)
    expect(arq.tabelas.lancamentos.join('\n')).toMatch(/Padaria \\"Central\\" ç/)
    expect(perfisDoArquivo(arq)).toEqual(['p1', 'p2'])
  })
})

describe('exportação em blocos (várias tabelas por chamada, como a tela)', () => {
  it('mesmo arquivo da exportação tabela a tabela, em poucas chamadas', async () => {
    const porTabela = await exportar(origem)
    const pedidos = []
    const emBlocos = await emTransacao(origem, async (q) => montarBackup({
      obterManifesto: () => gerarManifesto(q, { ambiente: 'origem', appHash: 'abc1234' }),
      obterPaginas: (de, o) => { pedidos.push([de, o]); return lerPaginas(q, de, o, { limiteBytes: 300 }) },
    }))
    expect(emBlocos.tabelas).toEqual(porTabela.tabelas)
    expect(emBlocos.manifesto.tabelas).toEqual(porTabela.manifesto.tabelas)
    expect(pedidos.length).toBeLessThan(Object.keys(porTabela.manifesto.tabelas).length / 2)
    expect(pedidos.length).toBeGreaterThan(1) // o limite de bytes quebra em mais de uma resposta
    // Limite grande: uma resposta só.
    const uma = await emTransacao(origem, (q) => lerPaginas(q, null, 0))
    expect(uma.proximo).toBeNull()
    expect(uma.blocos.map(b => b.tabela)).toEqual(Object.keys(porTabela.manifesto.tabelas))
  }, 60_000)
})

describe('restauração tudo-ou-nada', () => {
  let arq
  let destino
  beforeAll(async () => { arq = await exportar(origem) }, 60_000)
  beforeEach(async () => {
    destino = await bancoCompleto()
    await destino.exec(SEMENTE_DESTINO)
  }, 60_000)

  it('restaura fiel (updated_at, numeric, sequências), mantém usuários e o rodapé do destino, e a conferência dá ok', async () => {
    await enviar(destino, arq)
    const r = await emTransacao(destino, (q) => aplicarRestauracao(q, { loteId: 'lote_teste_1', manifesto: arq.manifesto }))
    expect(r.conferencia.every(c => c.ok)).toBe(true)
    const q = qDe(destino)
    expect((await q("SELECT id FROM lancamentos ORDER BY id")).map(x => x.id)).toEqual(['t1', 't2'])
    const [t1] = await q("SELECT amount::text AS a, updated_at FROM lancamentos WHERE id = 't1'")
    expect(t1.a).toBe('10.50')
    // Gatilho desligado na cópia: o updated_at é o da origem, não a hora da restauração.
    const [o1] = await qDe(origem)("SELECT updated_at FROM lancamentos WHERE id = 't1'")
    expect(new Date(t1.updated_at).toISOString()).toBe(new Date(o1.updated_at).toISOString())
    expect(await q("SELECT id FROM contas ORDER BY id")).toEqual([{ id: 'c1' }, { id: 'cc' }])
    // Mantido do destino: usuários e identidade.
    expect((await q('SELECT id FROM usuarios ORDER BY id')).map(x => x.id)).toEqual(['u1', 'u2', 'u3'])
    expect(await q('SELECT rodape_titulo, rodape_frase FROM configuracoes')).toEqual([{ rodape_titulo: 'Destino Ltda', rodape_frase: 'Frase do destino' }])
    expect((await q('SELECT cost_centers FROM configuracoes'))[0].cost_centers).toEqual(['Casa'])
    // Sequência continua do maior id.
    await q("INSERT INTO account_mapping (grupo, nome_finup, nome_dindin) VALUES ('G', 'Nova', 'D3')")
    expect((await q('SELECT count(*)::int AS n FROM account_mapping'))[0].n).toBe(3)
    // Gatilho religado e área de preparo vazia.
    await q("UPDATE lancamentos SET description = 'mudou' WHERE id = 't1'")
    expect(new Date((await q("SELECT updated_at FROM lancamentos WHERE id = 't1'"))[0].updated_at).getTime()).toBeGreaterThan(new Date(o1.updated_at).getTime())
    expect((await q('SELECT count(*)::int AS n FROM backup_preparo'))[0].n).toBe(0)
    // A cópia do destino é idêntica à origem (exceto o rodapé, que não entra na impressão digital).
  }, 60_000)

  it('ida e volta: exportar o destino restaurado dá o mesmo manifesto da origem', async () => {
    await enviar(destino, arq, 'lote_ida_volta')
    await emTransacao(destino, (q) => aplicarRestauracao(q, { loteId: 'lote_ida_volta', manifesto: arq.manifesto }))
    const de = await fotografia(destino)
    const da = await fotografia(origem)
    expect(de).toEqual(da)
  }, 60_000)

  it('falha no meio (vínculo quebrado no arquivo) → desfaz tudo: o destino fica exatamente como estava', async () => {
    const antes = await fotografia(destino)
    const quebrado = structuredClone(arq)
    quebrado.tabelas.contrato_itens = ['{"id": "ki9", "contrato_id": "nao-existe", "descricao": "x", "grupo": "outro", "responsavel": "inquilino", "ativo": true}']
    await enviar(destino, quebrado, 'lote_quebrado')
    await expect(emTransacao(destino, (q) => aplicarRestauracao(q, { loteId: 'lote_quebrado', manifesto: quebrado.manifesto }))).rejects.toThrow()
    expect(await fotografia(destino)).toEqual(antes)
  }, 60_000)

  it('envio incompleto → recusa sem mudar nada', async () => {
    const antes = await fotografia(destino)
    await emTransacao(destino, (q) => gravarParte(q, { loteId: 'lote_incompleto', tabela: 'contas', parte: 0, linhas: arq.tabelas.contas }))
    await expect(emTransacao(destino, (q) => aplicarRestauracao(q, { loteId: 'lote_incompleto', manifesto: arq.manifesto }))).rejects.toThrow(/envio do arquivo não terminou/)
    expect(await fotografia(destino)).toEqual(antes)
  }, 60_000)

  it('"_estrutura_base" (ambiente provisionado) não vira a versão: ultima = última migração real; destino sem a marca aceita', async () => {
    await origem.exec("INSERT INTO _migracoes (nome) VALUES ('_estrutura_base')")
    try {
      const comMarca = await exportar(origem)
      expect(comMarca.manifesto.schema.migracoes).toContain('_estrutura_base')
      expect(comMarca.manifesto.schema.ultima).toBe(MIGRACOES.at(-1))
      // Destino igual em migrações reais, sem a marca: aceita e restaura.
      const pv = await emTransacao(destino, (q) => previa(q, comMarca.manifesto, perfisDoArquivo(comMarca)))
      expect(pv.versao.recusar).toEqual([])
      expect(pv.versao.semMigracoes).toEqual([])
      expect(pv.destino.ultima).toBe(MIGRACOES.at(-1))
      // Arquivo gerado antes da correção ("ultima" = "_estrutura_base"): o campo é ignorado.
      comMarca.manifesto.schema.ultima = '_estrutura_base'
      await enviar(destino, comMarca, 'lote_marca')
      const r = await emTransacao(destino, (q) => aplicarRestauracao(q, { loteId: 'lote_marca', manifesto: comMarca.manifesto }))
      expect(r.conferencia.every(c => c.ok)).toBe(true)
    } finally {
      await origem.exec("DELETE FROM _migracoes WHERE nome = '_estrutura_base'")
    }
  }, 60_000)

  it('arquivo de versão mais nova → recusa antes de tocar em qualquer coisa', async () => {
    const antes = await fotografia(destino)
    const novo = structuredClone(arq)
    novo.manifesto.schema.migracoes.push('2099-01-01_futuro.sql')
    await enviar(destino, novo, 'lote_novo')
    await expect(emTransacao(destino, (q) => aplicarRestauracao(q, { loteId: 'lote_novo', manifesto: novo.manifesto }))).rejects.toThrow(/versão mais nova.*2099-01-01_futuro/)
    expect(await fotografia(destino)).toEqual(antes)
  }, 60_000)

  it('arquivo mais antigo (sem uma coluna e sem uma migração): aceita, coluna fica no padrão e a conferência dá ok', async () => {
    const velho = structuredClone(arq)
    velho.manifesto.schema.migracoes = velho.manifesto.schema.migracoes.slice(0, -1)
    // Tira a coluna "notes" dos lançamentos (o arquivo "não conhecia").
    velho.manifesto.tabelas.lancamentos.colunas = velho.manifesto.tabelas.lancamentos.colunas.filter(c => c !== 'notes')
    velho.tabelas.lancamentos = velho.tabelas.lancamentos.map(l => { const o = JSON.parse(l); delete o.notes; return JSON.stringify(o) })
    const { impressaoDasLinhas } = await import('../src/lib/backupFormato.js')
    // Impressão digital do arquivo velho = a do Postgres sem a coluna (recalculada como o Postgres a escreve).
    const [r] = await emTransacao(origem, async (q) => {
      await q("SET LOCAL TimeZone = 'UTC'") // o backup grava as datas com fuso sempre em UTC
      return q(`SELECT string_agg((to_jsonb(t) - 'notes')::text, E'\\n' ORDER BY t.id COLLATE "C") AS s FROM lancamentos t`)
    })
    velho.tabelas.lancamentos = r.s.split('\n')
    velho.manifesto.tabelas.lancamentos.impressao = await impressaoDasLinhas(velho.tabelas.lancamentos)
    const pv = await emTransacao(destino, (qq) => previa(qq, velho.manifesto, perfisDoArquivo(velho)))
    expect(pv.versao.recusar).toEqual([])
    expect(pv.versao.semMigracoes).toEqual([MIGRACOES.at(-1)])
    expect(pv.versao.colunasPadrao).toContainEqual({ tabela: 'lancamentos', colunas: ['notes'] })
    await enviar(destino, velho, 'lote_velho')
    const res = await emTransacao(destino, (qq) => aplicarRestauracao(qq, { loteId: 'lote_velho', manifesto: velho.manifesto }))
    expect(res.conferencia.every(c => c.ok)).toBe(true)
  }, 60_000)

  it('perfis: avisa antes e lista depois os usuários com perfis permitidos que deixam de existir', async () => {
    const pv = await emTransacao(destino, (q) => previa(q, arq.manifesto, perfisDoArquivo(arq)))
    // Em ordem de nome: Misto (fica com 1 perfil), Restrito (fica sem nenhum); o admin ("todos") não entra.
    expect(pv.perfisSomem.map(u => [u.id, u.restam])).toEqual([['u2', 1], ['u1', 0]])
    expect(pv.atuais.lancamentos).toBe(1)
    expect(await emTransacao(destino, (q) => usuariosComPerfisQueSomem(q, ['pX', 'p1']))).toEqual([])
  }, 60_000)

  it('conferência sem restaurar acusa diferença de quantidade e de conteúdo', async () => {
    await enviar(destino, arq, 'lote_conf')
    await emTransacao(destino, (q) => aplicarRestauracao(q, { loteId: 'lote_conf', manifesto: arq.manifesto }))
    const q = qDe(destino)
    await q("UPDATE lancamentos SET amount = 10.51 WHERE id = 't1'")
    await q("DELETE FROM contrato_itens")
    const conf = await emTransacao(destino, (qq) => conferirNoBanco(qq, arq.manifesto))
    const por = Object.fromEntries(conf.map(c => [c.tabela, c]))
    expect(por.lancamentos).toMatchObject({ ok: false, banco: { linhas: 2 }, arquivo: { linhas: 2 } })
    expect(por.contrato_itens).toMatchObject({ ok: false, banco: { linhas: 0 }, arquivo: { linhas: 1 } })
    expect(por.contas.ok).toBe(true)
    expect((await emTransacao(destino, lerEstrutura)).tabelas).toContain('lancamentos')
  }, 60_000)
})

// ─── Rota: só administrador com todos os perfis ────────────────────────────────────────────────
describe('rota /api/backup', () => {
  const SECRET = 'segredo-de-teste'
  const bancos = {}
  let envOriginal
  let rota
  beforeAll(async () => {
    rota = (await import('./backup.js')).default
    bancos.central = abrirPGlite()
    await bancos.central.exec(SQL_CENTRAL)
    await bancos.central.exec("UPDATE ambientes SET database_name = 'banco_amb' WHERE sigla = 'vm'")
    bancos.banco_amb = await bancoCompleto()
    await bancos.banco_amb.exec("INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES ('u1', 'u1', 'U1', 'u1@t.local', 'x', 'admin')")
  }, 180_000)
  beforeEach(() => {
    envOriginal = { ...process.env }
    process.env.JWT_SECRET = SECRET
    usarBancos(bancos)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { process.env = envOriginal; vi.restoreAllMocks() })
  afterAll(() => { _definirFabricaDePool(null) })

  const token = async (nivel, perfis = 'todos') => {
    const [{ id }] = (await bancos.central.query("SELECT id FROM ambientes WHERE sigla = 'vm'")).rows
    return jwt.sign({ sub: 'u1', org: 'o1', nivel, permissoes: {}, perfis, username: 'u', origem: 'db', amb: id, amb_sigla: 'vm' }, SECRET)
  }
  const chamar = async (auth, { method = 'GET', url = '/api/backup?acao=manifesto', body } = {}) => {
    const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {} }
    await rota({ method, body, url, headers: { host: 'www.finup.app.br', authorization: `Bearer ${auth}` }, query: Object.fromEntries(new URL(url, 'http://x').searchParams) }, res)
    return res
  }

  it('operador, consulta e admin com perfis restritos: 403; admin com todos os perfis: manifesto', async () => {
    expect((await chamar(await token('operador'))).statusCode).toBe(403)
    expect((await chamar(await token('admin', ['p1']))).statusCode).toBe(403)
    const ok = await chamar(await token('admin'))
    expect(ok.statusCode).toBe(200)
    expect(ok.body.manifesto).toMatchObject({ formato: 'finup-backup', ambiente: 'vm' })
    const pag = await chamar(await token('admin'), { url: '/api/backup?acao=pagina&tabela=usuarios&offset=0' })
    expect(pag.statusCode).toBe(400) // tabela fora do backup nunca sai
    const pags = await chamar(await token('admin'), { url: '/api/backup?acao=paginas&de=usuarios&offset=0' })
    expect(pags.statusCode).toBe(400)
    const tudo = await chamar(await token('admin'), { url: '/api/backup?acao=paginas&offset=0' })
    expect(tudo.statusCode).toBe(200)
    expect(tudo.body.proximo).toBeNull() // banco pequeno: tudo numa resposta só
    expect(tudo.body.blocos.map(b => b.tabela)).not.toContain('usuarios')
  }, 60_000)
})
