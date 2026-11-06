// ── JORNADA GUIADA (onboarding) ─────────────────────────────────────────────────────────────────
// Evolução do checklist "Primeiros passos": fases em ordem, cada uma com passos de dois tipos.
//   • 'conhecer': leva à tela e abre o TOUR da tela (guia de src/lib/ajudaTelas.js). Conclui no
//     "Entendi ✔" (etapa 'feita' em boas_vindas_usuario.progresso).
//   • 'fazer': leva à tela e abre o "Faça comigo" (tarefa de src/lib/tarefasGuiadas.js). Conclui
//     SOZINHO quando o dado existe no banco (`feito(dados)`) — se já existe, nasce concluído.
// Estados (mesmos do checklist, na mesma coluna progresso.etapas): feita | pulada (retomável) |
// nao-se-aplica (sai do total). Passos 'fazer' reusam as etapas do CHECKLIST (mesmo id, mesma regra
// de "feito", "não se aplica" e aviso ao pular) — nada duplicado. Nada específico de um cliente.
//
// Passo: { id, fase, tipo, titulo, descricao, tela (página), hash? (seção de Configurações),
//   guia? (tela do tour), guiaChave? (item do tour onde começa), tarefa? (Faça comigo), etapa?
//   (item do CHECKLIST reaproveitado), mostrar(ctx), dependsOn: [ids] (ordem dos passos e do atalho
//   por objetivo; o que uma função EXIGE de verdade está em src/lib/prerequisitos.js) }.
import { CHECKLIST } from './ajudaTelas.js'

const sempre = () => true
const doChecklist = (id) => CHECKLIST.find(i => i.id === id)

export const FASES_JORNADA = [
  { id: 'configuracoes', titulo: 'Conhecer as Configurações' },
  { id: 'cadastros', titulo: 'Cadastros' },
  { id: 'movimento', titulo: 'Primeiro movimento' },
  { id: 'resultados', titulo: 'Ver resultados' },
  { id: 'extras', titulo: 'Extras', opcional: true },
]

// Passo 'fazer' que reaproveita uma etapa do checklist (texto próprio da jornada).
const fazer = (etapa, extra) => {
  const base = doChecklist(etapa)
  return {
    id: etapa, etapa, tipo: 'fazer',
    mostrar: base.mostrar, feito: base.feito, naoSeAplica: base.naoSeAplica, avisoAoPular: base.avisoAoPular,
    acao: base.acao, dependsOn: [],
    ...extra,
  }
}

