import { useEffect, useRef, useState } from 'react'
import { statusSugestoesImportacao } from '../lib/sugestoesImportacaoApi'
import { RECURSO_IA_IMPORTACAO } from '../lib/recursosCliente'

// Status das sugestões do Assistente (recurso contratado + opção do cliente) para a tela que monta:
// Configurações e Importar Fatura. Pede ao MONTAR (voltar para a tela = montar de novo) — nunca a cada
// render. Se o pedido FALHA (sessão ainda não pronta logo depois de "Atualizar agora", sem conexão,
// erro do servidor), tenta de novo com espera crescente e quando a conexão volta, em vez de ficar como
// "não liberado". → { liberado, ligado, pronto }
export const ESPERAS_STATUS_MS = [500, 1500, 3000, 6000, 10000]

export function useStatusSugestoesIa(carregar = statusSugestoesImportacao, esperas = ESPERAS_STATUS_MS) {
  const [st, setSt] = useState({ liberado: false, ligado: false, pronto: false })
  const ref = useRef({ carregar, esperas })
  useEffect(() => { ref.current = { carregar, esperas } })
  useEffect(() => {
    let vivo = true
    let timer = null
    let n = 0
    const tentar = async () => {
      clearTimeout(timer)
      const r = await ref.current.carregar()
      if (!vivo) return
      if (r?.falhou) {
        const espera = ref.current.esperas[n++]
        if (espera != null) timer = setTimeout(tentar, espera)
        return
      }
      setSt({ liberado: r?.liberado === true, ligado: r?.ligado === true, pronto: true })
    }
    tentar()
    const aoVoltarConexao = () => { n = 0; tentar() }
    window.addEventListener('online', aoVoltarConexao)
    return () => { vivo = false; clearTimeout(timer); window.removeEventListener('online', aoVoltarConexao) }
  }, [])
  return st
}

// Recursos contratados liberados para este ambiente ({ [recurso]: true }) — filtro das novidades de
// recurso (src/lib/novidades.js). Mesmo status (e mesma nova tentativa) da seção Configurações › Assistente.
export function useRecursosLiberados(carregar = statusSugestoesImportacao) {
  const st = useStatusSugestoesIa(carregar)
  return { recursos: { [RECURSO_IA_IMPORTACAO]: st.liberado }, pronto: st.pronto }
}
