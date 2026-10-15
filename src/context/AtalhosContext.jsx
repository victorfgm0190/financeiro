import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AtalhosContext } from './atalhosHooks'
import { useIsMobile } from '../hooks/useIsMobile'
import { acaoPorId, mapaEfetivo, nivelContexto } from '../lib/atalhos/registry'
import { combinacaoDoEvento, FIXA_GRAVAR_MODAL, temModificador } from '../lib/atalhos/combinacao'
import { listarAtalhos, gravarAtalhos, restaurarAtalho, restaurarTodosAtalhos } from '../lib/atalhos/api'

// MOTOR DE ATALHOS: um único keydown no window. Telas e modais registram os handlers das suas ações
// com useAtalho(acaoId, handler) ao montar (e saem ao desmontar). O handler é o MESMO do botão;
// devolver `false` = "não consumi" (ex.: botão oculto), e o motor tenta o próximo candidato.
//
// Os hooks (useAtalho, useCamadaModal, useTituloAtalho) ficam em ./atalhosHooks.
//
// Prioridade: com um modal aberto só vale o modal do TOPO (ações registradas dentro dele); sem
// modal, tela > global. Cada <Modal> é uma "camada" (useCamadaModal); o topo é a camada que vem
// por último na ordem do documento (modal aninhado é descendente; portado vai para o fim do body).

function ehCampoDeTexto(el) {
  if (!el || el === document.body) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag !== 'INPUT') return false
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes((el.type || '').toLowerCase())
}

export function AtalhosProvider({ children }) {
  const ativo = !useIsMobile()
  const [gravados, setGravados] = useState({})
  const [carregado, setCarregado] = useState(false)
  const [ajuda, setAjuda] = useState(null)
  const mapa = useMemo(() => mapaEfetivo(gravados), [gravados])
  const mapaRef = useRef(mapa)
  useEffect(() => { mapaRef.current = mapa }, [mapa])

  const handlers = useRef(new Map())
  const camadas = useRef(new Map())
  const seq = useRef(0)
  const capturando = useRef(false)

  // Carregado uma vez por sessão (o login recarrega a página) e mantido em memória.
  useEffect(() => {
    let vivo = true
    listarAtalhos()
      .then(rows => { if (vivo) setGravados(Object.fromEntries(rows.map(r => [r.acaoId, r.combinacao ?? null]))) })
      .catch(err => console.warn('[atalhos] falha ao carregar:', err.message))
      .finally(() => { if (vivo) setCarregado(true) })
    return () => { vivo = false }
  }, [])

  const registrar = useCallback((reg) => {
    const token = ++seq.current
    handlers.current.set(token, { ...reg, seq: token })
    return () => handlers.current.delete(token)
  }, [])

  const registrarCamada = useCallback((id, ref) => {
    camadas.current.set(id, ref)
    return () => camadas.current.delete(id)
  }, [])

  const setCapturando = useCallback((v) => { capturando.current = !!v }, [])

  const camadaTopo = useCallback(() => {
    let topo = null
    for (const [id, ref] of camadas.current) {
      const el = ref.current
      if (!el?.isConnected) continue
      if (!topo || (topo.el.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) topo = { id, el }
    }
    return topo
  }, [])

  // Handlers elegíveis agora, na ordem de prioridade (opcionalmente só os de uma combinação).
  const elegiveis = useCallback((combinacao = null) => {
    const topo = camadaTopo()
    const lista = []
    for (const h of handlers.current.values()) {
      const acao = acaoPorId(h.acaoId)
      if (!acao || (topo ? h.camada !== topo.id : h.camada != null)) continue
      if (combinacao && mapaRef.current[h.acaoId] !== combinacao) continue
      lista.push({ ...h, acao })
    }
    lista.sort((a, b) => nivelContexto(a.acao.contexto) - nivelContexto(b.acao.contexto) || b.seq - a.seq)
    return { topo, lista }
  }, [camadaTopo])

  const abrirAjuda = useCallback(() => {
    const { topo, lista } = elegiveis()
    const vistos = new Set()
    const acoes = []
    for (const h of lista) if (!vistos.has(h.acaoId)) { vistos.add(h.acaoId); acoes.push(h.acao) }
    setAjuda({ acoes, emModal: !!topo })
  }, [elegiveis])

  useEffect(() => {
    if (!ativo) return
    const onKeyDown = (e) => {
      if (capturando.current || e.defaultPrevented || e.isComposing) return
      if (e.metaKey || e.getModifierState?.('AltGraph')) return
      const consumir = () => { e.preventDefault(); e.stopPropagation() }
      const emCampo = ehCampoDeTexto(e.target)

      if (e.key === '?' && !e.ctrlKey && !e.altKey) {
        if (emCampo || e.repeat) return
        consumir()
        abrirAjuda()
        return
      }

      const combinacao = combinacaoDoEvento(e)
      if (!combinacao) return
      // Em campo de texto só passam combinações com Alt/Ctrl — nunca uma tecla "solta".
      if (emCampo && !temModificador(combinacao)) return

      if (combinacao === FIXA_GRAVAR_MODAL) {
        const { topo, lista } = elegiveis()
        if (!topo) return
        if (e.repeat) return consumir()
        for (const h of lista) {
          if (h.acao.salvaModal && h.fnRef.current?.(e) !== false) return consumir()
        }
        const form = topo.el.querySelector('form')
        if (form) { consumir(); form.requestSubmit() }
        return
      }

      const { lista } = elegiveis(combinacao)
      if (!lista.length) return
      if (e.repeat) return consumir()
      for (const h of lista) {
        if (h.fnRef.current?.(e) !== false) return consumir()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [ativo, elegiveis, abrirAjuda])

  // Persistência: otimista no estado; erro da API desfaz e repassa a exceção para a tela.
  const gravadosRef = useRef(gravados)
  useEffect(() => { gravadosRef.current = gravados }, [gravados])
  const aplicar = useCallback(async (mudar, chamada) => {
    const anterior = gravadosRef.current
    gravadosRef.current = mudar(anterior)
    setGravados(gravadosRef.current)
    try {
      await chamada()
    } catch (err) {
      gravadosRef.current = anterior
      setGravados(anterior)
      throw err
    }
  }, [])

  const gravar = useCallback((itens) => aplicar(
    g => ({ ...g, ...Object.fromEntries(itens.map(i => [i.acaoId, i.combinacao ?? null])) }),
    () => gravarAtalhos(itens),
  ), [aplicar])

  const restaurar = useCallback((acaoId) => aplicar(
    g => { const n = { ...g }; delete n[acaoId]; return n },
    () => restaurarAtalho(acaoId),
  ), [aplicar])

  const restaurarTodos = useCallback(() => aplicar(() => ({}), restaurarTodosAtalhos), [aplicar])

  const value = useMemo(() => ({
    ativo, carregado, mapa, gravados, registrar, registrarCamada, setCapturando,
    gravar, restaurar, restaurarTodos, ajuda, fecharAjuda: () => setAjuda(null),
  }), [ativo, carregado, mapa, gravados, registrar, registrarCamada, setCapturando, gravar, restaurar, restaurarTodos, ajuda])

  return <AtalhosContext.Provider value={value}>{children}</AtalhosContext.Provider>
}
