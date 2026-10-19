import { useCallback, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { gerarFeed } from '../lib/agendaFeed'
import { obterAgendaFeed, publicarAgendaFeed, EVENTO_AGENDA_FEED, EVENTO_AGENDA_PUBLICAR_JA } from '../lib/agendaFeedApi'
import { enderecoDoAmbiente } from '../lib/ambienteHost'

// AGENDA NO CELULAR — gera o .ics do feed do usuário logado NO NAVEGADOR (dados já carregados) e
// envia ao central só o que mudou (hash sem DTSTAMP) ou o que não foi gerado hoje (a janela anda):
//   • ao abrir o app (depois do /api/load);
//   • 15 s depois da última mudança em agendamentos, faturas, contas, categorias ou favorecidos;
//   • quando a tela cria o feed ou muda as opções (evento EVENTO_AGENDA_FEED);
//   • na hora em que "Sincronizar com a agenda do celular" muda (EVENTO_AGENDA_PUBLICAR_JA).
// Mudança feita por OUTRO usuário só entra quando o dono abrir o app (a tela avisa).
const ESPERA_ABRIR_MS = 5000
const ESPERA_MUDANCA_MS = 15000
const pad = (n) => String(n).padStart(2, '0')
const diaLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function useAgendaFeed() {
  const { schedules, payables, accounts, categories, payees, getNextOccurrences, pode, usuario, dbStatus } = useApp()
  const ativo = usuario?.origem === 'db' && !!usuario?.id
  const feedRef = useRef(undefined) // undefined = ainda não consultado; null = sem feed
  const dadosRef = useRef(null)
  const timerRef = useRef(null)
  const ocupadoRef = useRef(false)
  const deNovoRef = useRef(false) // pedido chegou durante um envio: roda de novo ao terminar
  useEffect(() => {
    dadosRef.current = { schedules, payables, accounts, categories, getNextOccurrences, podeVer: pode('agendamentos', 'ver') }
  })

  const publicar = useCallback(async () => {
    const feed = feedRef.current
    if (!feed?.id) return
    if (ocupadoRef.current) { deNovoRef.current = true; return }
    ocupadoRef.current = true
    try {
      const agora = new Date()
      const hoje = diaLocal(agora)
      const gerado = gerarFeed({
        ...dadosRef.current, hoje, agora,
        tipos: feed.tipos, mostrarValores: feed.mostrarValores,
        linkFinup: `${enderecoDoAmbiente(usuario.ambSigla)}/`,
      })
      const conteudos = {}
      for (const [tipo, g] of Object.entries(gerado)) {
        const atual = feed.cache?.[tipo]
        const deHoje = atual?.geradoEm && diaLocal(new Date(atual.geradoEm)) === hoje
        if (!atual || atual.hash !== g.hash || !deHoje) conteudos[tipo] = g.conteudo
      }
      if (Object.keys(conteudos).length === 0) return
      const r = await publicarAgendaFeed(conteudos)
      feed.cache = { ...(feed.cache || {}), ...(r.gravados || {}) }
    } catch (err) {
      console.warn('[agenda no celular] não publicou:', err.message)
    } finally {
      ocupadoRef.current = false
      if (deNovoRef.current) { deNovoRef.current = false; setTimeout(() => publicarRef.current?.(), 0) }
    }
  }, [usuario])
  const publicarRef = useRef(null)
  useEffect(() => { publicarRef.current = publicar }, [publicar])

  const agendar = useCallback((ms) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(publicar, ms)
  }, [publicar])

  // Ao abrir: consulta o feed (só no central) e publica se preciso.
  useEffect(() => {
    if (!ativo || dbStatus !== 'connected' || feedRef.current !== undefined) return
    feedRef.current = null
    obterAgendaFeed()
      .then(r => { feedRef.current = r.configurado ? r.feed : null; if (feedRef.current) agendar(ESPERA_ABRIR_MS) })
      .catch(err => console.warn('[agenda no celular] sem status:', err.message))
  }, [ativo, dbStatus, agendar])

  // Mudanças nos dados do feed: espera juntar.
  useEffect(() => {
    if (feedRef.current) agendar(ESPERA_MUDANCA_MS)
  }, [schedules, payables, accounts, categories, payees, agendar])

  // A tela criou o feed / mudou as opções.
  useEffect(() => {
    const ouvir = (e) => { feedRef.current = e.detail || null; if (feedRef.current) agendar(0) }
    // 300 ms: o estado novo (agendamento marcado/desmarcado) já está no dadosRef.
    const ja = () => { if (feedRef.current) agendar(300) }
    window.addEventListener(EVENTO_AGENDA_FEED, ouvir)
    window.addEventListener(EVENTO_AGENDA_PUBLICAR_JA, ja)
    return () => {
      window.removeEventListener(EVENTO_AGENDA_FEED, ouvir)
      window.removeEventListener(EVENTO_AGENDA_PUBLICAR_JA, ja)
      clearTimeout(timerRef.current)
    }
  }, [agendar])
}
