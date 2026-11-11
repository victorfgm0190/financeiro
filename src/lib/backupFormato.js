// BACKUP COMPLETO DO AMBIENTE — formato do arquivo e regras PURAS, as mesmas no navegador, na API
// (api/_backup.js) e nos scripts de linha de comando (scripts/backup-exportar.js, backup-conferir.js).
// Nada específico de cliente: as tabelas saem do banco; aqui só a classificação e o formato.
//
// Arquivo (.json):
//   { formato: 'finup-backup', versaoFormato: 1,
//     manifesto: { ambiente, geradoEm, appHash, schema: { ultima, migracoes[] },
//                  tabelas: { <tabela>: { linhas, impressao, colunas[] } } },
//     tabelas: { <tabela>: [ '<linha como JSON do Postgres>', ... ] } }
// Cada linha é o TEXTO que o Postgres gera (to_jsonb(linha)::text), guardado como string: assim a
// restauração devolve exatamente os mesmos valores (numeric com as casas, datas, jsonb) — sem passar
// pelos números do JavaScript — e a impressão digital pode ser recalculada aqui e no banco.
// Impressão digital da tabela = SHA-256 (hex) das linhas unidas por "\n", na ordem fixa
// (chave da tabela — id ou chave primária — e depois o texto da linha, comparação byte a byte).

export const FORMATO = 'finup-backup'
export const VERSAO_FORMATO = 1

// Tamanho máximo de cada parte enviada/recebida (a Vercel corta corpo e resposta em ~4,5 MB; as
// linhas viajam como strings JSON, com aspas escapadas, então a margem é grande de propósito).
export const LIMITE_BYTES_PARTE = 2_000_000

// ─── Classificação das tabelas ──────────────────────────────────────────────────────────────────
// Toda tabela do banco do ambiente está numa das duas listas. O teste src/lib/backupFormato.test.js
// varre o schema (estrutura_base, migrações e os CREATE TABLE da API) e FALHA se surgir tabela nova
// sem classificação. Em produção, tabela que existir no banco e não estiver em FORA_DO_BACKUP vai
// para o backup (nunca fica de fora em silêncio).
export const FORA_DO_BACKUP = Object.freeze({
  usuarios: 'Acesso: usuários e senhas são do ambiente de destino e continuam os dele.',
  membros: 'Acesso: vínculo de usuários com a organização do destino.',
  organizacoes: 'Acesso: organização do ambiente de destino.',
  senha_tokens: 'Acesso: links de definir senha do destino.',
  login_bloqueios: 'Acesso: bloqueios de tentativa de login do destino.',
  plataforma_clientes: 'Plataforma: controle de clientes, só do ambiente principal.',
  plataforma_historico: 'Plataforma: histórico do controle de clientes.',
  plataforma_cadastro_envios: 'Plataforma: pedidos públicos de cadastro.',
  _migracoes: 'Controle de versão do banco: vai no manifesto (lista de migrações), não como dado.',
  backup_preparo: 'Área de preparo da própria restauração (temporária).',
  indices_cache: 'Cache dos índices de reajuste (IPCA/IGP-M) do Banco Central: o app baixa de novo quando falta.',
})

export const NO_BACKUP = Object.freeze([
  'account_mapping', 'agendamentos', 'atalhos_usuario', 'bem_baixas', 'bem_movimentacoes', 'bem_vendas',
  'boas_vindas_usuario', 'card_imports', 'cartoes', 'categorias', 'configuracoes', 'consorcio_cotas',
  'consorcio_eventos', 'consorcios', 'contas', 'contrato_competencias', 'contrato_creditos', 'contrato_eventos',
  'contrato_itens', 'contrato_regras_itens', 'contratos', 'envelopes', 'favorecido_alias', 'favorecidos',
  'feriados', 'financing', 'financing_installments', 'fluxo_consultas', 'fluxo_datas_provisorias',
  'fluxo_provisorios', 'gerencial_rules', 'grupos_conta', 'guia_telas_ocultas', 'historico_alteracoes',
  'ia_apelidos', 'ia_pre_lancamentos', 'ia_uso', 'import_layouts', 'importacao_depara',
  'importacoes_lancamentos', 'importacoes_pendentes', 'lancamento_rateios', 'lancamentos',
  'marcos_saldo_gerencial', 'orcamento', 'pendencias_integridade', 'perfis', 'regras_classificacao',
  'reservas', 'reservas_funcoes', 'reservas_movimentos', 'reserve_adjustments', 'reserve_daily_ledger',
  'reserve_functions', 'reserve_pendencias_fechado', 'reserve_period_snapshots', 'reserve_periods',
  'reserve_virada_recalculos', 'reserve_viradas', 'schedule_reserva_funcoes', 'tipos_documento',
])

