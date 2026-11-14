import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { subMonths, format, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CreditCard, ArrowLeft, ArrowDownCircle, ArrowUpCircle, FileSpreadsheet, Users, Wallet, Landmark, FileText, PiggyBank } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtSinal, aplicacaoAccountIds, countsAsReportExpense, reservaDespesaFuncIds } from '../shared/utils'
import { regraDosConjuntos, totaisDoDemonstrativo } from '../../lib/regraDemonstrativo'
import RelatorioBens from './RelatorioBens'
import { useModoDespesas } from '../../hooks/useDespesasPorCategoria'
import { MODO_OPTS } from '../../lib/despesasPorCategoria'
import { Segmentado } from '../Dashboard/DespesasCategoria'
import RelatorioFatura from '../CreditCard/RelatorioFatura'
import ExtratoFatura from '../CreditCard/ExtratoFatura'
import ExtratoReservaModal from '../Reservas/ExtratoReservaModal'
import { useDadosExtratoReserva } from '../Reservas/dadosExtratoReserva'
import { controleGerencialAtivo } from '../../lib/controleGerencial'
import DemonstrativoFinanceiro from './DemonstrativoFinanceiro'
import RelatorioPorFavorecido from './RelatorioPorFavorecido'
import RelatorioRendimentos from './RelatorioRendimentos'
import FluxoCaixaPorConta from './FluxoCaixaPorConta'
import { useThemeColors } from '../../hooks/useTheme'
import { useIsMobile } from '../../hooks/useIsMobile'
import { corSerie, estiloTooltip } from '../../lib/chartPalette'
import SeletorModoValor from '../Contratos/SeletorModoValor'
import { lancamentosNoModo, MODO_VALOR_PADRAO, categoriaEspecial } from '../../lib/contratos/despesaReal'
import { isoLocal } from '../../lib/hoje'
import HelpCampo from '../shared/HelpCampo'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-borda-forte rounded-lg p-3 text-xs shadow-xl">
      <p className="text-texto-2 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {fmt(p.value)}</p>
      ))}
    </div>
  )
}

