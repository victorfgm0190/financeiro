// Limite diário do Assistente IA POR USUÁRIO, configurável por cliente (ambientes.ia_limite_diario /
// ia_limite_imagem no central; editado no Controle de Clientes). Conta as chamadas ao modelo do dia
// (ia_uso, fuso de São Paulo). PURO — usado pelo backend (api/assistente.js) e pelos testes.

export const LIMITE_IA_PADRAO = Object.freeze({ diario: 100, imagem: 30 })

const inteiro = (v, padrao) => (Number.isInteger(Number(v)) && Number(v) >= 0 ? Number(v) : padrao)

// Linha do central (ou nada, se as colunas ainda não existem) → { diario, imagem }.
export function limitesDoAmbiente(row) {
  return {
    diario: inteiro(row?.ia_limite_diario, LIMITE_IA_PADRAO.diario),
    imagem: inteiro(row?.ia_limite_imagem, LIMITE_IA_PADRAO.imagem),
  }
}

// Edição no Controle de Clientes: números inteiros de 0 a 10.000; imagem ≤ diário.
export function validarLimites({ diario, imagem }) {
  const d = Number(diario), i = Number(imagem)
  if (!Number.isInteger(d) || d < 0 || d > 10000) return { erro: 'Limite diário: número inteiro de 0 a 10.000.' }
  if (!Number.isInteger(i) || i < 0 || i > 10000) return { erro: 'Limite com imagem: número inteiro de 0 a 10.000.' }
  if (i > d) return { erro: 'O limite com imagem não pode passar do limite diário.' }
  return { diario: d, imagem: i }
}

// Mensagem de bloqueio (null = pode chamar). uso = { total, imagem } do dia; null = não deu para
// contar (banco sem a coluna) → não bloqueia.
export function bloqueioDoLimite(uso, limites, temImagem) {
  if (!uso) return null
  if (uso.total >= limites.diario) {
    return `Limite diário do assistente atingido (${limites.diario} pedidos por dia). Volta amanhã ou fale com o administrador.`
  }
  if (temImagem && uso.imagem >= limites.imagem) {
    return `Limite diário de pedidos com foto atingido (${limites.imagem} por dia). Você ainda pode escrever ou falar o pedido; foto, só amanhã.`
  }
  return null
}