export const tabelaNoBackup = (t) => !Object.prototype.hasOwnProperty.call(FORA_DO_BACKUP, t)

// Colunas que NÃO viajam no arquivo e ficam com o valor do DESTINO: a identidade do ambiente
// (título e frase do rodapé). Também ficam fora da impressão digital.
export const MANTIDOS_DO_DESTINO = Object.freeze({ configuracoes: ['rodape_titulo', 'rodape_frase'] })
export const colunasMantidas = (t) => MANTIDOS_DO_DESTINO[t] || []

// ─── Impressão digital ──────────────────────────────────────────────────────────────────────────
const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
export async function impressaoDasLinhas(linhas, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error('Este navegador não calcula SHA-256 (crypto.subtle).')
  return hex(await subtle.digest('SHA-256', new TextEncoder().encode((linhas || []).join('\n'))))
}

// ─── Arquivo ────────────────────────────────────────────────────────────────────────────────────
export const ERRO_FORMATO_ANTIGO = 'Este arquivo é de uma versão antiga do backup do Finup: ele não tem o cabeçalho com a versão e as conferências, não traz todas as tabelas e não pode ser restaurado com segurança. Gere um backup novo em Configurações → Backup → Exportar.'
export const ERRO_NAO_E_BACKUP = 'Este arquivo não é um backup do Finup.'

// Confere a ESTRUTURA do arquivo (sem banco). → { ok: true } | { ok: false, erro, antigo? }
export function validarArquivo(arq) {
  if (!arq || typeof arq !== 'object' || Array.isArray(arq)) return { ok: false, erro: ERRO_NAO_E_BACKUP }
  if (arq.formato !== FORMATO) {
    const antigo = Array.isArray(arq.accounts) || Array.isArray(arq.transactions) || arq._app === 'finup'
    return { ok: false, erro: antigo ? ERRO_FORMATO_ANTIGO : ERRO_NAO_E_BACKUP, antigo }
  }
  if (Number(arq.versaoFormato) > VERSAO_FORMATO) return { ok: false, erro: 'Este backup foi gerado por uma versão mais nova do Finup. Atualize o app antes de restaurar.' }
  const m = arq.manifesto
  if (!m || typeof m !== 'object' || !m.tabelas || typeof m.tabelas !== 'object' || !arq.tabelas || typeof arq.tabelas !== 'object') {
    return { ok: false, erro: 'Backup incompleto: falta o cabeçalho (manifesto) ou as tabelas.' }
  }
  for (const [t, info] of Object.entries(m.tabelas)) {
    const linhas = arq.tabelas[t]
    if (!Array.isArray(linhas)) return { ok: false, erro: `Backup incompleto: falta a tabela ${t}.` }
    if (linhas.length !== Number(info.linhas)) return { ok: false, erro: `Backup corrompido: ${t} tem ${linhas.length} linha(s) e o cabeçalho diz ${info.linhas}.` }
    if (linhas.some(l => typeof l !== 'string')) return { ok: false, erro: `Backup corrompido: linhas de ${t} fora do formato.` }
  }
  for (const t of Object.keys(arq.tabelas)) if (!m.tabelas[t]) return { ok: false, erro: `Backup corrompido: a tabela ${t} não está no cabeçalho.` }
  return { ok: true }
}

// Recalcula a impressão digital de cada tabela do arquivo e compara com o cabeçalho.
// → { ok, divergentes: [tabela] }
export async function conferirIntegridade(arq, subtle) {
  const divergentes = []
  for (const [t, info] of Object.entries(arq.manifesto.tabelas)) {
    if (await impressaoDasLinhas(arq.tabelas[t], subtle) !== info.impressao) divergentes.push(t)
  }
  return { ok: divergentes.length === 0, divergentes }
}

