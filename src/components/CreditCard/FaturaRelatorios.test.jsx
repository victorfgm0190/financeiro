// @vitest-environment jsdom
// Cartão de crédito: Extrato da Fatura (a fatura como o banco mostra) e Relatório Gerencial da Fatura.
// O total é o MESMO nos dois e no card "Fatura Selecionada" da tela do cartão (lib/faturaCartao).
// Dados FICTÍCIOS.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
const exportados = vi.hoisted(() => ({ xlsx: [], arquivos: [] }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/exportExcel', async (orig) => ({
  ...(await orig()),
  exportarExcel: async (spec) => { exportados.xlsx.push(spec); return 'baixado' },
  entregarArquivo: async (blob, nome) => { exportados.arquivos.push({ nome, blob }); return 'baixado' },
}))
const { default: ExtratoFatura } = await import('./ExtratoFatura.jsx')
const { default: RelatorioFatura } = await import('./RelatorioFatura.jsx')
const { default: CreditCardPanel } = await import('./CreditCardPanel.jsx')

const CARD = { id: 'c1', name: 'Cartão Teste', apelido: 'TESTE', type: 'credit', closingDay: 13, dueDay: 20, creditLimit: 10000 }
const VAZIO = { id: 'c2', name: 'Cartão Vazio', apelido: 'VAZIO', type: 'credit', closingDay: 15, dueDay: 22, creditLimit: 5000 }
const GRUPOS = [
  { id: 'g1', number: 1, alias: 'G', name: 'Reserva' }, { id: 'g2', number: 2, alias: '2', name: 'Contas Anuais' },
  { id: 'gd', number: 'D', alias: 'D', name: 'Despesas' },
]
const t = (o) => ({ accountId: 'c1', type: 'expense', description: 'Compra', reconciled: false, ...o })
const LANC = [
  t({ id: 'a', date: '2026-10-20', amount: 100, grupoGerencial: 'g1', description: 'Mercado' }),
  t({ id: 'b', date: '2026-08-10', amount: 50.1, faturaMonthYear: '2026-11', grupoGerencial: 'g2', installmentNum: 3, installmentTotal: 6, description: 'Loja 3/6' }),
  t({ id: 'd', date: '2026-11-02', amount: 2.9, description: 'IOF compra internacional' }),
  t({ id: 'e', date: '2026-11-03', amount: 30, grupoGerencial: 'gd', description: 'Farmácia' }),
  t({ id: 'f', date: '2026-11-05', amount: 10.01, type: 'income', description: 'Estorno Loja' }),
  t({ id: 'z', date: '2027-10-05', amount: 21.01, faturaMonthYear: '2027-10', grupoGerencial: 'g1', description: 'Parcela futura' }),
  { id: 'p', type: 'credit_payment', accountId: 'c1', date: '2026-10-25', amount: 4000, faturaMonthYear: '2026-10', description: 'Pagamento Efetuado' },
]
// Cartão vazio com uma compra agendada (prevista) de R$ 678,25 na fatura de novembro.
const AGENDA = [{ id: 's1', transactionType: 'expense', accountId: 'c2', amount: 678.25, startDate: '2026-11-10', frequency: 'once', description: 'Compra agendada' }]

