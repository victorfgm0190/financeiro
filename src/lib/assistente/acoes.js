// REGISTRO CENTRAL das ações do Assistente IA — fonte única (no estilo de src/mobile/modules.js).
// Ação nova = UMA entrada aqui + o componente em src/components/Assistente/executores.jsx.
// PURO (sem React, sem I/O): usado pelo backend (api/assistente.js) e pelo app. Imports com .js.
//
// Campos de cada ação:
//   id          nome da ferramenta da IA (snake_case)
//   nivel       'consulta' 🟢 responde direto (o APP calcula; a IA só escolhe filtros)
//               'criacao'  🟡 prévia + confirmar (formulário/modal existente)
//               'edicao'   🟠 prévia antes→depois + confirmar (fase 2)
//               'critica'  🔴 a IA não executa: só abrir_tela (sem ferramenta própria)
//   dominio     grupo carregado por contexto ('nucleo' = sempre)
//   permissao   [modulo, acao] de src/lib/permissoes.js — ferramenta só é oferecida a quem pode
//   ferramenta  { description, input_schema } (o name é o id)
//   validar     (params, ctx, hoje) → params limpos; id que não existe vira null (ctx: api/_ia.js)
//   resolver    nome do resolvedor no backend (api/assistente.js RESOLVEDORES), opcional
//   palavras    prefixos (normalizados) que trazem o DOMÍNIO da ação para o pedido
//   tela        (só 'critica'/telas) destino do abrir_tela: { page, rotulo }
//
// REGRA FIXA: o Assistente NUNCA exclui. Nenhuma ação exclui, e nenhum id/descrição fala nisso
// (src/lib/assistente/acoes.test.js garante). Estorno não é exclusão: é 🔴 (abrir_tela).
import { semIntermediador } from './nomeParecido.js'
import { contaParaGravar, escolherConta, contaCitada } from './contas.js'
import { moedaDoTexto } from '../cambio.js'
import {
  normalizarTermo, DATA_ISO, MES_ISO, txt, conf, valorPositivo, contemPalavra, parcelamentoDoTexto, descricaoGenericaDeCompra,
} from './texto.js'

export const NIVEIS = ['consulta', 'criacao', 'edicao', 'critica']
export const NUCLEO = ['perguntar', 'abrir_tela', 'registrar_lancamento', 'criar_agendamento', 'consultar_saldo', 'buscar_lancamentos']
export const RECORRENCIAS = ['once', 'weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual']
export const PERIODOS_VENCIMENTO = ['atrasados', 'hoje', 'amanha', 'semana', 'proximos_7', 'mes', 'proximos_30']
export const PERIODOS_GASTO = ['current', 'prev', '3m']

// ─── Telas gerais (destinos do abrir_tela além das ações 🔴) ─────────────────────────────────────
export const TELAS = {
  tela_lancamentos: { page: 'transactions', rotulo: 'Lançamentos', modulo: 'lancamentos' },
  tela_agendamentos: { page: 'schedule', rotulo: 'Agendamentos', modulo: 'agendamentos' },
  tela_cartao: { page: 'credit', rotulo: 'Cartão de Crédito', modulo: 'cartao' },
  tela_contas: { page: 'accounts', rotulo: 'Contas', modulo: 'contas' },
  tela_fluxo: { page: 'cashflow', rotulo: 'Fluxo de Caixa', modulo: 'fluxo' },
  tela_reservas: { page: 'reservas', rotulo: 'Reservas', modulo: 'reservas' },
  tela_envelopes: { page: 'envelopes', rotulo: 'Envelopes', modulo: 'envelopes' },
  tela_orcamento: { page: 'budget', rotulo: 'Orçamento', modulo: 'orcamento' },
  tela_patrimonio: { page: 'patrimonio', rotulo: 'Patrimônio', modulo: 'patrimonio' },
  tela_contratos: { page: 'contratos', rotulo: 'Contratos', modulo: 'contratos' },
  tela_relatorios: { page: 'reports', rotulo: 'Relatórios', modulo: 'relatorios' },
  tela_alertas: { page: 'alerts', rotulo: 'Alertas', modulo: 'alertas' },
  tela_configuracoes: { page: 'settings', rotulo: 'Configurações', modulo: 'configuracoes' },
}

