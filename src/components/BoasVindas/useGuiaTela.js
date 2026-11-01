// GUIA DA TELA — decide quando o guia de uma tela abre sozinho e qual guia está na frente.
//   • abre ao entrar na tela, se ela tem guia e o usuário não marcou "Não mostrar mais" (banco);
//   • nunca por cima do tour de boas-vindas: espera ele fechar;
//   • só depois de carregar o estado do banco (falhou → não abre sozinho; o "?" continua abrindo);
//   • "Esconder" vale só até recarregar a página (memória, nada no navegador);
//   • um guia na frente por vez: o do Assistente (aberto por cima da tela) passa à frente.
import { useCallback, useEffect, useId, useState, useSyncExternalStore } from 'react'
import { ajudaDaTela } from '../../lib/ajudaTelas'
import { assinarBoasVindas, carregarBoasVindas, estadoBoasVindas, ocultarGuia } from '../../lib/boasVindasApi'
import { useApp } from '../../context/AppContext'

// "Esconder": telas escondidas nesta carga da página (some ao recarregar).
const escondidas = new Set()
// "Reativar todos os guias": esquece também os "Esconder" desta carga.
export function limparEscondidos() { escondidas.clear() }
export function _reiniciarGuias() { escondidas.clear(); pilha.length = 0; avisar() }

// Guias abertos agora (ids de instância); o último é o que aparece.
const pilha = []
const ouvintes = new Set()
const avisar = () => { for (const f of ouvintes) f() }
const assinar = (f) => { ouvintes.add(f); return () => ouvintes.delete(f) }
const topo = () => pilha[pilha.length - 1] || null
function empilhar(id) { if (!pilha.includes(id)) { pilha.push(id); avisar() } }
function desempilhar(id) { const i = pilha.indexOf(id); if (i >= 0) { pilha.splice(i, 1); avisar() } }

export function useEstadoBoasVindas() {
  const [e, setE] = useState(estadoBoasVindas)
  useEffect(() => assinarBoasVindas(setE), [])
  return e
}

export function useGuiaTela(tela) {
  const id = useId()
  const { dbStatus } = useApp()
  const estado = useEstadoBoasVindas()
  // Escolha manual nesta tela ("?" / Esconder / Não mostrar mais); sem ela, vale a abertura automática.
  const [pedido, setPedido] = useState(null) // { tela, aberto }
  const naFrente = useSyncExternalStore(assinar, topo, () => null) === id
  const temGuia = !!ajudaDaTela(tela)

  useEffect(() => { if (dbStatus === 'connected') carregarBoasVindas() }, [dbStatus])

  // Abertura automática ao entrar na tela: estado do banco carregado, tour já visto e fechado, tela
  // sem "Não mostrar mais" e não escondida nesta carga da página.
  const pronto = !!estado && !!estado.tourVistoEm && !estado.tourAberto
  const oculto = !!estado?.guiasOcultos?.includes(tela)
  const automatico = temGuia && pronto && !oculto && !escondidas.has(tela)
  const aberto = pedido?.tela === tela ? pedido.aberto : automatico
  // Tour aberto por cima: o guia sai da frente até ele fechar.
  const visivel = aberto && temGuia && !estado?.tourAberto
  useEffect(() => {
    if (visivel) empilhar(id)
    else desempilhar(id)
    return () => desempilhar(id)
  }, [visivel, id])

  const abrir = useCallback(() => { escondidas.delete(tela); setPedido({ tela, aberto: true }) }, [tela])
  const esconder = useCallback(() => { escondidas.add(tela); setPedido({ tela, aberto: false }) }, [tela])
  const naoMostrarMais = useCallback(() => { escondidas.add(tela); setPedido({ tela, aberto: false }); ocultarGuia(tela) }, [tela])

  return { aberto: visivel && naFrente, abrir, esconder, naoMostrarMais, oculto, temGuia }
}
