// @vitest-environment jsdom
// Assistente aceita PDF (boleto, fatura, nota, comprovante, extrato) com o mesmo fluxo da imagem.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import Assistente from './Assistente'
import { interpretar } from '../../lib/assistenteApi'
import { contarPaginasPdf, ehPdf, lerPdf, MAX_PDF_BYTES, MENSAGEM_PDF_GRANDE } from '../../lib/assistente'
import { validarAnexo, blocoDoAnexo } from '../../../api/_anexoIa.js'

vi.mock('../../context/AppContext', () => ({ useApp: () => ({ activeProfileId: null }) }))
vi.mock('../../lib/assistenteApi', () => ({ interpretar: vi.fn(async () => ({ ferramenta: 'perguntar', parametros: { pergunta: 'Qual a conta?' } })) }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

const pdf = (paginas = 2, nome = 'boleto.pdf', tipo = 'application/pdf') => {
  const corpo = '%PDF-1.4\n' + Array.from({ length: paginas }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj\n`).join('') + '2 0 obj << /Type /Pages /Count ' + paginas + ' >> endobj\n%%EOF'
  return new File([corpo], nome, { type: tipo })
}

describe('leitura do PDF no aparelho', () => {
  it('reconhece pelo tipo ou pela extensão (iPhone entrega sem tipo)', () => {
    expect(ehPdf(pdf())).toBe(true)
    expect(ehPdf(new File(['x'], 'fatura.PDF', { type: '' }))).toBe(true)
    expect(ehPdf(new File(['x'], 'foto.jpg', { type: 'image/jpeg' }))).toBe(false)
  })
  it('conta as páginas quando visíveis; sem conseguir, null', async () => {
    expect(contarPaginasPdf(new TextEncoder().encode('<< /Type /Page >> << /Type /Page >> << /Type /Pages >>'))).toBe(2)
    expect(contarPaginasPdf(new TextEncoder().encode('%PDF stream comprimido'))).toBeNull()
    const r = await lerPdf(pdf(3))
    expect(r).toMatchObject({ mimeType: 'application/pdf', nome: 'boleto.pdf', paginas: 3 })
    expect(atob(r.base64).startsWith('%PDF')).toBe(true)
  })
  it('acima de 3 MB: mensagem clara, sem enviar', async () => {
    const grande = { size: MAX_PDF_BYTES + 1, name: 'extrato.pdf', type: 'application/pdf' }
    await expect(lerPdf(grande)).rejects.toThrow(MENSAGEM_PDF_GRANDE)
  })
})

describe('tela do Assistente', () => {
  it('o anexo aceita PDF (no iPhone abre também o app Arquivos); a câmera continua só imagem', () => {
    const { container } = render(<Assistente onClose={() => {}} />)
    const [camera, galeria] = container.querySelectorAll('input[type=file]')
    expect(camera.getAttribute('accept')).toBe('image/*')
    expect(galeria.getAttribute('accept')).toMatch(/application\/pdf/)
  })
  it('PDF anexado: ícone, nome e nº de páginas; vai para a IA com o tipo application/pdf', async () => {
    const { container } = render(<Assistente onClose={() => {}} />)
    const galeria = container.querySelectorAll('input[type=file]')[1]
    fireEvent.change(galeria, { target: { files: [pdf(2, 'fatura-cartao.pdf')] } })
    const chip = await screen.findByTestId('anexo-pdf')
    expect(chip.textContent).toMatch(/fatura-cartao\.pdf/)
    expect(chip.textContent).toMatch(/PDF · 2 páginas/)
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }))
    await waitFor(() => expect(interpretar).toHaveBeenCalled())
    expect(interpretar.mock.calls[0][0]).toMatchObject({ mimeType: 'application/pdf' })
    expect(interpretar.mock.calls[0][0].imagemBase64.length).toBeGreaterThan(10)
  })
  it('PDF grande: mostra a mensagem e não envia', async () => {
    const { container } = render(<Assistente onClose={() => {}} />)
    const galeria = container.querySelectorAll('input[type=file]')[1]
    const grande = pdf(1, 'extrato.pdf')
    Object.defineProperty(grande, 'size', { value: MAX_PDF_BYTES + 10 })
    fireEvent.change(galeria, { target: { files: [grande] } })
    expect(await screen.findByText(MENSAGEM_PDF_GRANDE)).toBeTruthy()
    expect(screen.queryByTestId('anexo-pdf')).toBeNull()
  })
  it('erro da API aparece com a mensagem real', async () => {
    interpretar.mockRejectedValueOnce(new Error('PDF muito grande (máximo 3 MB). Envie só as páginas necessárias ou tire um print.'))
    const { container } = render(<Assistente onClose={() => {}} />)
    fireEvent.change(container.querySelectorAll('input[type=file]')[1], { target: { files: [pdf(1)] } })
    await screen.findByTestId('anexo-pdf')
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }))
    expect(await screen.findByText(/PDF muito grande/)).toBeTruthy()
  })
})

describe('API: bloco do anexo para o Claude', () => {
  it('PDF → document; imagem → image (como antes)', () => {
    expect(blocoDoAnexo('QUJD', 'application/pdf')).toEqual([{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'QUJD' } }])
    expect(blocoDoAnexo('QUJD', 'image/jpeg')).toEqual([{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }])
    expect(blocoDoAnexo('', 'image/jpeg')).toEqual([])
  })
  it('validação: PDF até ~3 MB, imagem até ~2 MB, outros formatos recusados', () => {
    const b64 = (bytes) => 'A'.repeat(Math.ceil(bytes * 4 / 3))
    expect(validarAnexo(b64(3 * 1024 * 1024), 'application/pdf')).toBeNull()
    expect(validarAnexo(b64(3.5 * 1024 * 1024), 'application/pdf')).toMatchObject({ status: 413 })
    expect(validarAnexo(b64(2.5 * 1024 * 1024), 'image/png')).toMatchObject({ status: 413 })
    expect(validarAnexo('QUJD', 'application/msword')).toMatchObject({ status: 400 })
    expect(validarAnexo('', 'application/msword')).toBeNull()
  })
})