// ─── Campos e validação compartilhados ───────────────────────────────────────────────────────────
const NUM_CONF = { type: 'number', minimum: 0, maximum: 1 }
const CAMPOS_LANCAMENTO = {
  tipo: { type: 'string', enum: ['despesa', 'receita', 'transferencia'] },
  valor: { type: ['number', 'null'], description: 'Valor em reais, positivo' },
  data: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
  conta_id: { type: ['string', 'null'] },
  conta_destino_id: { type: ['string', 'null'], description: 'Só em transferência' },
  categoria_id: { type: ['string', 'null'] },
  centro_custo_id: { type: ['string', 'null'], description: 'Nome do centro de custo' },
  favorecido_id: { type: ['string', 'null'], description: 'Nome exato de um favorecido existente' },
  favorecido_novo: { type: ['string', 'null'], description: 'Nome de favorecido que ainda não existe' },
  descricao: { type: ['string', 'null'] },
  final_cartao: { type: ['string', 'null'], description: 'Imagem: os 4 últimos dígitos do cartão, se aparecem (ex.: "final 4541")' },
  confianca: {
    type: 'object',
    description: 'Confiança de 0 a 1 SÓ nos campos com dúvida (< 1); campo ausente = certeza. {} quando não há dúvida',
    properties: { valor: NUM_CONF, data: NUM_CONF, conta: NUM_CONF, conta_destino: NUM_CONF, categoria: NUM_CONF, favorecido: NUM_CONF, centro_custo: NUM_CONF, descricao: NUM_CONF },
  },
  total_encontrado: { type: ['integer', 'null'], description: 'Só com VÁRIOS movimentos no pedido: quantos movimentos há no pedido INTEIRO (mesmo acima de 10). Repita em cada chamada.' },
  termos: {
    type: 'object',
    description: 'Trecho do pedido que levou a cada escolha (omita quando houver vários movimentos)',
    properties: { categoria: { type: ['string', 'null'] }, conta: { type: ['string', 'null'] }, favorecido: { type: ['string', 'null'] } },
  },
  // Instruções explícitas do pedido (regra 19): todas opcionais; null = o padrão do formulário.
  grupo_gerencial_id: { type: ['string', 'null'], description: 'CLASSIFICAÇÃO gerencial citada ("despesa gerencial", "lançar como gerencial", "grupo 2", nome do grupo): id da lista GRUPOS GERENCIAIS. Só despesa no cartão. Não é conta.' },
  conta_devolucao_id: { type: ['string', 'null'], description: 'Grupo 1 · Gerencial: conta corrente citada para a devolução ("devolver no Nubank"). Só se citada.' },
  reserva_conta_id: { type: ['string', 'null'], description: '"Pago com a reserva X": id da conta de reserva citada' },
  reserva_funcao_id: { type: ['string', 'null'], description: 'Função de reserva citada ("função IPVA"): id da lista FUNÇÕES DE RESERVA' },
  tipo_documento_id: { type: ['string', 'null'], description: 'Tipo de documento citado ("NF", "recibo", "boleto"): id da lista TIPOS DE DOCUMENTO' },
  observacoes: { type: ['string', 'null'], description: 'Observação citada ("observação: presente" → "presente")' },
  fatura: { type: ['string', 'null'], description: 'Fatura do cartão citada ("na fatura de dezembro", "fatura 12/2026"): YYYY-MM' },
}
// Campos que só existem com o controle gerencial ligado (desligado: nem aparecem na ferramenta).
const CAMPOS_GERENCIAIS = ['grupo_gerencial_id', 'conta_devolucao_id']
const TIPO_CAT = { despesa: 'expense', receita: 'income' }
const CONFIANCA_CERTA = { valor: 1, data: 1, conta: 1, conta_destino: 1, categoria: 1, favorecido: 1, centro_custo: 1, descricao: 1 }
const contaValida = (ctx, id) => (ctx.idx.contas.has(id) ? id : null)
const cartaoValido = (ctx, id) => (ctx.idx.contas.get(id)?.type === 'credit' ? id : null)
const categoriaValida = (ctx, id) => (ctx.idx.categorias.has(id) ? id : null)
const doEnum = (lista, v, padrao) => (lista.includes(v) ? v : padrao)

// Apelido cujo termo é exatamente o trecho que o modelo citou → vence o palpite.
function porApelido(ctx, tipo, termo) {
  const t = normalizarTermo(termo)
  if (!t) return null
  return ctx.apelidos.find(a => a.tipo === tipo && a.termo === t)?.ref_id || null
}

