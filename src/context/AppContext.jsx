import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { addMonths, addWeeks, addDays, addYears, format, parseISO, isAfter, isBefore, startOfDay } from 'date-fns'

const AppContext = createContext(null)

const STORAGE_KEY = 'finapp_data'

const defaultData = {
  settings: {
    financialMonthStartDay: 1,
    currency: 'BRL',
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
  ],
  classificationRules: [],
  costCenters: ['Pessoal', 'Família', 'Trabalho', 'Casa'],
  payees: [],
}

function loadData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { ...defaultData, ...parsed, settings: { ...defaultData.settings, ...(parsed.settings || {}) } }
    }
  } catch {}
  return defaultData
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {}
}

export function AppProvider({ children }) {
  const [data, setData] = useState(loadData)

  useEffect(() => {
    saveData(data)
  }, [data])

  const update = useCallback((updater) => {
    setData(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      return next
    })
  }, [])

  // --- Settings ---
  const updateSettings = useCallback((settings) => {
    update(d => ({ ...d, settings: { ...d.settings, ...settings } }))
  }, [update])

  // --- Accounts ---
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

  // --- Transactions ---
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

  // --- Categories ---
  const addCategory = useCallback((category) => {
    const id = 'cat_' + Date.now()
    update(d => ({ ...d, categories: [...d.categories, { ...category, id }] }))
  }, [update])

  const deleteCategory = useCallback((id) => {
    update(d => ({ ...d, categories: d.categories.filter(c => c.id !== id) }))
  }, [update])

  // --- Schedules ---
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
      const updatedSchedules = d.schedules.map(s =>
        s.id === scheduleId ? { ...s, registered: [...(s.registered || []), date] } : s
      )
      return { ...d, accounts, transactions: [...d.transactions, newTx], schedules: updatedSchedules }
    })
  }, [update])

  const skipScheduleOccurrence = useCallback((scheduleId, date) => {
    update(d => ({
      ...d,
      schedules: d.schedules.map(s =>
        s.id === scheduleId ? { ...s, skipped: [...(s.skipped || []), date] } : s
      )
    }))
  }, [update])

  // --- Budgets ---
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

  // --- Classification Rules ---
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

  // --- Payees ---
  const addPayee = useCallback((name) => {
    update(d => {
      if (d.payees.includes(name)) return d
      return { ...d, payees: [...d.payees, name] }
    })
  }, [update])

  // --- Cost Centers ---
  const addCostCenter = useCallback((name) => {
    update(d => {
      if (d.costCenters.includes(name)) return d
      return { ...d, costCenters: [...d.costCenters, name] }
    })
  }, [update])

  // --- Financial Month ---
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

  // --- Next occurrences for schedules ---
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
      if (!allDone.includes(dateStr)) {
        occurrences.push(dateStr)
      }
      if (occurrences.length >= count) break
      switch (schedule.frequency) {
        case 'daily': current = addDays(current, 1); break
        case 'weekly': current = addWeeks(current, 1); break
        case 'biweekly': current = addWeeks(current, 2); break
        case 'monthly': current = addMonths(current, 1); break
        case 'bimonthly': current = addMonths(current, 2); break
        case 'quarterly': current = addMonths(current, 3); break
        case 'semiannual': current = addMonths(current, 6); break
        case 'annual': current = addYears(current, 1); break
        default: break
      }
      if (schedule.frequency === 'once') break
    }
    return occurrences
  }, [])

  // Classify description by rules
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
        }]
      }
    })
  }, [update])

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
      updateSettings,
      addAccount, updateAccount, deleteAccount, setMainAccount,
      addTransaction, updateTransaction, deleteTransaction,
      addCategory, deleteCategory,
      addSchedule, updateSchedule, deleteSchedule,
      registerScheduleOccurrence, skipScheduleOccurrence,
      addBudget, updateBudget, deleteBudget,
      addRule, updateRule, deleteRule,
      addPayee, addCostCenter,
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
