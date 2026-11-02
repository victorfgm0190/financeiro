// Regras puras da Central de Ajuda (sem React): que telas entram, como chegar a cada uma, que tarefa
// fica em que seção e a busca. Usadas por CentralAjuda.jsx e pelos testes.
import { AJUDA_TELAS, guiaDaTela } from '../../lib/ajudaTelas'
import { tarefasDaTela } from '../../lib/tarefasGuiadas'
import { CONFIG_ABAS, configHash } from '../../lib/configRota'
import { MODULO_DA_ABA_CONFIG } from '../../lib/permissoes'
import { mobileModules } from '../../mobile/modules'
import { secoesConfigSoDesktop } from '../../mobile/navegacao'

const SO_CELULAR = new Set(['inicio', 'mais', 'despesas'])
const PLATAFORMA = new Set(['clientes']) // tela do administrador da plataforma: fora da ajuda dos clientes
export const ESPERA_TOUR_MS = 900

// Páginas que existem no celular (módulo com `page` fora de 'desktop') e seções de Configurações só
// do computador — as mesmas regras do MobileShell e do SettingsPanel.
const PAGINAS_CELULAR = new Set(mobileModules.filter(m => m.page && m.place !== 'desktop').map(m => m.page))
const SECOES_SO_COMPUTADOR = secoesConfigSoDesktop(mobileModules)
const SO_COMPUTADOR = new Set(['transactions:fatura', 'import:conciliacao'])

// Tela (ou subtela) aparece na ajuda deste ambiente/usuário (e aparelho)? Mesmas regras do menu
// (podeVer), das abas de Configurações (módulo da aba ou seção `todos`) e do controle gerencial.
export function telaNaAjuda(id, ctx, { celular = false } = {}) {
  const [base, sub] = id.split(':')
  if (PLATAFORMA.has(base)) return false
  if (base === 'assistente') return !!ctx.iaAtiva
  if (SO_CELULAR.has(base)) return celular
  if (base === 'settings') {
    if (!sub) return true
    const aba = CONFIG_ABAS.find(a => a.secoes.some(s => s.id === sub))
    const secao = aba?.secoes.find(s => s.id === sub)
    if (!aba || sub === 'importacao') return false // importação histórica: só no ambiente principal
    if (celular && SECOES_SO_COMPUTADOR.has(sub)) return false
    if (sub === 'grupo-gerencial' && !ctx.gerencialAtivo) return false
    return !!(secao.todos || ctx.pode(MODULO_DA_ABA_CONFIG[aba.id] || 'configuracoes', 'ver'))
  }
  if (celular && (!PAGINAS_CELULAR.has(base) || SO_COMPUTADOR.has(id))) return false
  return !!ctx.podeVer(base)
}

// Como chegar à tela para o "Mostrar na tela": página do menu ou seção de Configurações. Subtelas
// que só abrem por dentro (extrato, relatórios, abas de Reservas…) não têm atalho direto.
export function rotaDaTela(id) {
  if (id.startsWith('settings:')) {
    const secao = id.slice('settings:'.length)
    const aba = CONFIG_ABAS.find(a => a.secoes.some(s => s.id === secao))
    return aba ? { pagina: 'settings', hash: configHash(aba.id, secao) } : null
  }
  if (id.includes(':') || SO_CELULAR.has(id) || id === 'assistente') return null
  return { pagina: id }
}

// Tarefa entra só na seção onde começa (a da página não se repete nas subtelas; as de Configurações
// ficam na seção do hash delas).
export function tarefaDaSecao(t, id) {
  const sec = id.split(':')[1]
  const extra = (t.telasExtras || []).includes(id)
  if (!sec) return extra || (t.tela === id && !t.hash)
  return extra || t.tela === id || (!!t.hash && t.hash.split('/').pop() === sec)
}

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Índice da busca: telas, funções (com explicação e exemplo), tarefas e perguntas.
export function montarIndice(telas, ctx, perguntas, opcoes) {
  const out = []
  for (const id of telas) {
    const g = guiaDaTela(id, ctx)
    out.push({ tipo: 'tela', tela: id, titulo: g.titulo, texto: g.descricao, busca: normalizar([g.titulo, g.descricao, ...(g.dicas || []), ...(g.errosComuns || [])].join(' ')) })
    for (const it of g.itens) {
      out.push({ tipo: 'funcao', tela: id, chave: it.chave, titulo: `${it.rotulo} — ${g.titulo}`, texto: it.detalhe || it.texto, busca: normalizar([it.rotulo, it.texto, it.detalhe, it.exemplo].join(' ')) })
    }
  }
  const vistas = new Set()
  for (const id of telas) {
    for (const t of tarefasDaTela(id, ctx, opcoes)) {
      if (vistas.has(t.id)) continue
      vistas.add(t.id)
      out.push({ tipo: 'tarefa', tarefaId: t.id, titulo: `Faça comigo: ${t.titulo}`, texto: t.descricao, busca: normalizar([t.titulo, t.descricao, ...t.passos.map(p => p.texto)].join(' ')) })
    }
  }
  for (const p of perguntas) out.push({ tipo: 'pergunta', id: p.id, tela: p.tela, chave: p.chave, titulo: p.pergunta, texto: p.resposta, busca: normalizar(`${p.pergunta} ${p.resposta}`) })
  return out
}
export function buscar(indice, termo, limite = 30) {
  const palavras = normalizar(termo).split(/\s+/).filter(w => w.length >= 2)
  if (!palavras.length) return []
  // Raiz simples: "parcela", "parcelas", "parcelado", "parcelada" se encontram.
  const raiz = (w) => (w.length > 5 ? w.slice(0, -2) : w)
  const raizes = palavras.map(raiz)
  // Ordem: o que tem a palavra no título primeiro; depois perguntas, tarefas, telas e funções.
  const nota = (e) => (raizes.every(w => normalizar(e.titulo).includes(w)) ? 0 : 10) + PESO_TIPO[e.tipo]
  return indice
    .filter(e => raizes.every(w => e.busca.includes(w)))
    .map((e, k) => ({ e, k, n: nota(e) }))
    .sort((x, y) => x.n - y.n || x.k - y.k)
    .slice(0, limite)
    .map(x => x.e)
}
const PESO_TIPO = { pergunta: 0, tarefa: 1, tela: 2, funcao: 3 }

export const telasDaAjuda = (ctx, opcoes) => Object.keys(AJUDA_TELAS).filter(id => telaNaAjuda(id, ctx, opcoes))
