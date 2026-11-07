// RÓTULOS DO CONTRATO POR MODALIDADE — um lugar só para wizard, ficha, lista, composição, selos,
// relatórios e Assistente (a descrição da parcela, que todas as telas mostram, sai daqui).
// O papel interno da cobrança principal continua 'aluguel' em qualquer modalidade (não migra dado);
// só o texto muda: "Aluguel" no aluguel, "Parcela" nas demais.

export const PAPEIS = { aluguel: 'Aluguel', condominio: 'Condomínio', iptu: 'IPTU', seguro: 'Seguro', multa: 'Multa' }

export const MODALIDADES = {
  aluguel: 'Aluguel',
  servico: 'Prestação de serviço',
  assinatura: 'Assinatura/mensalidade',
  seguro: 'Seguro',
  outro: 'Outro',
}

// Contrato sem modalidade (linha antiga, antes da coluna) = aluguel, como o padrão da tabela.
export const ehAluguel = (c) => (c?.modalidade || 'aluguel') === 'aluguel'

export const rotuloModalidade = (c) => MODALIDADES[c?.modalidade || 'aluguel'] || c?.modalidade || '—'

export const rotuloTipo = (c) => (c?.tipo === 'receber' ? 'A receber' : 'A pagar')

// Nome do papel na tela: a cobrança principal é "Aluguel" só no aluguel.
export function rotuloPapel(contrato, papel) {
  if ((papel || 'aluguel') === 'aluguel') return ehAluguel(contrato) ? 'Aluguel' : 'Parcela'
  return PAPEIS[papel] || papel
}

// Textos do cadastro e da ficha que dependem da modalidade.
export function rotulosContrato(c) {
  const aluguel = ehAluguel(c)
  const receber = c?.tipo === 'receber'
  // Contrato a receber por administradora: quem paga (favorecido) é a administradora.
  const repasse = receber && aluguel && !!c?.modo_repasse
  return {
    principal: aluguel ? 'Aluguel' : 'Parcela',
    principalMinusculo: aluguel ? 'aluguel' : 'parcela',
    valorPrincipal: aluguel ? 'Valor do aluguel (contratual)' : 'Valor da parcela',
    favorecido: repasse ? 'Administradora (quem faz o repasse)' : aluguel
      ? (receber ? 'Inquilino (favorecido)' : 'Favorecido do aluguel (imobiliária / proprietário)')
      : 'Favorecido',
    categoria: aluguel ? 'Categoria do aluguel' : 'Categoria',
    desconto: aluguel ? 'Bonificação' : 'Desconto temporário',
    itemBase: aluguel ? 'Aluguel contratual' : 'Valor contratual',
    abaCreditos: aluguel ? 'Créditos do proprietário' : 'Créditos a abater',
    tipoPagar: aluguel ? 'A pagar (sou o inquilino)' : 'A pagar',
    tipoReceber: aluguel ? 'A receber (sou o proprietário)' : 'A receber',
    conta: receber ? 'Conta de recebimento' : 'Conta de pagamento',
    diaVencimento: repasse ? 'Dia de vencimento do inquilino' : 'Dia de vencimento',
  }
}
