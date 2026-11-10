// @vitest-environment jsdom
// Quadro "Transferência entre perfis": esquerda = perfil da conta de ORIGEM, direita = perfil da conta de
// DESTINO, com o nome e o tipo (CPF/CNPJ) de cada perfil; cada lado lista só as categorias do seu perfil;
// grava por lado (categoria_origem_id / categoria_destino_id) e, entre tipos diferentes, também nas
// colunas antigas por tipo. As quatro combinações, a edição de transferência antiga e a baixa de
// agendamento. Dados fictícios.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|tem|set|add|update|delete|salvar|registrar|recarregar|abrir|fechar|criar|atualizar|carregar|planejar|aplicar|vincular|mark|possiveis|contratoPor|recalcular|find|ensure|reverse|baixar|save|register|skip|execut|efetiv|toggle|definir|confirm|reconcil|desfazer)/.test(k) ? vi.fn(() => []) : [])) }),
  isResgatePago: () => false,
}))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useCamadaModal: () => {} }))
vi.mock('./ShortcutHint', () => ({ default: () => null }))
vi.mock('../BoasVindas/useGuiaTela', () => ({ useEstadoBoasVindas: () => null }))

const { default: TransactionForm } = await import('../Transactions/TransactionForm.jsx')
const { PayModal } = await import('../Schedule/SchedulePanel.jsx')
const { default: ScheduleForm } = await import('../Schedule/ScheduleForm.jsx')
const LENTO = { timeout: 90_000 }

const PERFIS = [
  { id: 'pf1', name: 'Pessoa Um', type: 'pf' },
  { id: 'pf2', name: 'Pessoa Dois', type: 'pf' },
  { id: 'pj1', name: 'Empresa Um', type: 'pj' },
  { id: 'pj2', name: 'Empresa Dois', type: 'pj' },
]
const CONTAS = PERFIS.map(p => ({ id: `c_${p.id}`, name: `Conta ${p.name}`, type: 'checking', profileId: p.id, balance: 100 }))
// Uma categoria exclusiva de cada perfil e uma comum a todos.
const CATEGORIAS = [
  ...PERFIS.map(p => ({ id: `k_${p.id}`, name: `Só ${p.name}`, type: 'expense', icon: '•', perfilIds: [p.id] })),
  ...PERFIS.map(p => ({ id: `r_${p.id}`, name: `Receita ${p.name}`, type: 'income', icon: '•', perfilIds: [p.id] })),
  { id: 'k_comum', name: 'Comum', type: 'both', icon: '•' },
]

beforeEach(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
  for (const k of Object.keys(app)) delete app[k]
  Object.assign(app, {
    profiles: PERFIS, accounts: CONTAS, activeProfileId: null,
    accountGroups: [], activeAccountGroups: [], categories: CATEGORIAS,
    payees: [], costCenters: [], transactions: [], schedules: [], gerencialGroups: [], reserveFunctions: [], tiposDocumento: [],
    scheduleReservaFuncoes: [], rateiosByLancamento: new Map(), possiveisDuplicados: new Map(), vinculosPorLancamento: new Map(),
    settings: {}, dbStatus: 'connected', pode: () => true,
    addTransaction: vi.fn(() => 'tx_novo'), updateTransaction: vi.fn(),
    registrarEdicao: vi.fn(async () => {}), temHistorico: () => false,
  })
})
afterEach(() => cleanup())

const lado = (qual) => screen.getByTestId(`lado-${qual}`)
// Abre o seletor de um lado e devolve os itens da lista.
const itensDoLado = (qual) => {
  fireEvent.click(within(lado(qual)).getByRole('button', { name: /Sem categoria|Só |Receita |Comum/ }))
  const itens = [...document.querySelectorAll('[data-item]')].map(b => b.textContent.replace('• ', ''))
  fireEvent.keyDown(screen.getByPlaceholderText('Buscar...'), { key: 'Escape' })
  return itens
}
const escolher = (qual, nome) => {
  fireEvent.click(within(lado(qual)).getByRole('button', { name: /Sem categoria|Só |Receita |Comum/ }))
  fireEvent.click(screen.getByRole('button', { name: `• ${nome}` }))
}

