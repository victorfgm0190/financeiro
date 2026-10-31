// @vitest-environment jsdom
// "Dividir em categorias": restante e validação em linha própria, "Usar restante" com o restante
// do lançamento, descrição recolhida, Gravar só quando fecha o total.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import RateioModal from './RateioModal'

vi.mock('../../context/AppContext', () => ({ useApp: () => ({ activeProfileId: null, categoryGroupOrder: [] }) }))
afterEach(cleanup)

const CATS = [{ id: 'c1', name: 'Combustível', type: 'expense' }, { id: 'c2', name: 'Alimentação', type: 'expense' }]
const abrir = (props = {}) => render(<RateioModal total={250} categories={CATS} categoryType="expense"
  initial={[{ categoriaId: 'c1', valor: 200 }, { categoriaId: 'c2', valor: '' }]} onSave={() => {}} onDeleteAll={() => {}} onClose={() => {}} {...props} />)

describe('RateioModal', () => {
  it('restante a distribuir + validação; "Usar restante (R$ 50,00)" fecha o total e libera Gravar', () => {
    const onSave = vi.fn()
    abrir({ onSave })
    expect(screen.getByTestId('rateio-restante').textContent).toMatch(/50,00/)
    expect(screen.getByRole('status').textContent).toBeTruthy()
    const gravar = screen.getByRole('button', { name: 'Gravar' })
    expect(gravar.disabled).toBe(true)
    const usar = screen.getAllByRole('button', { name: /Usar restante \(R\$\s?50,00\)/ })
    expect(usar).toHaveLength(2) // em cada linha: soma o restante àquela linha
    fireEvent.click(usar[1])
    expect(screen.getByTestId('rateio-restante').className).toMatch(/text-receita/)
    fireEvent.click(gravar)
    expect(onSave).toHaveBeenCalledWith([{ categoriaId: 'c1', valor: 200, descricao: '' }, { categoriaId: 'c2', valor: 50, descricao: '' }])
  })
  it('descrição recolhida em "+ descrição" (aberta quando já tem); Excluir tudo continua', () => {
    const onDeleteAll = vi.fn()
    abrir({ onDeleteAll, initial: [{ categoriaId: 'c1', valor: 200, descricao: 'Gasolina' }, { categoriaId: 'c2', valor: 50 }] })
    expect(screen.getByLabelText('Descrição da parte 1').value).toBe('Gasolina')
    expect(screen.queryByLabelText('Descrição da parte 2')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ descrição' }))
    expect(screen.getByLabelText('Descrição da parte 2').getAttribute('placeholder')).toBe('Descrição da parte (opcional)')
    fireEvent.click(screen.getByRole('button', { name: 'Excluir tudo' }))
    expect(onDeleteAll).toHaveBeenCalled()
  })
})