export const PASSOS_JORNADA = [
  // Fase 1 — conhecer
  {
    id: 'j-configuracoes', fase: 'configuracoes', tipo: 'conhecer', mostrar: (c) => c.podeVer('settings'),
    titulo: 'Onde ficam os cadastros',
    descricao: 'Em Configurações você cadastra perfis, contas, cartões, categorias, favorecidos e tipos de documento, e ajusta guias e atalhos.',
    tela: 'settings', guia: 'settings', dependsOn: [],
  },
  {
    id: 'j-categorias', fase: 'configuracoes', tipo: 'conhecer', mostrar: (c) => c.podeVer('settings'),
    titulo: 'Categorias',
    descricao: 'As categorias já vêm prontas. Se quiser criar outras, é aqui.',
    tela: 'settings', hash: '#config/cadastros/categorias', guia: 'settings:categorias', guiaChave: 'nova-categoria', dependsOn: ['j-configuracoes'],
  },
  // Fase 2 — fazer
  fazer('perfil', { fase: 'cadastros', titulo: 'Criar o seu perfil', descricao: 'Cada pessoa ou empresa dona do dinheiro é um perfil (CPF ou CNPJ).', tela: 'settings', hash: '#config/geral/perfis', tarefa: 'settings.perfil-cpf' }),
  fazer('conta', { fase: 'cadastros', titulo: 'Cadastrar a primeira conta', descricao: 'Banco, poupança ou dinheiro, ligada a um perfil.', tela: 'accounts', tarefa: 'accounts.conta-corrente', dependsOn: ['perfil'] }),
  fazer('cartao', { fase: 'cadastros', titulo: 'Cadastrar um cartão de crédito', descricao: 'Com fechamento e vencimento, cada compra cai na fatura certa.', tela: 'accounts', tarefa: 'accounts.cadastrar-cartao', dependsOn: ['conta'] }),
  // Fase 3 — fazer
  {
    id: 'lancamento', fase: 'movimento', tipo: 'fazer', mostrar: (c) => c.podeVer('transactions') && c.podeIncluir('lancamentos'),
    titulo: 'Registrar o primeiro lançamento',
    descricao: 'Um gasto ou uma receita que já aconteceu.',
    tela: 'transactions', tarefa: 'transactions.despesa', acao: 'lancamento', dependsOn: ['conta'],
    feito: (d) => (d.transactions || []).some(t => !t.reservaAuto && !t.isEspelho && ['income', 'expense', 'transfer'].includes(t.type)),
  },
  fazer('agendamento', { fase: 'movimento', titulo: 'Criar o primeiro agendamento', descricao: 'Uma conta a pagar ou a receber, única, mensal ou parcelada.', tela: 'schedule', tarefa: 'schedule.conta-pagar', dependsOn: ['conta'] }),
  // Fase 4 — conhecer
  {
    id: 'j-painel', fase: 'resultados', tipo: 'conhecer', mostrar: sempre,
    titulo: 'Painel', descricao: 'O que cada card mostra: saldo disponível, o mês até agora e como ele deve terminar.',
    tela: 'dashboard', guia: 'dashboard', dependsOn: [],
  },
  {
    id: 'j-fluxo', fase: 'resultados', tipo: 'conhecer', mostrar: (c) => c.podeVer('cashflow'),
    titulo: 'Fluxo de Caixa', descricao: 'Como o saldo vai ficar com o que está agendado e como montar a sua própria visão com os filtros.',
    tela: 'cashflow', guia: 'cashflow', dependsOn: [],
  },
  {
    id: 'j-relatorios', fase: 'resultados', tipo: 'conhecer', mostrar: (c) => c.podeVer('reports'),
    titulo: 'Relatórios', descricao: 'Os relatórios disponíveis e como exportar.',
    tela: 'reports', guia: 'reports', dependsOn: [],
  },
  // Extras — opcional, fora do contador, só com o módulo ativo e permissão
  fazer('reserva', { fase: 'extras', titulo: 'Conta de reserva', descricao: 'Uma conta para guardar dinheiro com destino certo.', tela: 'accounts', tarefa: 'accounts.conta-reserva', dependsOn: ['perfil'] }),
  {
    id: 'funcao-reserva', fase: 'extras', tipo: 'fazer', mostrar: (c) => c.podeVer('reservas') && c.podeIncluir('reservas'),
    titulo: 'Função de reserva', descricao: 'Cada objetivo do dinheiro guardado na conta de reserva.',
    tela: 'reservas', tarefa: 'reservas.primeira-funcao', acao: 'funcao-reserva', dependsOn: ['reserva'],
    feito: (d) => (d.reserveFunctions || []).length > 0,
  },
  fazer('contrato', { fase: 'extras', titulo: 'Contratos', descricao: 'Contratos com cobrança que se repete geram as parcelas sozinhos.', tela: 'contratos', tarefa: 'contratos.primeiro-contrato', dependsOn: ['perfil', 'conta'] }),
  fazer('importar-fatura', { fase: 'extras', titulo: 'Importar fatura', descricao: 'Traga as compras do cartão pelo arquivo da fatura.', tela: 'import', tarefa: 'import.fatura', dependsOn: ['cartao'] }),
]

// Ids aceitos pela API para gravar estado de etapa (os da jornada; os do checklist já são aceitos).
export const ETAPAS_JORNADA = PASSOS_JORNADA.map(p => p.id)
// "Refazer jornada" zera só estes (os 'fazer' feitos pelos dados continuam feitos).
export const ETAPAS_REFAZER_JORNADA = ETAPAS_JORNADA

// ── Atalho por objetivo ("Quero ir direto para…") ───────────────────────────────────────────────
// `alvos`: o primeiro passo visível neste ambiente é o destino. Monta só os passos pendentes
// necessários, na ordem das dependências; ao concluir, a jornada volta ao normal.
export const OBJETIVOS = [
  { id: 'contrato', titulo: 'Cadastrar um contrato', alvos: ['contrato'] },
  { id: 'cartao', titulo: 'Controlar meu cartão', alvos: ['importar-fatura', 'cartao'] },
  { id: 'contas-pagar', titulo: 'Organizar contas a pagar', alvos: ['agendamento'] },
  { id: 'reservas', titulo: 'Montar reservas', alvos: ['funcao-reserva', 'reserva'] },
]
export const IDS_OBJETIVOS = OBJETIVOS.map(o => o.id)

