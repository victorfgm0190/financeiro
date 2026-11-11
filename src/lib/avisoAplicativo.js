// AVISO "USE O FINUP COMO APLICATIVO" (computador) — quando aparece. Guardado POR APARELHO no
// localStorage (não é preferência da pessoa: o mesmo usuário pode ter o app instalado num computador e
// não no outro). Regras:
//   • só no computador e só fora do aplicativo instalado;
//   • no máximo 1 vez a cada DIAS_ENTRE_AVISOS dias (conta a partir de quando apareceu);
//   • "Não mostrar mais" desliga de vez (Configurações → Geral → Usar como aplicativo reativa);
//   • instalado (evento appinstalled, ou o app aberto na janela própria) → não volta mais;
//   • nunca por cima de outro guia/aviso (quem chama informa `bloqueado`).
// Puro (o armazenamento entra como parâmetro). Nada específico de cliente.

export const CHAVE_AVISO_APP = 'finup_aviso_aplicativo'
export const DIAS_ENTRE_AVISOS = 7
const DIA_MS = 24 * 60 * 60 * 1000

const lsPadrao = () => { try { return globalThis.localStorage } catch { return null } }

export function lerAvisoApp(ls = lsPadrao()) {
  try {
    const v = JSON.parse(ls?.getItem(CHAVE_AVISO_APP) || 'null')
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}

function gravar(parcial, ls) {
  const novo = { ...lerAvisoApp(ls), ...parcial }
  try { ls?.setItem(CHAVE_AVISO_APP, JSON.stringify(novo)) } catch { /* sem localStorage: vale só agora */ }
  ouvintes.forEach(f => f())
  return novo
}

// Quem mostra o aviso escuta as mudanças (o botão da tela Configurações reativa na hora).
const ouvintes = new Set()
export function aoMudarAvisoApp(f) { ouvintes.add(f); return () => ouvintes.delete(f) }

export const registrarAvisoMostrado = (agora = new Date(), ls = lsPadrao()) => gravar({ mostradoEm: agora.toISOString() }, ls)
export const naoMostrarMaisAvisoApp = (ls = lsPadrao()) => gravar({ nunca: true }, ls)
export const marcarAppInstalado = (agora = new Date(), ls = lsPadrao()) => gravar({ instaladoEm: agora.toISOString() }, ls)
// Configurações: volta a mostrar (desfaz "Não mostrar mais" e a espera de 7 dias).
export const reativarAvisoApp = (ls = lsPadrao()) => gravar({ nunca: false, mostradoEm: null }, ls)

// Pode mostrar agora? `situacao` = situacaoDoNavegador (ambienteNavegador.js).
export function deveMostrarAvisoApp({ prefs = {}, situacao, computador, bloqueado = false, agora = new Date() }) {
  if (!computador || bloqueado || !situacao) return false
  if (situacao.instalado || prefs.instaladoEm || prefs.nunca) return false
  if (prefs.mostradoEm) {
    const desde = agora.getTime() - new Date(prefs.mostradoEm).getTime()
    if (Number.isFinite(desde) && desde < DIAS_ENTRE_AVISOS * DIA_MS) return false
  }
  return true
}

// ── Textos (aviso e Configurações) ──
export const BENEFICIO_APP = 'Abre na própria janela, com ícone na barra de tarefas (ou no Dock, no Mac), e abre mais rápido.'

export const textoResultadoInstalacao = (r) => (r === 'accepted' ? 'Pronto! O Finup foi instalado. Da próxima vez, abra pelo ícone dele.'
  : r === 'dismissed' ? 'Instalação cancelada. Você pode instalar depois por aqui ou pelo menu do navegador.' : '')

// Estado deste computador em Configurações. `situacao` = situacaoDoNavegador (ambienteNavegador.js).
export function rotuloSituacaoApp(situacao) {
  if (situacao.instalado) return 'Instalado: o Finup está aberto como aplicativo.'
  if (situacao.modo === 'sem-instalacao') return 'Este navegador não instala o Finup como aplicativo.'
  if (situacao.modo === 'safari-mac') return 'Não instalado. No Safari, o Finup pode ir para o Dock.'
  return 'Não instalado: o Finup está aberto numa aba do navegador.'
}
