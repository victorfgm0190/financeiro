// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/assistenteApi', () => ({
  aprenderApelidos: async () => ({}), concluirPreLancamento: async () => ({}), listarPreLancamentos: async () => [],
  guardarPreLancamento: async () => ({}), cotacaoDolar: async () => ({}), listarApelidos: async () => [],
}))
vi.mock('../Transactions/TransactionForm', () => ({
  default: ({ initial }) => (
    <p data-testid="form">
      {`rep=${initial.repeatFrequency || '-'} ini=${initial.repeatStartDate || '-'} vezes=${initial.repeatInstallments || '-'} `}
      {`rateio=${(initial.rateio || []).map(r => `${r.categoriaId}:${r.valor}`).join(',') || '-'} amount=${initial.amount} notes=${initial.notes || '-'}`}
    </p>
  ),
}))
vi.mock('../Schedule/ScheduleForm', () => ({ default: ({ initial }) => <p data-testid="agendamento">{`AGENDAMENTO ${initial.frequency} ${initial.startDate} ${initial.description} nº=${initial.numeroContrato || ''}`}</p> }))
const { default: PreviaAssistente } = await import('./PreviaAssistente.jsx')

const base = (o = {}) => Object.assign(app, {
  transactions: [], schedules: [], accounts: [{ id: 'cc', name: 'Conta', type: 'checking' }, { id: 'card', name: 'Cartão', type: 'credit', closingDay: 25 }],
  activeProfileId: null, updateAccount: vi.fn(), pode: () => true, getNextOccurrences: () => [], settings: {},
  addTransaction: vi.fn(), setReconciled: vi.fn(), categories: [{ id: 'cat_gas', name: 'Gasolina' }, { id: 'cat_ali', name: 'Alimentação' }, { id: 'cat_net', name: 'Internet' }],
  payees: [], gerencialGroups: [], reserveFunctions: [], tiposDocumento: [], ...o,
})
const sug = (o = {}) => ({
  tipo: 'despesa', valor: 120, data: '2026-11-12', conta_id: 'cc', categoria_id: 'cat_net', descricao: 'Internet',
  favorecido_novo: 'Provedor', confianca: {}, termos: {}, ...o,
})
const abrir = (s, texto = 'despesa de internet 120 na conta') =>
  render(<PreviaAssistente ferramenta="registrar_lancamento" sugestao={s} textoOriginal={texto} onClose={() => {}} onToast={() => {}} guardarAoFechar={false} />)
const botao = (nome) => screen.getByRole('button', { name: new RegExp(nome) })

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Prévia do Assistente: Só despesa / Despesa + agendamento', () => {
  it('20/30) sem indícios: os dois botões, nenhum destacado; escolher agendar liga a repetição', () => {
    base()
    abrir(sug())
    expect(botao('Só despesa')).toBeTruthy()
    expect(botao('Despesa \\+ agendamento')).toBeTruthy()
    expect(screen.queryByText('(sugerido)')).toBeNull()
    expect(screen.queryByRole('button', { name: /Só agendamento/ })).toBeNull()
    fireEvent.click(botao('Despesa \\+ agendamento'))
    expect(screen.getByTestId('form').textContent).toMatch(/rep=monthly ini=2026-11-12/)
    expect(screen.getByText(/1ª ocorrência/)).toBeTruthy()
  })

  it('13) cupom fiscal → "Só despesa" destacado', () => {
    base()
    abrir(sug({ descricao: 'Posto', documento: { natureza: 'cupom', pago: true } }), 'foto')
    expect(botao('Só despesa').textContent).toMatch(/sugerido/)
    expect(screen.getByText(/Cupom fiscal de compra/)).toBeTruthy()
  })

  it('15) boleto com contrato e vencimento futuro → "Só agendamento" destacado; escolhido abre o agendamento mensal com o nº', () => {
    base()
    abrir(sug({ valor: 389.9, descricao: 'Financeira', documento: { natureza: 'boleto', numero_contrato: '12345', vencimento: '2026-12-10', pago: false } }), 'foto do boleto')
    expect(screen.getByText(/contrato nº 12345 — parece cobrança mensal/)).toBeTruthy()
    expect(botao('Só agendamento').textContent).toMatch(/sugerido/)
    fireEvent.click(botao('Só agendamento'))
    expect(screen.getByTestId('agendamento').textContent).toBe('AGENDAMENTO monthly 2026-12-10 Financeira nº=12345') // nº no campo próprio, descrição limpa
  })

  it('21) "e agende todo dia 10": não pergunta; já vem despesa + agendamento, 1ª ocorrência em 10/12', () => {
    base()
    abrir(sug({ valor: 250, descricao: 'Energia', repetir: 'monthly', repetir_dia: 10 }), 'despesa de energia 250 e agende todo dia 10')
    expect(screen.queryByRole('button', { name: /Só despesa/ })).toBeNull()
    expect(screen.getByTestId('form').textContent).toMatch(/rep=monthly ini=2026-11-10/)
    expect(screen.getByText('10/12/2026')).toBeTruthy()
  })

  it('22) "mensal até dezembro de 2027" → nº de vezes', () => {
    base()
    abrir(sug({ valor: 1500, descricao: 'Aluguel', repetir: 'monthly', repetir_ate: '2027-12-31' }), 'lança aluguel 1500 e agenda mensal até dezembro de 2027')
    expect(screen.getByTestId('form').textContent).toMatch(/vezes=14/)
  })
})