const CASOS = [
  // [nome, origem, destino, tipo origem, tipo destino, colunas antigas esperadas (null = não gravadas)]
  ['CPF→CNPJ', 'pf1', 'pj1', 'CPF', 'CNPJ', { categoriaCpfId: 'k_pf1', categoriaCnpjId: 'r_pj1' }],
  ['CNPJ→CPF', 'pj1', 'pf1', 'CNPJ', 'CPF', { categoriaCnpjId: 'k_pj1', categoriaCpfId: 'r_pf1' }],
  ['CPF→CPF', 'pf1', 'pf2', 'CPF', 'CPF', null],
  ['CNPJ→CNPJ', 'pj1', 'pj2', 'CNPJ', 'CNPJ', null],
]
const nome = (id) => PERFIS.find(p => p.id === id).name

describe('formulário de lançamento — quadro "Transferência entre perfis"', () => {
  for (const [caso, de, para, tDe, tPara, antigas] of CASOS) {
    it(`${caso}: rótulos por lado, categorias do perfil de cada lado e o que é gravado`, LENTO, () => {
      render(<TransactionForm initial={{ type: 'transfer', accountId: `c_${de}`, toAccountId: `c_${para}`, amount: '100' }} onClose={() => {}} onToast={() => {}} preLancamentos={[]} />)
      expect(screen.getByTestId('rotulo-origem').textContent).toContain(`Categoria em ${nome(de)} (${tDe})`)
      expect(screen.getByTestId('rotulo-destino').textContent).toContain(`Categoria em ${nome(para)} (${tPara})`)
      // Cada lado: só as categorias do seu perfil (e as comuns).
      const origem = itensDoLado('origem')
      expect(origem).toEqual(expect.arrayContaining([`Só ${nome(de)}`, 'Comum']))
      expect(origem).not.toContain(`Só ${nome(para)}`)
      const destino = itensDoLado('destino')
      expect(destino).toEqual(expect.arrayContaining([`Receita ${nome(para)}`, 'Comum']))
      expect(destino).not.toContain(`Receita ${nome(de)}`)
      escolher('origem', `Só ${nome(de)}`)
      escolher('destino', `Receita ${nome(para)}`)
      fireEvent.click(document.querySelector('[data-help-salvar="lancamento"]'))
      const gravado = app.addTransaction.mock.calls.at(-1)[0]
      expect(gravado).toMatchObject({ type: 'transfer', categoriaOrigemId: `k_${de}`, categoriaDestinoId: `r_${para}` })
      if (antigas) expect(gravado).toMatchObject(antigas)
      else {
        expect(gravado.categoriaCnpjId ?? null).toBeNull()
        expect(gravado.categoriaCpfId ?? null).toBeNull()
      }
    })
  }

  it('editar transferência antiga (só colunas por tipo): mostra as categorias lidas pelo tipo e, ao salvar, grava nas novas e nas antigas', LENTO, () => {
    const antiga = {
      id: 't_antiga', type: 'transfer', accountId: 'c_pj1', toAccountId: 'c_pf1', amount: 100, date: '2026-11-05', description: 'Pró-labore',
      categoriaCnpjId: 'k_pj1', categoriaCpfId: 'r_pf1', categoriaOrigemId: null, categoriaDestinoId: null,
    }
    app.transactions = [antiga]
    render(<TransactionForm initial={antiga} onClose={() => {}} onToast={() => {}} preLancamentos={[]} />)
    expect(within(lado('origem')).getByRole('button', { name: /Só Empresa Um/ })).toBeTruthy()
    expect(within(lado('destino')).getByRole('button', { name: /Receita Pessoa Um/ })).toBeTruthy()
    fireEvent.click(document.querySelector('[data-help-salvar="lancamento"]'))
    expect(app.updateTransaction).toHaveBeenCalledWith('t_antiga', expect.objectContaining({
      categoriaOrigemId: 'k_pj1', categoriaDestinoId: 'r_pf1', categoriaCnpjId: 'k_pj1', categoriaCpfId: 'r_pf1',
    }))
  })
})

