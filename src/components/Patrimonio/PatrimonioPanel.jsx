import { useMemo, useState } from 'react'
import { format, subMonths, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Home, AlertTriangle, TrendingUp, Landmark, RefreshCw, ChevronRight, Edit2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtSinal } from '../shared/utils'
import Modal from '../shared/Modal'
import BemDetail from './BemDetail'
import { valorPatrimonial } from '../../lib/patrimonio'
import { usePatrimonioTotals } from '../../hooks/usePatrimonioTotals'
import { ABRIR_FATURA_KEY, ABRIR_EXTRATO_KEY, ABRIR_BEM_KEY, deixarHandoff, lerHandoff } from '../../lib/abrirTela'
import ComposicaoPatrimonioModal from './ComposicaoPatrimonioModal'
import ConsultaFinanciamentoModal from './ConsultaFinanciamentoModal'
import { ehContaDeFinanciamento } from '../../lib/financiamento'
import { useThemeColors } from '../../hooks/useTheme'
import InputMoeda from '../shared/InputMoeda'

function UpdateValueModal({ account, onClose }) {
  const { updateAccountValue, pode } = useApp()
  const podeSalvar = pode('patrimonio', 'editar')
  const [newValue, setNewValue] = useState(String(account.balance ?? ''))
  const [note, setNote] = useState('')
  const lastEntry = (account.valueHistory || []).slice(-1)[0]

  const handleSubmit = (e) => {
    e.preventDefault()
    if (newValue === '' || !podeSalvar) return
    updateAccountValue(account.id, Number(newValue), note)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {lastEntry && (
        <div className="p-3 bg-surface-2 rounded-lg text-xs text-texto-2">
          Último valor: <span className="text-texto-1 font-medium">{fmt(lastEntry.value)}</span> em {lastEntry.date}
          {lastEntry.note && <span className="ml-1 italic">— {lastEntry.note}</span>}
        </div>
      )}
      <div>
        <label className="label">Novo Valor (R$) *</label>
        <InputMoeda
          negativo
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          placeholder="0,00"
          autoFocus
          required
        />
      </div>
      <div>
        <label className="label">Observação</label>
        <input
          className="input"
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Digite uma observação (opcional)"
        />
      </div>
      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        {podeSalvar && <button type="submit" className="btn-primary flex-1">Atualizar</button>}
      </div>
      {!podeSalvar && <p className="text-xs text-texto-3">Somente leitura — seu nível de acesso não permite gravar.</p>}
    </form>
  )
}

function ValueHistoryList({ account }) {
  const history = [...(account.valueHistory || [])].sort((a, b) => b.date.localeCompare(a.date))
  if (history.length === 0) return <p className="text-xs text-texto-3 py-2">Sem histórico de atualizações.</p>
  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {history.map((h, i) => (
        <div key={h.id || i} className="flex items-center justify-between text-xs py-1.5 border-b border-borda last:border-0">
          <span className="text-texto-3">{h.date}</span>
          <span className="text-texto-1 font-medium">{fmt(h.value)}</span>
          {h.note && <span className="text-texto-3 italic truncate max-w-[120px]">{h.note}</span>}
        </div>
      ))}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-borda-forte rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-texto-2 mb-1">{label}</p>
      <p className="text-receita font-bold">{fmt(payload[0]?.value ?? 0)}</p>
    </div>
  )
}

