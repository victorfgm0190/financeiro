// Fixtures determinísticas para comparar o desconto de envelope nos cálculos de saldo (Saldo
// Principal, Fluxo de Caixa, saldo por conta, tela Envelopes) — com e sem rateio.
const rnd = (seed) => { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 } }
export const REF = new Date(2026, 10, 15) // 15/11/2026
export const SETTINGS = { financialMonthStartDay: 1, financialMonthMode: 'custom' }
export const periodo = (ref) => ({ start: new Date(ref.getFullYear(), ref.getMonth(), 1), end: new Date(ref.getFullYear(), ref.getMonth() + 1, 0) })
export const ACCOUNTS = [
  { id: 'cc', name: 'Conta', type: 'checking', fluxoCaixaPrincipal: true, balance: 5000, initialBalance: 3000, profileId: 'p' },
  { id: 'cc2', name: 'Conta 2', type: 'checking', fluxoCaixaPrincipal: true, balance: 1000, initialBalance: 1000, profileId: 'p' },
]
export const CATS = ['merc', 'confra', 'farm', 'lazer', 'comb']
export const ENVELOPES = [
  { id: 'e1', name: 'Mercado', categoryIds: ['merc'], limitAmount: 800, dueDay: 1, accountId: 'cc' },
  { id: 'e2', name: 'Lazer', categoryIds: ['lazer', 'confra'], limitAmount: 300, dueDay: 1, accountId: 'cc' },
  { id: 'e3', name: 'Farmácia', categoryIds: ['farm'], limitAmount: 150.55, dueDay: 1, accountId: 'cc2' },
]
export function transacoes(seed, n = 40) {
  const r = rnd(seed)
  return Array.from({ length: n }, (_, i) => {
    const dia = 1 + Math.floor(r() * 28)
    const mes = r() < 0.8 ? 11 : 10
    return {
      id: `t${seed}_${i}`, type: r() < 0.9 ? 'expense' : 'income', accountId: r() < 0.7 ? 'cc' : 'cc2',
      amount: Math.round(r() * 30000) / 100, categoryId: CATS[Math.floor(r() * CATS.length)],
      date: `2026-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
    }
  })
}
export const SEMENTES = [1, 7, 42, 99, 2026]
