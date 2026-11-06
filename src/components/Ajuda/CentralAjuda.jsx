// CENTRAL DE AJUDA (página "Ajuda" do menu) — todas as funções do sistema explicadas, com exemplo:
//   • busca "O que você quer fazer?" em títulos, textos, exemplos, tarefas e perguntas frequentes;
//   • "Comece por aqui": o resumo geral (o mesmo das boas-vindas) e o checklist Primeiros passos;
//   • uma seção por tela/módulo ativo e com permissão (mostrar(ctx)): para que serve, cada função com
//     explicação e exemplo, "Mostrar na tela" (navega e abre o tour já no item) e "Faça comigo",
//     dicas e erros comuns;
//   • perguntas frequentes com link para a seção.
// Desktop: índice lateral + conteúdo; celular: acordeão. Âncoras #ajuda/<tela>/<item>.
// Fica no menu mesmo com os guias desligados. Textos: src/lib/ajudaTelas.js, tarefasGuiadas.js,
// perguntasFrequentes.js — nada daqui é específico de um cliente.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, ChevronDown, ChevronRight, Play, Hand, Lightbulb, AlertTriangle, HelpCircle, LifeBuoy } from 'lucide-react'
import { AJUDA_TELAS, guiaDaTela, passosVisiveis } from '../../lib/ajudaTelas'
import { tarefasDaTela } from '../../lib/tarefasGuiadas'
import { perguntasVisiveis } from '../../lib/perguntasFrequentes'
import { parseAjudaHash, ajudaHash, idAncora } from '../../lib/ajudaRota'
import { EVENTO_NAVEGAR, navegarPara } from '../../lib/abrirTela'
import { useContextoAjuda } from '../BoasVindas/contextoAjuda'
import { iniciarTour, iniciarTarefa } from '../BoasVindas/tourEstado'
import PrimeirosPassos from '../BoasVindas/PrimeirosPassos'
import { useIsMobile } from '../../hooks/useIsMobile'
import { telaNaAjuda, telasDaAjuda, rotaDaTela, tarefaDaSecao, montarIndice, buscar, ESPERA_TOUR_MS } from './centralAjudaRegras'

const ROTULO_TIPO = { tela: 'Tela', funcao: 'Função', tarefa: 'Faça comigo', pergunta: 'Pergunta' }