// Lançamento/agendamento: id que não existe (ou não é visível ao usuário) vira null, confiança 0.
function validarLancamento(p, ctx, hoje) {
  const termos = {
    categoria: txt(p.termos?.categoria, 60), conta: txt(p.termos?.conta, 60), favorecido: txt(p.termos?.favorecido, 60),
  }
  // A IA manda em `confianca` só os campos com dúvida — o que não veio é certeza (1), com ou sem
  // lote (antes, fora do lote, o ausente virava 0 e a prévia pedia "confira" em campo certo).
  const c = { ...CONFIANCA_CERTA, ...(p.confianca && typeof p.confianca === 'object' ? p.confianca : {}) }
  const confianca = {
    valor: conf(c.valor), data: conf(c.data), conta: conf(c.conta), conta_destino: conf(c.conta_destino),
    categoria: conf(c.categoria), favorecido: conf(c.favorecido), centro_custo: conf(c.centro_custo), descricao: conf(c.descricao),
  }
  const tipo = doEnum(['despesa', 'receita', 'transferencia'], p.tipo, 'despesa')
  const zera = (chave) => { confianca[chave] = 0; return null }

  const valor = valorPositivo(p.valor) ?? zera('valor')
  const data = DATA_ISO.test(String(p.data || '')) ? p.data : hoje

  // Contas (lib/assistente/contas.js): gerencial nunca; fora das sugeríveis, só se o pedido citou.
  // Imagem (cupom, notificação): o final do cartão lido nela vale como se estivesse no texto.
  const finalDaImagem = ctx.temImagem && /^\d{4}$/.test(String(p.final_cartao || '')) && !/\bfinal \d{4}\b/i.test(ctx.textoPedido || '')
    ? ` final ${p.final_cartao}` : ''
  const ctxConta = finalDaImagem ? { ...ctx, textoPedido: `${ctx.textoPedido || ''}${finalDaImagem}` } : ctx
  const origem = escolherConta(ctxConta, porApelido(ctx, 'conta', termos.conta) || p.conta_id, confianca.conta)
  confianca.conta = origem.confianca
  const contaId = origem.id
  const destino = tipo === 'transferencia' ? contaParaGravar(ctx, p.conta_destino_id, { destino: true }) : { id: null }
  let destinoId = destino.id
  if (p.conta_destino_id && (!destinoId || destinoId === contaId)) destinoId = zera('conta_destino')
  const contaGerencial = origem.gerencial || !!destino.gerencial

  let categoriaId = tipo === 'transferencia' ? null : (porApelido(ctx, 'categoria', termos.categoria) || p.categoria_id)
  const cat = categoriaId ? ctx.idx.categorias.get(categoriaId) : null
  if (categoriaId && (!cat || (cat.tipo !== 'both' && cat.tipo !== TIPO_CAT[tipo]))) categoriaId = zera('categoria')

  // Apelido aprendido ("Usar" no aviso de favorecido parecido): pelo termo citado ou pelo nome que
  // veio sem o intermediador ("MP *BARBEARIACONS" → "barbeariacons").
  const favApelido = porApelido(ctx, 'favorecido', termos.favorecido)
    || porApelido(ctx, 'favorecido', semIntermediador(p.favorecido_novo))
    || (!p.favorecido_id && !p.favorecido_novo ? porApelido(ctx, 'favorecido', semIntermediador(p.descricao)) : null)
  let favorecido = favApelido || (p.favorecido_id ? ctx.idx.favorecidos.get(normalizarTermo(p.favorecido_id)) || null : null)
  let favorecidoNovo = null
  if (!favorecido && p.favorecido_id) confianca.favorecido = 0
  const novo = txt(p.favorecido_novo, 80)
  if (!favorecido && novo) {
    // Favorecido cadastrado: pelo nome como veio ou sem o intermediador. Novo: sem o intermediador
    // do SMS ("MP *BARBEARIACONS" → "BARBEARIACONS").
    const limpo = txt(semIntermediador(novo), 80) || novo
    const existente = ctx.idx.favorecidos.get(normalizarTermo(novo)) || ctx.idx.favorecidos.get(normalizarTermo(limpo))
    if (existente) favorecido = existente
    else favorecidoNovo = limpo
  }

  const centro = p.centro_custo_id ? ctx.idx.centros.get(normalizarTermo(p.centro_custo_id)) || zera('centro_custo') : null

  return {
    tipo, valor, data, conta_id: contaId || null, conta_destino_id: destinoId || null, categoria_id: categoriaId || null,
    centro_custo_id: centro, favorecido_id: favorecido, favorecido_novo: favorecidoNovo,
    descricao: txt(semIntermediador(p.descricao), 120) || txt(p.descricao, 120), confianca, termos,
    ...extrasDoPedido(p, ctx, tipo),
    ...(contaGerencial ? { conta_gerencial: true } : {}),
    ...(origem.opcoes ? { contas_opcoes: origem.opcoes } : {}),
    ...(origem.finalSemCartao ? { final_sem_cartao: origem.finalSemCartao } : {}),
  }
}

