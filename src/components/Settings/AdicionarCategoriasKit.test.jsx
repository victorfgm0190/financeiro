// @vitest-environment jsdom
// Botão "Adicionar categorias padrão que faltam" e cadastro de bem com as categorias de ganho/perda.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
const api = vi.hoisted(() => ({ tipo: 'PF', criar: null, criarBem: null }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/db', async (orig) => ({
  ...(await orig()),
  fetchTipoDoKit: async () => ({ tipo: api.tipo }),
  criarCategoriasCapital: (...a) => api.criar(...a),
}))
vi.mock('../../lib/bemApi', async (orig) => ({ ...(await orig()), criarBem: (...a) => api.criarBem(...a) }))
const { default: AdicionarCategoriasKit } = await import('./AdicionarCategoriasKit.jsx')
const { default: ParametrizarBemModal } = await import('../Patrimonio/ParametrizarBemModal.jsx')

const base = (o = {}) => {
  for (const k of Object.keys(app)) delete app[k]
  Object.assign(app, { categories: [], addCategory: vi.fn(), pode: () => true, activeProfileId: null, categoryGroupOrder: [], ...o })
}
beforeEach(() => { api.tipo = 'PF'; api.criar = vi.fn(async () => ({ criadas: [] })); api.criarBem = vi.fn(async () => ({})) })
afterEach(cleanup)

describe('Adicionar categorias padrão que faltam', () => {
  const abrir = async () => {
    fireEvent.click(screen.getByRole('button', { name: /Adicionar categorias padrão que faltam/ }))
    return screen.findByTestId('kit-categorias')
  }

  it('lista só o que falta do kit do tipo do cliente, nada marcado; inclui apenas as escolhidas, com o grupo', async () => {
    base({ categories: [{ id: 'x', name: 'mercado' }, { id: 'y', name: 'ÁGUA' }] })
    render(<AdicionarCategoriasKit />)
    const lista = await abrir()
    expect(lista.textContent).toMatch(/Energia/)
    expect(lista.textContent).not.toMatch(/Mercado/)
    expect(lista.textContent).not.toMatch(/Água/)
    expect(lista.textContent).toMatch(/Ganho e perda de capital/i)
    fireEvent.click(screen.getByRole('checkbox', { name: /Energia/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar (1)' }))
    expect(app.addCategory).toHaveBeenCalledTimes(1)
    expect(app.addCategory).toHaveBeenCalledWith({ id: 'cat_kit_energia', name: 'Energia', type: 'expense', color: '#eab308', icon: '⚡', group: 'Despesas da casa' })
  })

  it('cliente PJ vê o kit PJ; não insere nada sem escolher', async () => {
    api.tipo = 'PJ'
    base()
    render(<AdicionarCategoriasKit />)
    const lista = await abrir()
    expect(lista.textContent).toMatch(/Fornecedores/)
    expect(lista.textContent).not.toMatch(/Mercado/)
    expect(screen.getByRole('button', { name: /^Adicionar\s*$/ }).disabled).toBe(true)
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' }).at(-1))
    expect(app.addCategory).not.toHaveBeenCalled()
  })

  it('sem permissão de incluir em Cadastros: sem botão', () => {
    base({ pode: () => false })
    render(<AdicionarCategoriasKit />)
    expect(screen.queryByRole('button', { name: /Adicionar categorias padrão/ })).toBeNull()
  })
})

describe('cadastro de bem: ganho e perda de capital', () => {
  const CONTA = { id: 'bem', name: 'Carro', acquisitionValue: 1000 }
  const OUTRAS = [
    { id: 'pre', name: 'Prestação', type: 'expense' }, { id: 'jur', name: 'Juros', type: 'expense' },
  ]
  const render_ = (categorias) => render(<ParametrizarBemModal conta={CONTA} categorias={categorias} onCancel={() => {}} onSuccess={() => {}} onErro={() => {}} />)
  const select = (rotulo) => screen.getByText(new RegExp(rotulo)).closest('div').querySelector('select')

  it('sugere as categorias existentes (nome parecido) e não oferece criar', () => {
    base()
    const cats = [...OUTRAS, { id: 'p', name: 'PERDA DE CAPITAL', type: 'expense' }, { id: 'g', name: 'ganho de capital', type: 'income' }]
    render_(cats)
    expect(select('Perda de Venda').value).toBe('p')
    expect(select('Ganho de Venda').value).toBe('g')
    expect(screen.queryByRole('button', { name: /Criar categorias padrão/ })).toBeNull()
  })

  it('sem elas: botão cria na hora, sem sair do cadastro, e passa a sugerir', async () => {
    base()
    const criadas = [
      { id: 'cat_kit_ganho_capital', name: 'Ganho de capital', type: 'income', color: '#22c55e', icon: '📈', group: 'Ganho e perda de capital' },
      { id: 'cat_kit_perda_capital', name: 'Perda de capital', type: 'expense', color: '#ef4444', icon: '📉', group: 'Ganho e perda de capital' },
    ]
    api.criar = vi.fn(async () => ({ criadas }))
    const { rerender } = render_(OUTRAS)
    expect(select('Perda de Venda').value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Criar categorias padrão de ganho/perda' }))
    await waitFor(() => expect(app.addCategory).toHaveBeenCalledTimes(2))
    rerender(<ParametrizarBemModal conta={CONTA} categorias={[...OUTRAS, ...criadas]} onCancel={() => {}} onSuccess={() => {}} onErro={() => {}} />)
    expect(select('Perda de Venda').value).toBe('cat_kit_perda_capital')
    expect(select('Ganho de Venda').value).toBe('cat_kit_ganho_capital')
    expect(screen.queryByRole('button', { name: /Criar categorias padrão/ })).toBeNull()
  })

  it('a escolha da pessoa vale sobre a sugestão', () => {
    base()
    render_([...OUTRAS, { id: 'p', name: 'Perda de capital', type: 'expense' }, { id: 'g', name: 'Ganho de capital', type: 'income' }])
    fireEvent.change(select('Perda de Venda'), { target: { value: 'jur' } })
    expect(select('Perda de Venda').value).toBe('jur')
  })

  it('sem permissão em Cadastros: sem botão de criar', () => {
    base({ pode: () => false })
    render_(OUTRAS)
    expect(screen.queryByRole('button', { name: /Criar categorias padrão/ })).toBeNull()
  })
})