describe('baixa de agendamento — quadro por lado', () => {
  it('CPF→CPF: rótulos por perfil; o lançamento gerado leva a categoria de cada lado', LENTO, () => {
    const ag = {
      id: 's1', description: 'Mesada', transactionType: 'transfer', accountId: 'c_pf1', toAccountId: 'c_pf2', amount: 50,
      frequency: 'monthly', startDate: '2026-11-12', occurrenceType: 'continuous', registered: [], skipped: [], overrides: {},
      categoriaOrigemId: 'k_pf1', categoriaDestinoId: 'r_pf2',
    }
    const addTransaction = vi.fn(() => 'tx_novo')
    render(<PayModal schedule={ag} nextDate="2026-11-12" accounts={CONTAS} categories={CATEGORIAS} gerencialGroups={[]}
      addTransaction={addTransaction} markScheduleRegistered={vi.fn()} onClose={() => {}} />)
    expect(screen.getByTestId('rotulo-origem').textContent).toContain('Categoria em Pessoa Um (CPF)')
    expect(screen.getByTestId('rotulo-destino').textContent).toContain('Categoria em Pessoa Dois (CPF)')
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Transferência/ }))
    const gravado = addTransaction.mock.calls[0][0]
    expect(gravado).toMatchObject({ categoriaOrigemId: 'k_pf1', categoriaDestinoId: 'r_pf2' })
    expect('categoriaCnpjId' in gravado || 'categoriaCpfId' in gravado).toBe(false)
  })
})

describe('quadro — alinhamento dos seletores', () => {
  it('no computador cada lado é coluna alinhada pela base (rótulo quebra acima, seletores na mesma linha); no celular nada muda', LENTO, () => {
    render(<TransactionForm initial={{ type: 'transfer', accountId: 'c_pf1', toAccountId: 'c_pj1', amount: '100' }} onClose={() => {}} onToast={() => {}} preLancamentos={[]} />)
    for (const qual of ['origem', 'destino']) {
      const cls = lado(qual).className.split(/\s+/)
      expect(cls).toEqual(expect.arrayContaining(['flex', 'flex-col', 'sm:justify-end']))
      // Sem justify-end fora do sm: (uma coluna no celular, como antes).
      expect(cls).not.toContain('justify-end')
      // Rótulo antes do seletor, dentro do mesmo lado.
      expect(lado(qual).firstElementChild).toBe(screen.getByTestId(`rotulo-${qual}`))
    }
  })
})

// "Preencher com guia" e "Histórico" no cabeçalho da edição: os dois presentes, na MESMA linha,
// irmãos (um não está dentro do outro) e sem posicionamento absoluto/negativo que os sobreponha.
function conferirCabecalho() {
  const linha = screen.getByTestId('cabecalho-edicao')
  const guia = screen.getByTestId('botao-preencher-guia')
  const hist = screen.getByTestId('botao-historico')
  expect(linha.contains(guia) && linha.contains(hist)).toBe(true)
  expect(guia.contains(hist) || hist.contains(guia)).toBe(false)
  expect(linha.className.split(' ')).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'items-center']))
  // Só um botão do guia no formulário (não há outra linha acima com ele).
  expect(screen.getAllByTestId('botao-preencher-guia')).toHaveLength(1)
  for (let el = guia; el && el !== linha; el = el.parentElement) expect(el.className).not.toMatch(/absolute|fixed|-mt-|-mb-/)
  for (let el = hist; el && el !== linha; el = el.parentElement) expect(el.className).not.toMatch(/absolute|fixed|-mt-|-mb-/)
}

describe('editar — "Preencher com guia" ao lado do "Histórico"', () => {
  it('Editar lançamento', LENTO, () => {
    const tx = { id: 't1', type: 'expense', accountId: 'c_pf1', amount: 10, date: '2026-11-05', description: 'Mercado', categoryId: 'k_pf1' }
    app.transactions = [tx]
    render(<TransactionForm initial={tx} onClose={() => {}} onToast={() => {}} preLancamentos={[]} />)
    conferirCabecalho()
  })
  it('Editar agendamento', LENTO, () => {
    const ag = { id: 's1', description: 'Aluguel', transactionType: 'expense', accountId: 'c_pf1', amount: 50, categoryId: 'k_pf1',
      frequency: 'monthly', startDate: '2026-11-12', occurrenceType: 'continuous', registered: [], skipped: [], overrides: {} }
    app.schedules = [ag]
    render(<ScheduleForm initial={ag} onClose={() => {}} onAviso={() => {}} />)
    conferirCabecalho()
  })
  it('Novo lançamento: o botão do guia continua na linha própria (sem Histórico)', LENTO, () => {
    render(<TransactionForm initial={{ type: 'expense' }} onClose={() => {}} onToast={() => {}} preLancamentos={[]} />)
    expect(screen.getByTestId('botao-preencher-guia')).toBeTruthy()
    expect(screen.queryByTestId('botao-historico')).toBeNull()
  })
})