// Instruções explícitas do pedido (grupo gerencial, reserva, tipo de documento, observação, fatura),
// validadas contra o cadastro: inválido ou fora do caso → some (o formulário usa o padrão). Só os
// campos que valeram entram na saída. O app confere de novo com a conta final
// (src/lib/assistente/camposDoPedido.js): grupo e fatura só valem em despesa de cartão.
const ehReserva = (c) => !!c && c.papel !== 'gerencial' && (!!c.is_reserva || c.vinculo_tipo === 'reserva')
export function grupoDoPedido(ctx, v) {
  const grupos = ctx.idx.grupos
  if (!v || !grupos?.size) return null
  if (grupos.has(v)) return grupos.get(v)
  const t = normalizarTermo(String(v)).replace(/^grupo /, '')
  return [...grupos.values()].find(g => normalizarTermo(String(g.number)) === t || normalizarTermo(g.name) === t || (g.alias && normalizarTermo(g.alias) === t)) || null
}
function tipoDocumentoDoPedido(ctx, v, tipo) {
  const tipos = ctx.idx.tiposDocumento
  if (!v || !tipos?.size) return null
  const t = normalizarTermo(String(v))
  const d = tipos.get(v) || [...tipos.values()].find(x => normalizarTermo(x.sigla) === t || normalizarTermo(x.nome) === t)
  if (!d || d.ativo === false) return null
  const natureza = { despesa: 'pagar', receita: 'receber' }[tipo]
  return natureza && d.natureza !== 'ambos' && d.natureza !== natureza ? null : d.id
}
function extrasDoPedido(p, ctx, tipo) {
  const out = {}
  const despesa = tipo === 'despesa'
  const grupo = despesa && ctx.gerencialLigado !== false ? grupoDoPedido(ctx, p.grupo_gerencial_id) : null
  if (grupo) out.grupo_gerencial_id = grupo.id
  // Conta da devolução do grupo 1: só a conta corrente que o pedido citou (senão, o padrão do formulário).
  if (grupo?.number === 1 && p.conta_devolucao_id) {
    const c = ctx.idx.contas.get(p.conta_devolucao_id)
    if (c && c.type === 'checking' && c.papel !== 'gerencial' && c.active !== false && contaCitada(c, ctx.textoPedido, ctx.apelidos)) {
      out.conta_devolucao_id = c.id
    }
  }
  if (despesa) {
    const funcao = p.reserva_funcao_id ? ctx.idx.funcoesReserva?.get(p.reserva_funcao_id) || null : null
    const citada = p.reserva_conta_id ? ctx.idx.contas.get(p.reserva_conta_id) : null
    // Só a função citada: a conta de reserva é a dela (se o grupo citado não tiver conta própria).
    const daFuncao = funcao && !grupo?.default_account_id && ehReserva(ctx.idx.contas.get(funcao.account_id)) ? funcao.account_id : null
    const reserva = ehReserva(citada) ? citada.id : daFuncao
    if (reserva) out.reserva_conta_id = reserva
    if (funcao && funcao.account_id === (reserva || grupo?.default_account_id)) out.reserva_funcao_id = funcao.id
    if (MES_ISO.test(String(p.fatura || ''))) out.fatura = p.fatura
  }
  const doc = tipoDocumentoDoPedido(ctx, p.tipo_documento_id, tipo)
  if (doc) out.tipo_documento_id = doc
  const obs = txt(p.observacoes, 300)
  if (obs) out.observacoes = obs
  return out
}

const brl = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Lançamento já acontecido. Compra parcelada (SMS/push do cartão, voz, frase livre): o texto do
// pedido manda — "em 3x", "parcelei em 4", "em quatro vezes" ligam o parcelado mesmo que o modelo
// não tenha preenchido. O valor é o TOTAL (o formulário divide pelas parcelas), exceto quando o
// texto dá o valor DA PARCELA ("4x de 150", "4 parcelas de R$ 350") → total = N × parcela, com o
// aviso "4 × R$ 350,00 = R$ 1.400,00". "4x" solto (sem "em"/"de") → TOTAL, valor a conferir.
// Descrição genérica ("Compra em 3x") → o estabelecimento.
function validarRegistro(p, ctx, hoje) {
  const out = validarLancamento(p, ctx, hoje)
  if (out.tipo === 'despesa') {
    const doModelo = Number.isInteger(p.parcelas) && p.parcelas > 1 && p.parcelas <= 48 ? p.parcelas : null
    // Lote (vários lançamentos num pedido): parcelas e moeda saem do TRECHO do item (lote.js).
    const lido = parcelamentoDoTexto(ctx.trechoItem ?? ctx.textoPedido)
    const n = lido?.n || doModelo
    if (n) {
      out.parcelas = n
      if (lido?.valorParcela) {
        const total = Math.round(lido.valorParcela * n * 100) / 100
        out.valor = total
        out.valor_parcela = lido.valorParcela
        out.aviso_parcelas = `${n} × ${brl(lido.valorParcela)} = ${brl(total)}`
      } else if (lido && !lido.claro) {
        out.confianca.valor = Math.min(out.confianca.valor, 0.4)
      }
    }
  }
  // Compra PARCELADA sem conta/cartão/final citados: não escolhe conta sozinho (a favorita costuma
  // ser conta corrente, onde o Parcelado não existe) — a prévia pergunta "Em qual cartão?".
  if (out.parcelas && out.confianca.conta < 1 && !out.contas_opcoes && !out.final_sem_cartao) {
    out.conta_id = null
    out.confianca.conta = 0
    out.pergunta_cartao = true
  }
  const estabelecimento = out.favorecido_id || out.favorecido_novo
  if (estabelecimento && descricaoGenericaDeCompra(out.descricao)) out.descricao = estabelecimento
  // Compra em moeda estrangeira (src/lib/cambio.js): valor ORIGINAL, sem converter — o texto manda
  // ("US 20,00" lido aqui vale mais que o número do modelo); o valor em R$ a prévia calcula pela PTAX.
  // Parcelado em dólar fica fora (o cartão converte cada parcela): segue como real.
  const lidoMoeda = out.tipo === 'despesa' ? moedaDoTexto(ctx.trechoItem ?? ctx.textoPedido) : null
  if (out.tipo === 'despesa' && !out.parcelas && (lidoMoeda || p.moeda === 'USD')) {
    const original = lidoMoeda?.valor || out.valor
    if (original) {
      out.moeda = 'USD'
      out.valor_original = original
      out.valor = null
    }
  }
  return out
}

