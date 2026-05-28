import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { addMonths, addWeeks, addDays, addYears, format, parseISO } from 'date-fns'
import {
  supabase,
  loadFromSupabase, seedDefaults,
  syncSection, syncAccounts, syncPayees, syncSettings,
  accountToRow, txToRow, scheduleToRow, categoryToRow,
  budgetToRow, ruleToRow, gerencialGroupToRow, payableToRow,
} from '../lib/supabase'

const AppContext = createContext(null)

// Retorna todas as ocorrências pendentes de um agendamento até upToDateStr (inclusive)
function computePendingUpTo(schedule, upToDateStr) {
  const allDone = new Set([...(schedule.registered || []), ...(schedule.skipped || [])])
  const pending = []
  let current = parseISO(schedule.startDate)
  const maxInstallments = schedule.occurrenceType === 'installment' ? (schedule.installments || 1) : 9999
  let count = 0
  while (count < maxInstallments) {
    const dateStr = format(current, 'yyyy-MM-dd')
    if (dateStr > upToDateStr) break
    if (!allDone.has(dateStr)) pending.push(dateStr)
    count++
    switch (schedule.frequency) {
      case 'daily':         current = addDays(current, 1); break
      case 'weekly':        current = addWeeks(current, 1); break
      case 'biweekly':      current = addWeeks(current, 2); break
      case 'monthly':       current = addMonths(current, 1); break
      case 'bimonthly':     current = addMonths(current, 2); break
      case 'quarterly':     current = addMonths(current, 3); break
      case 'quadrimestral': current = addMonths(current, 4); break
      case 'semiannual':    current = addMonths(current, 6); break
      case 'annual':        current = addYears(current, 1); break
      default: break
    }
    if (schedule.frequency === 'once') break
  }
  return pending
}

