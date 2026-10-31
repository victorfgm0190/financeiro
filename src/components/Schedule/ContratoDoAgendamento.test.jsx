// @vitest-environment jsdom
// "Nº do contrato" no agendamento: escondido numa despesa comum, aparece com tipo de boleto/fatura/
// carnê, já preenchido ou pelo "+ Nº do contrato". Placeholder descreve a função, sem exemplo.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ContratoDoAgendamento from './ContratoDoAgendamento'

const app = { contratos: [], tiposDocumento: [{ id: 'tb', sigla: 'BOL', nome: 'Boleto' }, { id: 'tn', sigla: 'NF', nome: 'Nota fiscal' }] }
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
afterEach(cleanup)

const campo = () => screen.queryByLabelText(/Nº do contrato/)

describe('ContratoDoAgendamento — quando mostrar o nº do contrato', () => {
  it('sem tipo (ou nota fiscal) e vazio → só o link; tocar abre o campo', () => {
    render(<ContratoDoAgendamento numero="" onNumero={() => {}} tipoDocumentoId="tn" />)
    expect(campo()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ Nº do contrato' }))
    expect(campo().getAttribute('placeholder')).toBe('Número do contrato do documento (opcional)')
  })
  it('boleto → aparece; já preenchido → aparece', () => {
    render(<ContratoDoAgendamento numero="" onNumero={() => {}} tipoDocumentoId="tb" />)
    expect(campo()).toBeTruthy()
    cleanup()
    render(<ContratoDoAgendamento numero="12345" onNumero={() => {}} />)
    expect(campo().value).toBe('12345')
  })
})
