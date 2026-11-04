// LEITURA DO BOLETO DO CONDOMÍNIO (composição do boleto no módulo de Contratos) — PURO.
// Mesma leitura de imagem/PDF do Assistente (api/_anexoIa.js): uma ferramenta FORÇADA que só
// devolve o que está escrito no boleto. Quem é o responsável por cada item NÃO vem da IA: vem das
// regras do contrato, no app (lib/contratos/composicao.js). A imagem nunca é gravada.

export const FERRAMENTA_LEITURA = 'ler_boleto_condominio'

export const DEFINICAO_LEITURA = {
  name: FERRAMENTA_LEITURA,
  description: 'Devolve os dados escritos no boleto/demonstrativo de condomínio: vencimento, total a pagar e os itens que compõem a cobrança (descrição e valor de cada um).',
  input_schema: {
    type: 'object',
    properties: {
      vencimento: { type: ['string', 'null'], description: 'Data de vencimento no formato YYYY-MM-DD; null se não estiver legível.' },
      total: { type: ['number', 'null'], description: 'Valor total do boleto (o valor a pagar no vencimento), em reais, ponto decimal.' },
      beneficiario: { type: ['string', 'null'], description: 'Nome do condomínio ou administradora (beneficiário).' },
      itens: {
        type: 'array',
        description: 'Cada item da composição/demonstrativo do boleto, na ordem em que aparece. Desconto/abatimento com valor NEGATIVO. Não inclua o total, subtotais, saldo anterior nem multa/juros que não estejam somados no total.',
        items: {
          type: 'object',
          properties: {
            descricao: { type: 'string', description: 'Texto do item como está no boleto (ex.: "Taxa de condomínio", "Fundo de reserva", "Água").' },
            valor: { type: 'number', description: 'Valor do item em reais, ponto decimal.' },
          },
          required: ['descricao', 'valor'],
        },
      },
    },
    required: ['vencimento', 'total', 'itens'],
  },
}

export const INSTRUCOES_LEITURA = `Você lê boletos e demonstrativos de CONDOMÍNIO para o Finup, um app brasileiro de controle financeiro.
Chame a ferramenta ${FERRAMENTA_LEITURA} UMA vez com o que está ESCRITO no documento.
- Copie as descrições dos itens como estão (sem traduzir nem resumir) e o valor de cada um.
- Total = o valor a pagar do boleto. Se houver "valor do documento" e "valor cobrado", use o valor a pagar até o vencimento.
- Não invente: campo ilegível = null; item ilegível fica de fora.
- Não decida quem paga cada item (inquilino ou proprietário): o app decide pelas regras do contrato.`

const r2 = (n) => Math.round(Number(n) * 100) / 100

// Saída da ferramenta → { vencimento, total, beneficiario, itens: [{ desc, valor }] }
export function normalizarSaidaLeitura(input) {
  const itens = (Array.isArray(input?.itens) ? input.itens : [])
    .map(i => ({ desc: String(i?.descricao ?? '').trim().slice(0, 120), valor: Number(i?.valor) }))
    .filter(i => i.desc && Number.isFinite(i.valor) && i.valor !== 0)
    .slice(0, 40)
    .map(i => ({ ...i, valor: r2(i.valor) }))
  const total = Number(input?.total)
  return {
    vencimento: /^\d{4}-\d{2}-\d{2}$/.test(String(input?.vencimento || '')) ? input.vencimento : null,
    total: Number.isFinite(total) && total > 0 ? r2(total) : null,
    beneficiario: typeof input?.beneficiario === 'string' ? input.beneficiario.trim().slice(0, 120) || null : null,
    itens,
  }
}

// ─── RECIBO / DEMONSTRATIVO DE ALUGUEL (parcela principal do contrato) ───────────────────────────
// Débitos (aluguel, seguro, taxas…) e créditos (bonificação, descontos, fundo de reserva…) vêm de
// colunas: o sinal sai da natureza, não do texto. O app reconhece cada item pelo contrato.
export const FERRAMENTA_RECIBO = 'ler_recibo_aluguel'

