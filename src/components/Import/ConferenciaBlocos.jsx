// Importar Fatura → revisão: TELA NOVA DA CONFERÊNCIA (Etapa 6b, 12/11/2026). Só apresentação e as
// respostas do usuário — os blocos, as perguntas, o lado a lado e as frases vêm de
// lib/blocosConferencia; o casamento e a gravação continuam nas libs de sempre.
//   1. Resumo: três números (Novos · Já estão no Finup · Pedem sua decisão) + arquivo × fatura.
//   2. "É este?": um cartão por pergunta ("1 de N"), lado a lado, diferenças realçadas, dois botões
//      com a frase do que acontece; atalhos de teclado do motor do app (lib/atalhos/registry).
//   3. Blocos recolhidos: Novos (a tabela de sempre, vem do ImportPanel), Juntados agora, Já
//      conciliados antes, Não entram e Aguardando o banco (só informação).
//   6. Lugar da sugestão do Assistente (Etapa 6c): <SugestaoAssistente> não mostra nada sem uma
//      sugestão válida (lib/sugestaoAssistente).
import { useState } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, AlertCircle, Lightbulb } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'
import { camposLadoALado, fraseSim, fraseNao, parJaNoFinup, itemJaConciliado } from '../../lib/blocosConferencia'
import { ROTULO_CONFIANCA } from '../../lib/sugestaoAssistente'
import { useAtalho, useShortcutLabel } from '../../context/atalhosHooks'

const fmtFat = (ym) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : '—')

// ── 1. Resumo ────────────────────────────────────────────────────────────────────────────────────
function Numero({ testid, titulo, qtd, sub, tom = 'neutro', onClick }) {
  const cor = tom === 'aviso' ? 'border-aviso/50 bg-aviso/10' : tom === 'ok' ? 'border-primary/30 bg-primary/5' : 'border-borda bg-surface'
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} data-testid={testid}
      className={`rounded-xl border px-4 py-3 text-left min-w-0 ${cor} ${onClick ? 'hover:border-borda-forte' : ''}`}>
      <p className={`text-3xl font-bold leading-none tabular-nums ${tom === 'aviso' ? 'text-aviso' : 'text-texto-1'}`}>{qtd}</p>
      <p className={`text-sm mt-1 ${tom === 'aviso' ? 'text-aviso font-medium' : 'text-texto-1'}`}>{titulo}</p>
      {sub && <p className="text-xs text-texto-2 mt-0.5">{sub}</p>}
    </Tag>
  )
}

export function ResumoConferencia({ resumo, onIr, children }) {
  const r = resumo
  return (
    <section aria-label="Resumo da fatura" className="space-y-2" data-guia="import.resumo">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Numero testid="resumo-novos" titulo="Novos" qtd={r.novos.qtd} sub={`${fmt(r.novos.valor)} · serão importados`} onClick={onIr ? () => onIr('novos') : undefined} />
        <Numero testid="resumo-ja" titulo="Já estão no Finup" qtd={r.ja.qtd} tom="ok"
          sub={`${r.ja.conciliadosAntes ?? 0} conciliados antes · ${r.ja.juntadosAgora ?? 0} juntados agora`}
          onClick={onIr ? () => onIr((r.ja.juntadosAgora ?? 0) > 0 ? 'jaNoFinup' : 'jaConciliados') : undefined} />
        <Numero testid="resumo-decisao" titulo="Pedem sua decisão" qtd={r.decisao.qtd}
          sub={r.decisao.qtd > 0 ? `${fmt(Math.abs(r.decisao.valor))} ficam de fora até você responder` : 'nada pendente'}
          tom={r.decisao.qtd > 0 ? 'aviso' : 'neutro'} onClick={onIr && r.decisao.qtd > 0 ? () => onIr('decisao') : undefined} />
      </div>
      <p data-testid="resumo-totais" className="text-sm text-texto-2 flex flex-wrap gap-x-4 gap-y-0.5">
        <span>Total do arquivo: <span className="font-semibold text-texto-1 tabular-nums">{fmt(r.arquivo)}</span></span>
        {r.ficaNaFatura != null && (
          <span>Fica na fatura do Finup depois de confirmar: <span className={`font-semibold tabular-nums ${Math.abs(r.ficaNaFatura - r.arquivo - r.aguardando.valor) > 0.01 ? 'text-aviso' : 'text-texto-1'}`}>{fmt(r.ficaNaFatura)}</span>
            {r.aguardando.qtd > 0 && <span> (inclui {fmt(r.aguardando.valor)} aguardando o banco)</span>}
          </span>
        )}
      </p>
      {children}
    </section>
  )
}

