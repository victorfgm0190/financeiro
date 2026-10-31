import { describe, it, expect } from 'vitest'
import { classificarContas } from './contas'
import { validarAcao, definicaoFerramenta, acaoPorId } from './acoes'
import { camposDoPedido } from './camposDoPedido'
import { pendenciasDoItem, lancamentoDireto, MOTIVOS } from './loteApp'
import { camposParaConferir } from '../assistente'
import { reservaInicial } from '../reservaGerencialForm'

// Cadastro de teste (nada daqui é fixo no código: grupos, contas e tipos vêm do ambiente).
const ROWS = [
  { id: 'itaupers', name: 'Cartao Itau Personalite', apelido: 'Itaupers', type: 'credit', vinculo_tipo: 'none', profile_id: 'PV', active: true, cartao_finais: ['4541'] },
  { id: 'itau', name: 'Itau Principal', apelido: 'Itau', type: 'checking', is_main: true, profile_id: 'PV', active: true },
  { id: 'nubank', name: 'Nubank', type: 'checking', profile_id: 'PV', active: true },
  { id: 'res_ca', name: 'Reserva Contas Anuais', apelido: 'Contas Anuais', type: 'savings', is_reserva: true, profile_id: 'PV', active: true },
  { id: 'res_livre', name: 'Reserva Viagem', type: 'savings', is_reserva: true, profile_id: 'PV', active: true },
  { id: 'ger', name: 'Ger. Itaupers', type: 'gerencial', profile_id: 'PV', active: true },
]
const GRUPOS = [
  { id: 'grp_1', number: 1, name: 'Gerencial', alias: 'G', default_account_id: null },
  { id: 'grp_2', number: 2, name: 'Contas Anuais', alias: 'CA', default_account_id: 'res_ca' },
  { id: 'grp_3', number: 3, name: 'Pharmalog', alias: 'PH', default_account_id: 'itau' },
  { id: 'grp_D', number: 'D', name: 'Despesa', alias: 'D', default_account_id: null },
]
const FUNCOES = [
  { id: 'fn_ipva', name: 'IPVA', account_id: 'res_ca' },
  { id: 'fn_seguro', name: 'Seguro', account_id: 'res_ca' },
  { id: 'fn_passagem', name: 'Passagem', account_id: 'res_livre' },
]
const TIPOS = [
  { id: 'td_nf', nome: 'Nota fiscal', sigla: 'NF', natureza: 'pagar', ativo: true },
  { id: 'td_rec', nome: 'Recibo', sigla: 'REC', natureza: 'ambos', ativo: true },
]
const montar = (textoPedido, { gerencialLigado = true, lote = false } = {}) => {
  const contas = classificarContas(ROWS, 'PV')
  return {
    contas, textoPedido, apelidos: [], perfilAtivo: 'PV', temImagem: false, gerencialLigado, lote,
    idx: {
      contas: new Map(contas.map(c => [c.id, c])),
      categorias: new Map([['cat_drog', { tipo: 'expense' }], ['cat_merc', { tipo: 'expense' }]]),
      favorecidos: new Map(), centros: new Map([['obra', 'Obra']]),
      grupos: new Map((gerencialLigado ? GRUPOS : []).map(g => [g.id, g])),
      funcoesReserva: new Map(FUNCOES.map(f => [f.id, f])),
      tiposDocumento: new Map(TIPOS.map(t => [t.id, t])),
    },
  }
}

