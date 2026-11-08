import { describe, it, expect } from 'vitest'
import { validarCombinacao, RESERVED_KEYS } from './combinacao.js'
import { ACOES, ATALHOS_FIXOS, mapaEfetivo, acoesEmConflito, sanearAtalhos } from './registry.js'
import { conflitoDepoisDeGravar, normalizarItem } from '../../../api/atalhos.js'

// Blindagem dos atalhos (Etapa 3): F1 fixa, RESERVED_KEYS, modificador obrigatório (exceto F2/F4/F8/
// F9/F10), sem duplicados — na tela, na API e na migração do que já está gravado.
describe('regras das combinações', () => {
  it('F1 nunca: sozinha ou com qualquer modificador', () => {
    for (const c of ['F1', 'Ctrl+F1', 'Alt+F1', 'Shift+F1', 'Ctrl+Alt+Shift+F1']) expect(validarCombinacao(c), c).toMatch(/F1 é fixa/)
  })
  it('RESERVED_KEYS recusadas com mensagem (F5, F6 e as do navegador)', () => {
    for (const c of ['F3', 'F5', 'F6', 'F7', 'F11', 'F12', 'Ctrl+R', 'Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+L', 'Ctrl+P', 'Ctrl+F', 'Ctrl+H',
      'Ctrl+J', 'Ctrl+D', 'Ctrl+Tab', 'Ctrl+Shift+R', 'Ctrl+Shift+T', 'Ctrl+Shift+N', 'Alt+F4', 'Alt+ArrowLeft', 'Alt+ArrowRight', 'Alt+ArrowUp', 'Alt+ArrowDown']) {
      expect(RESERVED_KEYS, c).toContain(c)
      expect(validarCombinacao(c), c).toMatch(/reservada/)
    }
  })
  it('sem Ctrl/Alt só F2, F4, F8, F9 e F10', () => {
    for (const c of ['F2', 'F4', 'F8', 'F9', 'F10', 'Shift+F2']) expect(validarCombinacao(c), c).toBeNull()
    for (const c of ['N', 'Shift+N', 'Enter', 'Shift+Enter']) expect(validarCombinacao(c), c).toMatch(/modificador/)
    expect(validarCombinacao('Alt+N')).toBeNull()
  })
  it('padrões do app passam nas regras e não se repetem', () => {
    const mapa = mapaEfetivo({})
    for (const a of ACOES) {
      expect(validarCombinacao(a.padrao), a.id).toBeNull()
      expect(acoesEmConflito(a.id, a.padrao, mapa), a.id).toEqual([])
    }
  })
  it('F1 aparece nos fixos com cadeado', () => {
    expect(ATALHOS_FIXOS[0]).toMatchObject({ combinacao: 'F1', trava: true })
  })
})

describe('API: recusa F1, reservadas e duplicados', () => {
  it('normalizarItem recusa F1, F5 e F6', () => {
    for (const c of ['F1', 'F5', 'F6']) expect(normalizarItem({ acaoId: 'nav.envelopes', combinacao: c }).erro, c).toBeTruthy()
    expect(normalizarItem({ acaoId: 'nav.envelopes', combinacao: 'F9' }).item).toEqual({ acaoId: 'nav.envelopes', combinacao: 'F9' })
  })
  it('duplicado no mesmo contexto (ou com global) é recusado; substituir na mesma gravação passa', () => {
    // Alt+N já é "Novo Agendamento" (padrão) na tela de Agendamentos.
    expect(conflitoDepoisDeGravar({}, [{ acaoId: 'agend.lancarProvisao', combinacao: 'Alt+N' }])).toMatch(/Alt\+N já é usada por "Novo Agendamento"/)
    expect(conflitoDepoisDeGravar({}, [{ acaoId: 'agend.novoAgendamento', combinacao: null }, { acaoId: 'agend.lancarProvisao', combinacao: 'Alt+N' }])).toBeNull()
    // Global × tela: Alt+Shift+F (Fluxo de Caixa) não pode ir para uma ação de tela.
    expect(conflitoDepoisDeGravar({}, [{ acaoId: 'conta.novoLancamento', combinacao: 'Alt+Shift+F' }])).toMatch(/já é usada/)
    // Contextos diferentes podem repetir: Alt+N em Contas e em Agendamentos (como os padrões).
    expect(conflitoDepoisDeGravar({}, [{ acaoId: 'conta.novoLancamento', combinacao: 'Alt+N' }])).toBeNull()
  })
})

describe('migração do que já está gravado', () => {
  it('reservada ou F1 volta ao padrão; se o padrão conflitar, é desativada; duplicado desativa a de depois', () => {
    const { mudancas } = sanearAtalhos({
      'nav.envelopes': 'F5', // → padrão Alt+Shift+E
      'conta.novoLancamento': 'Ctrl+F1', // → padrão Alt+N
      'agend.novoAgendamento': 'Alt+V', 'agend.lancarProvisao': 'F6', // padrão de Provisão (Alt+V) já usado → desativa
      'lancamento.tipoReceita': 'Alt+K', 'lancamento.tipoDespesa': 'Alt+K', // repetido → desativa o de depois
      'lancamento.gravar': 'Alt+S', // válido → fica
    }, validarCombinacao)
    const por = Object.fromEntries(mudancas.map(m => [m.acaoId, m.para]))
    expect(por).toEqual({
      'nav.envelopes': 'padrao', 'conta.novoLancamento': 'padrao', 'agend.lancarProvisao': null, 'lancamento.tipoDespesa': null,
    })
    expect(sanearAtalhos({ 'lancamento.gravar': 'Alt+S', 'nav.envelopes': null }, validarCombinacao).mudancas).toEqual([])
  })
})