export default function CentralAjuda() {
  const ctx = useContextoAjuda()
  const isMobile = useIsMobile()
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState(null) // seção (tela de topo) aberta no celular
  const [alvo, setAlvo] = useState(() => parseAjudaHash(typeof window !== 'undefined' ? window.location.hash : ''))

  const todas = useMemo(() => telasDaAjuda(ctx, { celular: isMobile }), [ctx, isMobile])
  const topo = todas.filter(id => !id.includes(':'))
  const subtelasDe = (id) => todas.filter(x => x.startsWith(`${id}:`))
  const perguntas = useMemo(() => perguntasVisiveis(ctx), [ctx])
  const indice = useMemo(() => montarIndice(todas, ctx, perguntas, { celular: isMobile }), [todas, ctx, perguntas, isMobile])
  const resultados = buscar(indice, busca)

  // Âncora vinda do hash (o "?", o tour, uma pergunta): abre a seção e rola até o ponto.
  useEffect(() => {
    const ler = () => setAlvo(parseAjudaHash(window.location.hash))
    window.addEventListener('hashchange', ler)
    window.addEventListener(EVENTO_NAVEGAR, ler)
    return () => { window.removeEventListener('hashchange', ler); window.removeEventListener(EVENTO_NAVEGAR, ler) }
  }, [])
  const secaoDoAlvo = alvo.tela ? alvo.tela.split(':')[0] : null
  const secaoAberta = aberta ?? secaoDoAlvo
  useEffect(() => {
    if (!alvo.tela) return
    const t = setTimeout(() => {
      const el = document.getElementById(idAncora(alvo.tela, alvo.chave)) || document.getElementById(idAncora(alvo.tela))
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }, 120)
    return () => clearTimeout(t)
  }, [alvo])

  const irPara = useCallback((tela, chave = null) => {
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search + ajudaHash(tela, chave)) } catch { /* sem history */ }
    setBusca('')
    setAberta(tela.split(':')[0])
    setAlvo({ tela, chave })
  }, [])
  const mostrarNaTela = (tela, chave = null) => {
    const r = rotaDaTela(tela)
    if (!r) return
    navegarPara(r.pagina, r.hash ? { hash: r.hash } : undefined)
    setTimeout(() => iniciarTour(tela, { chave }), ESPERA_TOUR_MS)
  }
  const abrirResultado = (e) => {
    if (e.tipo === 'tarefa') iniciarTarefa(e.tarefaId)
    else if (e.tipo === 'pergunta') { setBusca(''); setAlvo({ tela: '__faq', chave: e.id }); setTimeout(() => document.getElementById(`faq-${e.id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }), 50) }
    else irPara(e.tela, e.chave)
  }

  // Seção de uma tela (função de render, não componente: não remonta a cada digitação na busca).
  const secao = (id, sub = false) => {
    const g = guiaDaTela(id, ctx)
    const tarefas = tarefasDaTela(id, ctx, { celular: isMobile }).filter(t => tarefaDaSecao(t, id))
    const rota = rotaDaTela(id)
    const H = sub ? 'h3' : 'h2'
    return (
      <section key={id} id={idAncora(id)} data-testid={`secao-${id}`} className={sub ? 'mt-5 pt-4 border-t border-borda' : ''}>
        <div className="flex flex-wrap items-center gap-2">
          <H className={sub ? 'text-sm font-semibold text-texto-1' : 'text-base font-semibold text-texto-1'}>{g.titulo}</H>
          {rota && (
            <button type="button" className="btn-secondary text-xs py-1 flex items-center gap-1" onClick={() => mostrarNaTela(id)}>
              <Play size={12} aria-hidden="true" /> Tour desta tela
            </button>
          )}
        </div>
        <p className="text-sm text-texto-1 mt-1 leading-relaxed">{g.descricao}</p>
        {tarefas.length > 0 && (
          <div className="mt-3 rounded-xl border border-borda bg-surface-2 p-3">
            <p className="text-xs font-semibold text-texto-2 uppercase tracking-wide flex items-center gap-1.5 mb-1.5"><Hand size={13} aria-hidden="true" /> Faça comigo</p>
            <div className="flex flex-wrap gap-2">
              {tarefas.map(t => (
                <button key={t.id} type="button" className="btn-secondary text-xs py-1.5" onClick={() => iniciarTarefa(t.id)} title={t.descricao}>{t.titulo}</button>
              ))}
            </div>
          </div>
        )}
        <dl className="mt-3 space-y-3">
          {g.itens.map(it => (
            <div key={it.chave} id={idAncora(id, it.chave)} data-testid={`funcao-${id}.${it.chave}`}
              className={`rounded-lg px-3 py-2 ${alvo.tela === id && alvo.chave === it.chave ? 'bg-primary/10 ring-1 ring-primary/40' : ''}`}>
              <dt className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-texto-1">{it.rotulo}</span>
                {rota && (
                  <button type="button" className="text-xs text-primary-fg hover:underline min-h-[28px]" onClick={() => mostrarNaTela(id, it.chave)}>Mostrar na tela</button>
                )}
              </dt>
              <dd className="text-sm text-texto-1 leading-relaxed">{it.detalhe || it.texto}</dd>
              {it.exemplo && <dd className="text-sm text-texto-2 leading-relaxed mt-0.5"><span className="italic">{it.exemplo}</span></dd>}
            </div>
          ))}
        </dl>
        {(g.dicas.length > 0 || g.errosComuns?.length > 0) && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {g.dicas.length > 0 && (
              <div className="rounded-lg border border-borda p-3">
                <p className="text-xs font-semibold text-texto-2 uppercase tracking-wide flex items-center gap-1.5 mb-1"><Lightbulb size={13} aria-hidden="true" /> Dicas</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-texto-1">{g.dicas.map(d => <li key={d}>{d}</li>)}</ul>
              </div>
            )}
            {g.errosComuns?.length > 0 && (
              <div className="rounded-lg border border-aviso/40 bg-aviso/5 p-3">
                <p className="text-xs font-semibold text-aviso uppercase tracking-wide flex items-center gap-1.5 mb-1"><AlertTriangle size={13} aria-hidden="true" /> Erros comuns</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-texto-1">{g.errosComuns.map(d => <li key={d}>{d}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </section>
    )
  }

  const comeco = (
    <section id="ajuda-comece" className="card space-y-3" data-testid="comece-por-aqui">
      <h2 className="text-base font-semibold text-texto-1">Comece por aqui</h2>
      <ul className="grid sm:grid-cols-2 gap-2">
        {passosVisiveis(ctx).map(p => (
          <li key={p.id} className="rounded-lg border border-borda p-3">
            <p className="text-sm font-semibold text-texto-1">{p.titulo}</p>
            <p className="text-sm text-texto-1 mt-0.5">{p.texto}</p>
          </li>
        ))}
      </ul>
      <PrimeirosPassos expandido className="!p-3 border border-borda shadow-none" />
    </section>
  )

  const faq = (
    <section id="ajuda-faq" className="card space-y-2" data-testid="perguntas-frequentes">
      <h2 className="text-base font-semibold text-texto-1 flex items-center gap-2"><HelpCircle size={18} aria-hidden="true" /> Perguntas frequentes</h2>
      {perguntas.map(p => (
        <details key={p.id} id={`faq-${p.id}`} className="rounded-lg border border-borda px-3 py-2" open={alvo.tela === '__faq' && alvo.chave === p.id}>
          <summary className="cursor-pointer text-sm font-medium text-texto-1 min-h-[32px] flex items-center">{p.pergunta}</summary>
          <p className="text-sm text-texto-1 mt-1 leading-relaxed">{p.resposta}</p>
          {AJUDA_TELAS[p.tela] && telaNaAjuda(p.tela, ctx, { celular: isMobile }) && (
            <button type="button" className="mt-1 text-xs text-primary-fg hover:underline" onClick={() => irPara(p.tela, p.chave || null)}>
              Ver em {AJUDA_TELAS[p.tela].titulo}
            </button>
          )}
        </details>
      ))}
    </section>
  )

  return (
    <div className="space-y-4" data-testid="central-ajuda">
      <div className="card">
        <label htmlFor="busca-ajuda" className="text-sm font-semibold text-texto-1 flex items-center gap-2"><LifeBuoy size={18} className="text-primary-fg" aria-hidden="true" /> O que você quer fazer?</label>
        <div className="relative mt-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-3" aria-hidden="true" />
          <input id="busca-ajuda" type="search" className="input pl-9" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Ex.: parcela, fatura, provisão, transferência" autoComplete="off" />
        </div>
        {busca.trim().length >= 2 && (
          <div className="mt-3" aria-live="polite">
            {resultados.length === 0
              ? <p className="text-sm text-texto-2">Nada encontrado. Tente outra palavra.</p>
              : (
                <ul className="divide-y divide-borda" data-testid="resultados-busca">
                  {resultados.map((e, k) => (
                    <li key={k}>
                      <button type="button" className="w-full text-left py-2 hover:bg-surface-hover rounded px-2" onClick={() => abrirResultado(e)}>
                        <span className="text-[11px] uppercase tracking-wide text-texto-2">{ROTULO_TIPO[e.tipo]}</span>
                        <span className="block text-sm font-medium text-texto-1">{e.titulo}</span>
                        <span className="block text-xs text-texto-2 line-clamp-2">{e.texto}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        )}
      </div>

      {comeco}

      {isMobile ? (
        <div className="space-y-2">
          {topo.map(id => {
            const aberto = secaoAberta === id
            return (
              <div key={id} className="card p-0 overflow-hidden">
                <button type="button" aria-expanded={aberto} onClick={() => setAberta(aberto ? '' : id)}
                  className="w-full flex items-center gap-2 px-4 min-h-[52px] text-left text-sm font-semibold text-texto-1">
                  {aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {AJUDA_TELAS[id].titulo}
                </button>
                {aberto && (
                  <div className="px-4 pb-4 border-t border-borda pt-3">
                    {secao(id)}
                    {subtelasDe(id).map(s => secao(s, true))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-[15rem_1fr] gap-4 items-start">
          <nav aria-label="Índice da ajuda" className="card p-2 sticky top-20 max-h-[calc(100vh-7rem)] overflow-y-auto">
            {topo.map(id => (
              <a key={id} href={ajudaHash(id)} onClick={(e) => { e.preventDefault(); irPara(id) }}
                className={`block rounded-lg px-3 py-1.5 text-sm ${secaoDoAlvo === id ? 'bg-primary/15 text-primary-fg font-medium' : 'text-texto-1 hover:bg-surface-hover'}`}>
                {AJUDA_TELAS[id].titulo}
              </a>
            ))}
            <a href="#ajuda-faq" onClick={(e) => { e.preventDefault(); document.getElementById('ajuda-faq')?.scrollIntoView?.({ behavior: 'smooth' }) }}
              className="block rounded-lg px-3 py-1.5 text-sm text-texto-1 hover:bg-surface-hover">Perguntas frequentes</a>
          </nav>
          <div className="space-y-4 min-w-0">
            {topo.map(id => (
              <div key={id} className="card">
                {secao(id)}
                {subtelasDe(id).map(s => secao(s, true))}
              </div>
            ))}
          </div>
        </div>
      )}

      {faq}
    </div>
  )
}
