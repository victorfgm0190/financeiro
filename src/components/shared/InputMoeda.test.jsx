// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import InputMoeda from './InputMoeda'

afterEach(cleanup)

function Campo({ inicial = '', onValor = () => {}, ...props }) {
  const [v, setV] = useState(inicial)
  return <InputMoeda aria-label="valor" value={v} onChange={e => { setV(e.target.value); onValor(e.target.value) }} {...props} />
}
const campo = () => screen.getByLabelText('valor')

describe('InputMoeda', () => {
  it('valor existente carrega formatado (20 → 20,00); vazio fica vazio', () => {
    render(<><Campo inicial={20} /><InputMoeda aria-label="vazio" value="" onChange={() => {}} /></>)
    expect(campo().value).toBe('20,00')
    expect(screen.getByLabelText('vazio').value).toBe('')
  })

  it('ao entrar mostra sem milhar; ao sair formata', () => {
    render(<Campo inicial={1500.5} />)
    expect(campo().value).toBe('1.500,50')
    fireEvent.focus(campo())
    expect(campo().value).toBe('1500,50')
    fireEvent.change(campo(), { target: { value: '1500,5' } })
    expect(campo().value).toBe('1500,5') // digitação livre
    fireEvent.blur(campo())
    expect(campo().value).toBe('1.500,50')
  })

  it('entrega o valor canônico (número em texto, como o type="number")', () => {
    const onValor = vi.fn()
    render(<Campo onValor={onValor} />)
    fireEvent.focus(campo())
    fireEvent.change(campo(), { target: { value: '1.234,56' } })
    expect(onValor).toHaveBeenLastCalledWith('1234.56')
    fireEvent.change(campo(), { target: { value: '' } })
    expect(onValor).toHaveBeenLastCalledWith('')
  })

  it('colar "R$ 1.234,56" funciona', () => {
    const onValor = vi.fn()
    render(<Campo onValor={onValor} />)
    fireEvent.focus(campo())
    fireEvent.change(campo(), { target: { value: 'R$ 1.234,56' } })
    expect(onValor).toHaveBeenLastCalledWith('1234.56')
    fireEvent.blur(campo())
    expect(campo().value).toBe('1.234,56')
  })

  it('vírgula: no máximo 2 casas na digitação (3ª tecla ignorada)', () => {
    const onValor = vi.fn()
    render(<Campo onValor={onValor} />)
    fireEvent.focus(campo())
    fireEvent.change(campo(), { target: { value: '100,00' } })
    fireEvent.change(campo(), { target: { value: '100,000' } })
    expect(campo().value).toBe('100,00')
    expect(onValor).toHaveBeenLastCalledWith('100')
    fireEvent.change(campo(), { target: { value: '20,000' } })
    expect(campo().value).toBe('20,00')
    fireEvent.change(campo(), { target: { value: '1,5' } })
    expect(onValor).toHaveBeenLastCalledWith('1.5')
    fireEvent.change(campo(), { target: { value: '1,234' } }) // colado
    expect(campo().value).toBe('1,23')
    expect(onValor).toHaveBeenLastCalledWith('1.23')
    fireEvent.blur(campo())
    expect(campo().value).toBe('1,23')
  })

  it('ponto: 3 dígitos é milhar, 1–2 é decimal', () => {
    const onValor = vi.fn()
    render(<Campo onValor={onValor} />)
    fireEvent.focus(campo())
    fireEvent.change(campo(), { target: { value: '1.234' } })
    expect(onValor).toHaveBeenLastCalledWith('1234')
    fireEvent.change(campo(), { target: { value: '1500.5' } })
    expect(onValor).toHaveBeenLastCalledWith('1500.5')
    fireEvent.change(campo(), { target: { value: '1,234.56' } })
    expect(onValor).toHaveBeenLastCalledWith('1234.56')
  })

  it('negativo só com `negativo`', () => {
    const semSinal = vi.fn()
    const comSinal = vi.fn()
    render(<><Campo onValor={semSinal} /><InputMoeda aria-label="neg" value="" negativo onChange={e => comSinal(e.target.value)} /></>)
    fireEvent.focus(campo())
    fireEvent.change(campo(), { target: { value: '-50' } })
    expect(semSinal).toHaveBeenLastCalledWith('50')
    const neg = screen.getByLabelText('neg')
    fireEvent.focus(neg)
    fireEvent.change(neg, { target: { value: '-1.234,5' } })
    expect(comSinal).toHaveBeenLastCalledWith('-1234.5')
  })

  it('sair do campo sem mudar o número não chama onChange (edição inline não salva à toa)', () => {
    const onValor = vi.fn()
    const onBlur = vi.fn()
    render(<Campo inicial={20} onValor={onValor} onBlur={e => onBlur(e.target.value)} />)
    fireEvent.focus(campo())
    fireEvent.change(campo(), { target: { value: '20,0' } })
    fireEvent.blur(campo())
    expect(onValor).not.toHaveBeenCalled()
    expect(onBlur).toHaveBeenCalledWith('20')
    expect(campo().value).toBe('20,00')
  })

  it('validação: obrigatório e maior que zero barram o formulário', () => {
    const enviar = vi.fn(e => e.preventDefault())
    render(<form onSubmit={enviar}><Campo required min="0.01" /><button>ok</button></form>)
    const form = campo().form
    expect(form.checkValidity()).toBe(false) // vazio + required
    fireEvent.focus(campo())
    fireEvent.change(campo(), { target: { value: '0' } })
    fireEvent.blur(campo())
    expect(campo().validationMessage).toBe('Informe um valor maior que zero')
    expect(form.checkValidity()).toBe(false)
    fireEvent.focus(campo())
    fireEvent.change(campo(), { target: { value: '0,01' } })
    fireEvent.blur(campo())
    expect(form.checkValidity()).toBe(true)
  })

  it('Enter: onKeyDown recebe a tecla e o valor canônico', () => {
    const onKey = vi.fn()
    render(<Campo inicial={10} onKeyDown={e => onKey(e.key, e.target.value)} />)
    fireEvent.focus(campo())
    fireEvent.change(campo(), { target: { value: '12,5' } })
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(onKey).toHaveBeenCalledWith('Enter', '12.5')
  })

  it('teclado numérico no celular', () => {
    render(<Campo />)
    expect(campo().getAttribute('inputmode')).toBe('decimal')
    expect(campo().type).toBe('text')
  })
})
