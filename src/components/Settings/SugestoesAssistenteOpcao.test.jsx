// @vitest-environment jsdom
// Configurações › "Sugestões do Assistente na importação" (Etapa 6c): recurso contratado — só aparece
// com a liberação do administrador da plataforma. Dados fictícios.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

const app = vi.hoisted(() => ({ settings: {}, updateSettings: () => {} }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
const { default: SugestoesAssistenteOpcao, TEXTO_SUGESTOES_IA } = await import('./SugestoesAssistenteOpcao.jsx')

afterEach(() => cleanup())

const montar = async (status) => {
  render(<SugestoesAssistenteOpcao carregarStatus={async () => status} />)
  await act(async () => {})
}

describe('opção do cliente', () => {
  it('sem liberação: NÃO aparece (nem desabilitada)', async () => {
    Object.assign(app, { settings: { iaSugestoesImportacao: true }, updateSettings: vi.fn() })
    await montar({ liberado: false, ligado: false })
    expect(screen.queryByTestId('opcao-sugestoes-ia')).toBeNull()
    expect(screen.queryByText(/Sugestões do Assistente/)).toBeNull()
  })
  it('liberado: aparece com o texto da LGPD e liga/desliga a opção do cliente', async () => {
    Object.assign(app, { settings: {}, updateSettings: vi.fn() })
    await montar({ liberado: true, ligado: false })
    const opcao = screen.getByTestId('opcao-sugestoes-ia')
    expect(opcao.textContent).toContain(TEXTO_SUGESTOES_IA)
    expect(TEXTO_SUGESTOES_IA).toMatch(/descrição, o valor e a data.*Anthropic.*nome da loja ou de uma pessoa \(ex\.: Pix\).*Não enviamos conta, cartão, CPF\/CNPJ nem saldo\. Nada é gravado sem você confirmar\./)
    const caixa = screen.getByRole('checkbox', { name: 'Sugestões do Assistente na importação' })
    expect(caixa.checked).toBe(false)
    fireEvent.click(caixa)
    expect(app.updateSettings).toHaveBeenCalledWith({ iaSugestoesImportacao: true })
  })
  it('somente leitura: aparece desabilitada', async () => {
    Object.assign(app, { settings: { iaSugestoesImportacao: true }, updateSettings: vi.fn() })
    render(<SugestoesAssistenteOpcao somenteLeitura carregarStatus={async () => ({ liberado: true, ligado: true })} />)
    await act(async () => {})
    expect(screen.getByRole('checkbox', { name: 'Sugestões do Assistente na importação' }).disabled).toBe(true)
  })
})