const defaultData = {
  settings: {
    financialMonthStartDay: 1,
    currency: 'BRL',
    recurringMatchExceptions: [],
  },
  accounts: [],
  transactions: [],
  schedules: [],
  budgets: [],
  categories: [
    { id: 'cat_1', name: 'Alimentação', type: 'expense', color: '#f97316', icon: '🍽️' },
    { id: 'cat_2', name: 'Transporte', type: 'expense', color: '#3b82f6', icon: '🚗' },
    { id: 'cat_3', name: 'Moradia', type: 'expense', color: '#8b5cf6', icon: '🏠' },
    { id: 'cat_4', name: 'Saúde', type: 'expense', color: '#ef4444', icon: '❤️' },
    { id: 'cat_5', name: 'Lazer', type: 'expense', color: '#06b6d4', icon: '🎬' },
    { id: 'cat_6', name: 'Educação', type: 'expense', color: '#84cc16', icon: '📚' },
    { id: 'cat_7', name: 'Roupas', type: 'expense', color: '#ec4899', icon: '👕' },
    { id: 'cat_8', name: 'Mercado', type: 'expense', color: '#14b8a6', icon: '🛒' },
    { id: 'cat_9', name: 'Salário', type: 'income', color: '#22c55e', icon: '💰' },
    { id: 'cat_10', name: 'Freelance', type: 'income', color: '#10b981', icon: '💻' },
    { id: 'cat_11', name: 'Investimentos', type: 'income', color: '#6366f1', icon: '📈' },
    { id: 'cat_12', name: 'Outros', type: 'both', color: '#6b7280', icon: '📌' },
    // ── Despesas agrupadas ────────────────────────────────────────────────────
    { id: 'cat_ali_sup', name: 'Supermercado',      type: 'expense', color: '#f97316', icon: '🏪', group: 'Alimentação' },
    { id: 'cat_ali_ref', name: 'Refeições Fora',    type: 'expense', color: '#f97316', icon: '🍽️', group: 'Alimentação' },
    { id: 'cat_ali_pad', name: 'Padaria',            type: 'expense', color: '#f97316', icon: '🥐', group: 'Alimentação' },
    { id: 'cat_ali_del', name: 'Delivery',           type: 'expense', color: '#f97316', icon: '📦', group: 'Alimentação' },
    { id: 'cat_tra_com', name: 'Combustível',        type: 'expense', color: '#3b82f6', icon: '⛽', group: 'Transporte' },
    { id: 'cat_tra_est', name: 'Estacionamento',     type: 'expense', color: '#3b82f6', icon: '🅿️', group: 'Transporte' },
    { id: 'cat_tra_ped', name: 'Pedágio',            type: 'expense', color: '#3b82f6', icon: '🛣️', group: 'Transporte' },
    { id: 'cat_tra_pub', name: 'Transporte Público', type: 'expense', color: '#3b82f6', icon: '🚌', group: 'Transporte' },
    { id: 'cat_tra_man', name: 'Manutenção Veículo', type: 'expense', color: '#3b82f6', icon: '🔧', group: 'Transporte' },
    { id: 'cat_mor_alg', name: 'Aluguel',            type: 'expense', color: '#8b5cf6', icon: '🏠', group: 'Moradia' },
    { id: 'cat_mor_cdn', name: 'Condomínio',         type: 'expense', color: '#8b5cf6', icon: '🏢', group: 'Moradia' },
    { id: 'cat_mor_ipt', name: 'IPTU',               type: 'expense', color: '#8b5cf6', icon: '📋', group: 'Moradia' },
    { id: 'cat_mor_agu', name: 'Água',               type: 'expense', color: '#8b5cf6', icon: '💧', group: 'Moradia' },
    { id: 'cat_mor_luz', name: 'Luz',                type: 'expense', color: '#8b5cf6', icon: '⚡', group: 'Moradia' },
    { id: 'cat_mor_gas', name: 'Gás',                type: 'expense', color: '#8b5cf6', icon: '🔥', group: 'Moradia' },
    { id: 'cat_mor_int', name: 'Internet',           type: 'expense', color: '#8b5cf6', icon: '📡', group: 'Moradia' },
    { id: 'cat_mor_tel', name: 'Telefone',           type: 'expense', color: '#8b5cf6', icon: '📱', group: 'Moradia' },
    { id: 'cat_sau_far', name: 'Farmácia',           type: 'expense', color: '#ef4444', icon: '💊', group: 'Saúde' },
    { id: 'cat_sau_med', name: 'Consulta Médica',    type: 'expense', color: '#ef4444', icon: '🩺', group: 'Saúde' },
    { id: 'cat_sau_pls', name: 'Plano de Saúde',    type: 'expense', color: '#ef4444', icon: '🏥', group: 'Saúde' },
    { id: 'cat_sau_exa', name: 'Exames',             type: 'expense', color: '#ef4444', icon: '🔬', group: 'Saúde' },
    { id: 'cat_sau_aca', name: 'Academia',           type: 'expense', color: '#ef4444', icon: '💪', group: 'Saúde' },
    { id: 'cat_edu_esc', name: 'Escola',             type: 'expense', color: '#84cc16', icon: '🏫', group: 'Educação' },
    { id: 'cat_edu_fac', name: 'Faculdade',          type: 'expense', color: '#84cc16', icon: '🎓', group: 'Educação' },
    { id: 'cat_edu_cur', name: 'Curso',              type: 'expense', color: '#84cc16', icon: '📝', group: 'Educação' },
    { id: 'cat_edu_liv', name: 'Livros',             type: 'expense', color: '#84cc16', icon: '📚', group: 'Educação' },
    { id: 'cat_laz_str', name: 'Streaming',          type: 'expense', color: '#06b6d4', icon: '📺', group: 'Lazer' },
    { id: 'cat_laz_cin', name: 'Cinema',             type: 'expense', color: '#06b6d4', icon: '🎬', group: 'Lazer' },
    { id: 'cat_laz_via', name: 'Viagem',             type: 'expense', color: '#06b6d4', icon: '✈️', group: 'Lazer' },
    { id: 'cat_laz_res', name: 'Restaurante',        type: 'expense', color: '#06b6d4', icon: '🍴', group: 'Lazer' },
    { id: 'cat_laz_ass', name: 'Assinaturas',        type: 'expense', color: '#06b6d4', icon: '🔖', group: 'Lazer' },
    { id: 'cat_ves_rou', name: 'Roupas',             type: 'expense', color: '#ec4899', icon: '👗', group: 'Vestuário' },
    { id: 'cat_ves_cal', name: 'Calçados',           type: 'expense', color: '#ec4899', icon: '👟', group: 'Vestuário' },
    { id: 'cat_ves_ace', name: 'Acessórios',         type: 'expense', color: '#ec4899', icon: '💍', group: 'Vestuário' },
    { id: 'cat_imp_ipv', name: 'IPVA',               type: 'expense', color: '#6b7280', icon: '🚘', group: 'Impostos' },
    { id: 'cat_imp_ir',  name: 'IR',                 type: 'expense', color: '#6b7280', icon: '📊', group: 'Impostos' },
    { id: 'cat_imp_tax', name: 'Taxas',              type: 'expense', color: '#6b7280', icon: '💸', group: 'Impostos' },
    { id: 'cat_seg_aut', name: 'Seguro Auto',        type: 'expense', color: '#14b8a6', icon: '🛡️', group: 'Seguros' },
    { id: 'cat_seg_vid', name: 'Seguro Vida',        type: 'expense', color: '#14b8a6', icon: '💙', group: 'Seguros' },
    { id: 'cat_seg_res', name: 'Seguro Residencial', type: 'expense', color: '#14b8a6', icon: '🏡', group: 'Seguros' },
    { id: 'cat_ban_tar', name: 'Tarifas',            type: 'expense', color: '#f59e0b', icon: '💳', group: 'Bancos' },
    { id: 'cat_ban_jur', name: 'Juros',              type: 'expense', color: '#f59e0b', icon: '💸', group: 'Bancos' },
    { id: 'cat_ban_fin', name: 'Financiamento',      type: 'expense', color: '#f59e0b', icon: '🏦', group: 'Bancos' },
    { id: 'cat_out_pre', name: 'Presentes',          type: 'expense', color: '#78716c', icon: '🎁', group: 'Outras Despesas' },
    { id: 'cat_out_doa', name: 'Doações',            type: 'expense', color: '#78716c', icon: '🤝', group: 'Outras Despesas' },
    { id: 'cat_out_div', name: 'Despesas Diversas',  type: 'expense', color: '#78716c', icon: '📌', group: 'Outras Despesas' },
    // ── Receitas agrupadas ────────────────────────────────────────────────────
    { id: 'cat_rem_sal', name: 'Salário',            type: 'income',  color: '#22c55e', icon: '💰', group: 'Remunerações' },
    { id: 'cat_rem_fer', name: 'Férias',             type: 'income',  color: '#22c55e', icon: '🌴', group: 'Remunerações' },
    { id: 'cat_rem_13',  name: '13º Salário',        type: 'income',  color: '#22c55e', icon: '🎄', group: 'Remunerações' },
    { id: 'cat_rem_bon', name: 'Bônus',              type: 'income',  color: '#22c55e', icon: '🎯', group: 'Remunerações' },
    { id: 'cat_rem_com', name: 'Comissão',           type: 'income',  color: '#22c55e', icon: '💼', group: 'Remunerações' },
    { id: 'cat_ren_jur', name: 'Juros Recebidos',    type: 'income',  color: '#10b981', icon: '💹', group: 'Rendimentos' },
    { id: 'cat_ren_div', name: 'Dividendos',         type: 'income',  color: '#10b981', icon: '📈', group: 'Rendimentos' },
    { id: 'cat_ren_alg', name: 'Aluguel Recebido',   type: 'income',  color: '#10b981', icon: '🏘️', group: 'Rendimentos' },
    { id: 'cat_ore_rei', name: 'Reembolsos',         type: 'income',  color: '#6366f1', icon: '💵', group: 'Outras Receitas' },
    { id: 'cat_ore_ven', name: 'Vendas',             type: 'income',  color: '#6366f1', icon: '🏷️', group: 'Outras Receitas' },
    { id: 'cat_ore_fgt', name: 'FGTS',               type: 'income',  color: '#6366f1', icon: '🏛️', group: 'Outras Receitas' },
    { id: 'cat_ore_pis', name: 'PIS / PASEP',        type: 'income',  color: '#6366f1', icon: '📋', group: 'Outras Receitas' },
  ],
  classificationRules: [],
  costCenters: ['Pessoal', 'Família', 'Trabalho', 'Casa'],
  payees: [],
  gerencialGroups: [
    { id: 'grp_1', number: 1, name: 'Gerencial', alias: 'G', fixed: true, defaultAccountId: null },
    { id: 'grp_D', number: 'D', name: 'Despesa', alias: 'D', fixed: true, defaultAccountId: null },
  ],
  payables: [],
}

