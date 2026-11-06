import { describe, it, expect } from 'vitest'
import { jornadaComStatus, PASSOS_JORNADA, FASES_JORNADA, ETAPAS_JORNADA } from './onboardingSteps.js'
import { AJUDA_TELAS } from './ajudaTelas.js'
import { tarefaPorId } from './tarefasGuiadas.js'

const TODAS = ['settings', 'accounts', 'credit', 'transactions', 'schedule', 'cashflow', 'reports', 'reservas', 'contratos', 'import']
const ctx = (paginas = TODAS) => ({ podeVer: (p) => paginas.includes(p), podeIncluir: () => true, pode: () => true, iaAtiva: true, gerencialAtivo: true })

describe('configuração da jornada', () => {
  it('5 fases em ordem; cada passo tem fase, tipo, título, descrição, tela e (conforme o tipo) guia ou tarefa', () => {
    expect(FASES_JORNADA.map(f => f.id)).toEqual(['configuracoes', 'cadastros', 'movimento', 'resultados', 'avancado'])
    for (const p of PASSOS_JORNADA) {
      expect(FASES_JORNADA.some(f => f.id === p.fase), p.id).toBe(true)
      expect(['conhecer', 'fazer'], p.id).toContain(p.tipo)
      expect(p.titulo && p.descricao && p.tela, p.id).toBeTruthy()
      expect(Array.isArray(p.dependsOn), p.id).toBe(true)
      if (p.tipo === 'conhecer') expect(p.guia, p.id).toBeTruthy()
      else expect(p.tarefa && typeof p.feito === 'function', p.id).toBeTruthy()
    }
    expect(new Set(ETAPAS_JORNADA).size).toBe(ETAPAS_JORNADA.length)
  })
})

describe('ligações da jornada com os guias', () => {
  it('todo guia, item de tour e tarefa citados existem; a tarefa começa na tela do passo', () => {
    for (const p of PASSOS_JORNADA) {
      if (p.guia) expect(AJUDA_TELAS[p.guia], `${p.id} guia`).toBeTruthy()
      if (p.guiaChave) expect(AJUDA_TELAS[p.guia].itens.some(i => i.chave === p.guiaChave), `${p.id} chave`).toBe(true)
      if (p.tarefa) {
        expect(tarefaPorId(p.tarefa), `${p.id} tarefa`).toBeTruthy()
        expect(tarefaPorId(p.tarefa).tela, `${p.id} tela`).toBe(p.tela)
      }
    }
  })
})

describe('progresso da jornada', () => {
  it('passo "fazer" nasce concluído quando o dado já existe; "conhecer" só com "Entendi"', () => {
    const r = jornadaComStatus(ctx(), {
      profiles: [{ id: 'p' }], accounts: [{ id: 'a', type: 'checking', profileId: 'p' }],
      transactions: [{ id: 't', type: 'expense' }],
      progresso: { etapas: { 'j-configuracoes': { estado: 'feita' } } },
    })
    const est = Object.fromEntries(r.passos.map(p => [p.id, p.estado]))
    expect(est).toMatchObject({ perfil: 'feita', conta: 'feita', lancamento: 'feita', 'j-configuracoes': 'feita', 'j-categorias': 'pendente', cartao: 'pendente', agendamento: 'pendente' })
    expect(r.feitas).toBe(4)
    expect(r.total).toBe(PASSOS_JORNADA.length)
    expect(r.proximo.id).toBe('j-categorias')
    expect(r.fases.find(f => f.id === 'cadastros')).toMatchObject({ feitas: 2, total: 3, completa: false })
  })

  it('"não se aplica" sai do total (e leva junto o que depende dele); pulado fica para retomar', () => {
    const r = jornadaComStatus(ctx(), { progresso: { etapas: { cartao: { estado: 'nao-se-aplica' }, perfil: { estado: 'pulada' } } } })
    expect(r.passos.map(p => p.id)).not.toContain('importar-fatura')
    expect(r.total).toBe(PASSOS_JORNADA.length - 2)
    expect(r.puladas.map(p => p.id).sort()).toEqual(['cartao', 'perfil'])
    expect(r.completo).toBe(false)
  })

  it('módulo sem acesso não entra; tudo feito → completo', () => {
    const c = ctx(['settings', 'accounts', 'transactions', 'schedule'])
    const r0 = jornadaComStatus(c, {})
    expect(r0.passos.map(p => p.id)).not.toContain('j-fluxo')
    expect(r0.fases.map(f => f.id)).not.toContain('avancado')
    const etapas = Object.fromEntries(r0.passos.filter(p => p.tipo === 'conhecer').map(p => [p.id, { estado: 'feita' }]))
    etapas.cartao = { estado: 'nao-se-aplica' }
    const r = jornadaComStatus(c, {
      profiles: [{ id: 'p' }], accounts: [{ id: 'a', type: 'checking', profileId: 'p' }],
      transactions: [{ id: 't', type: 'income' }], schedules: [{ id: 's' }], progresso: { etapas },
    })
    expect(r.completo).toBe(true)
    expect(r.feitas).toBe(r.total)
  })
})
