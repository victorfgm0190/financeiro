import { describe, it, expect } from 'vitest'
import { isTransferenciaEntrePerfis, categoriasEntrePerfis, transferenciaNaVisaoDoPerfil, categoriasDosLados, pernasEntrePerfis } from './transferenciaPerfis'
import { diffCampos, precisaEscolherEscopo, planoAgendamento, occCampos, comCamposDaOcorrencia, ESCOPO } from './camposSerie'

const pj = { id: 'a1', profileId: 'p_pj' }
const pf = { id: 'a2', profileId: 'p_pf' }
const pf2 = { id: 'a3', profileId: 'p_pf' }
const semPerfil = { id: 'a4' }

describe('isTransferenciaEntrePerfis', () => {
  it('perfis diferentes → true', () => {
    expect(isTransferenciaEntrePerfis(pj, pf)).toBe(true)
    expect(isTransferenciaEntrePerfis(pf, pj)).toBe(true)
  })
  it('mesmo perfil, conta sem perfil ou ausente → false', () => {
    expect(isTransferenciaEntrePerfis(pf, pf2)).toBe(false)
    expect(isTransferenciaEntrePerfis(pj, semPerfil)).toBe(false)
    expect(isTransferenciaEntrePerfis(pj, undefined)).toBe(false)
  })
})

describe('categoriasEntrePerfis', () => {
  const perfis = [{ id: 'p_pj', type: 'pj' }, { id: 'p_pf', type: 'pf' }]
  it('agendamento antigo (só colunas por tipo) → lados lidos pelo tipo; antigas mantidas (tipos diferentes)', () => {
    expect(categoriasEntrePerfis(pj, pf, { categoriaCnpjId: 'c1', categoriaCpfId: 'c2' }, perfis))
      .toEqual({ categoriaOrigemId: 'c1', categoriaDestinoId: 'c2', categoriaCnpjId: 'c1', categoriaCpfId: 'c2' })
    expect(categoriasEntrePerfis(pf, pj, { categoriaCnpjId: 'c1', categoriaCpfId: 'c2' }, perfis))
      .toEqual({ categoriaOrigemId: 'c2', categoriaDestinoId: 'c1', categoriaCnpjId: 'c1', categoriaCpfId: 'c2' })
  })
  it('mesmo perfil → null em tudo', () => {
    expect(categoriasEntrePerfis(pf, pf2, { categoriaOrigemId: 'x' }, perfis))
      .toEqual({ categoriaOrigemId: null, categoriaDestinoId: null, categoriaCnpjId: null, categoriaCpfId: null })
  })
  it('vazio → null (agendamento antigo sem categoria)', () => {
    expect(categoriasEntrePerfis(pj, pf, {}, perfis))
      .toEqual({ categoriaOrigemId: null, categoriaDestinoId: null, categoriaCnpjId: null, categoriaCpfId: null })
  })
})