// ─── As ações ────────────────────────────────────────────────────────────────────────────────────
export const ACOES = [
  // ── Núcleo (sempre carregado) ──
  {
    id: 'perguntar', nivel: 'consulta', dominio: 'nucleo', permissao: ['lancamentos', 'incluir'],
    ferramenta: {
      description: 'Pergunta ao usuário quando falta algo essencial ou há ambiguidade real (ex.: duas contas Itaú). Também para recusar o que você não faz.',
      input_schema: {
        type: 'object',
        properties: { pergunta: { type: 'string' }, opcoes: { type: 'array', items: { type: 'string' }, maxItems: 6 } },
        required: ['pergunta', 'opcoes'],
      },
    },
    validar: (p) => ({
      pergunta: txt(p.pergunta, 300) || 'Pode detalhar o que você quer fazer?',
      opcoes: Array.isArray(p.opcoes) ? p.opcoes.map(o => txt(o, 80)).filter(Boolean).slice(0, 6) : [],
    }),
  },
  {
    id: 'abrir_tela', nivel: 'consulta', dominio: 'nucleo', permissao: ['lancamentos', 'incluir'],
    ferramenta: {
      description: 'Abre a tela certa para o usuário decidir. Use para operações CRÍTICAS (estorno, fechar/abrir fatura, pagar fatura, revisar fatura, importar, virada de saldo, ajustes de reserva, gerenciais, baixa em lote, edição em massa, integridade, contratos, patrimônio, configurações) e para EDITAR itens existentes — você não executa nada disso.',
      input_schema: {
        type: 'object',
        properties: {
          destino: { type: 'string', description: 'Id do destino (lista no enum)' },
          filtro: { type: ['string', 'null'], description: 'O que o usuário citou para achar o item (ex.: "posto")' },
          cartao_id: { type: ['string', 'null'], description: 'Cartão citado (destinos de fatura)' },
          mes: { type: ['string', 'null'], description: 'Fatura YYYY-MM, se citada' },
        },
        required: ['destino'],
      },
    },
    validar: (p, ctx) => ({
      // Controle gerencial desligado (ctx.gerencialLigado === false): sem destino 'gerenciais'.
      destino: DESTINOS[p.destino] && !(p.destino === 'gerenciais' && ctx.gerencialLigado === false) ? p.destino : 'tela_lancamentos',
      filtro: txt(p.filtro, 80),
      cartao_id: cartaoValido(ctx, p.cartao_id),
      mes: MES_ISO.test(String(p.mes || '')) ? p.mes : null,
    }),
  },
  {
    id: 'registrar_lancamento', nivel: 'criacao', dominio: 'nucleo', permissao: ['lancamentos', 'incluir'],
    ferramenta: {
      description: 'Prepara um lançamento (despesa, receita ou transferência) que JÁ aconteceu ("gastei", "paguei", "recebi", "lance") para o usuário revisar. Não grava nada.',
      input_schema: {
        type: 'object',
        properties: {
          ...CAMPOS_LANCAMENTO,
          parcelas: { type: ['integer', 'null'], description: 'Compra parcelada no cartão ("em 3x", "3 parcelas"): número de parcelas; o valor é o TOTAL da compra. À vista = null' },
          moeda: { type: 'string', enum: ['BRL', 'USD'], description: 'Moeda do valor citado: "US", "US$", "USD", "U$", "dólares" → USD (valor = o número em dólar, SEM converter); senão BRL' },
          repetir: { type: ['string', 'null'], enum: [...RECORRENCIAS.filter(r => r !== 'once'), null], description: 'Lançamento que se repete, se citado ("todo mês" → monthly, "quinzenal" → biweekly); senão null' },
        },
        required: ['tipo', 'valor', 'data', 'conta_id', 'categoria_id', 'descricao', 'confianca'],
      },
    },
    validar: (p, ctx, hoje) => {
      const out = validarRegistro(p, ctx, hoje)
      if (RECORRENCIAS.includes(p.repetir) && p.repetir !== 'once' && !out.parcelas) out.repetir = p.repetir
      return out
    },
  },
  {
    id: 'criar_agendamento', nivel: 'criacao', dominio: 'nucleo', permissao: ['agendamentos', 'incluir'],
    ferramenta: {
      description: 'Prepara um agendamento (conta a pagar/receber futura, recorrente ou única; "contas a pagar" = agendamento) para o usuário revisar. Não grava nada.',
      input_schema: {
        type: 'object',
        properties: {
          ...CAMPOS_LANCAMENTO,
          vencimento: { type: ['string', 'null'], description: 'Primeiro vencimento, YYYY-MM-DD' },
          recorrencia: { type: 'string', enum: RECORRENCIAS, description: 'once = única' },
          parcelas: { type: ['integer', 'null'], description: 'Número de parcelas, se for parcelado; null = contínuo' },
          linha_digitavel: { type: ['string', 'null'], description: 'Boleto: a linha digitável (só os dígitos), se legível' },
        },
        required: ['tipo', 'valor', 'vencimento', 'recorrencia', 'conta_id', 'categoria_id', 'descricao', 'confianca'],
      },
    },
    validar: (p, ctx, hoje) => {
      const out = validarLancamento(p, ctx, hoje)
      out.vencimento = DATA_ISO.test(String(p.vencimento || '')) ? p.vencimento : out.data
      out.recorrencia = doEnum(RECORRENCIAS, p.recorrencia, 'once')
      out.parcelas = Number.isInteger(p.parcelas) && p.parcelas > 1 && p.parcelas <= 360 ? p.parcelas : null
      // Boleto: linha digitável (47/48 dígitos; 44 = código de barras) — a prévia SEMPRE pede conferência.
      const linha = String(p.linha_digitavel || '').replace(/\D/g, '')
      if ([44, 47, 48].includes(linha.length)) out.linha_digitavel = linha
      return out
    },
  },
  {
    id: 'consultar_saldo', nivel: 'consulta', dominio: 'nucleo', permissao: ['contas', 'ver'],
    ferramenta: {
      description: 'Saldo de UMA conta. O app calcula; você só indica a conta (nunca informe valores).',
      input_schema: { type: 'object', properties: { conta_id: { type: ['string', 'null'] } }, required: ['conta_id'] },
    },
    validar: (p, ctx) => ({ conta_id: contaValida(ctx, p.conta_id) }),
  },
  {
    id: 'buscar_lancamentos', nivel: 'consulta', dominio: 'nucleo', permissao: ['lancamentos', 'ver'],
    ferramenta: {
      description: 'Procura lançamentos e agendamentos por texto (descrição/favorecido), valor e período — a mesma Busca global do app. "acha um lançamento de 87 reais" → valor 87.',
      input_schema: {
        type: 'object',
        properties: {
          texto: { type: ['string', 'null'], description: 'Palavra da descrição ou do favorecido' },
          valor: { type: ['number', 'null'] },
          modo_valor: { type: 'string', enum: ['exato', 'aproximado'], description: 'aproximado = mesma parte inteira ("uns 87")' },
          de: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
          ate: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
        },
        required: ['texto', 'valor'],
      },
    },
    validar: (p) => ({
      texto: txt(p.texto, 80),
      valor: valorPositivo(p.valor),
      modo_valor: doEnum(['exato', 'aproximado'], p.modo_valor, 'exato'),
      de: DATA_ISO.test(String(p.de || '')) ? p.de : null,
      ate: DATA_ISO.test(String(p.ate || '')) ? p.ate : null,
    }),
  },

  // ── Agenda ──
  {
    id: 'baixar_agendamento', nivel: 'criacao', dominio: 'agenda', permissao: ['agendamentos', 'editar'],
    resolver: 'candidatosBaixa',
    palavras: ['baixa', 'baixar', 'pagou', 'paguei', 'recebi', 'quitei', 'quitar', 'parcela', 'agendamento'],
    ferramenta: {
      description: 'Dar baixa (registrar o pagamento/recebimento) num agendamento pendente que JÁ EXISTE ("dá baixa", "o Carlos me pagou", "paguei o aluguel"). O app procura o agendamento e abre a prévia; não grava nada. Informe só o NOME citado ("Carlos") e o valor: um valor em valor_informado, ou faixa em valor_min/valor_max ("uns 200, 220" → 200 e 220). valor_exato = true SÓ quando o valor foi dito exato ("de 250"); com "uns", "próximo de", "mais ou menos", "algo assim" → false. Tipo só se o pedido deixar claro: "me pagou/recebi" = receita; "paguei" = despesa; senão null.',
      input_schema: {
        type: 'object',
        properties: {
          favorecido: { type: ['string', 'null'], description: 'Nome citado, como o usuário disse' },
          descricao: { type: ['string', 'null'], description: 'Descrição citada do agendamento (ex.: "aluguel")' },
          valor_informado: { type: ['number', 'null'], description: 'Valor pago/recebido citado' },
          valor_exato: { type: 'boolean', description: 'true só se o valor foi dito exato' },
          valor_min: { type: ['number', 'null'] },
          valor_max: { type: ['number', 'null'] },
          tipo: { type: ['string', 'null'], enum: ['despesa', 'receita', null] },
          data_pagamento: { type: ['string', 'null'], description: 'YYYY-MM-DD; padrão hoje' },
          conta_id: { type: ['string', 'null'], description: 'Conta onde entrou/saiu o dinheiro, se citada' },
        },
        required: ['favorecido', 'tipo'],
      },
    },
    validar: (p, ctx, hoje) => {
      let min = valorPositivo(p.valor_min)
      let max = valorPositivo(p.valor_max)
      if (min && max && min > max) [min, max] = [max, min]
      return {
        favorecido: txt(p.favorecido, 80), descricao: txt(p.descricao, 80),
        valor_informado: valorPositivo(p.valor_informado), valor_min: min, valor_max: max,
        valor_exato: p.valor_exato === true && !!valorPositivo(p.valor_informado) && !(min && max && min !== max),
        tipo: doEnum(['despesa', 'receita'], p.tipo, null),
        data_pagamento: DATA_ISO.test(String(p.data_pagamento || '')) ? p.data_pagamento : hoje,
        // Conta da baixa: mesma regra do lançamento (gerencial nunca; fora das sugeríveis, só citada).
        ...((g) => ({ conta_id: g.id, ...(g.gerencial ? { conta_gerencial: true } : {}) }))(contaParaGravar(ctx, p.conta_id)),
      }
    },
  },
  {
    id: 'consultar_vencimentos', nivel: 'consulta', dominio: 'agenda', permissao: ['agendamentos', 'ver'],
    palavras: ['vence', 'vencem', 'vencimento', 'venciment', 'a pagar', 'a receber', 'atrasad', 'agenda', 'pendente', 'contas da semana', 'semana'],
    ferramenta: {
      description: 'O que vence (agendamentos pendentes) num período: "o que vence essa semana?", "contas atrasadas". O app calcula pela tela de Agendamentos.',
      input_schema: {
        type: 'object',
        properties: {
          periodo: { type: 'string', enum: PERIODOS_VENCIMENTO, description: 'semana = segunda a domingo desta semana' },
          tipo: { type: 'string', enum: ['pagar', 'receber', 'todos'] },
        },
        required: ['periodo', 'tipo'],
      },
    },
    validar: (p) => ({ periodo: doEnum(PERIODOS_VENCIMENTO, p.periodo, 'proximos_7'), tipo: doEnum(['pagar', 'receber', 'todos'], p.tipo, 'todos') }),
  },

  // ── Cartão ──
  {
    id: 'consultar_fatura', nivel: 'consulta', dominio: 'cartao', permissao: ['cartao', 'ver'],
    palavras: ['fatura', 'cartao', 'cartoes', 'credito', 'limite'],
    ferramenta: {
      description: 'Situação da fatura de um cartão de crédito (total, pago, falta pagar, fechada?). Sem mês citado = fatura atual. O app calcula.',
      input_schema: {
        type: 'object',
        properties: { cartao_id: { type: ['string', 'null'] }, mes: { type: ['string', 'null'], description: 'YYYY-MM da fatura, se citado' } },
        required: ['cartao_id'],
      },
    },
    validar: (p, ctx) => ({ cartao_id: cartaoValido(ctx, p.cartao_id), mes: MES_ISO.test(String(p.mes || '')) ? p.mes : null }),
  },

  // ── Painel / relatórios ──
  {
    id: 'consultar_gastos_categoria', nivel: 'consulta', dominio: 'painel', permissao: ['painel', 'ver'],
    palavras: ['gastei', 'gasto', 'gastos', 'gastando', 'maiores despesas', 'despesas do mes', 'despesas com', 'quanto foi de'],
    ferramenta: {
      description: 'Quanto foi gasto numa categoria (ou as maiores despesas) no mês financeiro: "quanto gastei de mercado esse mês?". O app calcula como o Painel.',
      input_schema: {
        type: 'object',
        properties: {
          categoria_id: { type: ['string', 'null'], description: 'null = maiores despesas' },
          periodo: { type: 'string', enum: PERIODOS_GASTO, description: 'current = este mês; prev = mês passado; 3m = últimos 3 meses' },
        },
        required: ['categoria_id', 'periodo'],
      },
    },
    validar: (p, ctx) => {
      const cat = categoriaValida(ctx, p.categoria_id)
      return { categoria_id: cat && ctx.idx.categorias.get(cat).tipo !== 'income' ? cat : null, periodo: doEnum(PERIODOS_GASTO, p.periodo, 'current') }
    },
  },
  {
    id: 'consultar_saldo_principal', nivel: 'consulta', dominio: 'painel', permissao: ['painel', 'ver'],
    palavras: ['saldo principal', 'principal', 'projetado', 'final do ciclo', 'quanto tenho', 'meu saldo'],
    ferramenta: {
      description: 'Saldo Principal do Início/Painel (atual, final do ciclo e projetado). O app calcula; não informe valores.',
      input_schema: { type: 'object', properties: {}, required: [] },
    },
    validar: () => ({}),
  },

  // ── 🔴 Críticas: a IA só abre a tela (destinos do abrir_tela) ──
  { id: 'estornar', nivel: 'critica', dominio: 'critica', permissao: ['lancamentos', 'ver'], tela: { page: 'transactions', rotulo: 'Lançamentos' }, palavras: ['estorn'] },
  { id: 'pagar_fatura', nivel: 'critica', dominio: 'critica', permissao: ['cartao', 'ver'], tela: { page: 'credit', rotulo: 'Cartão de Crédito' } },
  { id: 'fechar_abrir_fatura', nivel: 'critica', dominio: 'critica', permissao: ['cartao', 'ver'], tela: { page: 'credit', rotulo: 'Cartão de Crédito' } },
  { id: 'revisar_fatura', nivel: 'critica', dominio: 'critica', permissao: ['cartao', 'ver'], tela: { page: 'credit', rotulo: 'Cartão de Crédito' } },
  { id: 'importar_fatura', nivel: 'critica', dominio: 'critica', permissao: ['importar', 'ver'], tela: { page: 'import', rotulo: 'Importar Fatura (só no computador)' } },
  { id: 'importar_lancamentos', nivel: 'critica', dominio: 'critica', permissao: ['lancamentos', 'ver'], tela: { page: 'importar-lancamentos', rotulo: 'Importar lançamentos' } },
  { id: 'gerenciais', nivel: 'critica', dominio: 'critica', permissao: ['agendamentos', 'ver'], tela: { page: 'schedule', rotulo: 'Agendamentos › Executar gerenciais' } },
  { id: 'baixa_em_lote', nivel: 'critica', dominio: 'critica', permissao: ['agendamentos', 'ver'], tela: { page: 'schedule', rotulo: 'Agendamentos' } },
  { id: 'vincular_ou_ja_no_cartao', nivel: 'critica', dominio: 'critica', permissao: ['agendamentos', 'ver'], tela: { page: 'schedule', rotulo: 'Agendamentos' } },
  { id: 'edicao_em_massa', nivel: 'critica', dominio: 'critica', permissao: ['lancamentos', 'ver'], tela: { page: 'transactions', rotulo: 'Lançamentos' } },
  { id: 'renomear_favorecido', nivel: 'critica', dominio: 'critica', permissao: ['cadastros', 'ver'], tela: { page: 'settings', rotulo: 'Configurações › Favorecidos', config: ['cadastros', 'favorecidos'] } },
  { id: 'virada_saldo_reservas', nivel: 'critica', dominio: 'critica', permissao: ['reservas', 'ver'], tela: { page: 'reservas', rotulo: 'Reservas' } },
  { id: 'ajustes_reserva', nivel: 'critica', dominio: 'critica', permissao: ['reservas', 'ver'], tela: { page: 'reservas', rotulo: 'Reservas' } },
  { id: 'integridade', nivel: 'critica', dominio: 'critica', permissao: ['alertas', 'ver'], tela: { page: 'alerts', rotulo: 'Alertas › Integridade' } },
  { id: 'contratos', nivel: 'critica', dominio: 'critica', permissao: ['contratos', 'ver'], tela: { page: 'contratos', rotulo: 'Contratos' } },
  { id: 'patrimonio', nivel: 'critica', dominio: 'critica', permissao: ['patrimonio', 'ver'], tela: { page: 'patrimonio', rotulo: 'Patrimônio' } },
  { id: 'configuracoes', nivel: 'critica', dominio: 'critica', permissao: ['configuracoes', 'ver'], tela: { page: 'settings', rotulo: 'Configurações' } },
]

