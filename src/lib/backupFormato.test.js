import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  FORA_DO_BACKUP, NO_BACKUP, tabelaNoBackup, validarArquivo, conferirIntegridade, compararVersao, impressaoDasLinhas,
  nomeDoArquivo, arquivosParaApagar, diasDesde, textoUltimoBackup, perfisDoArquivo, ERRO_FORMATO_ANTIGO, FORMATO,
  ultimaMigracao, versaoDoManifesto,
} from './backupFormato'
import { montarBackup, dividirEmPartes, serializarBackup, ERRO_BANCO_MUDOU } from './backupMontagem'

const raiz = fileURLToPath(new URL('../../', import.meta.url))

// Todas as tabelas que o código cria no banco do AMBIENTE: estrutura base, migrações e os CREATE TABLE da
// API (tabelas criadas sob demanda). O banco central tem SQL próprio (supabase/central) e fica de fora.
function tabelasDoSchema() {
  const arquivos = [join(raiz, 'supabase/estrutura_base.sql')]
  for (const f of readdirSync(join(raiz, 'supabase/migrations'))) if (f.endsWith('.sql')) arquivos.push(join(raiz, 'supabase/migrations', f))
  const varrer = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) { if (!f.startsWith('_testes')) varrer(p); continue }
      if (f.endsWith('.js') && !f.endsWith('.test.js') && f !== '_sqlEmbutido.js') arquivos.push(p)
    }
  }
  varrer(join(raiz, 'api'))
  const nomes = new Set()
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi
  for (const a of arquivos) {
    const texto = readFileSync(a, 'utf8').split('\n').filter(l => !/^\s*(--|\/\/)/.test(l)).join('\n')
    for (const m of texto.matchAll(re)) nomes.add(m[1].toLowerCase())
  }
  return [...nomes].sort()
}

describe('classificação das tabelas (protege o futuro)', () => {
  it('toda tabela do schema está em "no backup" ou "fora, com motivo" — tabela nova sem classificação FALHA aqui', () => {
    const classificadas = new Set([...NO_BACKUP, ...Object.keys(FORA_DO_BACKUP)])
    const sem = tabelasDoSchema().filter(t => !classificadas.has(t))
    expect(sem, `Classifique em src/lib/backupFormato.js (NO_BACKUP ou FORA_DO_BACKUP): ${sem.join(', ')}`).toEqual([])
  })
  it('as listas não se cruzam e todo "fora" tem motivo', () => {
    expect(NO_BACKUP.filter(t => FORA_DO_BACKUP[t])).toEqual([])
    for (const [t, motivo] of Object.entries(FORA_DO_BACKUP)) expect(motivo.length, t).toBeGreaterThan(10)
    expect(NO_BACKUP.every(tabelaNoBackup)).toBe(true)
  })
  it('acesso, plataforma, controle de versão e cache ficam fora; dados (contratos, reservas, histórico, rateios…) entram', () => {
    for (const t of ['usuarios', 'membros', 'organizacoes', 'senha_tokens', 'login_bloqueios', 'plataforma_clientes', '_migracoes', 'backup_preparo', 'indices_cache']) expect(tabelaNoBackup(t), t).toBe(false)
    for (const t of ['lancamentos', 'lancamento_rateios', 'schedule_reserva_funcoes', 'reserve_viradas', 'reserve_daily_ledger', 'contratos', 'financing', 'consorcios', 'historico_alteracoes', 'pendencias_integridade', 'tipos_documento', 'ia_apelidos', 'fluxo_provisorios', 'import_layouts', 'guia_telas_ocultas', 'feriados']) expect(tabelaNoBackup(t), t).toBe(true)
  })
})

const linhas = ['{"id": "a", "valor": 10.50}', '{"id": "b", "valor": 1}']
const arquivoValido = async () => ({
  formato: FORMATO, versaoFormato: 1,
  manifesto: { ambiente: 'xx', geradoEm: '2026-11-10T12:00:00.000Z', schema: { ultima: 'm2', migracoes: ['m1', 'm2'] }, tabelas: {
    contas: { linhas: 2, impressao: await impressaoDasLinhas(linhas), colunas: ['id', 'valor'] },
    perfis: { linhas: 1, impressao: await impressaoDasLinhas(['{"id": "p1"}']), colunas: ['id'] },
  } },
  tabelas: { contas: [...linhas], perfis: ['{"id": "p1"}'] },
})