describe('categorias por lado — as quatro combinações (gravação e leitura)', () => {
  const perfis = [
    { id: 'pf1', type: 'pf', name: 'Pessoa Um' }, { id: 'pf2', type: 'pf', name: 'Pessoa Dois' },
    { id: 'pj1', type: 'pj', name: 'Empresa Um' }, { id: 'pj2', type: 'pj', name: 'Empresa Dois' },
  ]
  const conta = (p) => ({ id: `c_${p}`, profileId: p })
  const accById = new Map(perfis.map(p => [`c_${p.id}`, conta(p.id)]))
  const profileById = new Map(perfis.map(p => [p.id, p]))
  const casos = [
    ['CPF→CNPJ', 'pf1', 'pj1', { categoriaCnpjId: 'DEST', categoriaCpfId: 'ORIG' }],
    ['CNPJ→CPF', 'pj1', 'pf1', { categoriaCnpjId: 'ORIG', categoriaCpfId: 'DEST' }],
    ['CPF→CPF', 'pf1', 'pf2', {}],
    ['CNPJ→CNPJ', 'pj1', 'pj2', {}],
  ]
  for (const [nome, de, para, antigas] of casos) {
    it(`${nome}: grava cada lado na sua coluna; KPI de cada perfil lê a categoria do seu lado`, () => {
      const gravado = categoriasEntrePerfis(conta(de), conta(para), { categoriaOrigemId: 'ORIG', categoriaDestinoId: 'DEST' }, perfis)
      expect(gravado.categoriaOrigemId).toBe('ORIG')
      expect(gravado.categoriaDestinoId).toBe('DEST')
      // Antigas: só quando os tipos diferem (mesmo tipo: fora do objeto — não mudam).
      if (Object.keys(antigas).length) expect(gravado).toMatchObject(antigas)
      else expect('categoriaCnpjId' in gravado || 'categoriaCpfId' in gravado).toBe(false)
      const tx = { id: 't', type: 'transfer', amount: 10, accountId: `c_${de}`, toAccountId: `c_${para}`, ...gravado }
      expect(categoriasDosLados(tx, conta(de), conta(para), perfis)).toEqual({ origem: 'ORIG', destino: 'DEST' })
      // KPIs com o perfil selecionado.
      expect(transferenciaNaVisaoDoPerfil(tx, profileById.get(de), accById, profileById)).toMatchObject({ type: 'expense', categoryId: 'ORIG' })
      expect(transferenciaNaVisaoDoPerfil(tx, profileById.get(para), accById, profileById)).toMatchObject({ type: 'income', categoryId: 'DEST' })
      // Demonstrativo (Todos, com "transferências entre perfis"): uma perna por lado.
      const pernas = pernasEntrePerfis([tx], [...accById.values()], perfis)
      expect(pernas.map(p => [p.type, p.categoryId])).toEqual([['expense', 'ORIG'], ['income', 'DEST']])
    })
  }
  it('lançamento antigo (só colunas por tipo): lido pelo tipo de cada lado, como antes', () => {
    const tx = { type: 'transfer', accountId: 'c_pf1', toAccountId: 'c_pj1', categoriaCnpjId: 'X_PJ', categoriaCpfId: 'X_PF', categoriaOrigemId: null, categoriaDestinoId: null }
    expect(categoriasDosLados(tx, conta('pf1'), conta('pj1'), perfis)).toEqual({ origem: 'X_PF', destino: 'X_PJ' })
  })
  it('ajuste antigo de uma ocorrência (só CNPJ/CPF) vale sobre as por lado do agendamento', () => {
    const sch = { id: 's', frequency: 'monthly', startDate: '2026-01-10', accountId: 'c_pf1', toAccountId: 'c_pj1',
      categoriaOrigemId: 'BASE_O', categoriaDestinoId: 'BASE_D', overrides: { '2026-02-10': { categoriaCnpjId: 'OV_PJ', categoriaCpfId: 'OV_PF' } } }
    const oc = comCamposDaOcorrencia(sch, '2026-02-10')
    expect(categoriasDosLados(oc, conta('pf1'), conta('pj1'), perfis)).toEqual({ origem: 'OV_PF', destino: 'OV_PJ' })
    expect(categoriasDosLados(comCamposDaOcorrencia(sch, '2026-03-10'), conta('pf1'), conta('pj1'), perfis)).toEqual({ origem: 'BASE_O', destino: 'BASE_D' })
  })
})