export const acaoPorId = (id) => ACOES.find(a => a.id === id) || null

// Destinos do abrir_tela: as ações 🔴 + as telas gerais. id → { page, rotulo, config?, critica }.
export const DESTINOS = Object.fromEntries([
  ...ACOES.filter(a => a.nivel === 'critica').map(a => [a.id, { ...a.tela, critica: true, permissao: a.permissao }]),
  ...Object.entries(TELAS).map(([id, t]) => [id, { page: t.page, rotulo: t.rotulo, critica: false, permissao: [t.modulo, 'ver'] }]),
])

// ─── Escolha das ferramentas do pedido ───────────────────────────────────────────────────────────
// Núcleo fixo + os DOMÍNIOS cujas palavras aparecem no texto (sem chamada extra ao modelo), só as
// que o usuário pode usar. Ordem estável (núcleo, depois ordem do registro): o mesmo grupo gera o
// mesmo prefixo — o cache de prompt vale por grupo.
export function dominiosDoTexto(texto) {
  const t = normalizarTermo(texto)
  const out = new Set()
  for (const a of ACOES) if (a.dominio !== 'nucleo' && a.nivel !== 'critica' && a.palavras && contemPalavra(t, a.palavras)) out.add(a.dominio)
  return [...out]
}

export function acoesDoPedido(texto, podeFn) {
  const dominios = new Set(dominiosDoTexto(texto))
  const permitido = (a) => !podeFn || podeFn(a.permissao[0], a.permissao[1])
  const nucleo = NUCLEO.map(acaoPorId).filter(permitido)
  const extras = ACOES.filter(a => a.ferramenta && a.dominio !== 'nucleo' && dominios.has(a.dominio) && permitido(a))
  return [...nucleo, ...extras]
}