// Passos que ainda faltam para chegar em `alvoId`, dependências primeiro (sem repetir).
function faltamPara(alvoId, porId, vistos = new Set()) {
  if (vistos.has(alvoId)) return []
  vistos.add(alvoId)
  const p = porId.get(alvoId)
  if (!p) return []
  const antes = (p.dependsOn || []).flatMap(d => faltamPara(d, porId, vistos))
  return p.feito || p.estado === 'nao-se-aplica' ? antes : [...antes, p]
}

function passosDoObjetivo(obj, passos) {
  const porId = new Map(passos.map(p => [p.id, p]))
  const alvo = obj.alvos.find(id => porId.has(id) && porId.get(id).estado !== 'nao-se-aplica')
  return alvo ? { alvo, passos: faltamPara(alvo, porId) } : null
}

// Jornada com o estado de cada passo e o progresso.
//   ctx = contexto de ajuda (podeVer, podeIncluir…); dados = { profiles, accounts, transactions,
//   schedules, cardImports, contratos, reserveFunctions, progresso }.
// Contador e parabéns só com as fases principais: Extras tem o próprio x/y e não bloqueia a conclusão.
// Pulado e "não se aplica" contam como resolvidos para concluir; o contador mostra só os feitos.
export function jornadaComStatus(ctx, dados = {}) {
  const etapas = dados.progresso?.etapas || {}
  const marcada = (id) => etapas[id]?.estado
  const passos = PASSOS_JORNADA
    .filter(p => p.mostrar(ctx))
    // Depende de um passo que "não se aplica" (ex.: importar fatura sem cartão): some também.
    .filter(p => !p.dependsOn?.some(d => marcada(d) === 'nao-se-aplica'))
    .map(p => {
      const m = marcada(p.id)
      const feito = p.tipo === 'fazer' ? !!p.feito?.(dados) : m === 'feita'
      const estado = feito ? 'feita' : m === 'nao-se-aplica' ? 'nao-se-aplica' : m === 'pulada' ? 'pulada' : 'pendente'
      return { ...p, estado, feito: estado === 'feita' }
    })
  const montarFase = (f) => {
    const ps = passos.filter(p => p.fase === f.id)
    const cont = ps.filter(p => p.estado !== 'nao-se-aplica')
    return { ...f, passos: ps, feitas: cont.filter(p => p.feito).length, total: cont.length, completa: cont.every(p => p.feito) }
  }
  const fases = FASES_JORNADA.filter(f => !f.opcional).map(montarFase).filter(f => f.passos.length > 0)
  const extrasFase = FASES_JORNADA.filter(f => f.opcional).map(montarFase).find(f => f.passos.length > 0) || null
  const principais = fases.flatMap(f => f.passos)
  const contaveis = principais.filter(p => p.estado !== 'nao-se-aplica')
  const pendentes = principais.filter(p => p.estado === 'pendente')

  // Objetivo escolhido (progresso.objetivo): os próximos passos saem dele até concluir.
  const objetivosDisponiveis = OBJETIVOS
    .map(o => ({ ...o, ...passosDoObjetivo(o, passos) }))
    .filter(o => o.alvo && o.passos.length > 0)
  const escolhido = OBJETIVOS.find(o => o.id === dados.progresso?.objetivo) || null
  const doEscolhido = escolhido ? passosDoObjetivo(escolhido, passos) : null
  const objetivo = doEscolhido?.passos.length ? { ...escolhido, ...doEscolhido } : null

  return {
    fases,
    extras: extrasFase,
    passos,
    pendentes,
    puladas: passos.filter(p => p.estado === 'pulada' || p.estado === 'nao-se-aplica'),
    feitas: contaveis.filter(p => p.feito).length,
    total: contaveis.length,
    pulados: contaveis.filter(p => p.estado === 'pulada').length,
    proximo: objetivo ? objetivo.passos[0] : (pendentes[0] || null),
    completo: principais.length > 0 && pendentes.length === 0,
    objetivo,
    objetivoConcluido: escolhido && !objetivo ? escolhido.id : null,
    objetivosDisponiveis,
  }
}

// Próximo passo depois de `id` (objetivo primeiro; a barra usa para o botão "Próximo").
export function proximoDepois(st, id) {
  return st.objetivo?.passos.find(p => p.id !== id) || st.pendentes.find(p => p.id !== id) || null
}

// A tela já foi vista pela jornada ("Entendi")? O tour dela não abre mais sozinho, sem gravar nada
// nas preferências dos guias.
export function telaConcluidaNaJornada(tela, progresso) {
  const etapas = progresso?.etapas || {}
  return PASSOS_JORNADA.some(p => p.guia === tela && etapas[p.id]?.estado === 'feita')
}
