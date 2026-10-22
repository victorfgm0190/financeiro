import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { MoreHorizontal, Edit2, Trash2, ChevronRight } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'
import { gastoEnvelopes, currentCompetencia, resumosPorUso, totaisEnvelopes, barraEnvelope, ehParcela } from '../../lib/envelopes'
import Modal from '../shared/Modal'

// Peças da exibição dos envelopes, compartilhadas pela tela Envelopes, pelo card "Envelopes do mês"
// do Painel e pelo card do Início no celular. Os números vêm de gastoEnvelopes (via resumoEnvelope);
// nada aqui calcula gasto.

const fmtPadrao = (n) => fmt(n)

// Cores da barra pelo % usado (decisão 11): parcelado no tom cheio, à vista no tom claro do
// mesmo estado. Tokens --color-barra-* (index.css), com valores próprios em cada tema.
function coresBarra(pct) {
  if (pct > 100) return ['bg-barra-estouro', 'bg-barra-estouro-claro']
  if (pct > 80) return ['bg-barra-alerta', 'bg-barra-alerta-claro']
  return ['bg-barra-ok', 'bg-barra-ok-claro']
}

const rotuloCompetencia = (comp) => {
  const s = format(new Date(comp.year, comp.month0, 1), "MMMM 'de' yyyy", { locale: ptBR })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Faixa com os 3 totais. Cabe em 390px: grade de 3 colunas, fonte menor no celular, sem cortar.
export function TotaisEnvelopes({ totais, v = fmtPadrao, embutido = false }) {
  const estourou = totais.disponivel < 0
  const celulas = [
    { rotulo: 'Total limite', valor: v(totais.limite), cor: 'text-texto-1' },
    { rotulo: 'Já gasto', valor: v(totais.gasto), cor: 'text-despesa' },
    { rotulo: estourou ? 'Estourou' : 'Ainda posso gastar', valor: v(Math.abs(totais.disponivel)), cor: estourou ? 'text-perigo' : 'text-primary-fg' },
  ]
  return (
    <div className={`grid grid-cols-3 divide-x divide-borda ${embutido ? 'rounded-lg bg-surface-2/50' : 'card p-0'}`}>
      {celulas.map(c => (
        <div key={c.rotulo} className="min-w-0 px-2 py-2.5 sm:px-4 sm:py-3">
          <p className="text-[10px] sm:text-xs text-texto-2 uppercase tracking-wide leading-tight">{c.rotulo}</p>
          <p className={`mt-1 text-[13px] min-[400px]:text-sm sm:text-xl font-bold tabular-nums whitespace-nowrap ${c.cor}`}>{c.valor}</p>
        </div>
      ))}
    </div>
  )
}

// Barra em dois tons: parcelado (cheio) + à vista (claro).
export function BarraEnvelope({ r, alta = false }) {
  const w = barraEnvelope(r)
  const [cheio, claro] = coresBarra(r.pct)
  return (
    <div
      className={`${alta ? 'h-2.5' : 'h-2'} bg-surface-2 rounded-full overflow-hidden flex`}
      role="progressbar"
      aria-valuenow={Math.round(r.pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${r.env.name}: ${Math.round(r.pct)}% usado`}
    >
      <div className={`h-full ${cheio}`} style={{ width: `${w.parcelado}%` }} title="Parcelado" />
      <div className={`h-full ${claro}`} style={{ width: `${w.aVista}%` }} title="À vista" />
    </div>
  )
}

// Menu "⋯" de um envelope (Editar / Excluir). Sem nenhuma ação permitida, não aparece.
export function MenuEnvelope({ nome, onEditar, onExcluir }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('touchstart', fora)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('touchstart', fora) }
  }, [aberto])
  if (!onEditar && !onExcluir) return null
  const item = 'w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-surface-hover'
  return (
    <div ref={ref} className="relative shrink-0 -mr-1.5 -mt-1.5">
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        aria-label={`Opções do envelope ${nome}`}
        aria-expanded={aberto}
        className="w-9 h-9 flex items-center justify-center rounded-md text-texto-3 hover:text-texto-1 hover:bg-surface-hover"
      >
        <MoreHorizontal size={16} />
      </button>
      {aberto && (
        <div className="absolute right-0 top-full mt-1 z-30 w-40 bg-surface border border-borda-forte rounded-lg shadow-2xl py-1">
          {onEditar && (
            <button type="button" className={`${item} text-texto-1`} onClick={() => { setAberto(false); onEditar() }}>
              <Edit2 size={14} /> Editar
            </button>
          )}
          {onExcluir && (
            <button type="button" className={`${item} text-perigo`} onClick={() => { setAberto(false); onExcluir() }}>
              <Trash2 size={14} /> Excluir
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Conteúdo de um envelope: nome + "x categorias", barra, "Gasto R$ X de R$ Y", "Disponível R$ Z"
// (ou "Estourou R$ W" em vermelho) e "Parcelado R$ A · À vista R$ B". Tocar abre os lançamentos.
export function EnvelopeLinha({ r, v = fmtPadrao, onAbrir, menu = null, mostrarCategorias = true }) {
  const nCats = r.env.categoryIds?.length || 0
  return (
    <div className="min-w-0">
      <div className="flex items-start gap-2">
        <button type="button" onClick={onAbrir} className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold text-texto-1 truncate">{r.env.name}</p>
          {mostrarCategorias && <p className="text-[11px] text-texto-3">{nCats} categoria{nCats !== 1 ? 's' : ''}</p>}
        </button>
        {menu}
      </div>
      <button type="button" onClick={onAbrir} className="block w-full text-left mt-2" aria-label={`Ver lançamentos de ${r.env.name}`}>
        <BarraEnvelope r={r} />
        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
          <span className="text-texto-2">
            Gasto <span className="text-texto-1 font-medium tabular-nums">{v(r.gasto)}</span> de <span className="tabular-nums">{v(r.limite)}</span>
          </span>
          {r.estourado
            ? <span className="text-perigo font-semibold tabular-nums">Estourou {v(-r.disponivel)}</span>
            : <span className="text-texto-2">Disponível <span className="text-primary-fg font-semibold tabular-nums">{v(r.disponivel)}</span></span>}
        </div>
        <p className="mt-0.5 text-[11px] text-texto-3 tabular-nums">Parcelado {v(r.parcelado)} · À vista {v(r.aVista)}</p>
      </button>
    </div>
  )
}

// Selo "Parcela x/y" (campos installment_num/total do lançamento).
function SeloParcelaTx({ tx }) {
  if (!ehParcela(tx)) return null
  return (
    <span title="Parcela de compra parcelada" className="text-[10px] px-1 py-0.5 rounded bg-surface-hover/60 text-texto-2 font-medium whitespace-nowrap shrink-0">
      Parcela {tx.installmentNum}/{tx.installmentTotal}
    </span>
  )
}

// Modal de lançamentos do envelope (o mesmo da tela Envelopes, no Painel e no Início).
export function EnvelopeDetalhe({ r, compLabel, v = fmtPadrao }) {
  const { categories, profileAccounts: accounts } = useApp()
  const account = accounts.find(a => a.id === r.env.accountId)
  const sortedTxs = [...r.txs].sort((a, b) => b.date.localeCompare(a.date))
  const kpi = 'text-sm sm:text-base font-bold tabular-nums whitespace-nowrap'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="card py-3 px-2 text-center min-w-0">
          <p className="text-[10px] sm:text-xs text-texto-3 uppercase tracking-wide mb-1">Limite</p>
          <p className={`${kpi} text-texto-1`}>{v(r.limite)}</p>
        </div>
        <div className="card py-3 px-2 text-center min-w-0">
          <p className="text-[10px] sm:text-xs text-texto-3 uppercase tracking-wide mb-1">Gasto</p>
          <p className={`${kpi} text-despesa`}>{v(r.gasto)}</p>
        </div>
        <div className="card py-3 px-2 text-center min-w-0">
          <p className="text-[10px] sm:text-xs text-texto-3 uppercase tracking-wide mb-1">{r.estourado ? 'Estourou' : 'Restante'}</p>
          <p className={`${kpi} ${r.estourado ? 'text-perigo' : 'text-primary-fg'}`}>{v(Math.abs(r.disponivel))}</p>
        </div>
      </div>

      <div className="text-xs text-texto-3 flex flex-wrap gap-x-4 gap-y-1">
        <span>Competência: <span className="text-texto-2">{compLabel}</span></span>
        {account && <span>Conta: {account.apelido || account.name}</span>}
        <span>Parcelado <span className="text-texto-2">{v(r.parcelado)}</span> · À vista <span className="text-texto-2">{v(r.aVista)}</span></span>
      </div>

      {sortedTxs.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-texto-3 text-sm">Nenhum lançamento neste período</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borda">
                <th className="text-left py-2 px-1 text-xs text-texto-2 font-medium w-24">Data</th>
                <th className="text-left py-2 px-1 text-xs text-texto-2 font-medium">Descrição</th>
                <th className="text-left py-2 px-1 text-xs text-texto-2 font-medium hidden sm:table-cell">Categoria</th>
                <th className="text-right py-2 px-1 text-xs text-texto-2 font-medium w-28">Valor</th>
              </tr>
            </thead>
            <tbody>
              {sortedTxs.map(tx => {
                const cat = categories.find(c => c.id === tx.categoryId)
                const d = tx.date
                return (
                  <tr key={tx.id} className="border-b border-borda/40 hover:bg-surface-hover/20">
                    <td className="py-2.5 px-1 text-xs text-texto-2 whitespace-nowrap">
                      {d.slice(8)}/{d.slice(5, 7)}/{d.slice(0, 4)}
                    </td>
                    <td className="py-2.5 px-1 text-xs text-texto-2 max-w-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{tx.description}</span>
                        <SeloParcelaTx tx={tx} />
                      </div>
                    </td>
                    <td className="py-2.5 px-1 text-xs text-texto-2 hidden sm:table-cell">
                      {cat ? `${cat.icon} ${cat.name}` : '—'}
                    </td>
                    <td className="py-2.5 px-1 text-xs font-semibold text-despesa text-right whitespace-nowrap">
                      {v(tx.amount)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-borda-forte">
                <td colSpan={2} className="py-2.5 px-1 text-xs text-texto-2 font-semibold">Total</td>
                <td className="hidden sm:table-cell" />
                <td className="py-2.5 px-1 text-xs font-bold text-despesa text-right">{v(r.gasto)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// Envelopes da competência ATUAL (a do Painel / Início), perfil ativo, ordenados por % usado.
function useEnvelopesDoMes() {
  const { envelopes, profileTransactions, settings } = useApp()
  const startDay = settings?.financialMonthStartDay || 1
  const comp = currentCompetencia(startDay)
  const compKey = comp.year * 12 + comp.month0
  return useMemo(() => {
    const resumos = resumosPorUso(gastoEnvelopes(envelopes, profileTransactions, compKey, startDay))
    const compLabel = rotuloCompetencia({ year: Math.floor(compKey / 12), month0: compKey % 12 })
    return { resumos, totais: totaisEnvelopes(resumos), compLabel }
  }, [envelopes, profileTransactions, compKey, startDay])
}

// Lista + modal, usada pelo card do Painel e pelo do Início.
function ListaEnvelopesMes({ resumos, totais, compLabel, v, colunas }) {
  const [abertoId, setAbertoId] = useState(null)
  const aberto = resumos.find(r => r.env.id === abertoId)
  return (
    <>
      <TotaisEnvelopes totais={totais} v={v} embutido />
      <ul className={`mt-3 ${colunas ? 'grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-4'}`}>
        {resumos.map(r => (
          <li key={r.env.id}>
            <EnvelopeLinha r={r} v={v} onAbrir={() => setAbertoId(r.env.id)} mostrarCategorias={false} />
          </li>
        ))}
      </ul>
      {aberto && (
        <Modal open onClose={() => setAbertoId(null)} title={`${aberto.env.name} — ${compLabel}`} size="lg">
          <EnvelopeDetalhe r={aberto} compLabel={compLabel} v={v} />
        </Modal>
      )}
    </>
  )
}

// Card "Envelopes do mês" do Painel (computador). Sem envelopes cadastrados, não aparece.
export function CardEnvelopesMes({ onVerEnvelopes }) {
  const dados = useEnvelopesDoMes()
  if (dados.resumos.length === 0) return null
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-texto-2">
          Envelopes do mês <span className="font-normal text-texto-3">· {dados.compLabel}</span>
        </h3>
        {onVerEnvelopes && (
          <button type="button" onClick={onVerEnvelopes} className="flex items-center gap-0.5 text-xs text-primary-fg hover:text-texto-1 font-medium">
            Ver envelopes <ChevronRight size={13} />
          </button>
        )}
      </div>
      <ListaEnvelopesMes {...dados} v={fmtPadrao} colunas />
    </section>
  )
}

// Corpo do card Envelopes no Início do celular (o título e o "Ver tudo" vêm do Início).
export function EnvelopesInicio({ v }) {
  const dados = useEnvelopesDoMes()
  if (dados.resumos.length === 0) return <p className="text-xs text-texto-3">Nenhum envelope criado.</p>
  return <ListaEnvelopesMes {...dados} v={v} />
}
