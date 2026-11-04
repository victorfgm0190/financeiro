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
