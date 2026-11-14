// Cadastro de FUNÇÃO DE RESERVA (nome, conta, saldo inicial, despesa anual, depósito mensal, mês de
// vencimento, categoria, contar como despesa). Usado na tela de Reservas e no "+ Nova função" do
// agendamento ("Resgatar de"), com a conta travada na conta do grupo (`contaFixa`).
import { useState, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { fmt, accountsForView } from '../shared/utils'
import { useIsMobile } from '../../hooks/useIsMobile'
import HelpCampo from '../shared/HelpCampo'
import AvisoPrerequisitos from '../BoasVindas/AvisoPrerequisitos'
import InputMoeda from '../shared/InputMoeda'

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Data local 'YYYY-MM-DD' (evita o shift de fuso do toISOString).
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function FuncaoReservaForm({ initial, accounts, categories = [], transactions = [], schedules = [], onSubmit, onClose, contaFixa = null }) {
  const isMobile = useIsMobile()
  const { pode } = useApp()
  const podeSalvar = pode('reservas', initial ? 'editar' : 'incluir')
  const [form, setForm] = useState({
    name: initial?.name || '',
    accountId: initial?.accountId || contaFixa || '',
    saldoInicial: initial?.saldoInicial ?? 0,
    despesaAnual: initial?.despesaAnual ?? 0,
    depositoMensal: initial?.depositoMensal ?? 0,
    mesVencimento: initial?.mesVencimento ?? '',
    categoryId: initial?.categoryId || '',
    exibirComoDespesa: initial?.exibirComoDespesa ?? false,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Categorias de despesa (inclui 'both'), ordenadas por nome — mesma base do TransactionForm.
  const categoryOpts = [...categories]
    .filter(c => c.type === 'expense' || c.type === 'both')
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'))

  // Sugestões dos lançamentos reais + agendamentos pendentes vinculados (reservaFuncaoId).
  // Só para funções EXISTENTES com conta vinculada (transfers precisam da conta p/ classificar).
  //   SAÍDA  = transfer saindo da conta (accountId === conta)
  //   ENTRADA = transfer entrando (toAccountId === conta) OU receita na conta (income)
  // Agendamentos: transactionType/frequency; o modelo não tem campo 'status' — todo agendamento
  // vinculado conta como pendente. enough=false (< 2 meses e sem agendamento, ou sem conta).
  const suggestions = useMemo(() => {
    const fnId = initial?.id
    const accId = initial?.accountId
    if (!fnId) return null
    const now = new Date()
    const cutoff = localDateStr(new Date(now.getFullYear(), now.getMonth() - 12, now.getDate()))
    const today = localDateStr(now)

    // ── Lançamentos efetivados (últimos 12 meses) ──
    let entradasTx = 0, saidasTx = 0
    const saidasByMonth = {}
    const monthsSeen = new Set()
    for (const tx of (transactions || [])) {
      if (tx.reservaFuncaoId !== fnId) continue
      if (tx.date < cutoff || tx.date > today) continue
      monthsSeen.add(tx.date.slice(0, 7))
      if (tx.type === 'transfer' && tx.accountId === accId) {
        saidasTx += tx.amount
        const mo = Number(tx.date.slice(5, 7))
        saidasByMonth[mo] = (saidasByMonth[mo] || 0) + tx.amount
      } else if (tx.type === 'transfer' && tx.toAccountId === accId) {
        entradasTx += tx.amount
      } else if (tx.type === 'income' && tx.accountId === accId) {
        entradasTx += tx.amount
      }
    }

    // ── Agendamentos pendentes vinculados (transactionType/frequency) ──
    const linked = (schedules || []).filter(s => s.reservaFuncaoId === fnId && s.transactionType && s.status !== 'paid')
    const perYear = { daily: 365, weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, semiannual: 2, annual: 1 }
    const isEntradaS = (s) => (s.transactionType === 'transfer' && s.toAccountId === accId) || (s.transactionType === 'income' && s.accountId === accId)
    const isSaidaS = (s) => s.transactionType === 'transfer' && s.accountId === accId
    const monthOf = (d) => {
      if (!d) return null
      if (d instanceof Date) return d.getMonth() + 1
      return Number(String(d).slice(5, 7)) || null
    }

    let entradaMensalRecorrente = 0  // Σ equivalente mensal das entradas recorrentes
    let entradaSchedOnce = 0         // Σ entradas 'once'
    let despesaAnualSched = 0        // Σ saídas recorrentes projetadas p/ 12 meses
    let mesAnualSched = null         // mês da próxima saída anual agendada

    for (const s of linked) {
      const freq = s.frequency
      const recorrente = freq && freq !== 'once'
      if (isEntradaS(s)) {
        // Recorrente → valor mensal equivalente (amount × ocorrências/ano ÷ 12); monthly = amount.
        if (recorrente) entradaMensalRecorrente += (s.amount * (perYear[freq] || 12)) / 12
        else entradaSchedOnce += s.amount
      } else if (isSaidaS(s)) {
        // Recorrente → projeção anual (monthly ×12, annual ×1, outros × estimativa de ocorrências/ano).
        if (recorrente) despesaAnualSched += s.amount * (perYear[freq] || 1)
        if (freq === 'annual') mesAnualSched = monthOf(s.nextOccurrence || s.startDate) || mesAnualSched
      } else if (s.isProvisao && s.transactionType === 'expense') {
        // Provisão de despesa vinculada (não é transferência): despesa futura estimada.
        // annual/once → amount; monthly → ×12; demais frequências → × ocorrências/ano.
        if (freq === 'monthly') despesaAnualSched += s.amount * 12
        else if (freq === 'annual' || freq === 'once' || !freq) despesaAnualSched += s.amount
        else despesaAnualSched += s.amount * (perYear[freq] || 1)
      }
    }

    // a) Depósito Mensal = maior entre: (recorrentes já mensais) e ((lançamentos + 'once')/12).
    const depAbordagemA = Math.round(entradaMensalRecorrente * 100) / 100
    const depAbordagemB = Math.round(((entradasTx + entradaSchedOnce) / 12) * 100) / 100
    const depositoMensal = Math.max(depAbordagemA, depAbordagemB)

    // b) Despesa Anual = saídas de lançamentos (12m) + saídas recorrentes agendadas projetadas.
    const despesaAnual = Math.round((saidasTx + despesaAnualSched) * 100) / 100

    // c) Mês de Vencimento: maior volume de saídas nos lançamentos; havendo saída ANUAL agendada,
    //    prevalece o mês da próxima ocorrência. Empate/sem dado → null.
    let mesVencimento = null
    const porMes = Object.entries(saidasByMonth).sort((a, b) => b[1] - a[1])
    if (porMes.length === 1 || (porMes.length > 1 && porMes[0][1] > porMes[1][1])) {
      mesVencimento = Number(porMes[0][0])
    }
    if (mesAnualSched) mesVencimento = mesAnualSched

    return {
      enough: !!accId && (monthsSeen.size >= 2 || linked.length > 0),
      despesaAnual,
      depositoMensal,
      mesVencimento,
    }
  }, [transactions, schedules, initial])

  return (
    <form onSubmit={e => { e.preventDefault(); if (!podeSalvar) return; onSubmit({
      ...form,
      accountId: form.accountId || null,
      saldoInicial: Number(form.saldoInicial) || 0,
      despesaAnual: Number(form.despesaAnual) || 0,
      depositoMensal: Number(form.depositoMensal) || 0,
      mesVencimento: form.mesVencimento !== '' ? Number(form.mesVencimento) : null,
      categoryId: form.categoryId || null,
      exibirComoDespesa: !!form.exibirComoDespesa,
    }) }} className="space-y-4" data-help-form="reserva">
      {!initial && <AvisoPrerequisitos funcao="funcao-reserva" onIr={onClose} />}
      <div data-guia="reserva-form.nome" data-help-id="reserva.nome">
        <label className="label">Nome da Função *<HelpCampo campo="reserva.nome" /></label>
        <input className="input" value={form.name} onChange={e => set('name', e.target.value)} required placeholder="Digite o nome da função" />
      </div>
      <div data-guia="reserva-form.conta" data-help-id="reserva.conta">
        <label className="label">Conta Vinculada<HelpCampo campo="reserva.conta" /></label>
        <select className="input" value={form.accountId} onChange={e => set('accountId', e.target.value)} disabled={!!contaFixa}>
          <option value="">— Sem conta —</option>
          {accountsForView(accounts.filter(a => a.active !== false), isMobile).map(a => <option key={a.id} value={a.id}>{a.apelido || a.name}</option>)}
        </select>
      </div>
      <div data-guia="reserva-form.saldo-inicial" data-help-id="reserva.saldoInicial">
        <label className="label">Saldo Inicial (R$)<HelpCampo campo="reserva.saldoInicial" /></label>
        <InputMoeda negativo className="input" value={form.saldoInicial} onChange={e => set('saldoInicial', e.target.value)} placeholder="0,00 (aceita negativo)" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div data-guia="reserva-form.despesa-anual" data-help-id="reserva.despesaAnual">
          <label className="label">Despesa Anual (R$)<HelpCampo campo="reserva.despesaAnual" /></label>
          <InputMoeda negativo className="input" value={form.despesaAnual} onChange={e => set('despesaAnual', e.target.value)} placeholder="0,00" />
          {suggestions && (suggestions.enough
            ? <p className="text-xs text-texto-3 mt-1">Calculado dos lançamentos: {fmt(suggestions.despesaAnual)}
                <button type="button" onClick={() => set('despesaAnual', suggestions.despesaAnual)} className="text-primary-fg hover:underline ml-1.5 font-medium">Usar valor calculado</button>
              </p>
            : <p className="text-xs text-texto-3 mt-1">Dados insuficientes para calcular</p>
          )}
        </div>
        <div data-guia="reserva-form.deposito-mensal" data-help-id="reserva.depositoMensal">
          <label className="label">Depósito Mensal (R$)<HelpCampo campo="reserva.depositoMensal" /></label>
          <InputMoeda negativo className="input" value={form.depositoMensal} onChange={e => set('depositoMensal', e.target.value)} placeholder="0,00" />
          {suggestions && (suggestions.enough
            ? <p className="text-xs text-texto-3 mt-1">Calculado dos lançamentos: {fmt(suggestions.depositoMensal)} / mês
                <button type="button" onClick={() => set('depositoMensal', suggestions.depositoMensal)} className="text-primary-fg hover:underline ml-1.5 font-medium">Usar valor calculado</button>
              </p>
            : <p className="text-xs text-texto-3 mt-1">Dados insuficientes para calcular</p>
          )}
        </div>
      </div>
      <div data-guia="reserva-form.mes-vencimento" data-help-id="reserva.mesVencimento">
        <label className="label">Mês de Vencimento da Despesa<HelpCampo campo="reserva.mesVencimento" /></label>
        <select className="input" value={form.mesVencimento} onChange={e => set('mesVencimento', e.target.value)}>
          <option value="">Rateio mensal (÷ 12)</option>
          {MONTH_LABELS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
        <p className="text-xs text-texto-3 mt-1">Quando não definido, a despesa anual é dividida em 12 parcelas mensais</p>
        {suggestions && suggestions.enough && suggestions.mesVencimento && (
          <p className="text-xs text-texto-3 mt-1">Maior volume em: {MONTH_LABELS[suggestions.mesVencimento - 1]}
            <button type="button" onClick={() => set('mesVencimento', suggestions.mesVencimento)} className="text-primary-fg hover:underline ml-1.5 font-medium">Usar valor calculado</button>
          </p>
        )}
      </div>
      <div data-guia="reserva-form.categoria" data-help-id="reserva.categoria">
        <label className="label">Categoria da Despesa<HelpCampo campo="reserva.categoria" /></label>
        <select className="input" value={form.categoryId} onChange={e => set('categoryId', e.target.value)}>
          <option value="">Sem categoria vinculada</option>
          {categoryOpts.map(c => <option key={c.id} value={c.id}>{`${c.icon || ''} ${c.name}`.trim()}</option>)}
        </select>
        <p className="text-xs text-texto-3 mt-1">As sombras de reserva (depósitos e resgates) herdam esta categoria no Resultado por Categoria</p>
      </div>
      <div data-help-id="reserva.contarComoDespesa">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="accent-primary"
            checked={!!form.exibirComoDespesa}
            onChange={e => set('exibirComoDespesa', e.target.checked)}
          />
          <span className="text-sm text-texto-1">Contar como despesa</span><HelpCampo campo="reserva.contarComoDespesa" />
        </label>
        <p className="text-xs text-texto-3 mt-1">
          Marcado: as transferências desta função (depósitos e resgates) entram nos totais de
          despesa do Dashboard e Relatórios. Desmarcado: são ignoradas (ex.: poupança/receita).
        </p>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        {podeSalvar && <button type="submit" data-guia="reserva-form.salvar" className="btn-primary flex-1">{initial ? 'Salvar' : 'Criar'}</button>}
      </div>
      {!podeSalvar && <p className="text-xs text-texto-3">Somente leitura — seu nível de acesso não permite gravar.</p>}
    </form>
  )
}