export function AppProvider({ children }) {
  const [data, setData] = useState(defaultData)
  const [initialized, setInitialized] = useState(false)
  const [dbStatus, setDbStatus] = useState('connecting')
  const prevDataRef = useRef(null)
  const syncTimerRef = useRef(null)
  const autoRegisterDoneRef = useRef(false)

  // ── Inicialização: carrega do Supabase ──────────────────────────────────────
  useEffect(() => {
    loadFromSupabase(defaultData).then(async (result) => {
      if (result.status === 'connected') {
        setData(result.data)
        prevDataRef.current = result.data
        setDbStatus('connected')
      } else if (result.status === 'empty') {
        // Banco existe mas vazio: semeia defaults
        try {
          await seedDefaults(defaultData)
          setDbStatus('seeded')
        } catch {
          setDbStatus('error')
        }
        prevDataRef.current = defaultData
      } else {
        // 'schema-missing' ou 'error'
        console.warn('[Supabase]', result.status, result.error)
        setDbStatus(result.status)
        prevDataRef.current = defaultData
      }
      setInitialized(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync debounced para Supabase ────────────────────────────────────────────
  useEffect(() => {
    if (!initialized) return
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)

    syncTimerRef.current = setTimeout(async () => {
      const prev = prevDataRef.current
      if (!prev) return

      const tasks = []

      if (prev.accounts !== data.accounts)
        tasks.push(syncAccounts(prev.accounts, data.accounts))
      if (prev.transactions !== data.transactions)
        tasks.push(syncSection('lancamentos', prev.transactions, data.transactions, txToRow))
      if (prev.schedules !== data.schedules)
        tasks.push(syncSection('agendamentos', prev.schedules, data.schedules, scheduleToRow))
      if (prev.categories !== data.categories)
        tasks.push(syncSection('categorias', prev.categories, data.categories, categoryToRow))
      if (prev.budgets !== data.budgets)
        tasks.push(syncSection('orcamento', prev.budgets, data.budgets, budgetToRow))
      if (prev.classificationRules !== data.classificationRules)
        tasks.push(syncSection('regras_classificacao', prev.classificationRules, data.classificationRules, ruleToRow))
      if (prev.gerencialGroups !== data.gerencialGroups)
        tasks.push(syncSection('reservas_funcoes', prev.gerencialGroups, data.gerencialGroups, gerencialGroupToRow))
      if (prev.payables !== data.payables)
        tasks.push(syncSection('reservas', prev.payables, data.payables, payableToRow))
      if (prev.payees !== data.payees)
        tasks.push(syncPayees(prev.payees, data.payees))
      if (prev.settings !== data.settings || prev.costCenters !== data.costCenters)
        tasks.push(syncSettings(data.settings, data.costCenters))

      if (tasks.length > 0) await Promise.all(tasks)
      prevDataRef.current = data
    }, 500)

    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current) }
  }, [data, initialized])

  const update = useCallback((updater) => {
    setData(prev => typeof updater === 'function' ? updater(prev) : updater)
  }, [])

  // ── Registrar automático na inicialização ───────────────────────────────────
  useEffect(() => {
    if (!initialized || autoRegisterDoneRef.current) return
    autoRegisterDoneRef.current = true
    const todayStr = format(new Date(), 'yyyy-MM-dd')

    setData(prev => {
      let schedules = prev.schedules
      let accounts = prev.accounts
      let transactions = prev.transactions
      let changed = false

      for (const schedule of prev.schedules) {
        if (!schedule.autoRegister) continue
        const pending = computePendingUpTo(schedule, todayStr)
        if (pending.length === 0) continue

        for (const date of pending) {
          changed = true
          const txId = 'tx_auto_' + Date.now() + '_' + Math.random().toString(36).slice(2)
          const newTx = {
            id: txId,
            type: schedule.transactionType,
            accountId: schedule.accountId || null,
            accountType: schedule.accountType || null,
            toAccountId: schedule.toAccountId || null,
            fromAccountId: null,
            amount: Number(schedule.amount),
            categoryId: schedule.categoryId || null,
            description: schedule.description,
            payee: schedule.payee || null,
            costCenter: schedule.costCenter || null,
            date,
            scheduleId: schedule.id,
            createdAt: new Date().toISOString(),
          }
          if (schedule.transactionType === 'income') {
            accounts = accounts.map(a => a.id === schedule.accountId
              ? { ...a, balance: a.balance + Number(schedule.amount) } : a)
          } else if (schedule.transactionType === 'expense') {
            if (schedule.accountType === 'credit') {
              accounts = accounts.map(a => a.id === schedule.accountId ? {
                ...a,
                creditDebt: (a.creditDebt || 0) + Number(schedule.amount),
                creditMonthBill: (a.creditMonthBill || 0) + Number(schedule.amount),
              } : a)
            } else {
              accounts = accounts.map(a => a.id === schedule.accountId
                ? { ...a, balance: a.balance - Number(schedule.amount) } : a)
            }
          } else if (schedule.transactionType === 'transfer') {
            accounts = accounts.map(a => {
              if (a.id === schedule.accountId) return { ...a, balance: a.balance - Number(schedule.amount) }
              if (a.id === schedule.toAccountId) return { ...a, balance: a.balance + Number(schedule.amount) }
              return a
            })
          }
          transactions = [...transactions, newTx]
          schedules = schedules.map(s => s.id === schedule.id
            ? { ...s, registered: [...(s.registered || []), date] } : s)
        }
      }

      if (!changed) return prev
      return { ...prev, schedules, accounts, transactions }
    })
  }, [initialized]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Settings ────────────────────────────────────────────────────────────────
  const updateSettings = useCallback((settings) => {
    update(d => ({ ...d, settings: { ...d.settings, ...settings } }))
  }, [update])

  // ── Accounts ────────────────────────────────────────────────────────────────
  const addAccount = useCallback((account) => {
    const id = 'acc_' + Date.now()
    update(d => ({ ...d, accounts: [...d.accounts, { ...account, id, balance: Number(account.balance) || 0 }] }))
    return id
  }, [update])

  const updateAccount = useCallback((id, changes) => {
    update(d => ({ ...d, accounts: d.accounts.map(a => a.id === id ? { ...a, ...changes } : a) }))
  }, [update])

  const deleteAccount = useCallback((id) => {
    update(d => ({ ...d, accounts: d.accounts.filter(a => a.id !== id) }))
  }, [update])

  const setMainAccount = useCallback((id) => {
    update(d => ({ ...d, accounts: d.accounts.map(a => ({ ...a, isMain: a.id === id })) }))
  }, [update])

  // ── Transactions ────────────────────────────────────────────────────────────
  const addTransaction = useCallback((tx) => {
    const id = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    const newTx = { ...tx, id, amount: Number(tx.amount), createdAt: new Date().toISOString() }
    update(d => {
      let accounts = [...d.accounts]
      if (tx.type === 'income') {
        accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: a.balance + Number(tx.amount) } : a)
      } else if (tx.type === 'expense') {
        if (tx.accountType === 'credit') {
          accounts = accounts.map(a => a.id === tx.accountId ? {
            ...a,
            creditDebt: (a.creditDebt || 0) + Number(tx.amount),
            creditMonthBill: (a.creditMonthBill || 0) + Number(tx.amount),
          } : a)
        } else {
          accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: a.balance - Number(tx.amount) } : a)
        }
      } else if (tx.type === 'transfer') {
        accounts = accounts.map(a => {
          if (a.id === tx.accountId) return { ...a, balance: a.balance - Number(tx.amount) }
          if (a.id === tx.toAccountId) return { ...a, balance: a.balance + Number(tx.amount) }
          return a
        })
      } else if (tx.type === 'credit_payment') {
        accounts = accounts.map(a => {
          if (a.id === tx.fromAccountId) return { ...a, balance: a.balance - Number(tx.amount) }
          if (a.id === tx.accountId) return {
            ...a,
            creditDebt: Math.max(0, (a.creditDebt || 0) - Number(tx.amount)),
            creditMonthBill: Math.max(0, (a.creditMonthBill || 0) - Number(tx.amount)),
          }
          return a
        })
      }
      return { ...d, accounts, transactions: [...d.transactions, newTx] }
    })
    return id
  }, [update])

  const updateTransaction = useCallback((id, changes) => {
    update(d => ({ ...d, transactions: d.transactions.map(t => t.id === id ? { ...t, ...changes } : t) }))
  }, [update])

  const deleteTransaction = useCallback((id) => {
    update(d => {
      const tx = d.transactions.find(t => t.id === id)
      if (!tx) return d
      let accounts = [...d.accounts]
      if (tx.type === 'income') {
        accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: a.balance - tx.amount } : a)
      } else if (tx.type === 'expense') {
        if (tx.accountType === 'credit') {
          accounts = accounts.map(a => a.id === tx.accountId ? {
            ...a,
            creditDebt: Math.max(0, (a.creditDebt || 0) - tx.amount),
            creditMonthBill: Math.max(0, (a.creditMonthBill || 0) - tx.amount),
          } : a)
        } else {
          accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: a.balance + tx.amount } : a)
        }
      } else if (tx.type === 'transfer') {
        accounts = accounts.map(a => {
          if (a.id === tx.accountId) return { ...a, balance: a.balance + tx.amount }
          if (a.id === tx.toAccountId) return { ...a, balance: a.balance - tx.amount }
          return a
        })
      }
      return { ...d, accounts, transactions: d.transactions.filter(t => t.id !== id) }
    })
  }, [update])

  // ── Categories ──────────────────────────────────────────────────────────────
  const addCategory = useCallback((category) => {
    const id = 'cat_' + Date.now()
    update(d => ({ ...d, categories: [...d.categories, { ...category, id }] }))
  }, [update])

  const deleteCategory = useCallback((id) => {
    update(d => ({ ...d, categories: d.categories.filter(c => c.id !== id) }))
  }, [update])

  // ── Schedules ───────────────────────────────────────────────────────────────
  const addSchedule = useCallback((schedule) => {
    const id = 'sch_' + Date.now()
    update(d => ({ ...d, schedules: [...d.schedules, { ...schedule, id, skipped: [], registered: [] }] }))
    return id
  }, [update])

  const updateSchedule = useCallback((id, changes) => {
    update(d => ({ ...d, schedules: d.schedules.map(s => s.id === id ? { ...s, ...changes } : s) }))
  }, [update])

  const deleteSchedule = useCallback((id) => {
    update(d => ({ ...d, schedules: d.schedules.filter(s => s.id !== id) }))
  }, [update])

  const registerScheduleOccurrence = useCallback((scheduleId, date) => {
    update(d => {
      const schedule = d.schedules.find(s => s.id === scheduleId)
      if (!schedule) return d
      const tx = {
        type: schedule.transactionType,
        accountId: schedule.accountId,
        accountType: schedule.accountType,
        toAccountId: schedule.toAccountId,
        amount: schedule.amount,
        categoryId: schedule.categoryId,
        description: schedule.description,
        payee: schedule.payee,
        costCenter: schedule.costCenter,
        date,
        scheduleId,
      }
      const newTxId = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2)
      const newTx = { ...tx, id: newTxId, createdAt: new Date().toISOString() }
      let accounts = [...d.accounts]
      if (tx.type === 'income') {
        accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: a.balance + Number(tx.amount) } : a)
      } else if (tx.type === 'expense') {
        if (tx.accountType === 'credit') {
          accounts = accounts.map(a => a.id === tx.accountId ? {
            ...a,
            creditDebt: (a.creditDebt || 0) + Number(tx.amount),
            creditMonthBill: (a.creditMonthBill || 0) + Number(tx.amount),
          } : a)
        } else {
          accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: a.balance - Number(tx.amount) } : a)
        }
      } else if (tx.type === 'transfer') {
        accounts = accounts.map(a => {
          if (a.id === tx.accountId) return { ...a, balance: a.balance - Number(tx.amount) }
          if (a.id === tx.toAccountId) return { ...a, balance: a.balance + Number(tx.amount) }
          return a
        })
      }
      return {
        ...d, accounts,
        transactions: [...d.transactions, newTx],
        schedules: d.schedules.map(s =>
          s.id === scheduleId ? { ...s, registered: [...(s.registered || []), date] } : s
        ),
      }
    })
  }, [update])

  const skipScheduleOccurrence = useCallback((scheduleId, date) => {
    update(d => ({
      ...d,
      schedules: d.schedules.map(s =>
        s.id === scheduleId ? { ...s, skipped: [...(s.skipped || []), date] } : s
      ),
    }))
  }, [update])

  // ── Budgets ─────────────────────────────────────────────────────────────────
  const addBudget = useCallback((budget) => {
    const id = 'bud_' + Date.now()
    update(d => ({ ...d, budgets: [...d.budgets, { ...budget, id }] }))
  }, [update])

  const updateBudget = useCallback((id, changes) => {
    update(d => ({ ...d, budgets: d.budgets.map(b => b.id === id ? { ...b, ...changes } : b) }))
  }, [update])

  const deleteBudget = useCallback((id) => {
    update(d => ({ ...d, budgets: d.budgets.filter(b => b.id !== id) }))
  }, [update])

  // ── Classification Rules ────────────────────────────────────────────────────
  const addRule = useCallback((rule) => {
    const id = 'rule_' + Date.now()
    update(d => ({ ...d, classificationRules: [...d.classificationRules, { ...rule, id }] }))
  }, [update])

  const updateRule = useCallback((id, changes) => {
    update(d => ({ ...d, classificationRules: d.classificationRules.map(r => r.id === id ? { ...r, ...changes } : r) }))
  }, [update])

  const deleteRule = useCallback((id) => {
    update(d => ({ ...d, classificationRules: d.classificationRules.filter(r => r.id !== id) }))
  }, [update])

  // ── Payees ──────────────────────────────────────────────────────────────────
  const addPayee = useCallback((name) => {
    update(d => {
      if (d.payees.includes(name)) return d
      return { ...d, payees: [...d.payees, name] }
    })
  }, [update])

  // ── Cost Centers ─────────────────────────────────────────────────────────────
  const addCostCenter = useCallback((name) => {
    update(d => {
      if (d.costCenters.includes(name)) return d
      return { ...d, costCenters: [...d.costCenters, name] }
    })
  }, [update])

  // ── Financial Month ──────────────────────────────────────────────────────────
  const getFinancialPeriod = useCallback((referenceDate = new Date()) => {
    const startDay = data.settings.financialMonthStartDay || 1
    const ref = new Date(referenceDate)
    const day = ref.getDate()
    let start, end
    if (day >= startDay) {
      start = new Date(ref.getFullYear(), ref.getMonth(), startDay)
      end = new Date(ref.getFullYear(), ref.getMonth() + 1, startDay - 1)
    } else {
      start = new Date(ref.getFullYear(), ref.getMonth() - 1, startDay)
      end = new Date(ref.getFullYear(), ref.getMonth(), startDay - 1)
    }
    return { start, end }
  }, [data.settings.financialMonthStartDay])

  // ── Schedule Occurrences ─────────────────────────────────────────────────────
  const getNextOccurrences = useCallback((schedule, count = 12) => {
    const occurrences = []
    const registered = schedule.registered || []
    const skipped = schedule.skipped || []
    let current = parseISO(schedule.startDate)
    const maxInstallments = schedule.occurrenceType === 'installment' ? schedule.installments : Infinity
    let totalOccurrences = 0
    const allDone = [...registered, ...skipped]

    while (occurrences.length < count && totalOccurrences < maxInstallments) {
      const dateStr = format(current, 'yyyy-MM-dd')
      totalOccurrences++
      if (!allDone.includes(dateStr)) occurrences.push(dateStr)
      if (occurrences.length >= count) break
      switch (schedule.frequency) {
        case 'daily': current = addDays(current, 1); break
        case 'weekly': current = addWeeks(current, 1); break
        case 'biweekly': current = addWeeks(current, 2); break
        case 'monthly': current = addMonths(current, 1); break
        case 'bimonthly': current = addMonths(current, 2); break
        case 'quarterly': current = addMonths(current, 3); break
        case 'quadrimestral': current = addMonths(current, 4); break
        case 'semiannual': current = addMonths(current, 6); break
        case 'annual': current = addYears(current, 1); break
        default: break
      }
      if (schedule.frequency === 'once') break
    }
    return occurrences
  }, [])

  // ── Classification ───────────────────────────────────────────────────────────
  const classifyByRules = useCallback((description) => {
    const lower = description.toLowerCase()
    for (const rule of data.classificationRules) {
      if (lower.includes(rule.contains.toLowerCase())) {
        return { categoryId: rule.categoryId, payee: rule.payee || '' }
      }
    }
    return null
  }, [data.classificationRules])

  const learnClassification = useCallback((description, categoryId, payee) => {
    const words = description.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    if (words.length === 0) return
    const keyword = words[0]
    update(d => {
      const exists = d.classificationRules.some(r => r.contains.toLowerCase() === keyword)
      if (exists) return d
      return {
        ...d,
        classificationRules: [...d.classificationRules, {
          id: 'rule_' + Date.now(),
          contains: keyword,
          categoryId,
          payee: payee || '',
        }],
      }
    })
  }, [update])

  // ── Gerencial Groups ─────────────────────────────────────────────────────────
  const addGerencialGroup = useCallback((group) => {
    update(d => {
      const nums = d.gerencialGroups.filter(g => typeof g.number === 'number').map(g => g.number)
      const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 2
      const id = 'grp_' + Date.now()
      return { ...d, gerencialGroups: [...d.gerencialGroups, { ...group, id, number: nextNum, fixed: false }] }
    })
  }, [update])

  const updateGerencialGroup = useCallback((id, changes) => {
    update(d => ({ ...d, gerencialGroups: d.gerencialGroups.map(g => g.id === id ? { ...g, ...changes } : g) }))
  }, [update])

  const deleteGerencialGroup = useCallback((id) => {
    update(d => ({ ...d, gerencialGroups: d.gerencialGroups.filter(g => g.id !== id) }))
  }, [update])

  // ── Payables ─────────────────────────────────────────────────────────────────
  const addPayable = useCallback((payable) => {
    const id = 'pay_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    update(d => ({ ...d, payables: [...(d.payables || []), { ...payable, id }] }))
  }, [update])

  const updatePayable = useCallback((id, changes) => {
    update(d => ({ ...d, payables: (d.payables || []).map(p => p.id === id ? { ...p, ...changes } : p) }))
  }, [update])

  const deletePayable = useCallback((id) => {
    update(d => ({ ...d, payables: (d.payables || []).filter(p => p.id !== id) }))
  }, [update])

  const gerarContasPagarFatura = useCallback((cartaoId, billStart, billEnd, mesAno) => {
    update(d => {
      const card = d.accounts.find(a => a.id === cartaoId)
      if (!card) return d

      const grpDId = d.gerencialGroups.find(g => g.number === 'D')?.id || 'grp_D'
      const existingKeys = new Set(
        (d.payables || []).map(p => `${p.cartaoId}|${p.mesAno}|${p.grupoGerencialId}`)
      )

      const gerencialTxs = d.transactions.filter(tx =>
        tx.accountId === cartaoId &&
        tx.type === 'expense' &&
        tx.grupoGerencial &&
        tx.grupoGerencial !== grpDId &&
        tx.date >= billStart &&
        tx.date <= billEnd
      )

      if (gerencialTxs.length === 0) return d

      const startDay = d.settings.financialMonthStartDay || 1
      const billEndDate = new Date(billEnd + 'T00:00:00')
      const dueDate = new Date(billEndDate.getFullYear(), billEndDate.getMonth() + 1, startDay)
      const dueDateStr = dueDate.toISOString().split('T')[0]

      const groups = {}
      for (const tx of gerencialTxs) {
        groups[tx.grupoGerencial] = (groups[tx.grupoGerencial] || 0) + tx.amount
      }

      const newPayables = []
      for (const [grupoId, amount] of Object.entries(groups)) {
        const key = `${cartaoId}|${mesAno}|${grupoId}`
        if (existingKeys.has(key)) continue
        const grupo = d.gerencialGroups.find(g => g.id === grupoId)
        const cardName = card.apelido || card.name
        const grupoAlias = grupo?.alias || grupoId
        newPayables.push({
          id: 'pay_' + Date.now() + '_' + Math.random().toString(36).slice(2),
          cartaoId,
          mesAno,
          grupoGerencialId: grupoId,
          origin: grupo?.number === 1 ? 'gerencial' : 'invoice',
          description: `Fatura ${cardName} ${grupoAlias} · ${mesAno}`,
          amount,
          dueDate: dueDateStr,
          status: 'pending',
          paidAt: null,
          billStart,
          billEnd,
        })
      }

      if (newPayables.length === 0) return d
      return { ...d, payables: [...(d.payables || []), ...newPayables] }
    })
  }, [update])

  // ── Recurring Schedule Match ──────────────────────────────────────────────────

  const findMatchingSchedule = useCallback((tx) => {
    if (tx.type !== 'expense' || tx.accountType !== 'credit') return null
    const exceptions = data.settings.recurringMatchExceptions || []
    const txPayee = (tx.payee || '').toLowerCase().trim()
    if (txPayee && exceptions.includes(txPayee)) return null

    return data.schedules.find(schedule => {
      if (schedule.transactionType !== 'expense') return false
      if (Math.abs(schedule.amount - Number(tx.amount)) > 0.50) return false
      const sPayee = (schedule.payee || '').toLowerCase().trim()
      const txDesc = (tx.description || '').toLowerCase()
      const sDesc = (schedule.description || '').toLowerCase()
      // Payee match takes priority
      if (txPayee && sPayee) {
        return txPayee === sPayee || txPayee.includes(sPayee) || sPayee.includes(txPayee)
      }
      // Fallback: first significant word of schedule description in tx description
      if (txDesc && sDesc) {
        const keyword = sDesc.split(/\s+/).find(w => w.length > 3)
        return keyword ? txDesc.includes(keyword) : false
      }
      return false
    }) || null
  }, [data.schedules, data.settings.recurringMatchExceptions])

  const addRecurringMatchException = useCallback((payee) => {
    const norm = (payee || '').toLowerCase().trim()
    if (!norm) return
    update(d => ({
      ...d,
      settings: {
        ...d.settings,
        recurringMatchExceptions: [
          ...(d.settings.recurringMatchExceptions || []).filter(p => p !== norm),
          norm,
        ],
      },
    }))
  }, [update])

  // Marca a ocorrência do agendamento como cumprida SEM criar nova transação
  const markScheduleRegistered = useCallback((scheduleId, date) => {
    update(d => ({
      ...d,
      schedules: d.schedules.map(s =>
        s.id === scheduleId
          ? { ...s, registered: [...(s.registered || []).filter(d => d !== date), date] }
          : s
      ),
    }))
  }, [update])

  // ── Gerencial Processing ──────────────────────────────────────────────────────
  const processarLancamentoGerencial = useCallback((lancamento, grupoId) => {
    const grupo = data.gerencialGroups?.find(g => g.id === grupoId)
    if (!grupo) return { needsResgate: false }
    if (grupo.number === 'D') return { needsResgate: false }

    if (grupo.number === 1) {
      update(d => {
        const cartao = d.accounts.find(a => a.id === lancamento.accountId)
        const apelido = cartao?.apelido || cartao?.name?.slice(0, 6) || 'CC'
        const subcontaName = `Ger. ${apelido}`

        const contaPrincipal =
          d.accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal) ||
          d.accounts.find(a => a.isMain && a.type !== 'credit') ||
          d.accounts.find(a => a.type === 'checking')

        if (!contaPrincipal) return d

        let accounts = [...d.accounts]
        let subcontaId = d.accounts.find(a => a.name === subcontaName)?.id

        if (!subcontaId) {
          subcontaId = 'acc_ger_' + Date.now()
          accounts = [...accounts, {
            id: subcontaId,
            name: subcontaName,
            type: 'savings',
            balance: lancamento.amount,
            bank: '',
            apelido: `G${apelido}`.slice(0, 8),
            fluxoCaixaPrincipal: false,
            isMain: false,
            contaCorrentePrincipal: false,
            grupoGerencial: grupoId,
          }]
        } else {
          accounts = accounts.map(a =>
            a.id === subcontaId ? { ...a, balance: (a.balance || 0) + lancamento.amount } : a
          )
        }

        accounts = accounts.map(a =>
          a.id === contaPrincipal.id ? { ...a, balance: (a.balance || 0) - lancamento.amount } : a
        )

        const txId = 'tx_ger_' + Date.now() + '_' + Math.random().toString(36).slice(2)
        const newTx = {
          id: txId,
          type: 'transfer',
          accountId: contaPrincipal.id,
          toAccountId: subcontaId,
          amount: lancamento.amount,
          date: lancamento.date,
          description: `Provisão ${subcontaName}`,
          grupoGerencial: grupoId,
          createdAt: new Date().toISOString(),
        }

        return { ...d, accounts, transactions: [...d.transactions, newTx] }
      })
      return { needsResgate: false }
    }

    const contaResgate = data.accounts.find(a => a.id === grupo.defaultAccountId)
    return { needsResgate: true, grupo, contaResgate: contaResgate || null }
  }, [data.gerencialGroups, data.accounts, update])

  // ── Loading screen ───────────────────────────────────────────────────────────
  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-center">
          <div
            className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-4"
            style={{ borderColor: '#0F6E56', borderTopColor: 'transparent' }}
          />
          <p className="text-gray-400 text-sm">Carregando dados...</p>
        </div>
      </div>
    )
  }

  return (
    <AppContext.Provider value={{
      data,
      settings: data.settings,
      accounts: data.accounts,
      transactions: data.transactions,
      schedules: data.schedules,
      budgets: data.budgets,
      categories: data.categories,
      classificationRules: data.classificationRules,
      costCenters: data.costCenters,
      payees: data.payees,
      gerencialGroups: data.gerencialGroups,
      payables: data.payables || [],
      updateSettings,
      addAccount, updateAccount, deleteAccount, setMainAccount,
      addTransaction, updateTransaction, deleteTransaction,
      addCategory, deleteCategory,
      addSchedule, updateSchedule, deleteSchedule,
      registerScheduleOccurrence, skipScheduleOccurrence,
      addBudget, updateBudget, deleteBudget,
      addRule, updateRule, deleteRule,
      addPayee, addCostCenter,
      addGerencialGroup, updateGerencialGroup, deleteGerencialGroup,
      processarLancamentoGerencial,
      addPayable, updatePayable, deletePayable, gerarContasPagarFatura,
      findMatchingSchedule, addRecurringMatchException, markScheduleRegistered,
      dbStatus,
      getFinancialPeriod,
      getNextOccurrences,
      classifyByRules,
      learnClassification,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
