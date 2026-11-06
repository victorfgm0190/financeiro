import { describe, it, expect } from 'vitest'
import { jornadaComStatus, PASSOS_JORNADA, FASES_JORNADA, ETAPAS_JORNADA, OBJETIVOS, telaConcluidaNaJornada } from './onboardingSteps.js'
import { PREREQUISITOS, prerequisitosDe } from './prerequisitos.js'
import { AJUDA_TELAS } from './ajudaTelas.js'
import { tarefaPorId } from './tarefasGuiadas.js'

const TODAS = ['settings', 'accounts', 'credit', 'transactions', 'schedule', 'cashflow', 'reports', 'reservas', 'contratos', 'import']
const TOTAL_PRINCIPAIS = PASSOS_JORNADA.filter(p => p.fase !== 'extras').length
const ctx = (paginas = TODAS) => ({ podeVer: (p) => paginas.includes(p), podeIncluir: () => true, pode: () => true, iaAtiva: true, gerencialAtivo: true })

describe('configuração da jornada', () => {
  it('5 fases em ordem; cada passo tem fase, tipo, título, descrição, tela e (conforme o tipo) guia ou tarefa', () => {
    expect(FASES_JORNADA.map(f => f.id)).toEqual(['configuracoes', 'cadastros', 'movimento', 'resultados', 'extras'])
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
    expect(r.total).toBe(TOTAL_PRINCIPAIS)
    expect(r.proximo.id).toBe('j-categorias')
    expect(r.fases.find(f => f.id === 'cadastros')).toMatchObject({ feitas: 2, total: 3, completa: false })
  })

  it('"não se aplica" sai do total (e leva junto o que depende dele); pulado fica para retomar', () => {
    const r = jornadaComStatus(ctx(), { progresso: { etapas: { cartao: { estado: 'nao-se-aplica' }, perfil: { estado: 'pulada' } } } })
    expect(r.passos.map(p => p.id)).not.toContain('importar-fatura')
    expect(r.total).toBe(TOTAL_PRINCIPAIS - 1) // só o cartão saiu; importar fatura é Extra
    expect(r.puladas.map(p => p.id).sort()).toEqual(['cartao', 'perfil'])
    expect(r.pulados).toBe(1)
    expect(r.completo).toBe(false)
  })

  it('módulo sem acesso não entra; tudo feito → completo', () => {
    const c = ctx(['settings', 'accounts', 'transactions', 'schedule'])
    const r0 = jornadaComStatus(c, {})
    expect(r0.passos.map(p => p.id)).not.toContain('j-fluxo')
    expect(r0.extras).toBeNull()
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

describe('Extras e pulados', () => {
  it('Extras não entra no contador nem bloqueia a conclusão; tem o próprio x/y', () => {
    const etapas = Object.fromEntries(PASSOS_JORNADA.filter(p => p.tipo === 'conhecer').map(p => [p.id, { estado: 'feita' }]))
    const r = jornadaComStatus(ctx(), {
      profiles: [{ id: 'p' }], accounts: [{ id: 'a', type: 'checking', profileId: 'p' }, { id: 'c', type: 'credit' }],
      transactions: [{ id: 't', type: 'income' }], schedules: [{ id: 's' }], contratos: [{ id: 'k' }], progresso: { etapas },
    })
    expect(r.feitas).toBe(r.total)
    expect(r.completo).toBe(true)
    expect(r.extras).toMatchObject({ id: 'extras', feitas: 1, total: 4 })
    expect(r.fases.map(f => f.id)).not.toContain('extras')
  })
  it('pulado e "não se aplica" resolvem para concluir, mas o contador mostra só os feitos', () => {
    const principais = PASSOS_JORNADA.filter(p => p.fase !== 'extras')
    const etapas = Object.fromEntries(principais.map((p, i) => [p.id, { estado: i === principais.length - 1 ? 'nao-se-aplica' : 'pulada' }]))
    const r = jornadaComStatus(ctx(), { progresso: { etapas } })
    expect(r.completo).toBe(true)
    expect(r.feitas).toBe(0)
    expect(r.pulados).toBe(principais.length - 1)
  })
})

describe('atalho por objetivo', () => {
  it('monta só os pendentes necessários, na ordem das dependências', () => {
    const r = jornadaComStatus(ctx(), { profiles: [{ id: 'p' }], progresso: { objetivo: 'contrato' } })
    expect(r.objetivo.passos.map(p => p.id)).toEqual(['conta', 'contrato'])
    expect(r.proximo.id).toBe('conta')
    const res = jornadaComStatus(ctx(), { progresso: { objetivo: 'reservas' } })
    expect(res.objetivo.passos.map(p => p.id)).toEqual(['perfil', 'reserva', 'funcao-reserva'])
    const car = jornadaComStatus(ctx(), { progresso: { objetivo: 'cartao' } })
    expect(car.objetivo.passos.map(p => p.id)).toEqual(['perfil', 'conta', 'cartao', 'importar-fatura'])
  })
  it('sem acesso ao módulo o objetivo não aparece; sem nada pendente também não; concluído avisa', () => {
    const c = ctx(['settings', 'accounts', 'transactions', 'schedule'])
    expect(jornadaComStatus(c, {}).objetivosDisponiveis.map(o => o.id)).toEqual(['contas-pagar'])
    const dados = { profiles: [{ id: 'p' }], accounts: [{ id: 'a', type: 'checking', profileId: 'p' }], schedules: [{ id: 's' }], progresso: { objetivo: 'contas-pagar' } }
    const r = jornadaComStatus(c, dados)
    expect(r.objetivo).toBeNull()
    expect(r.objetivoConcluido).toBe('contas-pagar')
    expect(r.objetivosDisponiveis.map(o => o.id)).not.toContain('contas-pagar')
  })
  it('todo objetivo aponta para passos que existem', () => {
    for (const o of OBJETIVOS) for (const a of o.alvos) expect(PASSOS_JORNADA.some(p => p.id === a), a).toBe(true)
  })
})

describe('pré-requisitos', () => {
  it('apontam para destinos que existem e têm tela e "Faça comigo"', () => {
    for (const def of Object.values(PREREQUISITOS)) {
      for (const e of def.exige) {
        const p = e.destino || PASSOS_JORNADA.find(x => x.id === e.passo)
        expect(p, e.passo).toBeTruthy()
        expect(p.tela && tarefaPorId(p.tarefa), e.passo).toBeTruthy()
      }
    }
  })
  it('contrato exige perfil, conta e categoria (a do sistema não conta); importar exige cartão; lançamento aceita cartão', () => {
    expect(prerequisitosDe('contrato', {}).itens.map(i => [i.passo.id, i.ok])).toEqual([['perfil', false], ['conta', false], ['categoria', false]])
    const base = { profiles: [{ id: 'p' }], accounts: [{ id: 'a', type: 'checking', profileId: 'p' }] }
    expect(prerequisitosDe('contrato', { ...base, categories: [{ id: 'cat_res_ger' }] }).faltam).toBe(true)
    expect(prerequisitosDe('contrato', { ...base, categories: [{ id: 'cat_1' }] }).faltam).toBe(false)
    expect(prerequisitosDe('importar-fatura', { accounts: [{ id: 'a', type: 'checking' }] }).faltam).toBe(true)
    expect(prerequisitosDe('lancamento', { accounts: [{ id: 'c', type: 'credit' }] }).faltam).toBe(false)
    expect(prerequisitosDe('nao-existe', {})).toBeNull()
  })
})

describe('tour da tela depois da jornada', () => {
  it('tela com "Entendi" gravado não reabre sozinha; sem isso, segue a regra normal', () => {
    expect(telaConcluidaNaJornada('dashboard', { etapas: { 'j-painel': { estado: 'feita' } } })).toBe(true)
    expect(telaConcluidaNaJornada('dashboard', { etapas: { 'j-painel': { estado: 'pulada' } } })).toBe(false)
    expect(telaConcluidaNaJornada('accounts', { etapas: { 'j-painel': { estado: 'feita' } } })).toBe(false)
  })
})

