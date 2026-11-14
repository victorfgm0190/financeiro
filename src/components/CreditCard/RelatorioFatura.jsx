import { useState, useMemo } from 'react'
import { categoriaParaExportar } from '../../lib/rateio'
import { Download, FileBarChart, AlertTriangle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useScrollScope } from '../../hooks/useScrollRestoration'
import { fmt, fmtDate, today } from '../shared/utils'
import { faturaDoCartao } from '../../lib/fatura'
import { controleGerencialAtivo } from '../../lib/controleGerencial'
import {
  lancamentosDaFatura, faturasDoCartao, faturaAtualDoCartao, rotuloFatura, resumoGerencialDaFatura, chaveDoGrupo,
} from '../../lib/faturaCartao'
import { agendamentosPrevistosDaFatura } from '../../lib/gerencialPrevistos'
import SeloCambio from '../shared/SeloCambio'
import { exportarExcel, entregarArquivo, nomeArquivoFinup } from '../../lib/exportExcel'
import { gerarCsv } from '../../lib/csvFinup'
import HelpCampo from '../shared/HelpCampo'
import ExtratoGerencial from './ExtratoGerencial'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const pct = (v, total) => (total > 0 ? `${((v / total) * 100).toFixed(0)}%` : '')

// Badge do grupo gerencial — mesmas cores da tela do cartão: G = reserva; D = cinza; numerados = laranja.
function GerBadge({ grupo }) {
  if (!grupo) return <span className="text-texto-3 text-xs">sem grupo</span>
  let cls = 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold'
  if (grupo.number === 1) cls += ' bg-reserva/20 text-reserva'
  else if (grupo.number === 'D') cls += ' bg-surface-hover/60 text-texto-3'
  else cls += ' bg-despesa/20 text-despesa'
  return <span className={cls}>{grupo.alias}</span>
}

function InstallmentBadge({ num, total }) {
  if (!num || num <= 0) return null
  return <span className="mt-0.5 inline-block bg-surface-2 text-texto-2 text-xs px-1.5 py-0.5 rounded font-medium">{num}/{total || '?'}</span>
}

// Card clicável do resumo: filtra a tabela; clicar de novo volta à fatura inteira.
function CardResumo({ titulo, valor, total, cor = 'text-texto-2', borda = '', ativo, onClick, sinal = '', testid }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} data-testid={testid}
      className={`card text-left transition-colors hover:bg-surface-hover ${borda} ${ativo ? 'ring-2 ring-primary' : ''}`}>
      <p className={`text-xs uppercase tracking-wide mb-1 ${cor}`}>{titulo}</p>
      <p className={`text-xl font-bold ${cor}`}>{sinal}{fmt(valor)}</p>
      {total > 0 && <p className="text-xs text-texto-3 mt-0.5">{pct(valor, total)}</p>}
    </button>
  )
}