const base = (o = {}) => {
  for (const k of Object.keys(app)) delete app[k]
  Object.assign(app, {
    profileAccounts: [CARD, VAZIO], accounts: [CARD, VAZIO], profileTransactions: LANC, transactions: LANC,
    profileSchedules: AGENDA, schedules: AGENDA, categories: [], gerencialGroups: GRUPOS, settings: {}, rateiosByLancamento: new Map(),
    getOccurrencesProjecao: (s) => [s.startDate], pode: () => true, scheduleReservaFuncoes: [],
    isFaturaFechada: () => false, creditUsage: () => 0, updateTransaction: vi.fn(),
    ...o,
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 10, 12, 0, 0)) // 10/11/2026: fatura atual do c1 = Nov/2026
  exportados.xlsx.length = 0
  exportados.arquivos.length = 0
  base()
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Extrato da Fatura', () => {
  it('lançamentos da fatura (competência), estorno abatido, pagamento e previstos fora do total', async () => {
    render(<ExtratoFatura initialCardId="c1" initialBillKey="2026-11" />)
    const ext = screen.getByTestId('extrato-fatura')
    expect(within(ext).getByTestId('extrato-fatura-total').textContent).toMatch('172,99')
    expect(within(ext).getAllByText('Parcela 3 de 6').length).toBeGreaterThan(0)
    expect(within(ext).getByText(/Pagamento efetuado \(fatura de Outubro\/2026\)/)).toBeTruthy()
    expect(within(ext).queryByText('Mercado')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Próxima fatura' }))
    expect(screen.getByTestId('extrato-fatura-rotulo').textContent).toMatch('Dezembro/2026')
    expect(screen.getByTestId('extrato-fatura-total').textContent).toMatch('0,00')
  })

  it('exporta Excel e CSV com o mesmo total', async () => {
    render(<ExtratoFatura initialCardId="c1" initialBillKey="2026-11" />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Excel' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'CSV' })) })
    const aba = exportados.xlsx[0].abas[0]
    expect(aba.linhas).toHaveLength(5)
    expect(Math.round(aba.linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100).toBe(172.99)
    expect(exportados.arquivos[0].nome).toMatch(/\.csv$/)
    const texto = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsText(exportados.arquivos[0].blob) })
    expect(texto).toMatch('"Parcela 3 de 6"')
  })

  it('cartão sem lançamento: previstos em bloco à parte, fora do total', () => {
    render(<ExtratoFatura initialCardId="c2" initialBillKey="2026-11" />)
    expect(screen.getByTestId('extrato-fatura-total').textContent).toMatch('0,00')
    expect(screen.getByTestId('extrato-fatura-previstos').textContent).toMatch('Compra agendada')
  })
})

