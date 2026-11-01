// Anexo do Assistente (imagem ou PDF): validação e o bloco de conteúdo do Claude. PURO.
//   imagem → { type: 'image',    source: { type: 'base64', media_type, data } }
//   PDF    → { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
// O app reduz a imagem (~1600 px) e limita o PDF a 3 MB antes de enviar: o corpo de uma requisição
// na Vercel tem ~4,5 MB e o base64 cresce ~33%. Aqui, os mesmos limites com uma folga.
export const MIMES_IMAGEM = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
export const MIME_PDF = 'application/pdf'
export const MAX_IMAGEM_BYTES = 2.2 * 1024 * 1024
export const MAX_PDF_BYTES = 3.2 * 1024 * 1024

// → { erro, status } quando recusado; null quando aceito (ou sem anexo).
export function validarAnexo(base64, mime) {
  if (!base64) return null
  const ehPdf = mime === MIME_PDF
  if (!MIMES_IMAGEM.has(mime) && !ehPdf) return { status: 400, erro: 'Formato não aceito (use JPG, PNG, WebP ou PDF).' }
  const bytes = Math.floor(base64.length * 3 / 4)
  if (ehPdf && bytes > MAX_PDF_BYTES) return { status: 413, erro: 'PDF muito grande (máximo 3 MB). Envie só as páginas necessárias ou tire um print.' }
  if (!ehPdf && bytes > MAX_IMAGEM_BYTES) return { status: 413, erro: 'Imagem muito grande (máximo ~2 MB).' }
  return null
}

export function blocoDoAnexo(base64, mime) {
  if (!base64) return []
  if (mime === MIME_PDF) return [{ type: 'document', source: { type: 'base64', media_type: MIME_PDF, data: base64 } }]
  return [{ type: 'image', source: { type: 'base64', media_type: mime, data: base64 } }]
}
