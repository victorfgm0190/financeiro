import { describe, it, expect, beforeEach } from 'vitest'
import { bancoDoArquivo } from './_testes/bancoTeste.js'
import { DDL_HISTORICO } from './_historico.js'
import { planejarMigracaoNumeroContrato, aplicarMigracaoNumeroContrato, MOTIVO_MIGRACAO } from './_numeroContrato.js'
import { separarContratoDoTexto, contratoPorNumero, mesmoNumeroContrato } from '../src/lib/contratos/numero.js'

// Cenário 9 (pendências 31/10): agendamentos/lançamentos antigos com "· Contrato nº …" no texto →
// número no campo próprio, texto limpo, histórico gravado (autor sistema). Postgres real (PGlite).
let db
const q = async (sql, params = []) => (await db.query(sql, params)).rows

beforeEach(async () => {
  db = await bancoDoArquivo(async (b) => {
    await b.exec('CREATE TABLE agendamentos (id TEXT PRIMARY KEY, description TEXT, numero_contrato TEXT)')
    await b.exec('CREATE TABLE lancamentos (id TEXT PRIMARY KEY, description TEXT, notes TEXT, numero_contrato TEXT)')
    for (const sql of DDL_HISTORICO) await b.exec(sql)
    await b.exec(`INSERT INTO agendamentos VALUES
      ('ag1', 'Academia X · Contrato nº 12345', NULL),
      ('ag2', 'Financeira · Contrato nº AB-778/2026', NULL),
      ('ag3', 'Aluguel', NULL),
      ('ag4', 'Seguro · Contrato nº 999', '555')`)
    await b.exec(`INSERT INTO lancamentos VALUES
      ('tx1', 'Academia X', 'Pago no PIX · Contrato nº 12345', NULL),
      ('tx2', 'Mercado', NULL, NULL)`)
  })
})

describe('migração do nº do contrato (descrição → campo próprio)', () => {
  it('prévia: só os registros com o sufixo; conflito (campo já com outro nº) fica de fora', async () => {
    const plano = await planejarMigracaoNumeroContrato(q)
    expect(plano.agendamentos.mudar.map(m => [m.id, m.campos])).toEqual([
      ['ag1', { description: 'Academia X', numero_contrato: '12345' }],
      ['ag2', { description: 'Financeira', numero_contrato: 'AB-778/2026' }],
    ])
    expect(plano.agendamentos.conflitos).toEqual([{ id: 'ag4', atual: '555', encontrado: '999' }])
    expect(plano.lancamentos.mudar.map(m => [m.id, m.campos])).toEqual([['tx1', { notes: 'Pago no PIX', numero_contrato: '12345' }]])
    // Prévia não altera nada.
    expect((await q("SELECT description FROM agendamentos WHERE id = 'ag1'"))[0].description).toBe('Academia X · Contrato nº 12345')
  })

  it('executar: descrição limpa, número no campo, histórico com autor sistema no mesmo lote', async () => {
    const plano = await planejarMigracaoNumeroContrato(q)
    const r = await aplicarMigracaoNumeroContrato(q, plano, { loteId: 'L_MIG' })
    expect(r).toMatchObject({ agendamentos: 2, lancamentos: 1, pulados: [] })
    expect(await q('SELECT id, description, numero_contrato FROM agendamentos ORDER BY id')).toEqual([
      { id: 'ag1', description: 'Academia X', numero_contrato: '12345' },
      { id: 'ag2', description: 'Financeira', numero_contrato: 'AB-778/2026' },
      { id: 'ag3', description: 'Aluguel', numero_contrato: null },
      { id: 'ag4', description: 'Seguro · Contrato nº 999', numero_contrato: '555' },
    ])
    expect((await q("SELECT notes, numero_contrato FROM lancamentos WHERE id = 'tx1'"))[0]).toEqual({ notes: 'Pago no PIX', numero_contrato: '12345' })
    const h = await q("SELECT entidade_id, campo, valor_anterior, valor_novo, autor, motivo, lote_id FROM historico_alteracoes WHERE entidade_id = 'ag1' ORDER BY campo")
    expect(h).toEqual([
      { entidade_id: 'ag1', campo: 'description', valor_anterior: 'Academia X · Contrato nº 12345', valor_novo: 'Academia X', autor: 'sistema', motivo: MOTIVO_MIGRACAO, lote_id: 'L_MIG' },
      { entidade_id: 'ag1', campo: 'numeroContrato', valor_anterior: null, valor_novo: '12345', autor: 'sistema', motivo: MOTIVO_MIGRACAO, lote_id: 'L_MIG' },
    ])
    // Rodar de novo não acha mais nada (idempotente).
    const de2 = await planejarMigracaoNumeroContrato(q)
    expect(de2.agendamentos.mudar.length + de2.lancamentos.mudar.length).toBe(0)
  })

  it('registro editado entre a prévia e a execução é pulado (guarda no UPDATE)', async () => {
    const plano = await planejarMigracaoNumeroContrato(q)
    await db.exec("UPDATE agendamentos SET description = 'Academia Y · Contrato nº 12345' WHERE id = 'ag1'")
    const r = await aplicarMigracaoNumeroContrato(q, plano, { loteId: 'L2' })
    expect(r.pulados).toEqual(['agendamentos:ag1'])
    expect((await q("SELECT numero_contrato FROM agendamentos WHERE id = 'ag1'"))[0].numero_contrato).toBeNull()
  })
})

describe('nº do contrato — comparação e contrato cadastrado', () => {
  it('separa o sufixo e compara sem pontuação/zeros à esquerda', () => {
    expect(separarContratoDoTexto('Academia X · Contrato nº 12345')).toEqual({ texto: 'Academia X', numero: '12345' })
    expect(separarContratoDoTexto('Contrato nº 777')).toEqual({ texto: '', numero: '777' })
    expect(separarContratoDoTexto('Contrato de aluguel')).toBeNull()
    expect(mesmoNumeroContrato('00012.345', '12345')).toBe(true)
    expect(mesmoNumeroContrato('12', '12')).toBe(false) // curto demais
  })
  it('contratoPorNumero: pagar × receber e rescindido de fora', () => {
    const cs = [
      { id: 'c1', numero: '12345', tipo: 'pagar', status: 'ativo' },
      { id: 'c2', numero: '777', tipo: 'pagar', status: 'rescindido' },
      { id: 'c3', numero: '888', tipo: 'receber', status: 'ativo' },
    ]
    expect(contratoPorNumero('12.345', cs)?.id).toBe('c1')
    expect(contratoPorNumero('777', cs)).toBeNull()
    expect(contratoPorNumero('888', cs)).toBeNull()
    expect(contratoPorNumero('888', cs, { tipoMov: 'income' })?.id).toBe('c3')
  })
})