describe('Relatório Gerencial da Fatura', () => {
  it('abre na fatura recebida; todos os lançamentos; cards fecham com o total; filtro por card', () => {
    render(<RelatorioFatura initialCardId="c1" initialBillKey="2026-11" />)
    expect(screen.getByLabelText(/^Fatura/).value).toBe('2026-11')
    expect(screen.getByTestId('relatorio-fatura-total').textContent).toMatch('172,99')
    expect(screen.getAllByTestId('relatorio-fatura-linha')).toHaveLength(5)
    expect(screen.getByTestId('card-grupo-G').textContent).toMatch('100,00')
    expect(screen.getByTestId('card-sem-grupo').textContent).toMatch('2,90')
    expect(screen.getByTestId('card-estornos').textContent).toMatch('10,01')
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByTestId('card-grupo-2'))
    expect(screen.getAllByTestId('relatorio-fatura-linha')).toHaveLength(1)
    fireEvent.click(screen.getByTestId('card-grupo-2'))
    expect(screen.getAllByTestId('relatorio-fatura-linha')).toHaveLength(5)
  })

  it('pelo menu (sem fatura recebida): sem fechada a pagar, abre na ABERTA (nunca na última futura)', () => {
    render(<RelatorioFatura />)
    const sel = screen.getByLabelText(/^Fatura/)
    expect(sel.value).toBe('2026-11')
    const rotulos = [...sel.options].map(o => o.textContent)
    expect(rotulos[0]).toBe('Out/2027 · futura')
    expect(rotulos).toContain('Nov/2026 · aberta')
  })

  it('pelo menu, com a fatura de novembro fechada e não paga: abre nela ("a pagar"), não na aberta', () => {
    vi.setSystemTime(new Date(2026, 10, 20, 12, 0, 0)) // 20/11: Nov/2026 fechou dia 13; aberta = Dez/2026
    render(<RelatorioFatura />)
    const sel = screen.getByLabelText(/^Fatura/)
    expect(sel.value).toBe('2026-11')
    const rotulos = [...sel.options].map(o => o.textContent)
    expect(rotulos).toContain('Nov/2026 · a pagar')
    expect(rotulos).toContain('Dez/2026 · aberta')
    cleanup()
    render(<ExtratoFatura />)
    expect(screen.getByTestId('extrato-fatura-rotulo').textContent).toMatch('Novembro/2026 · a pagar')
  })

  it('Excel: fatura inteira com a coluna do grupo + aba Resumo', async () => {
    render(<RelatorioFatura initialCardId="c1" initialBillKey="2026-11" />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Exportar Excel/ })) })
    const [fatura, resumo] = exportados.xlsx[0].abas
    expect(fatura.colunas.map(c => c.titulo)).toContain('Grupo Gerencial')
    expect(fatura.linhas).toHaveLength(5)
    expect(resumo.nome).toBe('Resumo')
    expect(Math.round(resumo.linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100).toBe(172.99)
  })

  it('aba "Movimentos do Cartão por Data" mostra o extrato por período, com exportação', async () => {
    render(<RelatorioFatura initialCardId="c1" initialBillKey="2026-11" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Movimentos do Cartão por Data' }))
    expect(screen.getByRole('heading', { name: 'Movimentos do Cartão por Data' })).toBeTruthy()
    // Período padrão = mês de calendário (01–30/11): Estorno de 05/11 e compras de 02 e 03/11.
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: /CSV/ }).at(-1)) })
    expect(exportados.arquivos.at(-1).nome).toMatch(/^Finup_Movimentos-do-Cartao-por-Data-TESTE_.*\.csv$/)
  })

  it('controle gerencial desligado: cards por categoria consideram o rateio', () => {
    const rateios = new Map([['a', [{ categoriaId: 'cat_casa', valor: 60 }, { categoriaId: 'cat_mercado', valor: 40 }]]])
    base({ settings: { controleGerencial: false }, rateiosByLancamento: rateios,
      categories: [{ id: 'cat_casa', name: 'Casa' }, { id: 'cat_mercado', name: 'Mercado' }] })
    render(<RelatorioFatura initialCardId="c1" initialBillKey="2026-11" />)
    const cards = screen.getAllByRole('button').map(b => b.textContent)
    expect(cards.some(t => /Casa.*60,00/.test(t))).toBe(true)
    expect(cards.some(t => /Mercado.*40,00/.test(t))).toBe(true)
  })

  it('controle gerencial desligado: "Relatório da Fatura", sem cards de grupo, coluna Ger. nem aba gerencial', () => {
    base({ settings: { controleGerencial: false } })
    render(<RelatorioFatura initialCardId="c1" initialBillKey="2026-11" />)
    expect(screen.getByTestId('relatorio-fatura').querySelector('h2').textContent).toMatch(/^\s*Relatório da Fatura/)
    expect(screen.getByTestId('relatorio-fatura-total').textContent).toMatch('172,99')
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByText('Ger.')).toBeNull()
    expect(screen.queryByTestId('card-grupo-G')).toBeNull()
  })
})

describe('Tela do cartão: mesmo total e regra dos previstos', () => {
  it('Fatura Selecionada = Extrato da Fatura = Relatório; botões com os nomes novos', async () => {
    render(<CreditCardPanel />)
    await act(async () => {})
    const card = document.querySelector('[data-guia="credit.fatura-selecionada"]')
    expect(card.textContent).toMatch('172,99')
    expect(screen.getByRole('button', { name: /Relatório Gerencial/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Extrato da Fatura/ }))
    expect(screen.getByTestId('extrato-fatura-total').textContent).toMatch('172,99')
    fireEvent.click(screen.getByRole('button', { name: /Voltar ao Cartão/ }))
    fireEvent.click(screen.getByRole('button', { name: /Relatório Gerencial/ }))
    expect(screen.getByTestId('relatorio-fatura-total').textContent).toMatch('172,99')
    expect(screen.getByLabelText(/^Fatura/).value).toBe('2026-11')
  })

  it('cartão sem lançamento com previsto: nunca "Quitada totalmente" junto com "Falta pagar"', async () => {
    base({ profileAccounts: [VAZIO, CARD], accounts: [VAZIO, CARD] })
    render(<CreditCardPanel />)
    await act(async () => {})
    expect(screen.queryByText('Quitada totalmente')).toBeNull()
    expect(screen.getAllByText(/Falta pagar R\$\s*678,25/).length).toBeGreaterThan(0)
    expect(document.querySelector('[data-guia="credit.divida-total"]').textContent).toMatch(/678,25 previstos nesta fatura/)
  })
})
