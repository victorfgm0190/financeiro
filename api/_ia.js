import { query } from './_db.js'
import { registroPorBanco } from './_conexao.js'
import { contextoPerfis } from './_permissoesApi.js'
import { normalizarTermo } from '../src/lib/assistente/texto.js'
import { ACOES, validarAcao } from '../src/lib/assistente/acoes.js'
import { classificarContas } from '../src/lib/assistente/contas.js'

// ASSISTENTE IA (etapa 1): o que o /api/assistente, o /api/ia-pre-lancamentos e o /api/ia-apelidos
// compartilham — DDL viva das tabelas ia_*, contexto de cadastros que vai para o modelo, validação
// dos ids que o modelo devolve e registro de consumo. Nada aqui grava lançamento, agendamento ou
// saldo: o app grava pelo mesmo fluxo do lançamento manual (AppContext), depois da prévia.
//
// Favorecido e centro de custo não têm id no banco: o "id" deles é o NOME (favorecidos.name e
// configuracoes.cost_centers). Categoria: caminho = category_group › name.

// DDL viva (a cópia em supabase/schema.sql é documentação; clientes novos recebem a migração
// supabase/migrations/2026-10-28_ia_assistente.sql). Roda uma vez por cold start, POR BANCO.
const schemaPronto = registroPorBanco()
export async function ensureIaSchema() {
  if (schemaPronto.jaRodou()) return
  await query(`CREATE TABLE IF NOT EXISTS ia_pre_lancamentos (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tipo TEXT NOT NULL CHECK (tipo IN ('lancamento', 'agendamento', 'baixa')),
    payload JSONB NOT NULL,
    texto_original TEXT,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'efetivado', 'descartado')),
    lancamento_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`)
  await query(`CREATE TABLE IF NOT EXISTS ia_apelidos (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tipo TEXT NOT NULL CHECK (tipo IN ('categoria', 'conta', 'favorecido', 'descricao_fatura')),
    termo TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    usos INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tipo, termo)
  )`)
  await query(`CREATE TABLE IF NOT EXISTS ia_uso (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ambiente TEXT,
    ferramenta TEXT,
    tokens_entrada INTEGER NOT NULL DEFAULT 0,
    tokens_saida INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    com_imagem BOOLEAN NOT NULL DEFAULT false
  )`)
  schemaPronto.marcar()
}

// Termo de apelido (minúsculo, sem acento): src/lib/assistente/texto.js, compartilhado com o app.
export { normalizarTermo }

export const TIPOS_APELIDO = ['categoria', 'conta', 'favorecido', 'descricao_fatura']

// Hoje em America/Sao_Paulo (YYYY-MM-DD).
export const hojeSaoPaulo = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

const somaDias = (ymd, dias) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// Categoria visível para os perfis do usuário? perfil_ids vazio/NULL = todos (src/lib/categoriasPerfil.js).
const categoriaDosPerfis = (perfilIds, perfis) =>
  !perfis || !Array.isArray(perfilIds) || perfilIds.length === 0 || perfilIds.some(p => perfis.includes(p))

