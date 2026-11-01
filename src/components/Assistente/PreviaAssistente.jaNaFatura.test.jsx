// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// SMS de cartão de uma parcela que JÁ está na fatura (projeção da importação, pendente):
// aviso "parece já estar na Fatura", Confirmar só concilia, valor diferente oferece Ajustar,
// compra nova segue para a prévia normal.
const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/assistenteApi', () => ({
  aprenderApelidos: async () => ({}), concluirPreLancamento: async () => ({}), listarPreLancamentos: async () => [],
  guardarPreLancamento: async () => ({}), cotacaoDolar: async () => ({}), listarApelidos: async () => [],
}))
vi.mock('../Transactions/TransactionForm', () => ({
  default: ({ initial, ajustes }) => (
    <p>FORMULÁRIO id={initial.id || 'novo'} cat={initial.categoryId || '-'} ajustes={JSON.stringify(ajustes || null)}</p>
  ),
}))
const { default: PreviaAssistente } = await import('./PreviaAssistente.jsx')

const parcela8 = {
  id: 'p8', type: 'expense', accountId: 'card', accountType: 'credit', amount: 205.61, date: '2026-10-15', faturaMonthYear: '2026-11',
  description: 'Seguradora Alfa Parc2 08/12', payee: 'Seguradora Alfa', installmentNum: 8, installmentTotal: 12,
  categoryId: 'cat_seguro', reconciled: false,
}
Object.assign(app, {
  transactions: [parcela8], accounts: [{ id: 'card', name: 'Cartão X', type: 'credit', closingDay: 25 }],
  activeProfileId: null, updateAccount: vi.fn(), pode: () => true, getNextOccurrences: () => [], schedules: [],
  settings: {}, addTransaction: vi.fn(), setReconciled: vi.fn(), categories: [], payees: ['Seguradora Alfa'],
  gerencialGroups: [], reserveFunctions: [], tiposDocumento: [],
})
const SMS = 'Compra aprovada de R$ 205,61 em SeguradoraAlfa Parc8, 31/10 as 10:22, cartao final 4541'
const sugestao = (o = {}) => ({
  tipo: 'despesa', valor: 205.61, data: '2026-10-31', conta_id: 'card', categoria_id: null, descricao: 'SeguradoraAlfa Parc8',
  favorecido_id: 'Seguradora Alfa', favorecido_novo: null, confianca: { valor: 1, data: 1, conta: 1, categoria: 1, descricao: 1, favorecido: 1 },
  termos: {}, ...o,
})
const abrir = (s = sugestao(), texto = SMS) => {
  const onClose = vi.fn()
  render(<PreviaAssistente ferramenta="registrar_lancamento" sugestao={s} textoOriginal={texto} onClose={onClose} onToast={() => {}} guardarAoFechar={false} />)
  return { onClose }
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('PreviaAssistente: lançamento que já está na fatura', () => {
  // "Parc8" do SMS (sem o total) já é parcela: mensagem de parcela com o total da série (31/10).
  it('parcela existente → "A parcela 8/12 … já está lançada"; "Confirmar vínculo" concilia e não cria nada', () => {
    const { onClose } = abrir()
    expect(screen.getByText(/A parcela 8\/12 de Seguradora Alfa Parc2 08\/12 já está lançada na fatura de nov\/2026/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Ajustar valor/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar vínculo/ }))
    expect(app.setReconciled).toHaveBeenCalledWith(['p8'], true)
    expect(app.addTransaction).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('valor R$ 2,00 diferente → "Ajustar valor" de R$ 205,61 para R$ 207,61 abre a edição do existente', () => {
    abrir(sugestao({ valor: 207.61 }), SMS.replace('205,61', '207,61'))
    const btn = screen.getByRole('button', { name: /Ajustar valor/ })
    expect(btn.textContent).toMatch(/de R\$\s?205,61 para R\$\s?207,61/)
    fireEvent.click(btn)
    expect(screen.getByText(/FORMULÁRIO id=p8 .*ajustes=\{"amount":207.61\}/)).toBeTruthy()
    expect(app.addTransaction).not.toHaveBeenCalled()
  })

  it('"Lançar mesmo assim" → prévia normal com aviso de possível duplicidade e categoria herdada', () => {
    abrir()
    fireEvent.click(screen.getByRole('button', { name: /Lançar mesmo assim/ }))
    fireEvent.click(screen.getByRole('button', { name: /Sim, lançar em dobro/ })) // parcela: confirma o dobro
    expect(screen.getByText(/Possível duplicidade/)).toBeTruthy()
    expect(screen.getByText(/FORMULÁRIO id=novo cat=cat_seguro/)).toBeTruthy()
  })

  it('compra nova → prévia normal, sem aviso; categoria mais usada do favorecido', () => {
    abrir(sugestao({ valor: 48.5, descricao: 'SEGURO EXTRA', favorecido_id: 'Seguradora Alfa' }), 'Compra aprovada de R$ 48,50 em SEGURO EXTRA')
    expect(screen.queryByText(/parece já estar na Fatura/)).toBeNull()
    expect(screen.getByText(/FORMULÁRIO id=novo cat=cat_seguro/)).toBeTruthy()
    expect(screen.getByText(/Categoria sugerida/)).toBeTruthy()
  })
})