// Estado do app (camelCase, como em lib/db.js).
const APP = {
  accounts: [
    { id: 'itaupers', name: 'Cartao Itau Personalite', type: 'credit' },
    { id: 'itau', name: 'Itau Principal', type: 'checking', contaCorrentePrincipal: true },
    { id: 'nubank', name: 'Nubank', type: 'checking' },
    { id: 'res_ca', name: 'Reserva Contas Anuais', type: 'savings', isReserva: true },
    { id: 'res_livre', name: 'Reserva Viagem', type: 'savings', isReserva: true },
  ],
  categories: [{ id: 'cat_drog', name: 'Drogaria' }, { id: 'cat_merc', name: 'Mercado', defaultGerencialGroup: 'grp_3' }],
  gerencialGroups: GRUPOS.map(g => ({ id: g.id, number: g.number, name: g.name, alias: g.alias, defaultAccountId: g.default_account_id })),
  reserveFunctions: FUNCOES.map(f => ({ id: f.id, name: f.name, accountId: f.account_id })),
  tiposDocumento: TIPOS,
  gerencialLigado: true,
}

const SMS = 'Compra aprovada de R$ 75,90 em DROGA AQUILLES, 30/10 as 19:05 no seu Itau final 4541. Lançar como despesa gerencial como categoria drogaria'
// O modelo de 1 item mandando confiança parcial (só o que teve dúvida) — o caso do "Confira" indevido.
const doModelo = {
  tipo: 'despesa', valor: 75.9, data: '2026-10-30', conta_id: 'itaupers', categoria_id: 'cat_drog',
  favorecido_novo: 'DROGA AQUILLES', descricao: 'DROGA AQUILLES', confianca: { categoria: 0.9 },
}

describe('A4 — confiança parcial fora do lote', () => {
  it('campo ausente em confianca = certeza: sem "confira" em valor, data e descrição', () => {
    const r = validarAcao('registrar_lancamento', doModelo, montar(SMS), '2026-10-30')
    expect(r.confianca).toMatchObject({ valor: 1, data: 1, descricao: 1, categoria: 0.9 })
    const conferir = camposParaConferir('registrar_lancamento', r)
    expect(conferir).not.toContain('amount')
    expect(conferir).not.toContain('date')
    expect(conferir).not.toContain('description')
  })
  it('confiança baixa dita pelo modelo continua marcando', () => {
    const r = validarAcao('registrar_lancamento', { ...doModelo, confianca: { valor: 0.3 } }, montar(SMS), '2026-10-30')
    expect(camposParaConferir('registrar_lancamento', r)).toContain('amount')
  })
})