export const DEFINICAO_RECIBO = {
  name: FERRAMENTA_RECIBO,
  description: 'Devolve os dados escritos no recibo/demonstrativo de aluguel: referência, vencimento, data e valor pago, e cada item com a natureza (débito ou crédito).',
  input_schema: {
    type: 'object',
    properties: {
      referencia: { type: ['string', 'null'], description: 'Mês/ano de referência do aluguel como está no recibo (ex.: "10/2026"); null se não houver.' },
      vencimento: { type: ['string', 'null'], description: 'Data de vencimento no formato YYYY-MM-DD; null se não estiver legível.' },
      data_pagamento: { type: ['string', 'null'], description: 'Data do pagamento no formato YYYY-MM-DD; null se não houver.' },
      valor_pago: { type: ['number', 'null'], description: 'Valor pago/total líquido do recibo, em reais, ponto decimal.' },
      itens: {
        type: 'array',
        description: 'Cada lançamento do demonstrativo, na ordem. NÃO inclua subtotal, total, total de débitos/créditos, saldo nem a linha "PAGAMENTO EFETUADO".',
        items: {
          type: 'object',
          properties: {
            descricao: { type: 'string', description: 'Texto do item como está no recibo (ex.: "Aluguel", "Seguro incêndio 3/36", "Fundo de reserva").' },
            valor: { type: 'number', description: 'Valor do item em reais, POSITIVO, ponto decimal.' },
            natureza: { type: 'string', enum: ['debito', 'credito'], description: 'debito = cobrado do inquilino (soma); credito = abatido/desconto (subtrai). Pela coluna do demonstrativo.' },
          },
          required: ['descricao', 'valor', 'natureza'],
        },
      },
    },
    required: ['itens'],
  },
}

export const INSTRUCOES_RECIBO = `Você lê recibos e demonstrativos de ALUGUEL (imobiliária) para o Finup, um app brasileiro de controle financeiro.
Chame a ferramenta ${FERRAMENTA_RECIBO} UMA vez com o que está ESCRITO no documento.
- Cada item com a descrição como está e o valor POSITIVO; a natureza vem da coluna: débito (cobrado) ou crédito (abatido/desconto).
- Ignore subtotal, total, totais de débito/crédito, saldo e a linha "PAGAMENTO EFETUADO" (não são itens).
- Não invente: campo ilegível = null; item ilegível fica de fora.`

// Saída da ferramenta → { referencia, vencimento, data_pagamento, valor_pago, itens: [{ desc, valor, natureza }] }
const NAO_ITEM_RECIBO = /^(sub ?total|total|valor (total|pago|liquido|a pagar)|pagamento efetuado|saldo)\b/i
export function normalizarSaidaRecibo(input) {
  const data = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x || '')) ? x : null)
  const semAcento = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '')
  const itens = (Array.isArray(input?.itens) ? input.itens : [])
    .map(i => ({
      desc: String(i?.descricao ?? '').trim().slice(0, 120), valor: Math.abs(Number(i?.valor)),
      natureza: String(i?.natureza || '').toLowerCase().startsWith('c') ? 'credito' : 'debito',
    }))
    .filter(i => i.desc && Number.isFinite(i.valor) && i.valor !== 0 && !NAO_ITEM_RECIBO.test(semAcento(i.desc).trim()))
    .slice(0, 40)
    .map(i => ({ ...i, valor: r2(i.valor) }))
  const pago = Number(input?.valor_pago)
  return {
    referencia: typeof input?.referencia === 'string' ? input.referencia.trim().slice(0, 40) || null : null,
    vencimento: data(input?.vencimento), data_pagamento: data(input?.data_pagamento),
    valor_pago: Number.isFinite(pago) && pago > 0 ? r2(pago) : null, itens,
  }
}
