import { describe, it, expect } from 'vitest'
import {
  contaCentralDoPerfil, contaCentralPara, msgSemContaCentral, dependentesDaContaCentral,
  checarRemocaoContaCentral, perfisSemContaCentral, mesmoPerfil,
} from './contaCentral'
import { contaPrincipalDe, montarProvisaoGerencial } from './provisaoGerencial'
import { ordenarPerfis, moverPerfil, proximaOrdem, perfilInicial, TUDO } from './perfisOrdem'

// Situação real (Neon, 16/10/2026): Victor tem a Conta central (Itau Principal, também favorita);
// Lumen Tech tem 2 contas correntes e nenhuma Conta central.
const PERFIS = [
  { id: 'prf_victor', name: 'VICTOR FRANCISCO GOMES MOREIRA', ordem: 0 },
  { id: 'prf_lumen', name: 'Lumen Tech', ordem: 1 },
]
const ITAU = { id: 'acc_itau', name: 'Itau Principal', type: 'checking', profileId: 'prf_victor', contaCorrentePrincipal: true, isMain: true }
const BB = { id: 'acc_bb', name: 'BB', type: 'checking', profileId: 'prf_victor' }
const CARTAO = { id: 'acc_card', name: 'Itaupers', apelido: 'Itaupers', type: 'credit', profileId: 'prf_victor' }
const CORA = { id: 'acc_cora', name: 'Cora', type: 'checking', profileId: 'prf_lumen' }
const CARTAO_LUMEN = { id: 'acc_card_l', name: 'Cartão PJ', apelido: 'CPJ', type: 'credit', profileId: 'prf_lumen' }
const RICO = { id: 'acc_rico', name: 'Rico', type: 'checking', profileId: null, isMain: true }
const CONTAS = [ITAU, BB, CARTAO, CORA, RICO]

describe('Conta central por perfil', () => {
  it('usa a Conta central do PERFIL DO ITEM', () => {
    expect(contaCentralDoPerfil(CONTAS, 'prf_victor')?.id).toBe('acc_itau')
    expect(contaCentralPara(CONTAS, PERFIS, CARTAO)).toEqual({ conta: ITAU, erro: null })
  })
  it('perfil sem Conta central: NÃO usa a de outro perfil, nem favorita, nem a primeira corrente', () => {
    const r = contaCentralPara(CONTAS, PERFIS, CARTAO_LUMEN)
    expect(r.conta).toBeNull()
    expect(r.erro).toBe('O perfil Lumen Tech não tem Conta central. Defina em Contas → editar conta.')
    // Mesmo com favorita no perfil, a favorita não entra.
    expect(contaCentralDoPerfil([...CONTAS, { ...CORA, id: 'x', isMain: true }], 'prf_lumen')).toBeNull()
  })
  it('item sem perfil: bloqueia com a mensagem da conta', () => {
    expect(contaCentralPara(CONTAS, PERFIS, RICO).erro).toBe('A conta "Rico" não tem perfil. Defina o perfil dela em Contas → editar conta.')
    expect(msgSemContaCentral(PERFIS, null)).toMatch(/não tem perfil/)
  })
  it('provisão gerencial usa a Conta central do perfil do cartão; sem ela não monta', () => {
    expect(contaPrincipalDe(CONTAS, 'prf_lumen')).toBeNull()
    const d = { accounts: [...CONTAS, CARTAO_LUMEN], gerencialGroups: [{ id: 'g1', number: 1 }], settings: {} }
    const parcela = { id: 'tx1', accountId: 'acc_card', amount: 10, date: '2026-10-10', description: 'X' }
    expect(montarProvisaoGerencial(d, parcela, { id: 'tx_ger_1' })?.tx.accountId).toBe('acc_itau')
    expect(montarProvisaoGerencial(d, { ...parcela, accountId: 'acc_card_l' }, { id: 'tx_ger_2' })).toBeNull()
  })
  it('subconta Ger. criada herda o perfil da Conta central', () => {
    const d = { accounts: CONTAS, gerencialGroups: [{ id: 'g1', number: 1 }], settings: {} }
    const r = montarProvisaoGerencial(d, { id: 'tx1', accountId: 'acc_card', amount: 10, date: '2026-10-10' }, { id: 'tx_ger_1' })
    expect(r.subcontaCriada).toBe(true)
    expect(r.accounts.find(a => a.name === 'Ger. Itaupers').profileId).toBe('prf_victor')
  })
})

describe('excluir/inativar a Conta central', () => {
  it('bloqueia quando o perfil tem cartão, reserva, Ger. ou financiamento', () => {
    expect(dependentesDaContaCentral('prf_victor', { accounts: CONTAS })).toEqual(['cartão'])
    const r = checarRemocaoContaCentral(ITAU, { accounts: CONTAS, profiles: PERFIS }, 'excluir')
    expect(r.bloqueio).toBe('Defina outra Conta central para VICTOR FRANCISCO GOMES MOREIRA antes de excluir esta conta.')
  })
  it('financiamento conta como dependente (parcela ligada a conta do perfil)', () => {
    const contas = [ITAU, BB]
    expect(dependentesDaContaCentral('prf_victor', { accounts: contas, schedules: [{ financingInstallmentId: 'fi1', accountId: 'acc_bb', toAccountId: 'acc_div' }] })).toEqual(['financiamento'])
  })
  it('sem dependentes: só avisa', () => {
    const r = checarRemocaoContaCentral(ITAU, { accounts: [ITAU, BB], profiles: PERFIS }, 'inativar')
    expect(r.bloqueio).toBeNull()
    expect(r.aviso).toMatch(/fica sem Conta central/)
  })
  it('conta que não é central: nada', () => {
    expect(checarRemocaoContaCentral(BB, { accounts: CONTAS, profiles: PERFIS })).toEqual({ bloqueio: null, aviso: null })
  })
  it('banner: só perfis com dependentes e sem Conta central', () => {
    expect(perfisSemContaCentral({ accounts: CONTAS, profiles: PERFIS })).toEqual([])
    expect(perfisSemContaCentral({ accounts: [...CONTAS, CARTAO_LUMEN], profiles: PERFIS }).map(x => [x.nome, x.dependentes]))
      .toEqual([['Lumen Tech', ['cartão']]])
  })
  it('favorita: contas sem perfil formam um grupo próprio', () => {
    expect(mesmoPerfil(RICO, { profileId: null })).toBe(true)
    expect(mesmoPerfil(RICO, ITAU)).toBe(false)
  })
})

describe('ordem dos perfis e perfil inicial', () => {
  const P = [{ id: 'b', name: 'B', ordem: 1 }, { id: 'a', name: 'A', ordem: 0 }, { id: 'c', name: 'C', ordem: 2 }]
  it('ordena por ordem; setas trocam e renumeram', () => {
    expect(ordenarPerfis(P).map(p => p.id)).toEqual(['a', 'b', 'c'])
    expect(moverPerfil(P, 'c', 'up').map(p => [p.id, p.ordem])).toEqual([['a', 0], ['c', 1], ['b', 2]])
    expect(moverPerfil(P, 'a', 'up')).toBe(P)
    expect(proximaOrdem(P)).toBe(3)
  })
  it('abre no 1º da ordem; respeita a escolha da sessão (inclusive "Tudo"); escolha de perfil excluído volta ao 1º', () => {
    expect(perfilInicial(P, null)).toBe('a')
    expect(perfilInicial(P, 'c')).toBe('c')
    expect(perfilInicial(P, TUDO)).toBeNull()
    expect(perfilInicial(P, 'zzz')).toBe('a')
  })
})