describe('A2 — grupo gerencial citado', () => {
  it('"despesa gerencial" → grupo 1; conta continua o cartão (não a conta gerencial)', () => {
    const r = validarAcao('registrar_lancamento', { ...doModelo, grupo_gerencial_id: 'grp_1' }, montar(SMS), '2026-10-30')
    expect(r).toMatchObject({ grupo_gerencial_id: 'grp_1', conta_id: 'itaupers', categoria_id: 'cat_drog' })
    const { initial, citados } = camposDoPedido(r, r.conta_id, APP)
    expect(initial.grupoGerencial).toBe('grp_1')
    expect(initial.gerencialContaId).toBeUndefined() // Conta destino: o padrão do formulário
    expect(citados).toContain('grupoGerencial')
  })
  it('pelo número ("grupo 2") ou pelo nome ("contas anuais") → grupo 2, que liga a reserva no formulário', () => {
    for (const v of ['2', 'grupo 2', 'Contas Anuais', 'CA']) {
      const r = validarAcao('registrar_lancamento', { ...doModelo, grupo_gerencial_id: v }, montar('no itaupers grupo 2'), '2026-10-30')
      expect(r.grupo_gerencial_id, v).toBe('grp_2')
      const { initial } = camposDoPedido(r, 'itaupers', APP)
      expect(initial.grupoGerencial).toBe('grp_2')
      const ini = reservaInicial({ grupoGerencial: initial.grupoGerencial, reservaFuncaoId: initial.reservaFuncaoId, novo: true },
        { cartao: true, gerencialGroups: APP.gerencialGroups, accounts: APP.accounts, reserveFunctions: APP.reserveFunctions })
      expect(ini).toMatchObject({ useReserva: true, reservaAccountId: 'res_ca' })
    }
  })
  it('função citada do grupo de reserva entra preenchida', () => {
    const r = validarAcao('registrar_lancamento', { ...doModelo, grupo_gerencial_id: 'grp_2', reserva_funcao_id: 'fn_ipva' }, montar(SMS), '2026-10-30')
    expect(r.reserva_funcao_id).toBe('fn_ipva')
    const { initial, citados } = camposDoPedido(r, 'itaupers', APP)
    expect(initial).toMatchObject({ grupoGerencial: 'grp_2', reservaFuncaoId: 'fn_ipva' })
    expect(citados).toEqual(expect.arrayContaining(['grupoGerencial', 'reservaFuncaoId']))
  })
  it('"pago com a reserva contas anuais" → grupo da reserva (travado no formulário)', () => {
    const r = validarAcao('registrar_lancamento', { ...doModelo, reserva_conta_id: 'res_ca' }, montar(SMS), '2026-10-30')
    const { initial, citados } = camposDoPedido(r, 'itaupers', APP)
    expect(initial.grupoGerencial).toBe('grp_2')
    expect(citados).toContain('reservaAccountId')
  })
  it('grupo 1 com "devolver no Nubank" → Conta destino citada; não citada → ignorada', () => {
    const r = validarAcao('registrar_lancamento', { ...doModelo, grupo_gerencial_id: 'grp_1', conta_devolucao_id: 'nubank' }, montar(`${SMS}, devolver no Nubank`), '2026-10-30')
    expect(r.conta_devolucao_id).toBe("nubank")
    expect(camposDoPedido(r, 'itaupers', APP).initial.gerencialContaId).toBe('nubank')
    const s = validarAcao('registrar_lancamento', { ...doModelo, grupo_gerencial_id: 'grp_1', conta_devolucao_id: 'nubank' }, montar(SMS), '2026-10-30')
    expect(s.conta_devolucao_id).toBeUndefined()
  })
  it('controle gerencial desligado ignora o grupo (e a ferramenta nem oferece o campo)', () => {
    const r = validarAcao('registrar_lancamento', { ...doModelo, grupo_gerencial_id: 'grp_1' }, montar(SMS, { gerencialLigado: false }), '2026-10-30')
    expect(r.grupo_gerencial_id).toBeUndefined()
    expect(camposDoPedido({ ...r, grupo_gerencial_id: 'grp_1' }, 'itaupers', { ...APP, gerencialLigado: false }).initial.grupoGerencial).toBeUndefined()
    const def = definicaoFerramenta(acaoPorId('registrar_lancamento'), null, { gerencial: false })
    expect(def.input_schema.properties.grupo_gerencial_id).toBeUndefined()
    expect(JSON.stringify(def)).not.toMatch(/gerenc/i)
  })
  it('grupo em conta corrente (não cartão) ou em receita não vale', () => {
    const r = validarAcao('registrar_lancamento', { ...doModelo, conta_id: 'itau', grupo_gerencial_id: 'grp_1' }, montar('no itau, gerencial'), '2026-10-30')
    expect(camposDoPedido(r, 'itau', APP).initial.grupoGerencial).toBeUndefined()
    const rec = validarAcao('registrar_lancamento', { ...doModelo, tipo: 'receita', categoria_id: null, grupo_gerencial_id: 'grp_1' }, montar(SMS), '2026-10-30')
    expect(rec.grupo_gerencial_id).toBeUndefined()
  })
  it('grupo inexistente → ignorado (padrão de hoje)', () => {
    const r = validarAcao('registrar_lancamento', { ...doModelo, grupo_gerencial_id: 'grupo 9' }, montar(SMS), '2026-10-30')
    expect(r.grupo_gerencial_id).toBeUndefined()
  })
})

