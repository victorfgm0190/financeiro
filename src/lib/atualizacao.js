// ATUALIZAÇÃO AVISADA — versão nova do Finup (service worker novo em espera) vira um aviso; nunca
// atualiza sozinho no meio do uso.
//
// ANTES (até 11/11/2026): registerType 'autoUpdate' + skipWaiting/clientsClaim no service worker: o
// SW novo assumia na hora e a página recarregava sozinha assim que ele tomava o controle (podia ser
// no meio de um formulário). Procurava versão nova só de hora em hora.
// AGORA: registerType 'prompt' (vite.config.js). O SW novo fica em espera; a página procura versão
// nova ao abrir, ao voltar para a aba/app e a cada 30 min (registration.update()). Com um SW em
// espera, busca /versao.json (novidades da versão nova, publicadas pelo build) e avisa. "Atualizar
// agora" (src/components/Layout/AvisoAtualizacao.jsx) envia as alterações pendentes e só então
// manda SKIP_WAITING; a página recarrega quando o SW novo assume.
// Outra janela do Finup atualizou: esta não recarrega no meio do uso — o aviso pede para recarregar.
import { NOVIDADES } from '../novidades.js'
import { novidadesDaVersaoNova, obrigatoriaEntre } from './novidades.js'

export const INTERVALO_PROCURA_MS = 30 * 60 * 1000
export const ADIAR_MS = 4 * 60 * 60 * 1000
const MINIMO_ENTRE_PROCURAS_MS = 60 * 1000

const inicial = () => ({ pronta: false, novas: [], obrigatoria: false, motivo: null, simulada: false, outraJanela: false, adiadaAte: 0 })
let estado = inicial()
const ouvintes = new Set()
const avisar = () => { for (const f of ouvintes) f() }
const mudar = (parcial) => { estado = { ...estado, ...parcial }; avisar() }

export const estadoAtualizacao = () => estado
export function assinarAtualizacao(f) { ouvintes.add(f); return () => ouvintes.delete(f) }

// Há aviso para mostrar agora? (pronta e não adiada; obrigatória e "outra janela" não se adiam)
export function atualizacaoParaAvisar(e = estado, agora = Date.now()) {
  if (!e.pronta) return false
  return e.obrigatoria || e.outraJanela || agora >= e.adiadaAte
}

// Versão nova em espera: busca o que vem nela. Sem /versao.json (rede, deploy antigo) avisa assim
// mesmo, sem as linhas.
export async function marcarVersaoPronta({ buscar = globalThis.fetch, locais = NOVIDADES } = {}) {
  let novas = []
  try {
    const r = await buscar(`/versao.json?nc=${Date.now()}`, { cache: 'no-store' })
    if (r?.ok) novas = novidadesDaVersaoNova(locais, (await r.json())?.novidades || [])
  } catch { /* sem a lista: aviso sem as linhas */ }
  mudar({ pronta: true, novas, ...obrigatoriaEntre(novas) })
  return estado
}

// "Mais tarde": volta depois de 4 h — ou na próxima abertura (o estado vive só nesta página).
export function adiarAtualizacao(agora = Date.now()) {
  if (estado.obrigatoria || estado.outraJanela) return
  mudar({ adiadaAte: agora + ADIAR_MS })
}

// Textos do aviso quando o envio das alterações não deu (a atualização espera; nada se perde).
export const textoSemRede = 'Sem internet: suas alterações ainda não foram enviadas, então a atualização ficou para depois. Nada foi perdido. Conecte-se e clique de novo em "Atualizar agora".'
export const textoErroEnvio = (erro) => `Não deu para enviar suas alterações${erro ? ` (${erro})` : ''}, então a atualização ficou para depois. Nada foi perdido. Tente de novo em instantes.`

// ── Service worker ──
let atualizarSW = null
let registro = null
let ultimaProcura = 0
let iniciouAqui = false

export function procurarAtualizacao({ agora = Date.now(), forcar = false } = {}) {
  if (!registro || (!forcar && agora - ultimaProcura < MINIMO_ENTRE_PROCURAS_MS)) return false
  ultimaProcura = agora
  try { Promise.resolve(registro.update()).catch(() => {}) } catch { /* offline / sem SW */ }
  return true
}

// Chamado pelo src/main.jsx com o registerSW de 'virtual:pwa-register'.
export function iniciarServiceWorker(registerSW, win = window) {
  atualizarSW = registerSW({
    immediate: true,
    onNeedRefresh: () => { marcarVersaoPronta() },
    // O SW novo assumiu. Pedido aqui: recarrega. Outra janela pediu: não recarrega no meio do uso.
    onNeedReload: () => {
      if (iniciouAqui) win.location.reload()
      else mudar({ pronta: true, outraJanela: true, obrigatoria: true, motivo: 'O Finup foi atualizado em outra janela. Recarregue esta para continuar com a versão nova.' })
    },
    onRegisteredSW: (_url, reg) => {
      if (!reg) return
      registro = reg
      procurarAtualizacao({ forcar: true })
      setInterval(() => procurarAtualizacao({ forcar: true }), INTERVALO_PROCURA_MS)
      const aoVoltar = () => { if (win.document.visibilityState !== 'hidden') procurarAtualizacao() }
      win.addEventListener('focus', aoVoltar)
      win.document.addEventListener('visibilitychange', aoVoltar)
    },
  })
}

// Último passo do "Atualizar agora" (as pendências já foram enviadas): SKIP_WAITING e recarrega.
export async function aplicarAtualizacao(win = window) {
  // Simulação: abre de novo sem o ?simular-atualizacao (senão o aviso voltaria).
  if (estado.simulada) { win.location.replace(win.location.pathname + win.location.hash); return }
  if (estado.outraJanela || !atualizarSW) { win.location.reload(); return }
  iniciouAqui = true
  await atualizarSW(true)
  // Rede de segurança: se o SW novo não assumir (ex.: já assumiu em outra janela), recarrega assim mesmo.
  setTimeout(() => win.location.reload(), 4000)
}

// Teste no teste1: ?simular-atualizacao (ou =obrigatoria) mostra o aviso com as novidades desta versão.
export function simularSePedido(win = window, locais = NOVIDADES) {
  let p
  try { p = new URLSearchParams(win.location.search).get('simular-atualizacao') } catch { return false }
  if (p === null) return false
  const novas = locais.slice(0, 1)
  const obrig = p === 'obrigatoria'
    ? { obrigatoria: true, motivo: 'Simulação: nesta versão o banco mudou e a versão aberta não consegue mais gravar.' }
    : { obrigatoria: false, motivo: null }
  mudar({ pronta: true, simulada: true, novas, ...obrig })
  return true
}

export function _reiniciarAtualizacao() { estado = inicial(); atualizarSW = null; registro = null; ultimaProcura = 0; iniciouAqui = false; avisar() }
