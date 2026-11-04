// Leitura do boleto do condomínio a partir de FOTO, print ou PDF — pela mesma leitura do Assistente
// (/api/assistente com `leitura: 'boleto_condominio'`): a imagem vai reduzida, o PDF inteiro (até o
// limite), nada é guardado no servidor (só o consumo de tokens em ia_uso) e a tela SEMPRE mostra a
// prévia para conferir — nada é gravado sozinho.
import { interpretar } from '../assistenteApi.js'
import { comprimirImagem, ehPdf, lerPdf, MAX_IMAGEM_ORIGINAL } from '../assistente.js'
import { r2 } from './parcelas.js'

export const LEITURA_DE_IMAGEM_DISPONIVEL = true

// Arquivo escolhido (File) → anexo { base64, mimeType } do mesmo jeito que o chat do Assistente.
export async function anexoDoArquivo(arquivo) {
  if (!arquivo) throw new Error('Escolha uma foto, print ou PDF do boleto.')
  if (ehPdf(arquivo)) return lerPdf(arquivo)
  if (!String(arquivo.type || '').startsWith('image/')) throw new Error('Envie uma imagem (foto, print) ou um PDF do boleto.')
  if (arquivo.size > MAX_IMAGEM_ORIGINAL) throw new Error('Imagem muito grande (máximo 20 MB). Tire outra foto ou recorte o print.')
  return comprimirImagem(arquivo)
}

// Resposta do servidor → { vencimento, total, beneficiario, itens: [{ desc, valor }] } (valores com 2
// casas; item sem valor numérico fica de fora).
export function normalizarLeitura(l) {
  const itens = (Array.isArray(l?.itens) ? l.itens : [])
    .map(i => ({ desc: String(i?.desc ?? i?.descricao ?? '').trim() || 'Item sem descrição', valor: Number(i?.valor) }))
    .filter(i => Number.isFinite(i.valor) && i.valor !== 0)
    .map(i => ({ ...i, valor: r2(i.valor) }))
  const total = Number(l?.total)
  const venc = /^\d{4}-\d{2}-\d{2}$/.test(String(l?.vencimento || '')) ? l.vencimento : null
  return { vencimento: venc, total: Number.isFinite(total) && total > 0 ? r2(total) : null, beneficiario: l?.beneficiario || null, itens }
}

// (arquivo File, ou anexo { base64, mimeType } já preparado) → Promise<{ vencimento, total, beneficiario, itens }>
export async function extrairItensDeImagem(arquivo, { ler = interpretar } = {}) {
  const anexo = arquivo?.base64 ? arquivo : await anexoDoArquivo(arquivo)
  const r = await ler({ leitura: 'boleto_condominio', imagemBase64: anexo.base64, mimeType: anexo.mimeType })
  const leitura = normalizarLeitura(r?.leitura)
  if (!leitura.itens.length) throw new Error('Não consegui ler os itens do boleto. Tente outra foto (mais nítida e reta) ou digite os itens.')
  return leitura
}
