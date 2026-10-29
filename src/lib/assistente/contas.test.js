import { describe, it, expect } from 'vitest'
import { classificarContas, contaParaGravar, gerencialCitada, citado, escolherConta, papelDaContaApp } from './contas'
import { validarAcao } from './acoes'

// Contas no formato do banco (neondb, 29/10): perfis Victor (PV) e Lumen (PL).
const ROWS = [
  { id: 'itaupers', name: 'Cartao Itau Personalite', apelido: 'Itaupers', type: 'credit', vinculo_tipo: 'none', profile_id: 'PV', active: true },
  { id: 'nubank', name: 'Nubank', apelido: 'NUBANK', type: 'credit', vinculo_tipo: 'none', profile_id: 'PV', active: true },
  { id: 'swile', name: 'SWILE VR GI', type: 'credit', vinculo_tipo: 'none', profile_id: 'PV', active: false },
  { id: 'itau', name: 'Itau Principal', apelido: 'Itau', type: 'checking', is_main: true, profile_id: 'PV', active: true },
  { id: 'lumen', name: 'ITAU LUMEN', apelido: 'ITLUMEN', type: 'checking', is_main: true, profile_id: 'PL', active: true },
  { id: 'bb', name: 'Banco do Brasil Principal', apelido: 'BB', type: 'checking', profile_id: 'PV', active: true },
  { id: 'anuais', name: 'Contas Anuais', apelido: 'CA', type: 'savings', vinculo_tipo: 'reserva', is_reserva: true, profile_id: 'PV', active: true },
  { id: 'ipca', name: 'IPCA 2035', type: 'investment', active: true },
  { id: 'hb20', name: 'HB20S', type: 'asset', profile_id: 'PV', active: true },
  { id: 'fin', name: 'Contas a Pagar - Fin. TIGGO', type: 'liability', profile_id: 'PV', active: true },
  { id: 'ger_itaupers', name: 'Ger. Itaupers', apelido: 'GItauper', type: 'gerencial', is_gerencial: true, profile_id: 'PV', active: true },
  { id: 'ger_legado', name: 'Ger. NUGI', type: 'checking', profile_id: 'PV', active: true },
  { id: 'dinger', name: 'Dinheiro Ger', apelido: 'dinger', type: 'cash', profile_id: 'PV', active: true },
]

const montar = (perfilAtivo, textoPedido = '', apelidos = [], temImagem = false) => {
  const contas = classificarContas(ROWS, perfilAtivo)
  return {
    contas, textoPedido, apelidos, perfilAtivo, temImagem,
    idx: { contas: new Map(contas.map(c => [c.id, c])), categorias: new Map([['cat_carne', { tipo: 'expense' }]]), favorecidos: new Map(), centros: new Map() },
  }
}
const papel = (ctx, id) => ctx.idx.contas.get(id).papel

describe('contas do Assistente — o que a IA pode sugerir', () => {
  it('sugeríveis: cartões ativos de uso comum + favorita do perfil ativo', () => {
    const ctx = montar('PV')
    const sug = ctx.contas.filter(c => c.papel === 'sugerivel').map(c => c.id)
    expect(sug).toEqual(['itaupers', 'nubank', 'itau'])
  })
  it('sem perfil ativo: as favoritas visíveis de todos os perfis', () => {
    expect(montar(null).contas.filter(c => c.papel === 'sugerivel').map(c => c.id)).toEqual(['itaupers', 'nubank', 'itau', 'lumen'])
  })
  it('reserva, investimento, bem, financiamento, outra corrente e inativa: só se citadas', () => {
    const ctx = montar('PV')
    for (const id of ['anuais', 'ipca', 'hb20', 'fin', 'bb', 'swile', 'lumen', 'dinger']) expect(papel(ctx, id)).toBe('citar')
  })
  it('gerencial: tipo gerencial, is_gerencial ou nome "Ger. …" (como a Integridade) — "Dinheiro Ger" não', () => {
    const ctx = montar('PV')
    expect(papel(ctx, 'ger_itaupers')).toBe('gerencial')
    expect(papel(ctx, 'ger_legado')).toBe('gerencial')
    expect(papel(ctx, 'dinger')).toBe('citar')
  })
})