describe('A2 — demais campos citados', () => {
  const pedido = 'gastei 120 no mercado no itaupers, centro de custo obra, tipo de documento NF, na fatura de 12/2026, observação: presente'
  it('centro de custo, tipo de documento, fatura e observação chegam preenchidos', () => {
    const r = validarAcao('registrar_lancamento', {
      ...doModelo, categoria_id: 'cat_merc', centro_custo_id: 'obra', tipo_documento_id: 'NF', fatura: '2026-12', observacoes: 'presente',
    }, montar(pedido), '2026-10-30')
    expect(r).toMatchObject({ centro_custo_id: 'Obra', tipo_documento_id: 'td_nf', fatura: '2026-12', observacoes: 'presente' })
    const { initial, citados } = camposDoPedido(r, 'itaupers', APP)
    expect(initial).toMatchObject({ tipoDocumentoId: 'td_nf', faturaMonthYear: '2026-12', notes: 'presente' })
    expect(citados).toEqual(expect.arrayContaining(['costCenter', 'tipoDocumentoId', 'faturaMonthYear', 'notes']))
  })
  it('tipo de documento de outra natureza (só "pagar" numa receita) → ignorado', () => {
    const r = validarAcao('registrar_lancamento', { ...doModelo, tipo: 'receita', categoria_id: null, tipo_documento_id: 'td_nf' }, montar('recebi 50'), '2026-10-30')
    expect(r.tipo_documento_id).toBeUndefined()
  })
  it('"todo mês" → repetir mensal', () => {
    const r = validarAcao('registrar_lancamento', { ...doModelo, repetir: 'monthly' }, montar(SMS), '2026-10-30')
    expect(r.repetir).toBe('monthly')
    expect(camposDoPedido(r, 'itaupers', APP).initial.repeatFrequency).toBe('monthly')
  })
  it('texto sem instruções: nada novo (o grupo segue o padrão da categoria, como ao escolher à mão)', () => {
    const r = validarAcao('registrar_lancamento', doModelo, montar(SMS.replace(/\. Lançar.*/, '.')), '2026-10-30')
    for (const k of ['grupo_gerencial_id', 'reserva_conta_id', 'reserva_funcao_id', 'tipo_documento_id', 'observacoes', 'fatura', 'repetir']) expect(r[k], k).toBeUndefined()
    expect(camposDoPedido(r, 'itaupers', APP)).toEqual({ initial: {}, citados: [] })
    const merc = camposDoPedido({ ...r, categoria_id: 'cat_merc' }, 'itaupers', APP)
    expect(merc.initial.grupoGerencial).toBe('grp_3')
    expect(merc.citados).toEqual([])
  })
})

describe('A3 — lote com instrução geral', () => {
  it('"todos como gerencial": cada item com o grupo vai para a revisão (o formulário aplica)', () => {
    const itens = [
      { ...doModelo, valor: 50, grupo_gerencial_id: 'grp_1', confianca: {} },
      { ...doModelo, valor: 80, grupo_gerencial_id: 'grp_1', confianca: {} },
    ].map(p => validarAcao('registrar_lancamento', p, montar('todos como gerencial no itaupers: 50 drogaria, 80 drogaria', { lote: true }), '2026-10-30'))
    const ctx = { ...APP, transactions: [], preLancamentos: [] }
    for (const it of itens) {
      expect(it.grupo_gerencial_id).toBe('grp_1')
      expect(pendenciasDoItem({ ferramenta: 'registrar_lancamento', sugestao: it }, ctx)).toContain(MOTIVOS.gerencial)
      expect(camposDoPedido(it, 'itaupers', APP).initial.grupoGerencial).toBe('grp_1')
    }
  })
  it('gravação direta leva tipo de documento e observação', () => {
    const tx = lancamentoDireto({ ...doModelo, conta_id: 'itau', tipo_documento_id: 'td_rec', observacoes: 'presente' }, { accounts: APP.accounts })
    expect(tx).toMatchObject({ tipoDocumentoId: 'td_rec', notes: 'presente' })
  })
})
