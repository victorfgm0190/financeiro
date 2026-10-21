// Leitura dos itens do boleto do condomínio a partir de uma FOTO — interface preparada para o futuro
// módulo de IA. Nesta fase fica desligada ("em breve" na tela de composição).
export const LEITURA_DE_IMAGEM_DISPONIVEL = false

// (arquivo de imagem) → Promise<{ itens: [{ desc, valor }], total: number|null }>
export async function extrairItensDeImagem(arquivo) {
  void arquivo
  throw new Error('Leitura de foto do boleto ainda não disponível.')
}
