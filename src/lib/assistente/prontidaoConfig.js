// Assistente IA — palavras-chave e padrões da "prontidão" (src/lib/assistente/prontidao.js). Arquivo
// ÚNICO para ajustar o que o app reconhece; nada de nomes, contas ou categorias de um cliente.
// Tudo é comparado em minúsculas e sem acento. Imports com .js (o backend também usa).

// Número de contrato: o texto depois de um destes rótulos ("Contrato nº 12345", "nº do contrato: 9-87").
export const ROTULOS_CONTRATO = [
  'contrato n', 'contrato no', 'contrato numero', 'contrato num', 'contrato:', 'contrato #', 'numero do contrato',
  'n do contrato', 'no do contrato', 'num do contrato', 'cod contrato', 'cod. contrato', 'codigo do contrato',
  'codigo contrato', 'contrato',
]

// Parcela de algo que já existe: "parcela 3/10", "parcela 3 de 10", "parc 3/10", "3a parcela de 10", "cota 2/3".
export const PALAVRAS_PARCELA = ['parcela', 'parc', 'prestacao', 'cota']

// Conta de consumo / fixa → Mensal (reforço).
export const CONTAS_FIXAS = [
  'aluguel', 'condominio', 'energia', 'luz', 'eletricidade', 'agua', 'saneamento', 'gas', 'internet', 'banda larga',
  'telefone', 'celular', 'telefonia', 'tv a cabo', 'streaming', 'escola', 'mensalidade', 'faculdade', 'curso',
  'plano de saude', 'convenio', 'odontologico', 'assinatura', 'academia', 'seguro residencial', 'iptu parcela',
]

// Tributos / encargos anuais → Anual (Parcelado quando cita cota/parcela).
export const TRIBUTOS_ANUAIS = ['ipva', 'iptu', 'licenciamento', 'dpvat', 'seguro auto', 'seguro do carro', 'seguro', 'anuidade', 'taxa anual']

// Natureza do documento → regra. Também casa com a sigla/nome do cadastro de Tipos de Documento.
export const NATUREZAS = {
  boleto: ['boleto', 'bol', 'linha digitavel', 'codigo de barras'],
  fatura: ['fatura', 'fat', 'conta de consumo'],
  nota_fiscal: ['nota fiscal', 'nf', 'nf-e', 'nfe', 'nfc-e', 'danfe'],
  cupom: ['cupom', 'cupom fiscal', 'cf', 'sat', 'extrato do cupom'],
  recibo: ['recibo', 'rec'],
  comprovante: ['comprovante', 'pix', 'ted', 'doc', 'transferencia'],
}

// Pedido explícito de agendar ("e agende", "todo mês", "agenda para dia 10") — aí não se pergunta.
export const PEDIDO_AGENDAR = ['agende', 'agenda', 'agendar', 'todo mes', 'todos os meses', 'mensalmente', 'todo dia', 'toda semana', 'todo ano', 'recorrente', 'repete', 'repetir']

// Histórico: o mesmo favorecido/categoria em N meses seguidos sugere Mensal.
export const MESES_SEGUIDOS_PARA_MENSAL = 2
