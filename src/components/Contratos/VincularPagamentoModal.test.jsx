// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { gerarPlanoParcelas, linhasDoContrato, parcelaDeVinculo, idParcela, r2 } from '../../lib/contratos/parcelas.js'

// Tela branca de 03/11 (vm): ao gravar, o estado novo chega com o lançamento já vinculado — ele sai
// da lista de candidatos e a conferência ficava sem ele (TypeError em txEscolhido.date).
const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
const { default: VincularPagamentoModal } = await import('./VincularPagamentoModal.jsx')
const { default: LimiteDeErro } = await import('../shared/LimiteDeErro.jsx')

afterEach(cleanup)

const C = {
  id: 'c1', tipo: 'pagar', modalidade: 'aluguel', objeto: 'Apto', favorecido: 'Imob Lar', data_inicio: '2026-08-20', data_fim: '2031-08-20',
  valor_base: 3900, periodicidade: 'mensal', dia_vencimento: 20, indice_reajuste: 'NENHUM', bonificacao_valor: 200, bonificacao_meses: 12,
  tem_condominio: false, conta_id: 'cc', categoria_id: 'cat', excluidas: [],
}
const TX = { id: 'tx22', date: '2026-08-22', amount: 3700, accountId: 'cc', categoryId: 'cat', payee: 'Imob Lar', description: 'IMOB LAR', type: 'expense' }
const OUT = {
  id: idParcela('c1', 'aluguel', '2026-10'), contratoId: 'c1', contratoPapel: 'aluguel', frequency: 'once', startDate: '2026-10-20',
  amount: 3700, registered: [], registeredMeta: {}, skipped: [], overrides: {}, composicao: { itens: [], total: 3700 },
}

describe('VincularPagamentoModal', () => {
  it('gravar com o lançamento saindo dos candidatos: a conferência continua na tela (sem tela branca)', async () => {
    const plano = gerarPlanoParcelas(C, { hoje: '2026-11-03' })
    const linha = linhasDoContrato(C, [OUT], [TX], { hoje: '2026-11-03', plano }).find(l => l.semParcela && l.competencia === '2026-08')
    let rerender
    let soltar
    const tela = () => <VincularPagamentoModal contrato={C} linha={linha} onClose={() => {}} onConcluido={() => {}} />
    Object.assign(app, {
      schedules: [OUT], transactions: [TX], accounts: [], vincularLancamento: () => ({ ok: true }), desvincularLancamento: () => ({ ok: true }),
      vincularLancamentoNaLinha: vi.fn(async (c, l, t) => {
        const item = { id: idParcela(c.id, l.papel, l.competencia), papel: l.papel, numero: l.numero, total: l.total, competencia: l.competencia,
          vencimento: l.vencimento, valor: r2(l.valor), valorStatus: 'confirmado', composicao: l.composicao }
        app.schedules = [OUT, parcelaDeVinculo(c, item, t)]
        app.transactions = [{ ...t, dataOcorrencia: l.vencimento, contratoId: c.id }]
        rerender(tela())
        await new Promise(ok => { soltar = ok }) // gravação no banco em andamento
        throw new Error('O vínculo não foi gravado: HTTP 503. Nada foi alterado; tente de novo.')
      }),
    })
    ;({ rerender } = render(tela()))
    fireEvent.click(screen.getByText(/22\/08\/2026 · Imob Lar/).closest('label').querySelector('input'))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar' }))
    fireEvent.click(screen.getByRole('button', { name: /Gravar vínculo/ }))
    // Estado novo já na tela: a conferência segue com o lançamento guardado.
    expect(screen.getByText(/Esta competência não tem parcela/)).toBeTruthy()
    expect(screen.getByText(/22\/08\/2026 · Imob Lar · R\$ 3\.700,00/)).toBeTruthy()
    await act(async () => { soltar() })
    expect(screen.getByText(/O vínculo não foi gravado: HTTP 503/)).toBeTruthy()
    expect(app.vincularLancamentoNaLinha.mock.calls[0][3]).toMatchObject({ vincular: expect.any(Function), desvincular: expect.any(Function) })
  })
})

describe('LimiteDeErro', () => {
  it('erro de tela vira aviso no lugar da parte; o resto continua', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Quebra = () => { throw new TypeError("Cannot read properties of null (reading 'date')") }
    render(<div><p>Resto do app</p><LimiteDeErro nome="teste"><Quebra /></LimiteDeErro></div>)
    expect(screen.getByRole('alert').textContent).toMatch(/Não foi possível abrir esta parte — recarregue/)
    expect(screen.getByText('Resto do app')).toBeTruthy()
  })
})