// ─── Versão ─────────────────────────────────────────────────────────────────────────────────────
// manifesto do arquivo × destino { migracoes: [nomes aplicados], colunas: { tabela: [colunas] } }.
// → { recusar: [motivos], semMigracoes: [do destino que o arquivo não tinha],
//     colunasPadrao: [{ tabela, colunas }], tabelasVazias: [tabelas do destino que o arquivo não traz] }
export function compararVersao(manifesto, destino) {
  const recusar = []
  const migDestino = new Set(destino.migracoes || [])
  const migArquivo = manifesto.schema?.migracoes || []
  const maisNovas = migArquivo.filter(m => !migDestino.has(m))
  if (maisNovas.length) recusar.push(`O arquivo é de uma versão mais nova do banco: este ambiente ainda não tem ${maisNovas.length === 1 ? 'a atualização' : 'as atualizações'} ${maisNovas.join(', ')}.`)
  const colunasPadrao = []
  for (const [t, info] of Object.entries(manifesto.tabelas || {})) {
    const doDestino = destino.colunas?.[t]
    if (!doDestino) { recusar.push(`A tabela ${t} do arquivo não existe neste ambiente (versão mais nova).`); continue }
    const set = new Set(doDestino)
    const novas = (info.colunas || []).filter(c => !set.has(c))
    if (novas.length) recusar.push(`A tabela ${t} do arquivo tem coluna(s) que este ambiente não tem: ${novas.join(', ')}.`)
    const doArquivo = new Set(info.colunas || [])
    const faltam = doDestino.filter(c => !doArquivo.has(c) && !colunasMantidas(t).includes(c))
    if (faltam.length) colunasPadrao.push({ tabela: t, colunas: faltam })
  }
  const tabelasVazias = Object.keys(destino.colunas || {}).filter(t => tabelaNoBackup(t) && !manifesto.tabelas?.[t])
  const migSet = new Set(migArquivo)
  const semMigracoes = [...migDestino].filter(m => !migSet.has(m)).sort()
  return { recusar, semMigracoes, colunasPadrao, tabelasVazias }
}

// Ids dos perfis do arquivo (tabela perfis) — para avisar dos usuários com "perfis permitidos" que somem.
export function perfisDoArquivo(arq) {
  return (arq?.tabelas?.perfis || []).map(l => { try { return JSON.parse(l).id } catch { return null } }).filter(Boolean)
}

// ─── Nome do arquivo e rotação na pasta ─────────────────────────────────────────────────────────
const dois = (n) => String(n).padStart(2, '0')
// finup-backup-<ambiente>-AAAA-MM-DD-HHMM.json (hora local do aparelho).
export function nomeDoArquivo(ambiente, quando = new Date()) {
  const amb = String(ambiente || 'ambiente').toLowerCase().replace(/[^a-z0-9]+/g, '')
  return `finup-backup-${amb}-${quando.getFullYear()}-${dois(quando.getMonth() + 1)}-${dois(quando.getDate())}-${dois(quando.getHours())}${dois(quando.getMinutes())}.json`
}
export const padraoDoAmbiente = (ambiente) => new RegExp(`^finup-backup-${String(ambiente || '').toLowerCase().replace(/[^a-z0-9]+/g, '')}-\\d{4}-\\d{2}-\\d{2}-\\d{4}\\.json$`)

// Dos nomes da pasta, quais apagar para ficarem `manter` backups DESTE ambiente. Só arquivos com o
// padrão de nome do Finup do ambiente — qualquer outro arquivo da pasta nunca entra na lista.
export function arquivosParaApagar(nomes, ambiente, manter = 10) {
  const re = padraoDoAmbiente(ambiente)
  const nossos = (nomes || []).filter(n => re.test(n)).sort()
  const n = Math.max(1, Math.floor(Number(manter) || 10))
  return nossos.slice(0, Math.max(0, nossos.length - n))
}

// Dias desde o último backup (null = nunca).
export function diasDesde(ts, agora = Date.now()) {
  if (!ts) return null
  return Math.max(0, Math.floor((agora - Number(ts)) / 86_400_000))
}
export const DIAS_LEMBRETE = 7
export function textoUltimoBackup(ultimo, agora = Date.now(), onde = 'computador') {
  const d = diasDesde(ultimo, agora)
  if (d == null) return `Nenhum backup feito neste ${onde}.`
  if (agora - Number(ultimo) < 2 * 60_000) return 'Último backup: agora.'
  if (d === 0) return 'Último backup: hoje.'
  return `Último backup: há ${d} dia${d === 1 ? '' : 's'}.`
}