// Definição da ferramenta para a API. abrir_tela recebe o enum dos destinos que o usuário pode abrir.
// `gerencial: false` (controle gerencial desligado no ambiente): nem o destino nem a menção a
// "gerenciais" aparecem.
export function definicaoFerramenta(acao, podeFn, { gerencial = true } = {}) {
  if (acao.id !== 'abrir_tela') {
    const props = acao.ferramenta?.input_schema?.properties
    if (gerencial || !props?.grupo_gerencial_id) return { name: acao.id, ...acao.ferramenta }
    const sem = Object.fromEntries(Object.entries(props).filter(([k]) => !CAMPOS_GERENCIAIS.includes(k)))
    return { name: acao.id, ...acao.ferramenta, input_schema: { ...acao.ferramenta.input_schema, properties: sem } }
  }
  const destinos = Object.entries(DESTINOS)
    .filter(([id, d]) => (!podeFn || podeFn(d.permissao[0], d.permissao[1])) && (gerencial || id !== 'gerenciais'))
    .map(([id]) => id)
  const schema = acao.ferramenta.input_schema
  return {
    name: acao.id,
    description: gerencial ? acao.ferramenta.description : acao.ferramenta.description.replace(', gerenciais', ''),
    input_schema: { ...schema, properties: { ...schema.properties, destino: { ...schema.properties.destino, enum: destinos } } },
  }
}

export function validarAcao(id, input, ctx, hoje) {
  const acao = acaoPorId(id)
  if (!acao?.validar) return null
  return acao.validar(input && typeof input === 'object' ? input : {}, ctx, hoje)
}