export default function ReportsPanel() {
  const { profileReportTransactions: transactions, categories, profileAccounts: accounts, reserveFunctions, abridorDeRepasse, contratos, contratosHabilitado, settings, pode } = useApp()
  const gerencialLigado = controleGerencialAtivo(settings)
  // Fluxo de Caixa da Reserva: o MESMO Extrato da função de Reservas › Fluxo Futuro, com os mesmos dados.
  const dadosReserva = useDadosExtratoReserva()
  // Card só aparece com função de reserva ligada a uma conta e acesso a Reservas (sem isso não há o que mostrar).
  const temReserva = dadosReserva.funcoes.length > 0 && (typeof pode !== 'function' || pode('reservas', 'ver'))
  const cor = useThemeColors()
  const isMobile = useIsMobile()
  const aplicSet = useMemo(() => aplicacaoAccountIds(accounts), [accounts])
  // Depósitos em reserva de funções "exibir como despesa" contam como despesa nos relatórios.
  const reservaSet = useMemo(() => new Set(accounts.filter(a => a.isReserva).map(a => a.id)), [accounts])
  const reservaDespesaFuncSet = useMemo(() => reservaDespesaFuncIds(reserveFunctions), [reserveFunctions])
  const regra = useMemo(
    () => regraDosConjuntos({ reserveFunctions, aplicSet, reservaSet, reservaDespesaFuncSet }),
    [reserveFunctions, aplicSet, reservaSet, reservaDespesaFuncSet],
  )
  const [modoDespesas, setModoDespesas] = useModoDespesas()
  const [selectedMonth, setSelectedMonth] = useState(0)
  const [showBens, setShowBens] = useState(false)
  const [showRendimentos, setShowRendimentos] = useState(false)
  const temContratoReceber = !!contratosHabilitado && (contratos || []).some(c => c.tipo === 'receber')
  const [modoValor, setModoValor] = useState(MODO_VALOR_PADRAO)
  const [porComposicao, setPorComposicao] = useState(false)
  const [showRelatorioFatura, setShowRelatorioFatura] = useState(false)
  const [showExtratoFatura, setShowExtratoFatura] = useState(false)
  const [showFluxoReserva, setShowFluxoReserva] = useState(false)
  const [showDemonstrativo, setShowDemonstrativo] = useState(false)
  const [showFavorecido, setShowFavorecido] = useState(false)
  const [showFluxoConta, setShowFluxoConta] = useState(false)

  const hasCredit = accounts.some(a => a.type === 'credit')

  const last6Months = useMemo(() => {
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i)
      const start = isoLocal(startOfMonth(d))
      const end = isoLocal(endOfMonth(d))
      const label = format(d, 'MMM/yy', { locale: ptBR })
      // Mesma regra do Demonstrativo: o resgate não é receita; no líquido, abate a despesa.
      const { receita: income, despesa: expense } = totaisDoDemonstrativo(transactions, { start, end }, regra, modoDespesas)
      months.push({ label, start, end, income, expense, balance: income - expense })
    }
    return months
  }, [transactions, regra, modoDespesas])

  const currentMonthData = last6Months[5 - selectedMonth] || last6Months[last6Months.length - 1]

  const categoryData = useMemo(() => {
    if (!currentMonthData) return []
    const totals = {}
    lancamentosNoModo(transactions, modoValor, { abrirRepasse: porComposicao && abridorDeRepasse ? abridorDeRepasse() : null })
      .filter(tx => countsAsReportExpense(tx, aplicSet, reservaDespesaFuncSet, reservaSet) && tx.date >= currentMonthData.start && tx.date <= currentMonthData.end && tx.categoryId)
      .forEach(tx => {
        totals[tx.categoryId] = (totals[tx.categoryId] || 0) + tx.amount
      })
    return Object.entries(totals)
      .map(([id, value]) => {
        const cat = categoriaEspecial(id) || categories.find(c => c.id === id)
        return { name: cat ? [cat.icon, cat.name].filter(Boolean).join(' ') : id, value }
      })
      .filter(c => c.value > 0.005)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [transactions, categories, currentMonthData, aplicSet, reservaDespesaFuncSet, reservaSet, modoValor, porComposicao, abridorDeRepasse, contratos])

  const totalIncome = last6Months.reduce((s, m) => s + m.income, 0) / 6
  const totalExpense = last6Months.reduce((s, m) => s + m.expense, 0) / 6

  if (showRelatorioFatura) {
    return (
      <div className="space-y-4">
        <button className="flex items-center gap-2 text-sm text-texto-2 hover:text-texto-1 transition-colors" onClick={() => setShowRelatorioFatura(false)}>
          <ArrowLeft size={14} /> Voltar aos Relatórios
        </button>
        <RelatorioFatura />
      </div>
    )
  }

  if (showExtratoFatura) {
    return (
      <div className="space-y-4">
        <button data-guia="reports:extrato-fatura.voltar" className="flex items-center gap-2 text-sm text-texto-2 hover:text-texto-1 transition-colors" onClick={() => setShowExtratoFatura(false)}>
          <ArrowLeft size={14} /> Voltar aos Relatórios
        </button>
        <ExtratoFatura />
      </div>
    )
  }

  if (showFluxoReserva) {
    return (
      <div className="space-y-4">
        <button data-guia="reports:fluxo-reserva.voltar" className="flex items-center gap-2 text-sm text-texto-2 hover:text-texto-1 transition-colors" onClick={() => setShowFluxoReserva(false)}>
          <ArrowLeft size={14} /> Voltar aos Relatórios
        </button>
        <ExtratoReservaModal
          pagina seletorFuncao funcao={null}
          funcoes={dadosReserva.funcoes} saldoInicialDe={dadosReserva.saldoInicialDe}
          previstosDoPeriodo={dadosReserva.previstosDoPeriodo} realizadosDe={dadosReserva.realizadosDe}
          periodoInicial={dadosReserva.periodoInicial} atual={dadosReserva.atual} hoje={dadosReserva.hoje}
        />
      </div>
    )
  }

  if (showDemonstrativo) {
    return (
      <div className="space-y-4">
        <button data-guia="reports:demonstrativo.voltar" className="flex items-center gap-2 text-sm text-texto-2 hover:text-texto-1 transition-colors" onClick={() => setShowDemonstrativo(false)}>
          <ArrowLeft size={14} /> Voltar aos Relatórios
        </button>
        <DemonstrativoFinanceiro />
      </div>
    )
  }

  if (showFavorecido) {
    return (
      <div className="space-y-4">
        <button data-guia="reports:favorecido.voltar" className="flex items-center gap-2 text-sm text-texto-2 hover:text-texto-1 transition-colors" onClick={() => setShowFavorecido(false)}>
          <ArrowLeft size={14} /> Voltar aos Relatórios
        </button>
        <RelatorioPorFavorecido />
      </div>
    )
  }

  if (showFluxoConta) {
    return (
      <div className="space-y-4">
        <button data-guia="reports:fluxo-conta.voltar" className="flex items-center gap-2 text-sm text-texto-2 hover:text-texto-1 transition-colors" onClick={() => setShowFluxoConta(false)}>
          <ArrowLeft size={14} /> Voltar aos Relatórios
        </button>
        <FluxoCaixaPorConta />
      </div>
    )
  }

  if (showRendimentos) {
    return (
      <div className="space-y-4">
        <button data-guia="reports:rendimentos.voltar" className="flex items-center gap-2 text-sm text-texto-2 hover:text-texto-1 transition-colors" onClick={() => setShowRendimentos(false)}>
          <ArrowLeft size={14} /> Voltar aos Relatórios
        </button>
        <RelatorioRendimentos />
      </div>
    )
  }

  if (showBens) {
    return (
      <div className="space-y-4">
        <button data-guia="reports:bens.voltar" className="flex items-center gap-2 text-sm text-texto-2 hover:text-texto-1 transition-colors" onClick={() => setShowBens(false)}>
          <ArrowLeft size={14} /> Voltar aos Relatórios
        </button>
        <RelatorioBens />
      </div>
    )
  }

  // Card de um relatório do menu (mesmo visual para todos).
  const card = ({ guia, Icone, titulo, descricao, onClick }) => (
    <button key={guia} data-guia={guia} onClick={onClick}
      className="w-full card flex items-center gap-3 text-left hover:bg-surface-hover transition-colors group">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/15">
        <Icone size={16} className="text-primary-fg" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-texto-1 group-hover:text-texto-1 transition-colors">{titulo}</p>
        <p className="text-xs text-texto-3 mt-0.5">{descricao}</p>
      </div>
      <span className="text-texto-3 group-hover:text-texto-2 transition-colors text-lg">›</span>
    </button>
  )
  // Menu em SEÇÕES. Seção sem nenhum card visível para o cliente não aparece.
  const secoes = [
    { titulo: 'Resultado', cards: [
      card({ guia: 'reports.demonstrativo', Icone: FileSpreadsheet, titulo: 'Resultado por Categoria', descricao: 'Receitas, despesas e resultado do período, por grupo e categoria — Excel e CSV', onClick: () => setShowDemonstrativo(true) }),
      card({ guia: 'reports.favorecido', Icone: Users, titulo: 'Movimentação por Favorecido', descricao: 'Quanto foi pago e recebido de cada pessoa ou empresa, no total e lançamento a lançamento — Excel e CSV', onClick: () => setShowFavorecido(true) }),
    ] },
    { titulo: 'Contas e Caixa', cards: [
      card({ guia: 'reports.fluxo-conta', Icone: Wallet, titulo: 'Extrato e Fluxo de Caixa por Conta', descricao: 'Movimentações e saldo acumulado por conta, grupo ou contas principais — com agendamentos futuros', onClick: () => setShowFluxoConta(true) }),
    ] },
    { titulo: 'Cartão de Crédito', cards: hasCredit ? [
      card({ guia: 'reports.extrato-fatura', Icone: FileText, titulo: 'Extrato da Fatura', descricao: 'A fatura do cartão como o banco mostra: lançamentos, parcelas, estornos e total — Excel e CSV', onClick: () => setShowExtratoFatura(true) }),
      card({ guia: 'reports.fatura', Icone: CreditCard, titulo: gerencialLigado ? 'Relatório Gerencial da Fatura' : 'Relatório da Fatura', descricao: gerencialLigado
        ? 'A fatura separada por grupo gerencial, com valor e %, e os movimentos do cartão por data — Excel e CSV'
        : 'A fatura com o total e os gastos por categoria — Excel e CSV', onClick: () => setShowRelatorioFatura(true) }),
    ] : [] },
    { titulo: 'Reservas', cards: temReserva ? [
      card({ guia: 'reports.fluxo-reserva', Icone: PiggyBank, titulo: 'Fluxo de Caixa da Reserva', descricao: 'Entradas, saídas e saldo de cada função de reserva no período escolhido', onClick: () => setShowFluxoReserva(true) }),
    ] : [] },
    { titulo: 'Patrimônio e Aluguéis', cards: [
      card({ guia: 'reports.bens', Icone: Landmark, titulo: 'Patrimônio — Pagamentos por Mês', descricao: 'Quanto saiu de caixa por bem e por mês, com principal, juros, terceiros e devoluções', onClick: () => setShowBens(true) }),
      ...(temContratoReceber ? [card({ guia: 'reports.rendimentos', Icone: FileSpreadsheet, titulo: 'Aluguéis — Rendimentos e Repasses', descricao: 'Por contrato a receber e por ano: aluguel bruto, deduções, base tributável, repasses e conferência com o informe', onClick: () => setShowRendimentos(true) })] : []),
    ] },
  ].filter(sc => sc.cards.length > 0)
  const totalMes = categoryData.reduce((s, c) => s + c.value, 0)

  return (
    <div className="space-y-4">
      {secoes.map(sc => (
        <section key={sc.titulo} className="space-y-3" aria-label={sc.titulo} data-testid="secao-relatorios">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-texto-3 pt-2">{sc.titulo}</h2>
          {sc.cards}
          {/* Resultado: as visões rápidas dos últimos 6 meses ficam na própria seção. */}
          {sc.titulo === 'Resultado' && (
            <>
              <div data-guia="reports.medias" className="card space-y-3">
                <h3 className="text-sm font-semibold text-texto-2">Média Mensal (últimos 6 meses)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1 text-receita">
                      <ArrowDownCircle size={14} />
                      <p className="text-xs text-texto-2 uppercase tracking-wide">Receitas</p>
                    </div>
                    <p className="text-xl font-bold text-receita">{fmt(totalIncome)}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1 text-despesa">
                      <ArrowUpCircle size={14} />
                      <p className="text-xs text-texto-2 uppercase tracking-wide">Despesas</p>
                    </div>
                    <p className="text-xl font-bold text-despesa">{fmt(totalExpense)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-texto-2 uppercase tracking-wide">Saldo</p>
                    <p className={`text-xl font-bold mt-1 ${totalIncome - totalExpense >= 0 ? 'text-receita' : 'text-despesa'}`}>
                      {fmtSinal(totalIncome - totalExpense)}
                    </p>
                  </div>
                </div>
              </div>

              <div data-guia="reports.evolucao" className="card">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 className="text-sm font-semibold text-texto-2">Evolução dos Últimos 6 Meses</h3>
                  <Segmentado opcoes={MODO_OPTS} valor={modoDespesas} onChange={setModoDespesas} rotulo="Regra do valor" />
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={last6Months} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={cor.chartGrade} />
                    <XAxis dataKey="label" tick={{ fill: cor.chartEixo, fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: cor.chartEixo, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: cor.surface2 }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: cor.texto2 }} />
                    <Bar dataKey="income" name="Receitas" fill={cor.receita} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" name="Despesas" fill={cor.despesa} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Despesas do Mês por Categoria: pizza e ranking num bloco só. */}
              <div data-guia="reports.despesas-categoria" className="card">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                  <h3 className="text-sm font-semibold text-texto-2">Despesas do Mês por Categoria</h3>
                  <SeletorModoValor value={modoValor} onChange={setModoValor} porComposicao={porComposicao} onPorComposicao={setPorComposicao} />
                  <span className="inline-flex items-center gap-1" data-help-form="filtroDespesasCategoria" data-help-id="filtroRelatorio.mes">
                    <select
                      data-guia="reports.mes"
                      className="input w-auto text-xs py-1.5"
                      value={selectedMonth}
                      onChange={e => setSelectedMonth(Number(e.target.value))}
                    >
                      {last6Months.map((m, i) => (
                        <option key={m.label} value={5 - i}>{m.label}</option>
                      ))}
                    </select>
                    <HelpCampo campo="filtroRelatorio.mes" />
                  </span>
                </div>
                {categoryData.length === 0 ? (
                  <p className="text-texto-3 text-sm text-center py-8">Sem dados de despesas neste período</p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-center">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={categoryData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent, x, y, textAnchor }) => (percent > 0.05
                          ? <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central" fill={cor.texto2} fontSize={11}>{isMobile ? '' : `${name} `}{(percent * 100).toFixed(0)}%</text>
                          : null)} labelLine={false}>
                          {categoryData.map((_, i) => <Cell key={i} fill={corSerie(cor.tema, i)} />)}
                        </Pie>
                        <Tooltip formatter={(v) => fmt(v)} {...estiloTooltip(cor)} itemStyle={{ color: cor.texto1 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div data-guia="reports.ranking" className="space-y-2">
                      {categoryData.map((item, i) => {
                        const pct = totalMes > 0 ? (item.value / totalMes) * 100 : 0
                        return (
                          <div key={item.name}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-texto-2">{item.name}</span>
                              <span className="text-texto-2">{fmt(item.value)} ({pct.toFixed(0)}%)</span>
                            </div>
                            <div className="h-1.5 bg-surface-2 rounded-full">
                              <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: corSerie(cor.tema, i) }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      ))}
    </div>
  )
}
