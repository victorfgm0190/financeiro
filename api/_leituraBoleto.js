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

// ─── EXTRATO DA ADMINISTRADORA (contrato a receber por administradora — conferência do repasse) ───
// Só o que está ESCRITO: período, saldo anterior, cada lançamento (crédito a favor do proprietário ou
// débito descontado dele) com o tipo SUGERIDO, total e valor do repasse. O app compara com o que
// projetou e o usuário confirma — nada é gravado sozinho; o arquivo não é guardado.
export const FERRAMENTA_EXTRATO = 'ler_extrato_administradora'
export const TIPOS_ITEM_EXTRATO = ['aluguel', 'taxa_adm', 'taxa_unica', 'tarifa', 'despesa', 'benfeitoria', 'ajuste']
const NATUREZAS_DESPESA_EXTRATO = ['iptu', 'condominio', 'consumo', 'manutencao', 'outra']

export const DEFINICAO_EXTRATO = {
  name: FERRAMENTA_EXTRATO,
  description: 'Devolve os dados escritos no extrato/demonstrativo do proprietário enviado pela administradora (imobiliária): período, saldo anterior, cada lançamento com natureza e tipo sugerido, total e valor repassado.',
  input_schema: {
    type: 'object',
    properties: {
      periodo: { type: ['string', 'null'], description: 'Período/competência do extrato como está escrito (ex.: "02/2026", "01/02 a 28/02/2026"); null se não houver.' },
      saldo_anterior: { type: ['number', 'null'], description: 'Saldo anterior do proprietário com a administradora, em reais, ponto decimal. POSITIVO se a administradora devia ao proprietário; NEGATIVO se o proprietário devia (saldo devedor). null se não houver.' },
      total_extrato: { type: ['number', 'null'], description: 'O "Total do Extrato" LÍQUIDO (saldo anterior + créditos − débitos), em reais, COM SINAL — NEGATIVO quando o proprietário fica devendo (ex.: -606.35; é o saldo do extrato quando não há repasse). No layout com colunas Débito/Crédito na linha "Total do Extrato", é o número da linha DE BAIXO (o líquido), NUNCA a soma dos débitos nem a dos créditos. null se não houver.' },
      valor_repasse: { type: ['number', 'null'], description: 'Valor da seção/linha "Repasse", em reais, COM O SINAL que está no extrato: positivo = depositado ao proprietário; NEGATIVO quando o extrato mostra o repasse negativo (saldo devedor — não houve repasse; ex.: -606.35); 0 se diz que não houve repasse; null se não estiver escrito.' },
      itens: {
        type: 'array',
        description: 'Cada lançamento do extrato, na ordem. NÃO inclua saldo anterior, subtotal, total nem a linha do repasse/depósito ao proprietário.',
        items: {
          type: 'object',
          properties: {
            descricao: { type: 'string', description: 'Texto do lançamento como está (ex.: "Aluguel 02/2026", "Taxa de administração", "Intermediação 1/3", "SANEPAR", "Tarifa bancária").' },
            valor: { type: 'number', description: 'Valor em reais, POSITIVO, ponto decimal.' },
            natureza: { type: 'string', enum: ['credito', 'debito'], description: 'credito = a favor do proprietário (aluguel recebido, reembolso); debito = descontado do proprietário (taxas, despesas, reparos).' },
            tipo: { type: 'string', enum: TIPOS_ITEM_EXTRATO, description: 'Sugestão: aluguel; taxa_adm (taxa de administração); taxa_unica (intermediação, taxa de contrato, 1º aluguel); tarifa (tarifa bancária, DOC/TED, boleto); despesa (conta do proprietário paga pela administradora: água, luz, IPTU, condomínio…); benfeitoria (reparo/obra abatido do aluguel); ajuste (qualquer outro).' },
            natureza_despesa: { type: 'string', enum: NATUREZAS_DESPESA_EXTRATO, description: 'Só para tipo despesa (omita nos demais): iptu, condominio, consumo (água, luz, gás), manutencao ou outra.' },
          },
          required: ['descricao', 'valor', 'natureza', 'tipo'],
        },
      },
    },
    required: ['itens'],
  },
}

export const INSTRUCOES_EXTRATO = `Você lê EXTRATOS/DEMONSTRATIVOS DO PROPRIETÁRIO enviados por administradoras de imóveis (imobiliárias) para o Finup, um app brasileiro de controle financeiro.
Chame a ferramenta ${FERRAMENTA_EXTRATO} UMA vez com o que está ESCRITO no documento.
- Cada lançamento com a descrição como está, o valor POSITIVO e a natureza: crédito (a favor do proprietário) ou débito (descontado dele). O tipo é só uma sugestão.
- Saldo anterior, total e valor repassado NÃO são lançamentos: vão nos campos próprios. Saldo anterior devedor (o proprietário devia) é NEGATIVO.
- valor_repasse com o sinal do extrato: repasse NEGATIVO (ex.: "Repasse -606,35", saldo devedor) vem NEGATIVO — não tire o sinal.
- total_extrato = o "Total do Extrato" LÍQUIDO, com sinal: negativo quando o proprietário fica devendo (ex.: -606.35). Quando o extrato não tem repasse, esse é o saldo do extrato.
- Layout com colunas Débito/Crédito: a linha "Total do Extrato" mostra a soma dos débitos (ex.: -2.806,35) e a dos créditos (ex.: 2.200,00) e, NA LINHA DE BAIXO, o líquido (ex.: -606,35). total_extrato é o líquido de baixo — NUNCA a soma dos débitos nem a dos créditos.
- Não invente: campo ilegível = null; lançamento ilegível fica de fora.`

// Saída da ferramenta → { periodo, saldo_anterior, total_extrato, valor_repasse, itens: [{ descricao, valor, natureza, tipo, natureza_despesa }] }
const NAO_ITEM_EXTRATO = /^(sub ?total|total|saldo( anterior| atual| final)?|valor (repassado|liquido|a repassar)|repasse|deposito)\b/i
export function normalizarSaidaExtrato(input) {
  const semAcento = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '')
  const numOuNull = (x) => (x == null || x === '' || !Number.isFinite(Number(x)) ? null : r2(Number(x)))
  const itens = (Array.isArray(input?.itens) ? input.itens : [])
    .map(i => ({
      descricao: String(i?.descricao ?? '').trim().slice(0, 120), valor: Math.abs(Number(i?.valor)),
      natureza: String(i?.natureza || '').toLowerCase().startsWith('c') ? 'credito' : 'debito',
      tipo: TIPOS_ITEM_EXTRATO.includes(i?.tipo) ? i.tipo : 'ajuste',
      natureza_despesa: NATUREZAS_DESPESA_EXTRATO.includes(i?.natureza_despesa) ? i.natureza_despesa : null,
    }))
    .filter(i => i.descricao && Number.isFinite(i.valor) && i.valor !== 0 && !NAO_ITEM_EXTRATO.test(semAcento(i.descricao).trim()))
    .slice(0, 60)
    .map(i => ({ ...i, valor: r2(i.valor) }))
  return {
    periodo: typeof input?.periodo === 'string' ? input.periodo.trim().slice(0, 40) || null : null,
    saldo_anterior: numOuNull(input?.saldo_anterior), total_extrato: numOuNull(input?.total_extrato),
    valor_repasse: numOuNull(input?.valor_repasse), itens,
  }
}
