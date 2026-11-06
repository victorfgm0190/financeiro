// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import ConsorcioModal from './ConsorcioModal'
import { salvarConsorcio } from '../../lib/bemApi'

vi.mock('../../lib/bemApi', () => ({ salvarConsorcio: vi.fn() }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const cota = (numero, data_adesao) => ({ numero, data_adesao, valor_carta: 100000, percentual_parcela: 50, valor_parcela_cheia: 683.4 })
const abrir = (consorcio) => render(<ConsorcioModal bemId="b" consorcio={consorcio} onCancel={() => {}} onSuccess={() => {}} onErro={() => {}} />)

describe('Data de adesão por cota', () => {
  it('mantém a data própria de cada cota ao salvar', async () => {
    salvarConsorcio.mockResolvedValue({})
    abrir({ data_adesao: '2026-04-22', cotas: [cota('A', '2026-04-24'), cota('B', '2026-04-22')] })
    expect(screen.getByLabelText('Data de adesão da cota', { selector: '#adesao-cota-0' }).value).toBe('24/04/2026')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(salvarConsorcio).toHaveBeenCalled())
    expect(salvarConsorcio.mock.calls[0][0].cotas.map(c => c.data_adesao)).toEqual(['2026-04-24', '2026-04-22'])
  })
  it('a cota nova vem com a data padrão, que pode ser trocada', () => {
    abrir({ data_adesao: '2026-04-22', cotas: [cota('A', '2026-04-24')] })
    fireEvent.click(screen.getByRole('button', { name: /Adicionar outra cota/ }))
    const nova = document.getElementById('adesao-cota-1')
    expect(nova.value).toBe('22/04/2026')
    fireEvent.change(nova, { target: { value: '01052026' } })
    expect(document.getElementById('adesao-cota-1').value).toBe('01/05/2026')
    expect(document.getElementById('adesao-cota-0').value).toBe('24/04/2026')
  })
  it('a data padrão preenche só as cotas sem data', () => {
    abrir({ cotas: [cota('A', '2026-04-24'), cota('B', null)] })
    const padrao = screen.getByText('Data de adesão padrão').parentElement.querySelector('input[inputmode="numeric"]')
    fireEvent.change(padrao, { target: { value: '22042026' } })
    expect(document.getElementById('adesao-cota-0').value).toBe('24/04/2026')
    expect(document.getElementById('adesao-cota-1').value).toBe('22/04/2026')
  })
})