// Cadastros do ambiente, já recortados pelos perfis permitidos do usuário.
// Contas: todas as visíveis (inclusive inativas), cada uma com `papel` (lib/assistente/contas.js):
// gerencial (nunca grava) | sugerivel (cartões "Uso comum" + favorita do perfil ativo) | citar.
// `perfilAtivo`: o perfil selecionado no app (só vale se for um dos perfis do usuário).
// → { contas, categorias, favorecidos, centros, apelidos, maisUsados, idx }
export async function montarContexto(user, q = query, { perfilAtivo = null } = {}) {
  const ctxPerfis = await contextoPerfis(q, user)
  const perfis = ctxPerfis?.perfis || null

  const contasRows = await q(
    `SELECT id, name, apelido, type, bank, profile_id, COALESCE(active, true) AS active, is_main,
            is_gerencial, vinculo_tipo, is_reserva, is_investimento, conta_aplicacao, cartao_finais
       FROM contas ORDER BY "order" NULLS LAST, name`)
  const visiveis = contasRows.filter(c => !ctxPerfis || ctxPerfis.contas.has(c.id))
  const perfilValido = perfilAtivo && visiveis.some(c => c.profile_id === perfilAtivo) && (!perfis || perfis.includes(perfilAtivo))
  const contas = classificarContas(visiveis, perfilValido ? perfilAtivo : null)

  const catRows = await q('SELECT id, name, type, category_group, perfil_ids FROM categorias ORDER BY category_group NULLS LAST, name')
  const categorias = catRows
    .filter(c => categoriaDosPerfis(c.perfil_ids, perfis))
    .map(c => ({ id: c.id, tipo: c.type, caminho: c.category_group ? `${c.category_group} › ${c.name}` : c.name }))

  const favorecidos = (await q('SELECT name FROM favorecidos ORDER BY name LIMIT 2000')).map(r => r.name).filter(Boolean)

  const [cfg] = await q('SELECT cost_centers, controle_gerencial FROM configuracoes WHERE id = 1')
  const centros = Array.isArray(cfg?.cost_centers) ? cfg.cost_centers.filter(x => typeof x === 'string' && x.trim()) : []

  const idx = {
    contas: new Map(contas.map(c => [c.id, c])),
    categorias: new Map(categorias.map(c => [c.id, c])),
    favorecidos: new Map(favorecidos.map(n => [normalizarTermo(n), n])),
    centros: new Map(centros.map(n => [normalizarTermo(n), n])),
  }

  // Apelidos aprendidos: só os que ainda apontam para um cadastro existente e visível
  // (renomeado/excluído → ignorado, nunca vira valor inválido).
  const apRows = await q('SELECT tipo, termo, ref_id, usos FROM ia_apelidos ORDER BY usos DESC, updated_at DESC LIMIT 400')
  const apelidos = apRows.map(a => ({ ...a, ref_id: refValido(a.tipo, a.ref_id, idx) })).filter(a => a.ref_id)

  // Mais usados nos últimos 90 dias (top 30 de cada), só entre os cadastros visíveis.
  const desde = somaDias(hojeSaoPaulo(), -90)
  const top = async (col) => (await q(
    `SELECT ${col} AS ref, COUNT(*)::int AS n FROM lancamentos
      WHERE date >= $1 AND ${col} IS NOT NULL AND ${col} <> ''
      GROUP BY ${col} ORDER BY n DESC LIMIT 60`, [desde]))
  const maisUsados = {
    categorias: (await top('category_id')).filter(r => idx.categorias.has(r.ref)).slice(0, 30).map(r => r.ref),
    contas: (await top('account_id')).filter(r => idx.contas.get(r.ref)?.papel === 'sugerivel').slice(0, 30).map(r => r.ref),
    favorecidos: (await top('payee')).map(r => idx.favorecidos.get(normalizarTermo(r.ref))).filter(Boolean).slice(0, 30),
  }

  // Controle gerencial do ambiente (null = ligado, como no app): desligado, o prompt não fala dele.
  const gerencialLigado = cfg?.controle_gerencial !== false
  return { contas, categorias, favorecidos, centros, apelidos, maisUsados, idx, perfilAtivo: perfilValido ? perfilAtivo : null, gerencialLigado }
}

// ref_id de um apelido ainda válido? Devolve o valor canônico (nome exato do favorecido) ou null.
function refValido(tipo, ref, idx) {
  if (tipo === 'categoria') return idx.categorias.has(ref) ? ref : null
  if (tipo === 'conta') return idx.contas.has(ref) ? ref : null
  if (tipo === 'favorecido') return idx.favorecidos.get(normalizarTermo(ref)) || null
  return null // descricao_fatura: etapa 2 (Importar Fatura)
}

const TIPO_CONTA = { checking: 'conta corrente', savings: 'poupança', credit: 'cartão de crédito', investment: 'investimento', cash: 'dinheiro', asset: 'bem', liability: 'dívida', gerencial: 'gerencial' }
const USO_CONTA = { sugerivel: 'PODE SUGERIR', citar: 'só se citada', gerencial: 'GERENCIAL — nunca em lançamento/agendamento/transferência' }

