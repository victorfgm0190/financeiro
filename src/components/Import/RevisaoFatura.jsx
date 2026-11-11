// Importar Fatura → Cartão de Crédito → etapa 2 "Revisar lançamentos": peças de APRESENTAÇÃO.
// Nenhuma regra de casamento, conciliação ou gravação mora aqui — os números vêm de
// lib/contagemRevisaoFatura (contagem única) e de projetarTotalFatura (lib/revisaoImportacao).
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, AlertCircle, Settings2 } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'
import DateInput from '../shared/DateInput'
import { ABAS_REVISAO, lerConferenciaAberta, lembrarConferenciaAberta, rotuloFatura, separarSufixo, textoSemDecisao } from '../../lib/contagemRevisaoFatura'
import { configHash } from '../../lib/configRota'
import HelpCampo from '../shared/HelpCampo'

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

// ── 1. Resumo no topo ────────────────────────────────────────────────────────────────────────────
function CartaoResumo({ titulo, valor, sub, destaque = false, testid }) {
  return (
    <div data-testid={testid} className={`rounded-xl border px-3 py-2.5 min-w-0 ${destaque ? 'border-aviso/50 bg-aviso/10' : 'border-borda bg-surface'}`}>
      <p className={`text-xs ${destaque ? 'text-aviso font-medium' : 'text-texto-2'}`}>{titulo}</p>
      <p className={`text-lg font-bold leading-tight mt-0.5 ${destaque ? 'text-aviso' : 'text-texto-1'}`}>{valor}</p>
      {sub && <p className="text-xs text-texto-2 mt-0.5">{sub}</p>}
    </div>
  )
}

export function ResumoRevisaoFatura({ contagem, projecao, faturaLabel, children }) {
  const c = contagem
  const decisao = c.decisao.qtd
  return (
    <section aria-label="Resumo da revisão" className="space-y-2" data-guia="import.resumo">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <CartaoResumo testid="resumo-arquivo" titulo="Total do arquivo" valor={fmt(projecao ? projecao.arquivo : c.arquivo.valor)} sub={plural(c.total, 'linha', 'linhas')} />
        <CartaoResumo testid="resumo-finup" titulo="Já no Finup" valor={fmt(c.conciliados.valor)} sub={plural(c.conciliados.qtd, 'lançamento', 'lançamentos')} />
        <CartaoResumo testid="resumo-importar" titulo="A importar" valor={fmt(c.importar.valor)} sub={plural(c.importar.qtd, 'lançamento', 'lançamentos')} />
        <CartaoResumo testid="resumo-decisao" titulo="Precisam de decisão" valor={String(decisao)}
          sub={decisao > 0 ? 'ficam de fora até você escolher' : 'nada pendente'} destaque={decisao > 0} />
      </div>
      <p className="text-xs text-texto-2 flex flex-wrap gap-x-3 gap-y-0.5">
        {projecao && (
          <span title={`O que a fatura ${faturaLabel} terá no Finup depois da confirmação: o já gravado nela + as linhas que serão inseridas`}>
            Total projetado da fatura: <span className="font-semibold text-texto-1">{fmt(projecao.projetado)}</span>
          </span>
        )}
        {c.desmarcados.qtd > 0 && <span>{plural(c.desmarcados.qtd, 'linha desmarcada', 'linhas desmarcadas')} ({fmt(c.desmarcados.valor)}) não {c.desmarcados.qtd === 1 ? 'será importada' : 'serão importadas'}</span>}
      </p>
      {children}
    </section>
  )
}