// ── 6. Lugar da sugestão do Assistente ─────────────────────────────────────────────────────────────
// Etapa 6c: recebe uma sugestão JÁ validada (validarSugestao). Sem sugestão, não ocupa espaço.
export function SugestaoAssistente({ sugestao, onUsar, compacto = false }) {
  if (!sugestao) return null
  if (compacto) {
    return (
      <span data-testid="sugestao-assistente" title={`Sugestão do Assistente (${ROTULO_CONFIANCA[sugestao.confianca]}): ${sugestao.motivo}`}
        className="shrink-0 inline-flex items-center text-primary-fg"><Lightbulb size={13} /></span>
    )
  }
  return (
    <div data-testid="sugestao-assistente" className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-texto-1">
      <Lightbulb size={14} className="text-primary-fg shrink-0 mt-0.5" />
      <p className="min-w-0 break-words flex-1">
        <span className="font-medium">Sugestão do Assistente</span> ({ROTULO_CONFIANCA[sugestao.confianca]}): {sugestao.motivo}
      </p>
      {onUsar && <button type="button" className="text-primary-fg hover:underline shrink-0" onClick={() => onUsar(sugestao)}>Usar sugestão</button>}
    </div>
  )
}

// ── 2. "É este?" ─────────────────────────────────────────────────────────────────────────────────
export function CartoesDecisao({ perguntas, ctx, onSim, onNao, sugestoes = {} }) {
  const [idx, setIdx] = useState(0)
  const n = perguntas.length
  const i = n ? Math.min(idx, n - 1) : 0
  const p = n ? perguntas[i] : null
  const ir = (passo) => (n > 1 ? setIdx((i + passo + n) % n) : false)
  useAtalho('importar.decisaoProxima', () => ir(1), n > 0)
  useAtalho('importar.decisaoAnterior', () => ir(-1), n > 0)
  useAtalho('importar.decisaoSim', () => (p?.candidatos.length === 1 ? onSim(p, p.candidatos[0]) : false), n > 0)
  useAtalho('importar.decisaoNao', () => (p ? onNao(p) : false), n > 0)
  const tecla = {
    sim: useShortcutLabel('importar.decisaoSim'), nao: useShortcutLabel('importar.decisaoNao'),
    prox: useShortcutLabel('importar.decisaoProxima'), ant: useShortcutLabel('importar.decisaoAnterior'),
  }
  const comTecla = (txt, t) => (t ? `${txt} (${t})` : txt)
  if (!p) {
    return (
      <p data-testid="decisao-vazia" className="flex items-center gap-2 rounded-xl border border-borda bg-surface px-3 py-2.5 text-sm text-texto-1">
        <Check size={16} className="text-primary-fg shrink-0" /> Nada pede sua decisão nesta fatura.
      </p>
    )
  }
  const colunas = p.candidatos.map(c => ({ c, campos: camposLadoALado(p.row, c, ctx) }))
  const linhasCampos = colunas[0]?.campos || camposLadoALado(p.row, {}, ctx)
  const varios = colunas.length > 1
  const grade = { gridTemplateColumns: `minmax(6.5rem, 9rem) repeat(${1 + colunas.length}, minmax(0, 1fr))` }
  return (
    <section data-testid="decisao-cartao" aria-label="Pedem sua decisão" className="rounded-xl border-2 border-aviso/50 bg-surface overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2 bg-aviso/10 border-b border-aviso/30">
        <AlertCircle size={16} className="text-aviso shrink-0" />
        <h3 className="text-sm font-semibold text-texto-1">Pedem sua decisão</h3>
        <span className="ml-auto flex items-center gap-1 text-xs text-texto-2">
          <button type="button" data-testid="decisao-anterior" aria-label="Anterior" title={comTecla('Anterior', tecla.ant)} disabled={n < 2}
            onClick={() => ir(-1)} className="p-1 rounded hover:bg-surface-hover disabled:opacity-40"><ChevronLeft size={16} /></button>
          <span data-testid="decisao-posicao" className="tabular-nums">{i + 1} de {n}</span>
          <button type="button" data-testid="decisao-proxima" aria-label="Próxima" title={comTecla('Próxima', tecla.prox)} disabled={n < 2}
            onClick={() => ir(1)} className="p-1 rounded hover:bg-surface-hover disabled:opacity-40"><ChevronRight size={16} /></button>
        </span>
      </header>
      <div className="px-3 py-3 space-y-3">
        <div>
          <p data-testid="decisao-titulo" className="text-lg font-semibold text-texto-1">{p.titulo}</p>
          <p className="text-xs text-texto-2">{p.explicacao}</p>
        </div>
        <div className="overflow-x-auto">
          <div role="table" aria-label="Comparação" className="grid text-xs min-w-[28rem]" style={grade}>
            <div role="row" className="contents">
              <span role="columnheader" />
              <span role="columnheader" className="px-2 py-1 font-semibold text-texto-2 uppercase tracking-wide">Na fatura</span>
              {colunas.map(({ c }, k) => (
                <span key={c.id} role="columnheader" className="px-2 py-1 font-semibold text-texto-2 uppercase tracking-wide">
                  {c.agendamento ? 'Agendamento' : varios ? `No Finup · opção ${k + 1}` : 'No Finup'}
                </span>
              ))}
            </div>
            {linhasCampos.map((campo, li) => {
              const algumDifere = colunas.some(col => col.campos[li]?.difere)
              return (
                <div key={campo.campo} role="row" className="contents" data-testid={`campo-${campo.campo}`}>
                  <span role="rowheader" className="px-2 py-1.5 text-texto-2 border-t border-borda">{campo.rotulo}</span>
                  <span role="cell" className={`px-2 py-1.5 border-t border-borda break-words ${algumDifere ? 'font-medium text-texto-1' : 'text-texto-1'}`}>{campo.fatura}</span>
                  {colunas.map(({ c, campos }) => {
                    const cel = campos[li]
                    return (
                      <span key={c.id} role="cell" data-difere={cel.difere ? 'sim' : undefined}
                        className={`px-2 py-1.5 border-t border-borda break-words ${cel.difere ? 'bg-aviso/15 text-aviso font-medium' : 'text-texto-1'}`}>
                        {cel.finup}{cel.difere && <span className="ml-1 text-[10px] whitespace-nowrap">◀ difere</span>}
                      </span>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
        {/* Etapa 6c: sugestão do Assistente entre a comparação e os botões. */}
        <SugestaoAssistente sugestao={sugestoes[p.id] || null} />
        <div className={`grid gap-2 ${varios ? '' : 'sm:grid-cols-2'}`}>
          {varios ? (
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${colunas.length}, minmax(0, 1fr))` }}>
              {colunas.map(({ c }, k) => (
                <BotaoResposta key={c.id} testid={`decisao-sim-${k + 1}`} principal onClick={() => onSim(p, c)}
                  rotulo={`Sim, é a opção ${k + 1}`} frase={fraseSim(p, c)} />
              ))}
            </div>
          ) : (
            <BotaoResposta testid="decisao-sim" principal onClick={() => onSim(p, colunas[0].c)}
              rotulo={comTecla(p.tipo === 'recorrente' ? 'Sim, é este agendamento' : 'Sim, é este', tecla.sim)} frase={fraseSim(p, colunas[0].c)} />
          )}
          <BotaoResposta testid="decisao-nao" onClick={() => onNao(p)}
            rotulo={comTecla('Não, é outro — importar como novo', tecla.nao)} frase={fraseNao(p)} />
        </div>
      </div>
    </section>
  )
}

function BotaoResposta({ testid, rotulo, frase, onClick, principal = false }) {
  return (
    <div className="min-w-0">
      <button type="button" data-testid={testid} data-help-id="revisaoFatura.decidir" onClick={onClick}
        className={`${principal ? 'btn-primary' : 'btn-secondary'} w-full min-h-[44px] text-sm justify-center`}>{rotulo}</button>
      <p className="text-xs text-texto-2 mt-1 break-words">{frase}</p>
    </div>
  )
}

// ── 3. Blocos recolhidos ─────────────────────────────────────────────────────────────────────────
export function BlocoConferencia({ id, titulo, qtd, sub, aberto, onAlternar, children, acoes, info = false }) {
  return (
    <section id={`bloco-${id}`} data-testid={`bloco-${id}`} className="card p-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3 min-h-[44px]">
        <button type="button" onClick={onAlternar} aria-expanded={aberto} disabled={!qtd}
          className="flex-1 flex items-center gap-2 py-2.5 text-left disabled:cursor-default">
          {qtd ? (aberto ? <ChevronDown size={16} className="text-texto-2" /> : <ChevronRight size={16} className="text-texto-2" />) : <span className="w-4" />}
          <h3 className="text-sm font-semibold text-texto-1">{titulo}</h3>
          <span className="text-sm text-texto-2 tabular-nums">({qtd})</span>
          {sub && <span className="text-xs text-texto-2">· {sub}</span>}
          {info && <span className="text-[11px] px-1.5 rounded bg-surface-2 border border-borda text-texto-2">só informação</span>}
        </button>
        {aberto && acoes}
      </div>
      {aberto && qtd > 0 && <div className="border-t border-borda">{children}</div>}
    </section>
  )
}

const linhaBase = 'px-3 py-2 border-b border-borda/50 last:border-0 text-xs'

// "Juntados agora (ficam conciliados)": cada par numa linha, com o que foi juntado.
export function ListaJaNoFinup({ linhas, onAcao, detalhes, abertas, onDetalhes }) {
  return (
    <ul data-testid="lista-ja-no-finup">
      {linhas.map(r => {
        const par = parJaNoFinup(r)
        const tx = par.tx || {}
        return (
          <li key={r._id} id={`jn-${r._id}`} className={linhaBase}>
            <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
              <Check size={14} className="text-primary-fg shrink-0 mt-0.5" />
              <span className="min-w-0 flex-1 break-words">
                <span className="text-texto-2">{fmtDate(r._dateCartao || r.date)}</span>{' '}
                <span className="font-medium text-texto-1">{r.description}</span>{' '}
                <span className="tabular-nums text-texto-1">{fmt(r.amount)}</span>
                <span className="text-texto-2"> → no Finup: </span>
                <span className="text-texto-1">“{tx.description || '—'}”</span>
                <span className="text-texto-2"> · {par.origem} · {fmtDate(tx.date)}{Math.abs((Number(tx.amount) || 0) - (Number(r.amount) || 0)) > 0.005 ? ` · ${fmt(tx.amount)} → ${fmt(r.amount)}` : ''}</span>
              </span>
              {detalhes && (
                <button type="button" className="text-primary-fg hover:underline shrink-0" aria-expanded={abertas?.has(r._id)} onClick={() => onDetalhes?.(r._id)}>
                  {abertas?.has(r._id) ? 'Fechar' : 'Detalhes'}
                </button>
              )}
              {par.acao && (
                <button type="button" data-testid={`nao-e-este-${r._id}`} className="text-primary-fg hover:underline shrink-0"
                  title={par.acao === 'novo' ? 'A linha entra como lançamento novo; o do Finup fica como está.' : 'Volta a ser pergunta em "Pedem sua decisão".'}
                  onClick={() => onAcao(r, par.acao)}>Não é este</button>
              )}
            </div>
            {detalhes && abertas?.has(r._id) && <div className="mt-1.5 pl-6">{detalhes(r)}</div>}
          </li>
        )
      })}
    </ul>
  )
}

const ROTULO_DIFERENCA = { valor: 'Valor', dataCartao: 'Data do cartão' }
// "Já conciliados antes": só consulta; diferença real de valor ou data aparece com ⚠.
export function ListaJaConciliados({ linhas }) {
  return (
    <ul data-testid="lista-ja-conciliados">
      {linhas.map(r => {
        const { tx, diferencas } = itemJaConciliado(r)
        return (
          <li key={r._id} id={`jc-${r._id}`} className={linhaBase}>
            <span className="break-words">
              <span className="text-texto-2">{fmtDate(r._dateCartao || r.date)}</span>{' '}
              <span className="font-medium text-texto-1">{r.description}</span>{' '}
              <span className="tabular-nums">{fmt(r.amount)}</span>
              <span className="text-texto-2"> → no Finup: “{tx?.description || '—'}”</span>
            </span>
            {diferencas.map(d => (
              <span key={d.campo} className="block pl-3 text-aviso">
                ⚠ {ROTULO_DIFERENCA[d.campo] || d.campo}: no Finup {d.campo === 'valor' ? fmt(d.banco) : fmtDate(d.banco)} · na fatura {d.campo === 'valor' ? fmt(d.arquivo) : fmtDate(d.arquivo)} — corrija na tela de Lançamentos, se for o caso
              </span>
            ))}
          </li>
        )
      })}
    </ul>
  )
}

// "Não entram": linhas desmarcadas. Dá para voltar a importar; nada é excluído.
export function ListaNaoEntram({ linhas, onIncluir }) {
  return (
    <ul data-testid="lista-nao-entram">
      {linhas.map(r => (
        <li key={r._id} id={`ne-${r._id}`} className={`${linhaBase} flex flex-wrap items-center gap-2`}>
          <span className="min-w-0 flex-1 break-words">
            <span className="text-texto-2">{fmtDate(r._dateCartao || r.date)}</span>{' '}
            <span className="font-medium text-texto-1">{r.description}</span>{' '}
            <span className="tabular-nums">{fmt(r.amount)}</span>
          </span>
          {onIncluir && <button type="button" className="text-primary-fg hover:underline" onClick={() => onIncluir(r)}>Importar esta linha</button>}
        </li>
      ))}
    </ul>
  )
}

// "Aguardando o banco": parcelas previstas no Finup que o banco ainda não lançou (fatura aberta).
export function ListaAguardando({ itens }) {
  return (
    <div>
      <p className="px-3 pt-2 text-xs text-texto-2">Parcelas previstas no Finup que o banco ainda não lançou nesta fatura aberta. Ficam como estão.</p>
      <ul data-testid="lista-aguardando">
        {itens.map((it, k) => (
          <li key={it.tx?.id || k} className={linhaBase}>
            <span className="text-texto-2">{fmtDate(it.tx?.date)}</span>{' '}
            <span className="font-medium text-texto-1">{it.tx?.description || '—'}</span>{' '}
            <span className="tabular-nums">{fmt(Math.abs(Number(it.tx?.amount) || 0))}</span>
            <span className="text-texto-2"> · fatura {fmtFat(it.tx?.faturaMonthYear)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