// RELATÓRIO GERENCIAL DA FATURA ("Relatório da Fatura" com o controle gerencial desligado).
// Mesma fonte e mesmo total do card "Fatura Selecionada" e do Extrato da Fatura (lib/faturaCartao):
// lançamentos pela competência da fatura, despesas − estornos; pagamentos fora.
//   • Fatura padrão: a escolhida na tela do cartão (initialBillKey); pelo menu ou ao trocar de
//     cartão, a fatura ATUAL (a que contém hoje), nunca a última futura.
//   • Cards: G, grupos 2..N, D, "Sem grupo" e Estornos — a mesma soma da linha de resumo da tela do
//     cartão. Σ grupos + sem grupo − estornos = total; se não fechar, aviso com a diferença.
//   • Aba "Extrato gerencial por data": o antigo Extrato Gerencial (ExtratoGerencial), só mudou de lugar.
export default function RelatorioFatura({ initialCardId, initialBillKey }) {
  const {
    profileAccounts: accounts = [], profileTransactions: transactions = [], profileSchedules: schedules = [],
    getOccurrencesProjecao, categories = [], gerencialGroups = [], settings, rateiosByLancamento,
  } = useApp()
  const gerencialLigado = controleGerencialAtivo(settings)
  const titulo = gerencialLigado ? 'Relatório Gerencial da Fatura' : 'Relatório da Fatura'
  useScrollScope('credit:relatorio')

  const creditCards = useMemo(() => accounts.filter(a => a.type === 'credit' && a.active !== false), [accounts])
  const [cardId, setCardId] = useState(initialCardId || creditCards[0]?.id || '')
  const card = accounts.find(a => a.id === cardId) || null
  const [billKey, setBillKey] = useState(() => initialBillKey || faturaAtualDoCartao(card, today()))
  const [filtro, setFiltro] = useState(null) // id do grupo | 'sem' | 'estorno' | id da categoria
  const [aba, setAba] = useState('fatura')

  const trocarCartao = (id) => {
    setCardId(id)
    setBillKey(faturaAtualDoCartao(accounts.find(a => a.id === id), today()))
    setFiltro(null)
  }

  const faturas = useMemo(() => faturasDoCartao(transactions, card, today()), [transactions, card])
  const fatura = useMemo(() => lancamentosDaFatura(transactions, card, billKey), [transactions, card, billKey])
  const resumo = useMemo(() => resumoGerencialDaFatura(fatura, gerencialGroups), [fatura, gerencialGroups])
  const grupoPorId = useMemo(() => new Map(gerencialGroups.map(g => [g.id, g])), [gerencialGroups])
  const previstos = useMemo(() => (card && billKey
    ? agendamentosPrevistosDaFatura({ schedules, cardId: card.id, billKey, getOccurrences: getOccurrencesProjecao, billKeyOf: d => faturaDoCartao(d, card) })
    : []), [schedules, card, billKey, getOccurrencesProjecao])
  const totalPrevisto = round2(previstos.reduce((s, p) => s + p.amount, 0))

  const nomeCategoria = (tx) => {
    const r = rateiosByLancamento?.get?.(tx.id)
    if (r?.length) return categoriaParaExportar(tx, r, categories)
    return categories.find(c => c.id === tx.categoryId)?.name || ''
  }
  // Sem controle gerencial: total por categoria (despesas; estornos à parte).
  const porCategoria = useMemo(() => {
    const m = new Map()
    for (const tx of fatura.despesas) {
      const k = tx.categoryId || 'sem'
      m.set(k, round2((m.get(k) || 0) + (Number(tx.amount) || 0)))
    }
    return [...m.entries()].map(([id, valor]) => ({ id, valor, nome: categories.find(c => c.id === id)?.name || 'Sem categoria' }))
      .sort((a, b) => b.valor - a.valor)
  }, [fatura, categories])

  const linhasTabela = useMemo(() => {
    if (!filtro) return fatura.lancamentos
    if (gerencialLigado) return fatura.lancamentos.filter(tx => chaveDoGrupo(tx, gerencialGroups) === filtro)
    if (filtro === 'estorno') return fatura.estornos
    return fatura.despesas.filter(tx => (tx.categoryId || 'sem') === filtro)
  }, [fatura, filtro, gerencialLigado, gerencialGroups])
  const alternar = (k) => setFiltro(f => (f === k ? null : k))
  const grupoDe = (tx) => (tx.type === 'income' ? null : grupoPorId.get(tx.grupoGerencial) || null)
  const nomeCartao = card ? (card.apelido || card.name) : ''

  const linhasExport = () => fatura.lancamentos.map(tx => {
    const g = grupoDe(tx)
    return {
      data: tx.date, desc: tx.description || '', descOrig: tx.notes || '', fatura: rotuloFatura(billKey),
      categoria: nomeCategoria(tx), favorecido: tx.payee || '',
      grupo: tx.type === 'income' ? 'Estorno' : g ? g.alias : 'Sem grupo',
      parcela: tx.installmentNum > 0 ? `${tx.installmentNum}/${tx.installmentTotal || '?'}` : '',
      valor: tx.type === 'income' ? -tx.amount : tx.amount,
    }
  })
  const linhasResumo = () => (gerencialLigado
    ? [
        ...resumo.grupos.map(({ grupo, total }) => ({ item: `${grupo.alias} · ${grupo.name}`, valor: total, pct: pct(total, fatura.total) })),
        ...(resumo.semGrupo ? [{ item: 'Sem grupo', valor: resumo.semGrupo, pct: pct(resumo.semGrupo, fatura.total) }] : []),
        ...(resumo.estornos ? [{ item: 'Estornos', valor: -resumo.estornos, pct: '' }] : []),
      ]
    : [
        ...porCategoria.map(c => ({ item: c.nome, valor: c.valor, pct: pct(c.valor, fatura.total) })),
        ...(fatura.totalEstornos ? [{ item: 'Estornos', valor: -fatura.totalEstornos, pct: '' }] : []),
      ])

  // Excel: a fatura inteira (com a coluna do grupo) + aba "Resumo" com os totais. Erros viram mensagem.
  const exportarXlsx = async () => {
    try {
      const filtros = [`Cartão: ${nomeCartao}`, `Fatura: ${rotuloFatura(billKey)}`]
      await exportarExcel({
        abas: [
          {
            nome: 'Fatura', titulo: `${titulo} — ${nomeCartao}`, filtros,
            resumo: [{ rotulo: 'Total da fatura', soma: 'valor' }],
            colunas: [
              { chave: 'data', titulo: 'Data', tipo: 'data' }, { chave: 'desc', titulo: 'Descrição' },
              { chave: 'descOrig', titulo: 'Descrição original' }, { chave: 'fatura', titulo: 'Fatura' },
              { chave: 'categoria', titulo: 'Categoria' }, { chave: 'favorecido', titulo: 'Favorecido' },
              ...(gerencialLigado ? [{ chave: 'grupo', titulo: 'Grupo Gerencial' }] : []),
              { chave: 'parcela', titulo: 'Parcela' },
              { chave: 'valor', titulo: 'Valor', tipo: 'moeda', cor: (l) => (l.valor < 0 ? 'receita' : 'despesa') },
            ],
            linhas: linhasExport(),
            totais: { rotulo: (n) => `${n} ${n === 1 ? 'lançamento' : 'lançamentos'}`, somar: ['valor'] },
          },
          {
            nome: 'Resumo', titulo: `Resumo — ${nomeCartao}`, filtros,
            colunas: [
              { chave: 'item', titulo: gerencialLigado ? 'Grupo' : 'Categoria' },
              { chave: 'valor', titulo: 'Valor', tipo: 'moeda', cor: (l) => (l.valor < 0 ? 'receita' : null) },
              { chave: 'pct', titulo: '%' },
            ],
            linhas: linhasResumo(),
            totais: { titulo: 'TOTAL DA FATURA', rotulo: () => '', somar: ['valor'] },
          },
        ],
        nomeArquivo: { relatorio: `${gerencialLigado ? 'Relatorio-Gerencial' : 'Relatorio'}-Fatura-${nomeCartao}`, periodo: billKey },
      })
    } catch (err) {
      window.alert(`Não consegui exportar o Excel: ${err?.message || err}`)
    }
  }

  const exportarCsv = async () => {
    try {
      const cab = ['Data', 'Descrição', 'Descrição original', 'Fatura', 'Categoria', 'Favorecido', ...(gerencialLigado ? ['Grupo Gerencial'] : []), 'Parcela', 'Valor']
      const csv = gerarCsv(cab, linhasExport().map(l => [
        fmtDate(l.data), l.desc, l.descOrig, l.fatura, l.categoria, l.favorecido, ...(gerencialLigado ? [l.grupo] : []), l.parcela, l.valor,
      ]))
      await entregarArquivo(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }),
        nomeArquivoFinup(`Relatorio-Fatura-${nomeCartao}`, billKey).replace(/\.xlsx$/, '.csv'), { tipo: 'text/csv' })
    } catch (err) {
      window.alert(`Não consegui exportar o CSV: ${err?.message || err}`)
    }
  }

  const colunas = gerencialLigado ? 6 : 5
  return (
    <div className="space-y-4" data-testid="relatorio-fatura">
      <div className="card">
        <h2 className="text-sm font-semibold text-texto-2 mb-4 flex items-center gap-2">
          <FileBarChart size={14} className="text-primary-fg" /> {titulo}
        </h2>
        <div className="flex flex-wrap items-end gap-3" data-help-form="filtrosRelatorioFatura">
          <div className="flex-1 min-w-36" data-help-id="filtroFatura.cartao">
            <label className="label" htmlFor="relfat-cartao">Cartão<HelpCampo campo="filtroFatura.cartao" /></label>
            <select id="relfat-cartao" className="input" value={cardId} onChange={e => trocarCartao(e.target.value)}>
              {creditCards.map(c => <option key={c.id} value={c.id}>{c.apelido || c.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-52" data-help-id="filtroFatura.fatura">
            <label className="label" htmlFor="relfat-fatura">Fatura<HelpCampo campo="filtroFatura.fatura" /></label>
            <select id="relfat-fatura" className="input" value={billKey} onChange={e => { setBillKey(e.target.value); setFiltro(null) }}>
              {faturas.map(f => <option key={f.key} value={f.key}>{f.rotulo}</option>)}
            </select>
          </div>
          <button className="btn-secondary flex items-center gap-2" onClick={exportarCsv} disabled={!fatura.lancamentos.length}>
            <Download size={14} /> Exportar CSV
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={exportarXlsx} disabled={!fatura.lancamentos.length}
            title="Exportar a fatura inteira e o resumo para Excel (.xlsx)">
            <Download size={14} /> Exportar Excel
          </button>
        </div>
      </div>

      {gerencialLigado && (
        <div className="flex items-center gap-1 border-b border-borda" role="tablist">
          {[['fatura', 'Fatura por grupo'], ['gerencial', 'Extrato gerencial por data']].map(([id, rot]) => (
            <button key={id} role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
              className={`px-3 pb-2 text-sm font-medium border-b-2 -mb-px ${aba === id ? 'border-primary text-primary-fg' : 'border-transparent text-texto-3 hover:text-texto-2'}`}>
              {rot}
            </button>
          ))}
        </div>
      )}

      {gerencialLigado && aba === 'gerencial' ? (
        <ExtratoGerencial key={cardId} initialCardId={cardId} />
      ) : (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <button type="button" onClick={() => setFiltro(null)} aria-pressed={!filtro} data-testid="card-total"
              className={`card text-left ${!filtro ? 'ring-2 ring-primary' : ''}`}>
              <p className="text-xs text-texto-2 uppercase tracking-wide mb-1">Total Fatura</p>
              <p className="text-xl font-bold text-despesa" data-testid="relatorio-fatura-total">{fmt(fatura.total)}</p>
              <p className="text-xs text-texto-3 mt-0.5">{fatura.lancamentos.length} lançamento{fatura.lancamentos.length !== 1 ? 's' : ''}</p>
            </button>
            {gerencialLigado ? (
              <>
                {resumo.grupos.map(({ grupo, total }) => (
                  <CardResumo key={grupo.id} testid={`card-grupo-${grupo.alias}`} titulo={`${grupo.alias} · ${grupo.name}`} valor={total} total={fatura.total}
                    cor={grupo.number === 1 ? 'text-reserva' : grupo.number === 'D' ? 'text-texto-2' : 'text-despesa'}
                    borda={grupo.number === 1 ? 'border-reserva/25' : grupo.number === 'D' ? '' : 'border-despesa/25'}
                    ativo={filtro === grupo.id} onClick={() => alternar(grupo.id)} />
                ))}
                {resumo.semGrupo > 0 && (
                  <CardResumo testid="card-sem-grupo" titulo="Sem grupo" valor={resumo.semGrupo} total={fatura.total} ativo={filtro === 'sem'} onClick={() => alternar('sem')} />
                )}
              </>
            ) : (
              porCategoria.map(c => (
                <CardResumo key={c.id} titulo={c.nome} valor={c.valor} total={fatura.total} ativo={filtro === c.id} onClick={() => alternar(c.id)} />
              ))
            )}
            {fatura.totalEstornos > 0 && (
              <CardResumo testid="card-estornos" titulo="Estornos" valor={fatura.totalEstornos} sinal="−" cor="text-receita" ativo={filtro === 'estorno'} onClick={() => alternar('estorno')} />
            )}
          </div>

          {gerencialLigado && Math.abs(resumo.diferenca) > 0.005 && (
            <p role="alert" className="flex items-center gap-1.5 text-xs text-aviso">
              <AlertTriangle size={13} /> A soma dos grupos ({fmt(resumo.fechamento)}) não fecha com o total da fatura ({fmt(fatura.total)}): diferença de {fmt(resumo.diferenca)}.
            </p>
          )}
          {totalPrevisto > 0 && (
            <p className="text-xs text-texto-3">
              Há {fmt(totalPrevisto)} em compras agendadas para esta fatura que ainda não viraram lançamento. Elas não entram neste relatório (na tela do cartão, os grupos aparecem com * quando incluem previstos).
            </p>
          )}

          {fatura.lancamentos.length === 0 ? (
            <div className="card text-center py-12"><p className="text-texto-3 text-sm">Nenhum lançamento nesta fatura</p></div>
          ) : (
            <div className="card p-0 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-borda text-left">
                    <th className="px-3 py-3 text-xs text-texto-2 font-medium whitespace-nowrap">Data</th>
                    <th className="px-3 py-3 text-xs text-texto-2 font-medium">Descrição</th>
                    <th className="px-3 py-3 text-xs text-texto-2 font-medium hidden md:table-cell">Categoria</th>
                    <th className="px-3 py-3 text-xs text-texto-2 font-medium hidden lg:table-cell">Favorecido</th>
                    {gerencialLigado && <th className="px-3 py-3 text-xs text-texto-2 font-medium">Ger.</th>}
                    <th className="px-3 py-3 text-xs text-texto-2 font-medium text-right whitespace-nowrap">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasTabela.map(tx => {
                    const estorno = tx.type === 'income'
                    return (
                      <tr key={tx.id} className="border-b border-borda/50 hover:bg-surface-hover/30 transition-colors" data-testid="relatorio-fatura-linha">
                        <td className="px-3 py-2.5 text-texto-2 whitespace-nowrap text-xs align-top">{fmtDate(tx.date)}</td>
                        <td className="px-3 py-2.5 text-texto-1 max-w-xs align-top">
                          <p className="truncate">{tx.description}</p>
                          {tx.notes && <p className="text-xs text-texto-3 truncate">{tx.notes}</p>}
                          <InstallmentBadge num={tx.installmentNum} total={tx.installmentTotal} />
                          {tx.payee && <p className="text-xs text-texto-3 lg:hidden">{tx.payee}</p>}
                        </td>
                        <td className="px-3 py-2.5 align-top hidden md:table-cell text-xs text-texto-2">{nomeCategoria(tx) || <span className="text-texto-3">—</span>}</td>
                        <td className="px-3 py-2.5 align-top hidden lg:table-cell text-xs text-texto-2">{tx.payee || <span className="text-texto-3">—</span>}</td>
                        {gerencialLigado && (
                          <td className="px-3 py-2.5 align-top">{estorno ? <span className="text-xs text-receita">estorno</span> : <GerBadge grupo={grupoDe(tx)} />}</td>
                        )}
                        <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap align-top ${estorno ? 'text-receita' : 'text-despesa'}`}>
                          {estorno ? `−${fmt(tx.amount)}` : fmt(tx.amount)}
                          {(tx.moeda || tx.estimado) && <div className="mt-0.5 font-normal"><SeloCambio tx={tx} /></div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-borda-forte bg-surface-2/60">
                    <td className="px-3 py-3 text-xs text-texto-2 font-bold" colSpan={colunas - 1}>
                      {filtro ? `Filtrado · ${linhasTabela.length} de ${fatura.lancamentos.length} lançamentos` : `Total · ${fatura.lancamentos.length} lançamento${fatura.lancamentos.length !== 1 ? 's' : ''}`}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-despesa whitespace-nowrap">
                      {fmt(filtro ? round2(linhasTabela.reduce((s, t) => s + (t.type === 'income' ? -t.amount : t.amount), 0)) : fatura.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