describe('categorias por perfil como campos da PARCELA', () => {
  const sch = {
    id: 's1', frequency: 'monthly', startDate: '2026-01-10', transactionType: 'transfer',
    accountId: 'a1', toAccountId: 'a2', amount: 100, categoriaCnpjId: 'c1', categoriaCpfId: 'c2', overrides: {},
  }
  const pendentes = ['2026-11-10', '2026-12-10', '2027-01-10']

  it('mudar a categoria do CNPJ pergunta o escopo quando há próximas', () => {
    const mud = diffCampos({ categoriaCnpjId: 'c1' }, { categoriaCnpjId: 'c9' })
    expect(mud).toEqual([{ campo: 'categoriaCnpjId', de: 'c1', para: 'c9' }])
    expect(precisaEscolherEscopo(mud, 2)).toBe(true)
  })

  it('"Só esta" grava override só na ocorrência; o lançamento dela herda', () => {
    const mudancas = [{ campo: 'categoriaCpfId', de: 'c2', para: 'c8' }]
    const { schedule } = planoAgendamento(sch, { occDate: '2026-11-10', mudancas, escopo: ESCOPO.PARCELA, pendentes })
    expect(schedule.categoriaCpfId).toBe('c2')
    expect(schedule.overrides['2026-11-10']).toEqual({ categoriaCpfId: 'c8' })
    expect(occCampos(schedule, '2026-11-10').categoriaCpfId).toBe('c8')
    expect(comCamposDaOcorrencia(schedule, '2026-11-10').categoriaCpfId).toBe('c8')
    expect(comCamposDaOcorrencia(schedule, '2026-12-10').categoriaCpfId).toBe('c2')
  })

  it('"Esta e as próximas" muda o agendamento base', () => {
    const mudancas = [{ campo: 'categoriaCnpjId', de: 'c1', para: 'c9' }]
    const { schedule } = planoAgendamento(sch, { occDate: '2026-11-10', mudancas, escopo: ESCOPO.PROXIMAS, pendentes })
    expect(schedule.categoriaCnpjId).toBe('c9')
    expect(occCampos(schedule, '2027-01-10').categoriaCnpjId).toBe('c9')
  })
})

describe('transferenciaNaVisaoDoPerfil — favorecido = perfil do outro lado', () => {
  const victor = { id: 'p_v', name: 'VICTOR', type: 'pf' }
  const lumen = { id: 'p_l', name: 'Lumen Tech', type: 'pj' }
  const profileById = new Map([victor, lumen].map(p => [p.id, p]))
  const accById = new Map([
    ['cc_v', { id: 'cc_v', profileId: 'p_v' }],
    ['cc_v2', { id: 'cc_v2', profileId: 'p_v' }],
    ['cc_l', { id: 'cc_l', profileId: 'p_l' }],
  ])
  const base = { id: 't1', type: 'transfer', amount: 100, categoriaCnpjId: 'cat_pj', categoriaCpfId: 'cat_pf' }
  const vParaL = { ...base, accountId: 'cc_v', toAccountId: 'cc_l', payee: 'Texto antigo' }
  const lParaV = { ...base, accountId: 'cc_l', toAccountId: 'cc_v', payee: '' }
  const ver = (tx, perfil) => transferenciaNaVisaoDoPerfil(tx, perfil, accById, profileById)

  it('Lumen Tech, entrou (veio do Victor) → receita, favorecido VICTOR', () => {
    expect(ver(vParaL, lumen)).toMatchObject({ type: 'income', payee: 'VICTOR', categoryId: 'cat_pj', accountId: 'cc_l', amount: 100 })
  })
  it('Lumen Tech, saiu (foi para o Victor) → despesa, favorecido VICTOR', () => {
    expect(ver(lParaV, lumen)).toMatchObject({ type: 'expense', payee: 'VICTOR', categoryId: 'cat_pj', accountId: 'cc_l' })
  })
  it('Victor, entrou (veio da Lumen) → receita, favorecido Lumen Tech', () => {
    expect(ver(lParaV, victor)).toMatchObject({ type: 'income', payee: 'Lumen Tech', categoryId: 'cat_pf', accountId: 'cc_v' })
  })
  it('Victor, saiu (foi para a Lumen) → despesa, favorecido Lumen Tech (mesmo com payee preenchido)', () => {
    expect(ver(vParaL, victor)).toMatchObject({ type: 'expense', payee: 'Lumen Tech', categoryId: 'cat_pf', accountId: 'cc_v' })
  })
  it('Tudo (sem perfil ativo) e mesmo perfil: continua transferência, sem tocar no lançamento', () => {
    expect(ver(vParaL, null)).toBe(vParaL)
    const interna = { ...base, accountId: 'cc_v', toAccountId: 'cc_v2', payee: '' }
    expect(ver(interna, victor)).toBe(interna)
  })
  it('não altera o lançamento original', () => {
    ver(vParaL, victor)
    expect(vParaL).toMatchObject({ type: 'transfer', payee: 'Texto antigo', accountId: 'cc_v' })
  })
})