describe('contaParaGravar (validação no backend)', () => {
  it('sugerível passa sem citar', () => {
    expect(contaParaGravar(montar('PV', 'gastei 50 no mercado'), 'itaupers')).toEqual({ id: 'itaupers', gerencial: false })
  })
  it('fora das sugeríveis: zera se o pedido não citou; aceita citada por nome, apelido ou apelido aprendido', () => {
    expect(contaParaGravar(montar('PV', 'gastei 50 no mercado'), 'bb').id).toBeNull()
    expect(contaParaGravar(montar('PV', 'gastei 50 no mercado no BB'), 'bb').id).toBe('bb')
    expect(contaParaGravar(montar('PV', 'tira 200 das contas anuais'), 'anuais').id).toBe('anuais')
    expect(contaParaGravar(montar('PV', 'paguei com o banco amarelo', [{ tipo: 'conta', termo: 'banco amarelo', ref_id: 'bb' }]), 'bb').id).toBe('bb')
  })
  it('gerencial é sempre recusada, mesmo citada', () => {
    expect(contaParaGravar(montar('PV', 'lança 30 no Ger. Itaupers'), 'ger_itaupers')).toEqual({ id: null, gerencial: true })
  })
  it('destino de transferência: reserva citada pode; inativa não', () => {
    expect(contaParaGravar(montar('PV', 'transfere 100 do itau para contas anuais'), 'anuais', { destino: true }).id).toBe('anuais')
    expect(contaParaGravar(montar('PV', 'transfere 100 para o SWILE VR GI'), 'swile', { destino: true }).id).toBeNull()
  })
})

describe('validarAcao com as regras de conta', () => {
  const base = { tipo: 'despesa', valor: 50, data: '2026-10-29', categoria_id: 'cat_carne', confianca: { conta: 0.9 } }
  it('conta não citada fora das sugeríveis → favorita do perfil ativo, "confira"; perfil Tudo → vazio', () => {
    const r = validarAcao('registrar_lancamento', { ...base, conta_id: 'bb' }, montar('PV', 'gastei 50 de carne'), '2026-10-29')
    expect(r).toMatchObject({ conta_id: 'itau', confianca: { conta: 0.4 } })
    expect(r.conta_gerencial).toBeUndefined()
    expect(validarAcao('registrar_lancamento', { ...base, conta_id: 'bb' }, montar(null, 'gastei 50 de carne'), '2026-10-29'))
      .toMatchObject({ conta_id: null, confianca: { conta: 0 } })
  })
  it('gerencial como origem ou destino → marca conta_gerencial (o backend responde abrir_tela)', () => {
    const ctx = montar('PV', 'lança 50 no ger itaupers')
    expect(validarAcao('registrar_lancamento', { ...base, conta_id: 'ger_itaupers' }, ctx, '2026-10-29')).toMatchObject({ conta_id: null, conta_gerencial: true })
    const t = validarAcao('registrar_lancamento', { ...base, tipo: 'transferencia', conta_id: 'itau', conta_destino_id: 'ger_itaupers' }, montar('PV', 'transfere 50 pro ger itaupers'), '2026-10-29')
    expect(t).toMatchObject({ conta_id: 'itau', conta_destino_id: null, conta_gerencial: true })
  })
  it('transferência para reserva citada é aceita', () => {
    const t = validarAcao('registrar_lancamento', { ...base, tipo: 'transferencia', conta_id: 'itau', conta_destino_id: 'anuais' }, montar('PV', 'transfere 50 do itau para contas anuais'), '2026-10-29')
    expect(t).toMatchObject({ conta_id: 'itau', conta_destino_id: 'anuais' })
  })
  it('baixa: mesma regra na conta de pagamento', () => {
    expect(validarAcao('baixar_agendamento', { favorecido: 'Carlos', conta_id: 'ger_itaupers' }, montar('PV', 'paguei o carlos pelo ger itaupers'), '2026-10-29'))
      .toMatchObject({ conta_id: null, conta_gerencial: true })
  })
})

