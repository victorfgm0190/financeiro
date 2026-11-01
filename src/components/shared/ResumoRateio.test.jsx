// @vitest-environment jsdom
// Campo Categoria com rateio: "faltam R$ 50,00" até completar; "✓ Total" em verde quando fecha.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ResumoRateio from './ResumoRateio'

afterEach(cleanup)
const linhas = [{ categoriaId: 'c1', valor: 200 }]

describe('ResumoRateio', () => {
  it('rateio parcial: "Rateado (1) · faltam R$ 50,00" em âmbar', () => {
    render(<ResumoRateio linhas={linhas} total={250} />)
    const el = screen.getByTestId('resumo-rateio')
    expect(el.textContent).toMatch(/Rateado \(1\)faltam R\$\s?50,00/)
    expect(el.querySelector('.text-aviso')).toBeTruthy()
  })
  it('fecha → "✓ Total" em verde; passa → vermelho; sem valor → soma, como antes', () => {
    render(<ResumoRateio linhas={[...linhas, { categoriaId: 'c2', valor: 50 }]} total={250} />)
    expect(screen.getByTestId('resumo-rateio').querySelector('.text-primary-fg').textContent).toMatch(/✓ Total: R\$\s?250,00/)
    cleanup()
    render(<ResumoRateio linhas={linhas} total={150} />)
    expect(screen.getByTestId('resumo-rateio').querySelector('.text-perigo').textContent).toMatch(/passa R\$\s?50,00/)
    cleanup()
    render(<ResumoRateio linhas={linhas} total={0} />)
    expect(screen.getByTestId('resumo-rateio').textContent).toMatch(/Total: R\$\s?200,00/)
  })
})