describe('arquivo', () => {
  it('formato antigo (sem manifesto, parcial) é recusado com mensagem clara', () => {
    const r = validarArquivo({ accounts: [], transactions: [], _app: 'finup' })
    expect(r).toMatchObject({ ok: false, antigo: true, erro: ERRO_FORMATO_ANTIGO })
    expect(r.erro).toMatch(/versão antiga.*não traz todas as tabelas.*não pode ser restaurado com segurança/)
    expect(validarArquivo({ qualquer: 1 }).erro).toMatch(/não é um backup do Finup/)
  })
  it('estrutura e integridade: quantidade e impressão digital de cada tabela', async () => {
    const a = await arquivoValido()
    expect(validarArquivo(a).ok).toBe(true)
    expect(await conferirIntegridade(a)).toEqual({ ok: true, divergentes: [] })
    const mexido = { ...a, tabelas: { ...a.tabelas, contas: ['{"id": "a", "valor": 10.5}', linhas[1]] } }
    expect(await conferirIntegridade(mexido)).toEqual({ ok: false, divergentes: ['contas'] })
    expect(validarArquivo({ ...a, tabelas: { ...a.tabelas, contas: [linhas[0]] } }).erro).toMatch(/contas tem 1 linha/)
    expect(validarArquivo({ ...a, versaoFormato: 9 }).erro).toMatch(/mais nova/)
    expect(perfisDoArquivo(a)).toEqual(['p1'])
  })
  it('impressão digital = SHA-256 das linhas unidas por \\n (vazia = SHA-256 de "")', async () => {
    expect(await impressaoDasLinhas([])).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})

describe('versão', () => {
  const destino = { migracoes: ['m1', 'm2', 'm3'], colunas: { contas: ['id', 'valor', 'nova'], perfis: ['id'], contratos: ['id'] } }
  it('arquivo mais antigo: aceita, lista as migrações que ele não tinha, colunas no padrão, tabela que ele não traz fica vazia', async () => {
    const v = compararVersao((await arquivoValido()).manifesto, destino)
    expect(v.recusar).toEqual([])
    expect(v.semMigracoes).toEqual(['m3'])
    expect(v.colunasPadrao).toEqual([{ tabela: 'contas', colunas: ['nova'] }])
    expect(v.tabelasVazias).toEqual(['contratos'])
  })
  it('arquivo mais novo (migração, tabela ou coluna que o destino não tem): recusa', async () => {
    const m = (await arquivoValido()).manifesto
    expect(compararVersao(m, { migracoes: ['m1'], colunas: { contas: ['id', 'valor'], perfis: ['id'] } }).recusar[0]).toMatch(/versão mais nova.*m2/)
    expect(compararVersao(m, { migracoes: ['m1', 'm2'], colunas: { contas: ['id'], perfis: ['id'] } }).recusar[0]).toMatch(/contas.*valor/)
    expect(compararVersao(m, { migracoes: ['m1', 'm2'], colunas: { contas: ['id', 'valor'] } }).recusar[0]).toMatch(/perfis.*não existe/)
  })
  describe('última migração real (sem "_estrutura_base")', () => {
    const REAIS = ['2026-10-14_usuarios.sql', '2026-11-10_transferencia_categoria_por_lado.sql', '2026-11-10b_backup_preparo.sql']
    const TESTE1 = [...REAIS, '_estrutura_base'] // ordem do banco (C): o "_" vem depois dos números
    const VM = REAIS.slice(0, -1) // sem a 2026-11-10b e sem a marca de provisionamento
    const man = (migracoes, ultima = migracoes.at(-1)) => ({ schema: { ultima, migracoes }, tabelas: {} })
    const dest = (migracoes) => ({ migracoes, colunas: {} })

    it('"ultima" é a última migração real, mesmo com "_estrutura_base" na lista', () => {
      expect(ultimaMigracao(TESTE1)).toBe('2026-11-10b_backup_preparo.sql')
      expect(ultimaMigracao(['2026-11-10b_x.sql', '2026-11-10_y.sql'])).toBe('2026-11-10b_x.sql')
      expect(ultimaMigracao(['_estrutura_base'])).toBeNull()
      expect(ultimaMigracao([])).toBeNull()
      expect(versaoDoManifesto(man(TESTE1, '_estrutura_base'))).toBe('2026-11-10b_backup_preparo.sql')
    })
    it('arquivo igual ao banco: aceita, nada faltando', () => {
      const v = compararVersao(man(TESTE1), dest(TESTE1))
      expect(v).toMatchObject({ recusar: [], semMigracoes: [], arquivo: '2026-11-10b_backup_preparo.sql', destino: '2026-11-10b_backup_preparo.sql' })
    })
    it('arquivo mais antigo: aceita e lista só migrações reais que ele não tinha', () => {
      const v = compararVersao(man(VM), dest(TESTE1))
      expect(v.recusar).toEqual([])
      expect(v.semMigracoes).toEqual(['2026-11-10b_backup_preparo.sql'])
    })
    it('arquivo mais novo: recusa citando só migrações reais (a marca não conta)', () => {
      const v = compararVersao(man(TESTE1), dest(VM))
      expect(v.recusar).toHaveLength(1)
      expect(v.recusar[0]).toMatch(/versão mais nova.*2026-11-10b_backup_preparo\.sql\.$/)
      expect(v.recusar[0]).not.toMatch(/_estrutura_base/)
    })
    it('mesma versão, só a marca de provisionamento diferente: aceita nos dois sentidos', () => {
      expect(compararVersao(man(REAIS.concat('_estrutura_base')), dest(REAIS)).recusar).toEqual([])
      expect(compararVersao(man(REAIS), dest(REAIS.concat('_estrutura_base'))).semMigracoes).toEqual([])
    })
    it('arquivo antigo com "ultima" errado ("_estrutura_base"): o campo é ignorado, decide a lista', () => {
      const errado = man(TESTE1, '_estrutura_base')
      expect(compararVersao(errado, dest(TESTE1)).recusar).toEqual([])
      expect(compararVersao(errado, dest(VM)).recusar[0]).toMatch(/2026-11-10b_backup_preparo/)
      expect(compararVersao(man(VM, '_estrutura_base'), dest(TESTE1)).recusar).toEqual([])
    })
  })

  it('identidade do ambiente (rodapé) não conta como coluna que falta', () => {
    const m = { schema: { migracoes: [] }, tabelas: { configuracoes: { linhas: 1, colunas: ['id'] } } }
    expect(compararVersao(m, { migracoes: [], colunas: { configuracoes: ['id', 'rodape_titulo', 'rodape_frase'] } }).colunasPadrao).toEqual([])
  })
})

describe('montagem em lotes e partes', () => {
  const MAN = async () => ({ ambiente: 'xx', schema: { migracoes: [] }, tabelas: {
    a: { linhas: 5, impressao: await impressaoDasLinhas(['1', '2', '3', '4', '5']), colunas: [] },
    b: { linhas: 0, impressao: await impressaoDasLinhas([]), colunas: [] },
  } })
  const paginas = { a: [['1', '2'], ['3', '4'], ['5']], b: [[]] }
  const obterPagina = (t, offset) => {
    const i = paginas[t].findIndex((_, k) => paginas[t].slice(0, k).flat().length === offset)
    return { linhas: paginas[t][i], proximo: i + 1 < paginas[t].length ? offset + paginas[t][i].length : null }
  }
  it('junta as páginas de cada tabela, confere e informa o progresso', async () => {
    const prog = []
    const arq = await montarBackup({ obterManifesto: MAN, obterPagina, onProgresso: p => prog.push(p.linhas) })
    expect(arq.tabelas).toEqual({ a: ['1', '2', '3', '4', '5'], b: [] })
    expect(prog.at(-1)).toBe(5)
    expect(validarArquivo(arq).ok).toBe(true)
    expect(JSON.parse(serializarBackup(arq))).toEqual(arq)
  })
  it('várias tabelas por chamada (obterPaginas): mesmo arquivo, uma pausa por resposta, não por tabela', async () => {
    const respostas = [
      { blocos: [{ tabela: 'a', linhas: ['1', '2', '3'] }], proximo: { tabela: 'a', offset: 3 } },
      { blocos: [{ tabela: 'a', linhas: ['4', '5'] }, { tabela: 'b', linhas: [] }], proximo: null },
    ]
    const pedidos = []
    const obterPaginas = (de, offset) => { pedidos.push([de, offset]); return respostas[pedidos.length - 1] }
    const arq = await montarBackup({ obterManifesto: MAN, obterPaginas })
    expect(arq.tabelas).toEqual({ a: ['1', '2', '3', '4', '5'], b: [] })
    expect(pedidos).toEqual([[null, 0], ['a', 3]])
  })
  it('obterPaginas trazendo tabela que o manifesto não tem: "o banco mudou"', async () => {
    const obterPaginas = () => ({ blocos: [{ tabela: 'a', linhas: ['1', '2', '3', '4', '5'] }, { tabela: 'nova', linhas: ['x'] }], proximo: null })
    await expect(montarBackup({ obterManifesto: MAN, obterPaginas, tentativas: 1 })).rejects.toThrow(/banco mudou.*nova/)
  })
  it('banco mudou no meio (página não bate com o manifesto): tenta de novo e depois falha', async () => {
    let chamadas = 0
    await expect(montarBackup({ obterManifesto: () => { chamadas++; return MAN() }, obterPagina: () => ({ linhas: ['x'], proximo: null }) }))
      .rejects.toThrow(ERRO_BANCO_MUDOU)
    expect(chamadas).toBe(2)
  })
  it('partes: respeita o limite de bytes, numera por tabela e não envia tabela vazia', async () => {
    const arq = { manifesto: { tabelas: { a: {}, b: {} } }, tabelas: { a: ['"aaaa"', '"bbbb"', '"cccc"'], b: [] } }
    const partes = dividirEmPartes(arq, 25)
    expect(partes.map(p => [p.tabela, p.parte, p.linhas.length])).toEqual([['a', 0, 2], ['a', 1, 1]])
  })
})

describe('pasta de backup', () => {
  it('nome: finup-backup-<ambiente>-AAAA-MM-DD-HHMM.json', () => {
    expect(nomeDoArquivo('TESTE1', new Date(2026, 10, 10, 9, 5))).toBe('finup-backup-teste1-2026-11-10-0905.json')
  })
  it('rotação: apaga só os mais antigos do Finup DESTE ambiente; nunca outros arquivos', () => {
    const nomes = [
      'finup-backup-vm-2026-11-01-0900.json', 'finup-backup-vm-2026-11-03-0900.json', 'finup-backup-vm-2026-11-02-0900.json',
      'finup-backup-teste1-2026-10-01-0900.json', 'relatorio.json', 'finup-backup-vm-2026-11-01-0900.json.bak', 'notas.txt',
    ]
    expect(arquivosParaApagar(nomes, 'vm', 2)).toEqual(['finup-backup-vm-2026-11-01-0900.json'])
    expect(arquivosParaApagar(nomes, 'vm', 10)).toEqual([])
  })
  it('último backup em dias e o texto', () => {
    const agora = Date.UTC(2026, 10, 10, 12)
    expect(diasDesde(null)).toBeNull()
    expect(diasDesde(agora - 9 * 86_400_000, agora)).toBe(9)
    expect(textoUltimoBackup(null)).toBe('Nenhum backup feito neste computador.')
    expect(textoUltimoBackup(null, agora, 'aparelho')).toBe('Nenhum backup feito neste aparelho.')
    expect(textoUltimoBackup(agora - 86_400_000, agora)).toBe('Último backup: há 1 dia.')
    expect(textoUltimoBackup(agora, agora)).toBe('Último backup: agora.')
    expect(textoUltimoBackup(agora - 3 * 3_600_000, agora)).toBe('Último backup: hoje.')
  })
})

describe('coluna data_compra (decisão 9, 12/11/2026) vai no backup', () => {
  it('a migração cria lancamentos.data_compra e lancamentos está no backup (as colunas saem do catálogo do banco)', () => {
    const sql = readFileSync(join(raiz, 'supabase/migrations/2026-11-12_data_compra.sql'), 'utf-8')
    expect(sql).toMatch(/ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS data_compra TEXT/)
    expect(tabelaNoBackup('lancamentos')).toBe(true)
  })
})