describe('gerencialCitada (rede de segurança: o modelo pode trocar pelo cartão)', () => {
  it('nome, apelido, "conta gerencial", "gerencial do <cartão>"', () => {
    expect(gerencialCitada(montar('PV'), 'lança 30 no Ger. Itaupers')?.id).toBe('ger_itaupers')
    expect(gerencialCitada(montar('PV'), 'lança 30 na gitauper')?.id).toBe('ger_itaupers')
    expect(gerencialCitada(montar('PV'), 'lança 30 na gerencial do itaupers')?.id).toBe('ger_itaupers')
    expect(gerencialCitada(montar('PV'), 'põe 30 na conta gerencial')).toBeTruthy()
  })
  it('classificar como gerencial NÃO é citar a conta gerencial', () => {
    expect(gerencialCitada(montar('PV'), 'lança 30 no itaupers grupo gerencial')).toBeNull()
    expect(gerencialCitada(montar('PV'), 'gastei 20 em dinheiro ger')).toBeNull()
  })
  it('citado: palavras inteiras', () => {
    expect(citado('paguei no BB hoje', 'BB')).toBe(true)
    expect(citado('abbey road', 'BB')).toBe(false)
  })
})

describe('ESCOLHA DA CONTA (item 2)', () => {
  it('citou a conta → ela, com confiança alta (qualquer ativa, exceto gerencial)', () => {
    expect(escolherConta(montar('PV', 'efetiva no Banco do Brasil Principal'), 'bb', 0.5)).toMatchObject({ id: 'bb', confianca: 1 })
    expect(escolherConta(montar('PV', 'paguei no BB'), 'bb', 0.5)).toMatchObject({ id: 'bb', confianca: 1 })
    expect(escolherConta(montar('PV', 'no ger itaupers'), 'ger_itaupers', 1)).toMatchObject({ id: null, gerencial: true })
  })
  it('compra no cartão (SMS "final 4541", "no cartão", foto) → o cartão escolhido', () => {
    const sms = 'Compra aprovada no seu PERSON BLACK PONTOS final 4541 - SKINA DA CARNE LTDA valor RS 350,08 em 25/10'
    expect(escolherConta(montar('PV', sms), 'itaupers', 0.8)).toMatchObject({ id: 'itaupers', confianca: 0.8 })
    expect(escolherConta(montar('PV', 'gastei 30 no cartão'), 'nubank', 0.6)).toMatchObject({ id: 'nubank' })
    expect(escolherConta(montar('PV', '', [], true), 'itaupers', 0.7)).toMatchObject({ id: 'itaupers' })
  })
  it('"final 4541" aprendido (apelido de conta) conta como citação', () => {
    const ctx = montar('PV', 'compra final 4541 de 20 reais', [{ tipo: 'conta', termo: 'final 4541', ref_id: 'itaupers' }])
    expect(escolherConta(ctx, 'itaupers', 0.3)).toMatchObject({ id: 'itaupers', confianca: 1 })
  })
  it('cartão ambíguo (modelo sem conta) → vazio só no perfil Tudo; com perfil, a favorita marcada "confira"', () => {
    expect(escolherConta(montar(null, 'gastei 30 no cartão'), null, 0)).toMatchObject({ id: null })
  })
  it('não citou conta nem cartão → favorita do perfil ativo, "confira" — mesmo que o modelo tenha chutado um cartão', () => {
    expect(escolherConta(montar('PV', 'gastei 50 de pão'), 'itaupers', 0.9)).toMatchObject({ id: 'itau', confianca: 0.4 })
    expect(escolherConta(montar('PL', 'gastei 50 de pão'), null, 0)).toMatchObject({ id: 'lumen', confianca: 0.4 })
    expect(escolherConta(montar(null, 'gastei 50 de pão'), 'itaupers', 0.9)).toMatchObject({ id: null, confianca: 0 })
  })
  it('seletor do app (camelCase): mesma regra', () => {
    expect(papelDaContaApp({ id: 'x', name: 'Ger. Itaupers', type: 'gerencial', isGerencial: true })).toBe('gerencial')
    expect(papelDaContaApp({ id: 'c', name: 'Nubank', type: 'credit', vinculoTipo: 'none', active: true })).toBe('sugerivel')
    expect(papelDaContaApp({ id: 'i', name: 'Itau', type: 'checking', isMain: true, profileId: 'PV', active: true }, 'PL')).toBe('citar')
  })
})