export default function PatrimonioPanel({ setActivePage }) {
  const { profileAccounts: accounts, accountGroups, pode } = useApp()
  const podeEditarPatrimonio = pode('patrimonio', 'editar')
  const cor = useThemeColors()
  const [updateValueAccount, setUpdateValueAccount] = useState(null)
  const [expandedHistory, setExpandedHistory] = useState(null)
  // "Abrir bem" vindo de outra tela (composição do PL em Contas) — lido uma vez, na montagem.
  const [detalheBem, setDetalheBem] = useState(() => {
    const v = lerHandoff(ABRIR_BEM_KEY)
    return v ? accounts.find(a => a.id === v.accountId) || null : null
  })

  // Conta de dívida de financiamento clicada → consulta; "Abrir a parcela" abre o bem na parcela.
  const [consultaFin, setConsultaFin] = useState(null)
  const [parcelaInicial, setParcelaInicial] = useState(null)

  // Categorias, totais e itens de cada total — fonte única (cards, Resumo, gráfico e composição).
  const { categorized, totals } = usePatrimonioTotals()

  // Composição do card/linha clicada. Os destinos navegam pelo handoff de abrirTela.
  const [composicao, setComposicao] = useState(null)
  const abrirConta = (conta) => { deixarHandoff(ABRIR_EXTRATO_KEY, { accountId: conta.id }); setActivePage?.('accounts') }
  const abrirFatura = (cardId, faturaMesAno) => { deixarHandoff(ABRIR_FATURA_KEY, { cardId, faturaMesAno }); setActivePage?.('credit') }
  const abrirBem = (conta) => { setComposicao(null); setDetalheBem(conta) }

  // Monthly PL evolution (last 6 months)
  const chartData = useMemo(() => {
    const today = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const refDate = subMonths(today, 5 - i)
      const monthEnd = format(endOfMonth(refDate), 'yyyy-MM-dd')
      const label = format(refDate, 'MMM/yy', { locale: ptBR })
      // Mês corrente = o mesmo PL dos cards e do Resumo (uma fonte só); o histórico de valores
      // dos bens só vale para os meses anteriores.
      if (i === 5) return { label, pl: totals.pl }

      // Asset values at this month-end: use last valueHistory entry <= monthEnd, fallback to current
      const bensVal = categorized.bens.reduce((s, a) => {
        const hist = (a.valueHistory || [])
          .filter(h => h.date <= monthEnd)
          .sort((x, y) => x.date.localeCompare(y.date))
        // Histórico de valores continua ganhando quando existe (é a avaliação daquele mês);
        // sem histórico, o fallback é o mesmo valor que o KPI usa, não o saldo.
        return s + (hist.length > 0 ? hist[hist.length - 1].value : valorPatrimonial(a))
      }, 0)

      // Financial accounts: use current (no history tracked)
      const finVal = categorized.investimentos.reduce((s, a) => s + (a.balance || 0), 0)
        + categorized.contas.reduce((s, a) => s + (a.balance || 0), 0)
      const debts = totals.dividas + totals.emprestimos + totals.cartao

      return { label, pl: bensVal + finVal - debts }
    })
  }, [categorized, totals])

  // Só apresentação: com o PL igual (ao centavo) nos 6 meses o Recharts gera ticks repetidos no eixo
  // Y (aviso de key duplicada). Nesse caso abre uma folga em volta do valor, mantendo o zero no eixo.
  const dominioY = useMemo(() => {
    const vs = chartData.map(d => d.pl)
    if (vs.length === 0 || vs.some(v => Math.round(v * 100) !== Math.round(vs[0] * 100))) return undefined
    const folga = Math.abs(vs[0]) * 0.1 || 1
    return [Math.min(0, vs[0] - folga), Math.max(0, vs[0] + folga)]
  }, [chartData])

  const hasHistory = categorized.bens.some(a => (a.valueHistory || []).length > 0)

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button type="button" onClick={() => setComposicao('bens')} className="card text-left hover:bg-surface-hover/40 transition-colors">
          <p className="text-xs text-texto-3 uppercase tracking-wide">Bens</p>
          <p className="text-lg font-bold text-receita mt-1">{fmt(totals.bens)}</p>
        </button>
        <button type="button" onClick={() => setComposicao('investimentos')} className="card text-left hover:bg-surface-hover/40 transition-colors">
          <p className="text-xs text-texto-3 uppercase tracking-wide">Investimentos</p>
          <p className="text-lg font-bold text-receita mt-1">{fmt(totals.investimentos)}</p>
        </button>
        <button type="button" onClick={() => setComposicao('contas')} className="card text-left hover:bg-surface-hover/40 transition-colors">
          <p className="text-xs text-texto-3 uppercase tracking-wide">Contas</p>
          <p className="text-lg font-bold text-receita mt-1">{fmt(totals.contas)}</p>
        </button>
        <button type="button" onClick={() => setComposicao('dividas')} className="card text-left hover:bg-surface-hover/40 transition-colors">
          <p className="text-xs text-texto-3 uppercase tracking-wide">Dívidas</p>
          <p className="text-lg font-bold text-despesa mt-1">{fmt(totals.dividas)}</p>
        </button>
        <button type="button" onClick={() => setComposicao('cartao')} className="card text-left hover:bg-surface-hover/40 transition-colors">
          <p className="text-xs text-texto-3 uppercase tracking-wide">Cartão</p>
          <p className="text-lg font-bold text-despesa mt-1">{fmt(totals.cartao)}</p>
        </button>
        <button type="button" onClick={() => setComposicao('pl')} className="card text-left border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors">
          <p className="text-xs text-primary-fg uppercase tracking-wide font-semibold">Patrimônio Líquido</p>
          <p className={`text-lg font-bold mt-1 ${totals.pl >= 0 ? 'text-receita' : 'text-despesa'}`}>{fmtSinal(totals.pl)}</p>
        </button>
      </div>

      {/* Evolution Chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-texto-2">Evolução do Patrimônio Líquido</h2>
          {!hasHistory && (
            <span className="text-xs text-texto-3 italic">Atualize valores de bens para ver a evolução real</span>
          )}
        </div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="plGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={cor.receita} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={cor.receita} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={cor.chartGrade} />
              <XAxis dataKey="label" tick={{ fill: cor.chartEixo, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: cor.chartEixo, fontSize: 10 }}
                {...(dominioY && { domain: dominioY })}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => {
                  if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`
                  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`
                  return String(v)
                }}
                width={55}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="pl"
                stroke={cor.receita}
                strokeWidth={2}
                fill="url(#plGrad)"
                dot={{ fill: cor.receita, r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bens Patrimoniais */}
      {categorized.bens.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-texto-2 flex items-center gap-2">
            <Home size={14} className="text-receita" /> Bens e Ativos
          </h2>
          <div className="space-y-2">
            {categorized.bens.map(a => {
              const gain = a.acquisitionValue != null ? a.balance - a.acquisitionValue : null
              const pct = a.acquisitionValue ? ((a.balance - a.acquisitionValue) / a.acquisitionValue) * 100 : null
              const isExpanded = expandedHistory === a.id
              return (
                <div key={a.id} className="card">
                  <div className="flex items-center justify-between">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setDetalheBem(a)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetalheBem(a) } }}
                      className="min-w-0 flex-1 cursor-pointer group -m-1 p-1 rounded-lg hover:bg-surface-hover/40 transition-colors"
                      title="Ver detalhes, financiamento e parcelas"
                    >
                      <p className="font-medium text-texto-1 text-sm flex items-center gap-1">
                        {a.name}
                        <ChevronRight size={13} className="text-texto-3 group-hover:text-primary-fg transition-colors" />
                      </p>
                      {a.bank && <p className="text-xs text-texto-3">{a.bank}</p>}
                      {a.acquisitionValue != null && (
                        <p className="text-xs text-texto-3 mt-0.5">
                          Aquisição: {fmt(a.acquisitionValue)}
                          {a.acquisitionDate && ` em ${a.acquisitionDate}`}
                          {gain !== null && (
                            <span className={`ml-2 font-medium ${gain >= 0 ? 'text-receita' : 'text-despesa'}`}>
                              {gain >= 0 ? '+' : ''}{fmt(gain)} ({pct?.toFixed(1)}%)
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <div className="text-right">
                        {/* O card mostra o mesmo número que entra no KPI de Bens, senão a
                            soma da lista não bate com o total exibido acima. */}
                        <p className="text-lg font-bold text-receita">{fmt(valorPatrimonial(a))}</p>
                        {valorPatrimonial(a) !== (a.balance || 0) && (
                          <p className="text-[11px] text-texto-3">
                            {a.patrimonioUseMethod === 'nota_fiscal' ? 'nota fiscal' : 'valor pago'}
                            {' · '}saldo {fmt(a.balance || 0)}
                          </p>
                        )}
                        {(a.valueHistory || []).length > 0 && (
                          <button
                            onClick={() => setExpandedHistory(isExpanded ? null : a.id)}
                            className="text-xs text-texto-3 hover:text-texto-2 transition-colors"
                          >
                            {isExpanded ? 'Ocultar' : `${a.valueHistory.length} atualiz.`}
                          </button>
                        )}
                      </div>
                      {/* gap-1.5 próprio: o gap-3 do container separa bem o valor dos botões,
                          mas deixaria os dois ícones soltos um do outro. */}
                      <div className="flex items-center gap-1.5">
                        {/* Mesmo destino do clique no nome do card — aqui como botão explícito,
                            já que a área clicável do nome só se anuncia pelo chevron. */}
                        <button
                          onClick={() => setDetalheBem(a)}
                          className="p-2 rounded-lg bg-surface-2 hover:bg-surface-hover text-texto-2 hover:text-texto-1 transition-colors"
                          title="Detalhar bem: nota fiscal, financiamento e parcelas"
                        >
                          <Edit2 size={13} />
                        </button>
                        {podeEditarPatrimonio && (
                        <button
                          onClick={() => setUpdateValueAccount(a)}
                          className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary-fg transition-colors"
                          title="Atualizar valor"
                        >
                          <RefreshCw size={13} />
                        </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-borda">
                      <ValueHistoryList account={a} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Investimentos (inclui contas com vínculo Patrimônio) */}
      {categorized.investimentos.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-texto-2 flex items-center gap-2">
            <Landmark size={14} className="text-receita" /> Investimentos
          </h2>
          <div className="space-y-2">
            {categorized.investimentos.map(a => (
              <div key={a.id} className="card">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-texto-1 text-sm">{a.name}</p>
                    <p className="text-xs text-texto-3">
                      {a.bank ? `${a.bank} · ` : ''}{a.vinculoTipo === 'patrimonio' ? 'Patrimônio' : 'Aplicação'}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-lg font-bold text-receita">{fmt(a.balance || 0)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dívidas e Passivos */}
      {(categorized.dividas.length > 0 || categorized.emprestimos.length > 0) && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-texto-2 flex items-center gap-2">
            <AlertTriangle size={14} className="text-despesa" /> Dívidas e Passivos
          </h2>
          <div className="space-y-2">
            {[...categorized.dividas, ...categorized.emprestimos].map(a => {
              const group = accountGroups.find(g => g.id === a.accountGroupId)
              // Financiamento: o saldo é o devedor do PRINCIPAL (a conta de dívida amortiza só o
              // principal); clicar abre a consulta. Outras dívidas seguem como sempre.
              const fin = ehContaDeFinanciamento(a)
              const Tag = fin ? 'button' : 'div'
              return (
                <Tag key={a.id} {...(fin ? { type: 'button', onClick: () => setConsultaFin(a) } : {})}
                  className={`card border border-despesa/20 w-full text-left ${fin ? 'hover:bg-surface-hover/40 transition-colors' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-texto-1 text-sm">{a.name}</p>
                      {group && <p className="text-xs text-texto-3">{group.name}</p>}
                      {a.acquisitionValue != null && (
                        <p className="text-xs text-texto-3 mt-0.5">
                          Valor original: {fmt(a.acquisitionValue)}
                          {a.acquisitionDate && ` em ${a.acquisitionDate}`}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-lg font-bold text-despesa">{fmtSinal(a.balance || 0)}</p>
                      <p className="text-xs text-texto-3">{fin ? 'Saldo devedor (principal)' : 'Saldo devedor'}</p>
                    </div>
                  </div>
                  {a.acquisitionValue > 0 && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className="h-1.5 bg-despesa rounded-full"
                          style={{ width: `${Math.min(100, (a.balance / a.acquisitionValue) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-texto-3 mt-0.5 text-right">
                        {((a.balance / a.acquisitionValue) * 100).toFixed(1)}% restante
                      </p>
                    </div>
                  )}
                </Tag>
              )
            })}
          </div>
        </div>
      )}

      {consultaFin && (
        <ConsultaFinanciamentoModal
          conta={consultaFin}
          onClose={() => setConsultaFin(null)}
          onAbrirParcela={(bemId, numero) => {
            const bem = accounts.find(x => x.id === bemId)
            if (!bem) return
            setConsultaFin(null)
            setParcelaInicial(numero)
            setDetalheBem(bem)
          }}
        />
      )}

      {/* Resumo financeiro */}
      <div className="card">
        <h2 className="text-sm font-semibold text-texto-2 mb-3 flex items-center gap-2">
          <TrendingUp size={14} className="text-texto-2" /> Resumo Patrimonial
        </h2>
        <div className="space-y-2 text-sm">
          <button type="button" onClick={() => setComposicao('bens')} className="w-full flex justify-between py-1.5 border-b border-borda hover:bg-surface-hover/40 transition-colors">
            <span className="text-texto-2">(+) Bens e Ativos</span>
            <span className="text-receita font-medium">{fmt(totals.bens)}</span>
          </button>
          <button type="button" onClick={() => setComposicao('investimentos')} className="w-full flex justify-between py-1.5 border-b border-borda hover:bg-surface-hover/40 transition-colors">
            <span className="text-texto-2">(+) Investimentos</span>
            <span className="text-receita font-medium">{fmt(totals.investimentos)}</span>
          </button>
          <button type="button" onClick={() => setComposicao('contas')} className="w-full flex justify-between py-1.5 border-b border-borda hover:bg-surface-hover/40 transition-colors">
            <span className="text-texto-2">(+) Contas Financeiras</span>
            <span className="text-receita font-medium">{fmt(totals.contas)}</span>
          </button>
          <button type="button" onClick={() => setComposicao('passivos')} className="w-full flex justify-between py-1.5 border-b border-borda hover:bg-surface-hover/40 transition-colors">
            <span className="text-texto-2">(−) Dívidas e Passivos</span>
            <span className="text-despesa font-medium">{fmt(totals.dividas + totals.emprestimos)}</span>
          </button>
          <button type="button" onClick={() => setComposicao('cartao')} className="w-full flex justify-between py-1.5 border-b border-borda hover:bg-surface-hover/40 transition-colors">
            <span className="text-texto-2">(−) Dívida Cartão de Crédito</span>
            <span className="text-despesa font-medium">{fmt(totals.cartao)}</span>
          </button>
          <button type="button" onClick={() => setComposicao('pl')} className="w-full flex justify-between py-2 font-semibold hover:bg-surface-hover/40 transition-colors">
            <span className="text-texto-1">= Patrimônio Líquido</span>
            <span className={totals.pl >= 0 ? 'text-receita' : 'text-despesa'}>{fmtSinal(totals.pl)}</span>
          </button>
        </div>
      </div>

      {/* Empty state */}
      {categorized.bens.length === 0 && categorized.dividas.length === 0 && categorized.emprestimos.length === 0 && categorized.investimentos.length === 0 && (
        <div className="card text-center py-12">
          <Landmark size={32} className="text-texto-3 mx-auto mb-3" />
          <p className="text-texto-3 text-sm">Nenhuma conta patrimonial cadastrada</p>
          <p className="text-texto-3 text-xs mt-1">Adicione contas nos grupos Imóveis, Veículos, Dívidas ou Empréstimos em Contas.</p>
        </div>
      )}

      <Modal
        open={!!updateValueAccount}
        onClose={() => setUpdateValueAccount(null)}
        title={`Atualizar Valor — ${updateValueAccount?.name || ''}`}
        size="sm"
      >
        {updateValueAccount && (
          <UpdateValueModal account={updateValueAccount} onClose={() => setUpdateValueAccount(null)} />
        )}
      </Modal>

      {composicao && (
        <ComposicaoPatrimonioModal
          tipo={composicao}
          onClose={() => setComposicao(null)}
          onAbrirConta={abrirConta}
          onAbrirBem={abrirBem}
          onAbrirFatura={abrirFatura}
        />
      )}

      {detalheBem && (
        <BemDetail conta={detalheBem} parcelaInicial={parcelaInicial} onClose={() => { setDetalheBem(null); setParcelaInicial(null) }} />
      )}
    </div>
  )
}