describe('Prévia do Assistente: parcela já lançada e rateio', () => {
  const P10 = { id: 'seg_10', type: 'expense', accountId: 'card', accountType: 'credit', amount: 150, date: '2026-11-15', faturaMonthYear: '2026-12', description: 'SEGURO X 10/12', payee: 'Seguro X', installmentNum: 10, installmentTotal: 12, reconciled: false }
  const smsParcela = (o = {}) => sug({ valor: 150, conta_id: 'card', descricao: 'SEGURO X', favorecido_novo: 'Seguro X', categoria_id: null, parcela_atual: { numero: 10, total: 12 }, ...o })

  it('24) SMS "parcela 10/12" com a série no cartão: não cria; "Confirmar vínculo" só concilia', () => {
    base({ transactions: [P10] })
    abrir(smsParcela(), 'Compra aprovada de R$ 150,00 em SEGURO X parcela 10/12 cartao final 1234')
    expect(screen.getByText(/A parcela 10\/12 de SEGURO X 10\/12 já está lançada na fatura de dez\/2026/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Só despesa/ })).toBeNull()
    fireEvent.click(botao('Confirmar vínculo'))
    expect(app.setReconciled).toHaveBeenCalledWith(['seg_10'], true)
    expect(app.addTransaction).not.toHaveBeenCalled()
  })

  it('25) valor diferente → "Ajustar valor"; "Lançar mesmo assim" pede confirmação do dobro', () => {
    base({ transactions: [P10] })
    abrir(smsParcela({ valor: 152 }), 'parcela 10/12 SEGURO X R$ 152,00')
    expect(botao('Ajustar valor').textContent).toMatch(/de R\$\s?150,00 para R\$\s?152,00/)
    fireEvent.click(botao('Lançar mesmo assim'))
    expect(screen.getByText(/vai ficar em DOBRO/)).toBeTruthy()
  })

  it('28) rateio: um lançamento de R$ 250 com Gasolina 200 / Alimentação 50', () => {
    base()
    abrir(sug({ valor: 250, descricao: 'Posto', rateio: [{ categoria_id: 'cat_gas', valor: 200, termo: 'gasolina' }, { categoria_id: 'cat_ali', valor: 50, termo: 'alimentação' }], rateio_faltam: 0 }),
      'gastei 250 no posto, 200 de gasolina e 50 de alimentação')
    expect(screen.getByTestId('form').textContent).toMatch(/rateio=cat_gas:200,cat_ali:50 amount=250/)
  })

  it('29) faltam R$ 50 → pergunta a categoria ou ajustar o total', () => {
    base({ transactions: [{ type: 'expense', categoryId: 'cat_ali', date: '2026-11-01' }] })
    abrir(sug({ valor: 250, descricao: 'Posto', rateio: [{ categoria_id: 'cat_gas', valor: 200, termo: 'gasolina' }], rateio_faltam: 50 }), 'gastei 250 no posto, 200 de gasolina')
    expect(screen.getByText(/Faltam R\$\s?50,00\. Em qual categoria\?/)).toBeTruthy()
    fireEvent.click(botao('Alimentação'))
    expect(screen.getByTestId('form').textContent).toMatch(/rateio=cat_gas:200,cat_ali:50/)
    cleanup()
    abrir(sug({ valor: 250, descricao: 'Posto', rateio: [{ categoria_id: 'cat_gas', valor: 200 }], rateio_faltam: 50 }), 'x')
    fireEvent.click(botao('Ajustar o total'))
    expect(screen.getByTestId('form').textContent).toMatch(/amount=200/)
  })
})