// Bloco de cadastros (texto estável → prompt caching). Sem data nem nada que mude a cada pedido.
export function textoCadastros(ctx) {
  const linhas = []
  linhas.push('## CONTAS (id | nome | apelido | tipo | banco | uso | finais do cartão)')
  for (const c of ctx.contas) {
    // Desligado: subcontas gerenciais nem aparecem (o backend continua recusando se citadas).
    if (ctx.gerencialLigado === false && c.papel === 'gerencial') continue
    const finais = Array.isArray(c.cartao_finais) && c.cartao_finais.length ? c.cartao_finais.join(', ') : '-'
    linhas.push(`${c.id} | ${c.name} | ${c.apelido || '-'} | ${TIPO_CONTA[c.type] || c.type} | ${c.bank || '-'} | ${USO_CONTA[c.papel]}${c.active === false ? ' (inativa)' : ''} | ${finais}`)
  }
  linhas.push('', '## CATEGORIAS (id | caminho | tipo: expense=despesa, income=receita, both=ambos)')
  for (const c of ctx.categorias) linhas.push(`${c.id} | ${c.caminho} | ${c.tipo}`)
  linhas.push('', '## FAVORECIDOS (o id é o próprio nome)')
  linhas.push(ctx.favorecidos.join(' ; ') || '(nenhum)')
  linhas.push('', '## CENTROS DE CUSTO (o id é o próprio nome)')
  linhas.push(ctx.centros.join(' ; ') || '(nenhum)')
  linhas.push('', '## APELIDOS APRENDIDOS (tipo | termo | id) — têm prioridade sobre o seu palpite')
  for (const a of ctx.apelidos) linhas.push(`${a.tipo} | ${a.termo} | ${a.ref_id}`)
  if (!ctx.apelidos.length) linhas.push('(nenhum)')
  linhas.push('', '## MAIS USADOS NOS ÚLTIMOS 90 DIAS (do mais para o menos usado)')
  linhas.push(`categorias: ${ctx.maisUsados.categorias.join(', ') || '-'}`)
  linhas.push(`contas: ${ctx.maisUsados.contas.join(', ') || '-'}`)
  linhas.push(`favorecidos: ${ctx.maisUsados.favorecidos.join(' ; ') || '-'}`)
  return linhas.join('\n')
}

// Instruções gerais (estáveis → cache). O que cada ferramenta faz está na descrição dela, no
// registro central (src/lib/assistente/acoes.js); o backend só oferece as do contexto do pedido.
export const INSTRUCOES = `Você é o assistente do Finup, um app brasileiro de controle financeiro.
O usuário descreve em português (texto, voz transcrita ou foto de comprovante/boleto) algo que quer registrar, consultar ou fazer.
Responda SEMPRE chamando exatamente UMA das ferramentas disponíveis, sem texto fora dela.

Regras:
1. Use SÓ ids que existem nos cadastros abaixo. Favorecido e centro de custo: o id é o nome exato da lista.
2. Os APELIDOS APRENDIDOS têm prioridade sobre o seu palpite: se o termo do apelido aparece no pedido, use o id dele.
3. Entenda sinônimos e variações (ex.: "combustível", "abastecer", "posto" → categoria de Gasolina/Combustível; "mercado" → Supermercado). Na dúvida entre categorias parecidas, prefira a mais usada nos últimos 90 dias.
4. Data padrão = a data de hoje informada no pedido. "Ontem", "dia 5" etc. são relativos a ela. Formato YYYY-MM-DD.
5. Se não tiver certeza de um campo, deixe null e dê confiança baixa (< 0.5). Não invente.
6. Favorecido que não existe no cadastro: deixe favorecido_id null e coloque o nome em favorecido_novo.
7. Em "termos", copie o trecho EXATO do pedido que levou a cada escolha (ex.: categoria: "combustível").
8. Descrição: curta e clara (ex.: "Combustível", "Conta de luz"), sem o valor.
9. Valor sempre positivo, em reais (ponto como separador decimal no JSON).
10. CONSULTAS (saldo, saldo principal, fatura, vencimentos, gastos, busca): você NÃO sabe valores — só escolha os filtros; o app calcula e mostra.
11. Você NUNCA exclui nem apaga nada, e não há ferramenta para isso. Se pedirem exclusão, use perguntar dizendo que você não exclui e que o item pode ser aberto na tela para o usuário decidir; opcoes vazio.
12. Operações críticas (estornar, pagar/fechar/abrir/revisar fatura, importar, virada de saldo, ajustes de reserva, gerenciais, baixa em lote, edição em massa, integridade, contratos, patrimônio, configurações) e EDITAR itens existentes: você não executa — use abrir_tela com o destino certo e o filtro citado.
13. CONTAS (coluna "uso"): conta citada pelo nome/apelido → essa conta. Compra no cartão ("no cartão", "crédito", "final 1234", nome do cartão) → o cartão certo; se não der para saber qual, conta_id null. Sem conta nem cartão citados → conta_id null (o app usa a favorita). "só se citada": use apenas se o pedido citou essa conta (nome ou apelido); senão conta_id null. "GERENCIAL": NUNCA use em registrar_lancamento, criar_agendamento, baixar_agendamento nem como origem/destino de transferência — são movimentadas só pela classificação gerencial; nunca troque uma conta gerencial citada pelo cartão de nome parecido. Consultar saldo de qualquer conta é permitido.
14. IMAGEM (foto ou print), com ou sem texto (o texto, se houver, manda: "foi no Itaupers", "divide em 3"):
   • cupom fiscal / nota: registrar_lancamento (despesa) com o VALOR TOTAL pago, a data da compra e o estabelecimento (nome fantasia) como favorecido e descrição; categoria pelo tipo de loja/itens; cartão pelo final impresso (final_cartao) ou pela forma de pagamento.
   • comprovante Pix/TED: registrar_lancamento; despesa se o usuário PAGOU (favorecido = quem recebeu), receita se RECEBEU (favorecido = quem pagou); transferência só se origem e destino forem contas do usuário. Valor e data do comprovante.
   • print de notificação/SMS do banco: mesma regra 15 (final do cartão em final_cartao, parcelas, valor total).
   • boleto: criar_agendamento (once) com valor, vencimento e beneficiário (favorecido/descrição); linha_digitavel com os dígitos, se legíveis.
   Campo que você não conseguiu ler com certeza (borrado, cortado, ambíguo): confiança < 0.5. Nunca invente valor, data ou final do cartão.
15. COMPRA PARCELADA (SMS/notificação de cartão do Itaú, Nubank, BB… ou frase livre): é registrar_lancamento (despesa); SMS → o cartão do "final NNNN" e a data da mensagem. Parcelas = N quando o texto diz "em 3x", "3 parcelas", "parcelado em 3", "parcelei em 4", "em 4 vezes", "4 vezes", "4x", "dividi em 4", "em quatro vezes" (à vista → null). Valor = o TOTAL da compra: "R$ 350 em 4 vezes", "parcelei 350 em 4x" e o valor do SMS são o TOTAL (350); "4 vezes de 350", "4 parcelas de R$ 350", "4x de 350" dão o valor DA PARCELA → valor = 4 × 350 = 1400. Na dúvida, use o TOTAL com confiança de valor baixa. Ex.: "parcelei R$350 no posto de gasolina em 4 vezes" → valor 350, parcelas 4, categoria de Combustível; "comprei um tênis 4x de 150 na Centauro" → valor 600, parcelas 4, favorecido Centauro. Descrição e favorecido = o estabelecimento (ex.: "RAIA1476"), nunca "Compra em 3x" ou "Compra aprovada".
16. Não dê conselho financeiro nem de investimento e não responda assuntos fora do Finup. Se pedirem, use perguntar explicando o que você faz.`