// ── 2. Conferência da fatura ─────────────────────────────────────────────────────────────────────
export function ConferenciaFatura({ conferencia, sessao, onIrParaLinha }) {
  const alerta = !conferencia?.totalmenteExplicada
  const [aberta, setAberta] = useState(() => {
    if (alerta) return true
    return lerConferenciaAberta(sessao) ?? false
  })
  // Sobra sem explicação → abre (mesmo que o usuário tenha deixado fechado).
  const alertaAnterior = useRef(alerta)
  useEffect(() => {
    if (alerta && !alertaAnterior.current) setAberta(true)
    alertaAnterior.current = alerta
  }, [alerta])
  if (!conferencia || conferencia.semDiferenca) return null
  const alternar = () => setAberta(v => { lembrarConferenciaAberta(sessao, !v); return !v })
  const { diferenca, semExplicacao, qtdItens, grupos, semDecisao } = conferencia
  const pendentes = semDecisao?.qtd || 0
  return (
    <section data-testid="conferencia-fatura" className={`rounded-xl border ${alerta ? 'border-aviso/50 bg-aviso/10' : 'border-borda bg-surface'}`}>
      <button type="button" onClick={alternar} aria-expanded={aberta} data-guia="import.conferencia"
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left min-h-[44px]">
        {alerta
          ? <AlertCircle size={16} className="text-aviso shrink-0" />
          : <Check size={16} className="text-primary-fg shrink-0" />}
        <span className="text-sm font-semibold text-texto-1">Conferência da fatura</span>
        <span className={`text-sm ${alerta ? 'text-aviso font-medium' : 'text-primary-fg'}`}>
          {pendentes > 0
            ? `⚠ ${textoSemDecisao(pendentes, semDecisao.valor, fmt)}${Math.abs(semExplicacao) > 0.01 ? ` · ${fmt(Math.abs(semExplicacao))} sem explicação` : ''}`
            : alerta
              ? `⚠ ${fmt(Math.abs(semExplicacao))} sem explicação`
              : `Diferença de ${fmt(Math.abs(diferenca))} totalmente explicada (${plural(qtdItens, 'item', 'itens')})`}
        </span>
        <span className="ml-auto text-texto-2 shrink-0">{aberta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
      </button>
      {aberta && (
        <div className="border-t border-borda px-3 py-2 space-y-3">
          {grupos.map(g => (
            <div key={g.tipo}>
              <div className="flex items-baseline gap-2 text-xs font-semibold text-texto-1 pb-1 border-b border-borda">
                <span>{g.titulo}</span>
                <span className="font-normal text-texto-2">({g.qtd})</span>
                <span className="ml-auto tabular-nums">{fmt(g.subtotal)}</span>
              </div>
              <ul>
                {g.itens.map((it, i) => {
                  const ref = it.linha || it.tx
                  return (
                    <li key={i} className="grid grid-cols-[1fr_auto] gap-x-3 py-1 text-xs text-texto-1 border-b border-borda/50 last:border-0">
                      <span className="min-w-0 break-words">
                        {it.linha
                          ? <button type="button" className="text-left hover:underline" onClick={() => onIrParaLinha?.(it.linha._id)}>{ref.description}</button>
                          : ref.description}
                        <span className="text-texto-2"> · {fmtDate(it.linha?._dateCartao || ref.dateCartao || ref.date)}</span>
                        {it.tipo === 'valor_diferente' && <span className="text-texto-2"> · {it.motivo}</span>}
                      </span>
                      <span className="text-right tabular-nums font-medium">{fmt(it.valor)}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          <p className="text-xs text-texto-2">
            Cada valor é o efeito na diferença (arquivo − Finup). Soma: {fmt(conferencia.explicada)}
            {pendentes > 0 && <> · sem decisão (fora da soma): <span className="text-aviso font-medium">{fmt(semDecisao.valor)}</span></>}
            {Math.abs(semExplicacao) > 0.01 && <> · sem explicação: <span className="text-aviso font-medium">{fmt(semExplicacao)}</span></>}
          </p>
        </div>
      )}
    </section>
  )
}

// ── 3. Abas da tabela ────────────────────────────────────────────────────────────────────────────
export function AbasRevisao({ contagem, aba, onAba }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-borda" role="tablist" aria-label="Linhas da fatura" data-guia="import.abas">
      {ABAS_REVISAO.map(a => {
        const n = a.conta(contagem)
        const ativa = aba === a.id
        const alerta = a.id === 'decisao' && n > 0
        return (
          <button key={a.id} type="button" role="tab" aria-selected={ativa} onClick={() => onAba(a.id)}
            className={`text-xs px-3 min-h-[32px] rounded-full border transition-colors ${ativa
              ? 'bg-primary/15 border-primary/40 text-primary-fg font-medium'
              : alerta ? 'bg-aviso/10 border-aviso/40 text-aviso' : 'bg-surface-2 border-borda-campo text-texto-2 hover:text-texto-1'}`}>
            {a.rotulo} ({n})
          </button>
        )
      })}
    </div>
  )
}

// Data do cartão; indicador quando a data do sistema é outra. Clique abre a edição das duas.
export function DataCelula({ row, onChange }) {
  const [editando, setEditando] = useState(false)
  const cartao = row._dateCartao || row.date || ''
  const difere = !!row._dateCartao && !!row.date && row._dateCartao !== row.date
  if (editando) {
    return (
      <div className="space-y-1" onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') setEditando(false) }}>
        <label className="block text-[10px] text-texto-2" data-help-id="revisaoFatura.data">Cartão
          <DateInput className="block bg-surface-2 border border-borda-campo text-texto-1 rounded px-1 py-0.5 text-xs w-[7.5rem]"
            value={row._dateCartao || ''} onChange={e => onChange({ _dateCartao: e.target.value || null })} />
        </label>
        <label className="block text-[10px] text-texto-2" data-help-id="revisaoFatura.data">Sistema
          <DateInput className="block bg-surface-2 border border-borda-campo text-texto-1 rounded px-1 py-0.5 text-xs w-[7.5rem]"
            value={row.date || ''} onChange={e => onChange({ date: e.target.value })} />
        </label>
        <button type="button" className="text-[10px] text-primary-fg hover:underline" onClick={() => setEditando(false)}>Fechar</button>
      </div>
    )
  }
  return (
    <button type="button" data-help-id="revisaoFatura.data" onClick={() => setEditando(true)} className="text-xs text-texto-1 whitespace-nowrap hover:underline text-left"
      title={difere ? `Data no cartão ${fmtDate(row._dateCartao)} · data no sistema ${fmtDate(row.date)} — clique para editar` : 'Clique para editar as datas'}>
      {cartao ? fmtDate(cartao) : '—'}
      {difere && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-aviso align-middle" aria-label="data do sistema diferente" />}
    </button>
  )
}

// Fatura como texto; destacada quando difere do mês de referência. Clique abre o seletor.
export function FaturaCelula({ row, referencia, opcoes, onChange }) {
  const [editando, setEditando] = useState(false)
  const difere = !!row.faturaMonthYear && !!referencia && row.faturaMonthYear !== referencia
  if (editando) {
    return (
      <select autoFocus data-help-id="revisaoFatura.fatura" aria-label="Fatura" onBlur={() => setEditando(false)}
        className="bg-surface-2 border border-borda-campo text-texto-1 rounded px-1 py-0.5 text-xs focus:outline-none"
        value={row.faturaMonthYear || ''}
        onChange={e => { onChange({ faturaMonthYear: e.target.value }); setEditando(false) }}>
        <option value="">—</option>
        {opcoes.map(o => <option key={o.value} value={o.value}>{rotuloFatura(o.value)}</option>)}
      </select>
    )
  }
  return (
    <button type="button" data-help-id="revisaoFatura.fatura" onClick={() => setEditando(true)}
      className={`text-xs whitespace-nowrap hover:underline ${difere ? 'text-aviso font-semibold' : 'text-texto-1'}`}
      title={difere ? `Fatura diferente do mês de referência (${rotuloFatura(referencia)}) — clique para trocar` : 'Clique para trocar a fatura'}>
      {difere && '⚠ '}{rotuloFatura(row.faturaMonthYear)}
    </button>
  )
}

// Descrição: texto principal inteiro (quebra, não corta); cidade/sufixo em 2ª linha menor.
// Clique edita.
export function DescricaoCelula({ row, onChange, selos }) {
  const [editando, setEditando] = useState(false)
  const { principal, sufixo } = separarSufixo(row.description)
  return (
    <div className="min-w-0">
      <div className="flex items-start gap-1.5 flex-wrap">
        {editando ? (
          <input autoFocus data-help-id="revisaoFatura.descricao" aria-label="Descrição" className="input !py-0.5 !text-xs min-w-0 flex-1" value={row.description}
            onChange={e => onChange({ description: e.target.value })}
            onBlur={() => setEditando(false)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditando(false) }} />
        ) : (
          <button type="button" data-help-id="revisaoFatura.descricao" onClick={() => setEditando(true)} title="Clique para editar a descrição"
            className="text-xs text-texto-1 font-medium text-left break-words min-w-0 hover:underline">
            {principal || '—'}
          </button>
        )}
        {selos}
      </div>
      {sufixo && !editando && <p className="text-[11px] text-texto-2 break-words">{sufixo}</p>}
    </div>
  )
}

// Selo de status compacto (uma linha).
const TOM = {
  ok: 'bg-primary/15 text-primary-fg',
  aviso: 'bg-aviso/15 text-aviso',
  perigo: 'bg-perigo-bg text-perigo',
  neutro: 'bg-surface-2 text-texto-2 border border-borda',
  novo: 'bg-primary/15 text-primary-fg',
  receita: 'bg-receita/15 text-receita',
}
export function Selo({ tom = 'neutro', title, children }) {
  return <span title={title} className={`inline-block text-[11px] leading-5 px-1.5 rounded whitespace-nowrap ${TOM[tom] || TOM.neutro}`}>{children}</span>
}

// Linhas que precisam de decisão: um controle compacto no lugar dos radios empilhados.
//   • "para escolher" (candidatos do cartão): um item por candidato + "É novo — importar";
//   • possível duplicata: "É outra compra — importar" | "É a mesma — atualizar o existente".
export function DecisaoSelect({ row, onEscolherCandidato, onPossivel }) {
  if (row._jaLancadoOpcoes) {
    return (
      <select aria-label="Decidir" data-help-id="revisaoFatura.decidir" className="w-full max-w-[11rem] bg-surface-2 border border-aviso text-texto-1 rounded px-1 py-0.5 text-xs"
        value={row._jaLancadoEscolha || ''} onChange={e => onEscolherCandidato(e.target.value)}>
        <option value="">⚠ {row._parecido ? 'Parecido — é este?' : 'Escolher…'}</option>
        {row._jaLancadoOpcoes.map(tx => (
          <option key={tx.id} value={tx.id}>É {tx._pre ? 'o pré-lançamento' : 'este'}: {tx.description || '—'} · {fmtDate(tx.date)} · {fmt(tx.amount)}</option>
        ))}
        <option value="novo">É novo — importar</option>
      </select>
    )
  }
  const tx = row._dupTx || row._collisionTx
  const valor = row._mesmoConfirmado ? 'mesmo' : row.selected ? 'importar' : ''
  return (
    <select aria-label="Decidir" data-help-id="revisaoFatura.decidir" className={`w-full max-w-[11rem] bg-surface-2 border ${valor ? 'border-borda-campo' : 'border-aviso'} text-texto-1 rounded px-1 py-0.5 text-xs`}
      title={tx ? `Possível duplicata de: ${tx.description} · ${fmtDate(tx.date)} · ${fmt(tx.amount)}` : undefined}
      value={valor} onChange={e => onPossivel(e.target.value)}>
      <option value="">⚠ Possível duplicata…</option>
      <option value="importar">É outra compra — importar</option>
      {tx && <option value="mesmo">É a mesma — atualizar o existente</option>}
    </select>
  )
}

// ── 4. Rodapé ────────────────────────────────────────────────────────────────────────────────────
// Parcelas já no banco: só as que mudam algo; idênticas viram uma linha recolhida. Conciliadas com
// diferença no arquivo aparecem à parte, só como informação — nunca são alteradas nem marcadas.
export function ParcelasJaNoBanco({ linhas, identicas, conciliadas = [], aplicar, onToggle }) {
  const corpo = <ParcelasAtualizar linhas={linhas} identicas={identicas} aplicar={aplicar} onToggle={onToggle} />
  if (!conciliadas.length) return corpo
  return <div className="space-y-2"><ConciliadasComDiferenca itens={conciliadas} />{corpo}</div>
}

const ROTULO_DIFERENCA = { valor: 'Valor', dataCartao: 'Data do cartão', descricao: 'Descrição' }
function ConciliadasComDiferenca({ itens }) {
  return (
    <div className="card py-2.5" role="note">
      <h3 className="text-xs font-semibold text-texto-1">
        {plural(itens.length, 'lançamento já conciliado com diferença no arquivo', 'lançamentos já conciliados com diferença no arquivo')} — só informação
      </h3>
      <p className="text-xs text-texto-2 mt-0.5">Conciliado não é alterado pela reimportação. Se o arquivo estiver certo, corrija o lançamento na tela de Lançamentos.</p>
      <ul className="mt-2 text-xs text-texto-1 space-y-1">
        {itens.map(it => (
          <li key={it.id} className="break-words">
            <span className="font-medium">{it.descricao}</span> · {it.parcela} · {fmt(it.valor)}
            {it.diferencas.map(d => (
              <span key={d.campo} className="block pl-3 text-texto-2">
                {ROTULO_DIFERENCA[d.campo]}: no Finup {d.campo === 'valor' ? fmt(d.banco) : d.campo === 'dataCartao' ? fmtDate(d.banco) : d.banco} · no arquivo {d.campo === 'valor' ? fmt(d.arquivo) : d.campo === 'dataCartao' ? fmtDate(d.arquivo) : d.arquivo}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ParcelasAtualizar({ linhas, identicas, aplicar, onToggle }) {
  const [verIdenticas, setVerIdenticas] = useState(false)
  if (!linhas.length && !identicas.length) return null
  if (!linhas.length) {
    return (
      <div className="card py-2.5">
        <button type="button" className="flex items-center gap-2 text-xs text-texto-2 w-full text-left" onClick={() => setVerIdenticas(v => !v)} aria-expanded={verIdenticas}>
          {verIdenticas ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {plural(identicas.length, 'parcela já no banco, idêntica', 'parcelas já no banco, todas idênticas')} <Check size={14} className="text-primary-fg" />
        </button>
        {verIdenticas && (
          <ul className="mt-2 pl-6 text-xs text-texto-1 space-y-0.5">
            {identicas.map(l => <li key={l.id}>{l.descricao} · {l.parcela} · {fmt(l.valor)}</li>)}
          </ul>
        )}
      </div>
    )
  }
  const temReserva = linhas.some(l => l.campos.reserva.antes !== l.campos.reserva.depois)
  const Campo = ({ c }) => (c.antes !== c.depois
    ? <span className="block min-w-0"><span className="text-texto-2 line-through break-words">{c.antes}</span> <span className="text-texto-1 font-medium break-words">→ {c.depois}</span></span>
    : <span className="text-texto-1 break-words">{c.antes}</span>)
  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-borda flex items-center gap-2 flex-wrap">
        <h3 className="text-xs font-semibold text-texto-1">Parcelas já no banco — atualizar?</h3>
        <span className="text-xs text-texto-2">
          {plural(linhas.length, 'com diferença', 'com diferença')} · {aplicar} marcada{aplicar !== 1 ? 's' : ''} p/ atualizar
          {identicas.length > 0 && ` · ${identicas.length} idêntica${identicas.length !== 1 ? 's' : ''} (ocultas)`}
        </span>
      </div>
      <table className="w-full text-xs table-fixed">
        <thead>
          <tr className="border-b border-borda text-left text-texto-2">
            <th className="w-8 px-2 py-2"><HelpCampo campo="revisaoFatura.atualizarParcela" /></th>
            <th className="px-2 py-2 font-medium">Descrição</th>
            <th className="px-2 py-2 font-medium w-20">Parcela</th>
            <th className="px-2 py-2 font-medium w-24">Data</th>
            <th className="px-2 py-2 font-medium w-24 text-right">Valor</th>
            <th className="px-2 py-2 font-medium">Categoria</th>
            <th className="px-2 py-2 font-medium">Grupo</th>
            {temReserva && <th className="px-2 py-2 font-medium">Reserva</th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={l.id} className={`border-b border-borda/50 align-top ${i % 2 ? 'bg-surface-2' : ''}`}>
              <td className="px-2 py-1.5"><input type="checkbox" className="accent-primary" data-help-id="revisaoFatura.atualizarParcela" checked={l.aplicar} onChange={() => onToggle(l.id)} aria-label={`Atualizar ${l.descricao}`} /></td>
              <td className="px-2 py-1.5"><Campo c={l.campos.descricao} />{l.csv && <span className="ml-1 text-[10px] px-1 rounded bg-surface-2 text-texto-2 border border-borda" title="O extrato traz um valor diferente em centavos (dentro da tolerância de R$ 0,50). O valor do banco é mantido.">CSV {l.csv}</span>}</td>
              <td className="px-2 py-1.5"><Campo c={l.campos.parcela} /></td>
              <td className="px-2 py-1.5"><Campo c={l.campos.data} /></td>
              <td className="px-2 py-1.5 text-right tabular-nums"><Campo c={l.campos.valor} /></td>
              <td className="px-2 py-1.5"><Campo c={l.campos.categoria} /></td>
              <td className="px-2 py-1.5"><Campo c={l.campos.grupo} /></td>
              {temReserva && <td className="px-2 py-1.5"><Campo c={l.campos.reserva} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Bloco recolhível com contador no título (parcelas futuras, regras).
export function BlocoRecolhido({ titulo, contador, children, inicial = false }) {
  const [aberto, setAberto] = useState(inicial)
  return (
    <div className="card p-0 overflow-hidden">
      <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left min-h-[44px]">
        {aberto ? <ChevronDown size={14} className="text-texto-2" /> : <ChevronRight size={14} className="text-texto-2" />}
        <h3 className="text-xs font-semibold text-texto-1">{titulo}</h3>
        {contador != null && <span className="text-xs text-texto-2">({contador})</span>}
      </button>
      {aberto && <div className="border-t border-borda">{children}</div>}
    </div>
  )
}

export function LinkRegrasClassificacao() {
  return (
    <a href={configHash('regras', 'classificacao')} className="inline-flex items-center gap-1.5 text-xs text-primary-fg hover:underline">
      <Settings2 size={13} /> Gerenciar regras de classificação
    </a>
  )
}

// ── 5. Barra de ações fixa ───────────────────────────────────────────────────────────────────────
export function BarraAcoesRevisao({ contagem, acoes, confirmar }) {
  const decisao = contagem.decisao.qtd
  return (
    <div data-testid="barra-acoes-revisao"
      className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] md:bottom-0 z-20 -mx-1 px-3 py-2 rounded-xl border border-borda-forte bg-surface shadow-2xl flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-2">{acoes}</div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        <span className="text-xs text-texto-2 text-right">
          <span className="text-texto-1 font-medium">{plural(contagem.importar.qtd, 'lançamento', 'lançamentos')} · {fmt(contagem.importar.valor)}</span>
          {decisao > 0 && <span className="block text-aviso">⚠ {textoSemDecisao(decisao, contagem.decisao.valor, fmt)}</span>}
        </span>
        {confirmar}
      </div>
    </div>
  )
}