// Instruções conforme o controle gerencial do ambiente: desligado, nenhuma menção a gerencial
// (duas variantes estáveis → o cache de prompt continua valendo por variante).
const SEM_GERENCIAL = INSTRUCOES.replace(', gerenciais,', ',').replace(' "GERENCIAL": NUNCA use em registrar_lancamento, criar_agendamento, baixar_agendamento nem como origem/destino de transferência — são movimentadas só pela classificação gerencial; nunca troque uma conta gerencial citada pelo cartão de nome parecido.', '')
export const instrucoes = (gerencialLigado = true) => (gerencialLigado ? INSTRUCOES : SEM_GERENCIAL)

// Todas as ferramentas do registro (o pedido usa só as do contexto: acoesDoPedido).
export const FERRAMENTAS = ACOES.filter(a => a.ferramenta).map(a => ({ name: a.id, ...a.ferramenta }))
export { RECORRENCIAS } from '../src/lib/assistente/acoes.js'

// Valida a saída do modelo pelo registro: id que não existe (ou não é visível) vira null.
export const validarParametros = (ferramenta, input, ctx, hoje = hojeSaoPaulo()) => validarAcao(ferramenta, input, ctx, hoje)

// Consumo da chamada (ia_uso). Falha aqui não derruba a resposta.
// comImagem: o pedido teve foto/print (só a marca — a imagem nunca é gravada).
export async function registrarUso({ ambiente, ferramenta, usage, comImagem = false }, q = query) {
  const entrada = (usage?.input_tokens || 0) + (usage?.cache_read_input_tokens || 0) + (usage?.cache_creation_input_tokens || 0)
  const base = [ambiente || null, ferramenta || null, entrada, usage?.output_tokens || 0]
  try {
    await q('INSERT INTO ia_uso (ambiente, ferramenta, tokens_entrada, tokens_saida, com_imagem) VALUES ($1, $2, $3, $4, $5)', [...base, !!comImagem])
  } catch (err) {
    // Banco sem a coluna com_imagem (migração 2026-10-30_ia_uso_imagem pendente): grava sem ela.
    let erro = err
    if (err?.code === '42703') {
      try { await q('INSERT INTO ia_uso (ambiente, ferramenta, tokens_entrada, tokens_saida) VALUES ($1, $2, $3, $4)', base); return } catch (e2) { erro = e2 }
    }
    console.error('[ia] uso não registrado:', erro.message)
  }
}
