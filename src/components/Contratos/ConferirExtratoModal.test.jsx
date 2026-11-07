// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'

// Conferência do extrato da administradora (dados fictícios; caso de referência: aluguel 2.200, adm.
// 10%, início 21/02/2026, intermediação 2.200 em 470/865/865).
const CONTRATO = {
  id: 'c9', tipo: 'receber', modalidade: 'aluguel', modo_repasse: true, objeto: 'Imóvel Exemplo', favorecido: 'Administradora Exemplo',
  data_inicio: '2026-02-21', data_fim: '2026-09-30', valor_base: 2200, periodicidade: 'mensal', dia_vencimento: 5, dia_repasse: 10,
  repasse_meses_depois: 1, indice_reajuste: 'NENHUM', bonificacao_valor: 0, bonificacao_meses: 0, conta_id: 'conta-x',
  categoria_id: 'cat-aluguel', taxa_adm_pct: 10, taxa_adm_base: 'bruto', categoria_taxa_adm_id: 'cat-adm',
  itens_repasse: [{ id: 'tu', tipo_repasse: 'taxa_unica', descricao: 'Intermediação', valor: 2200, valores_parcelas: [470, 865, 865], vigencia_inicio: '2026-02', ativo: true }],
  competencias: [],
}
const salvarCompetenciaRepasse = vi.fn(async () => ({}))
const app = { indicesContratos: {}, schedules: [], transactions: [], salvarCompetenciaRepasse, pode: () => true }
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/contratos/datas', async (orig) => ({ ...(await orig()), hojeStr: () => '2026-03-06' }))

const { default: ConferirExtratoModal } = await import('./ConferirExtratoModal.jsx')
const nbsp = (s) => s.replace(/\u00a0/g, ' ')

const LEITURA = {
  periodo: '02/2026', saldo_anterior: 10, total_extrato: null, valor_repasse: 0,
  itens: [
    { descricao: 'Aluguel proporcional 02/2026', valor: 586.67, natureza: 'credito', tipo: 'aluguel' },
    { descricao: 'Taxa de administração', valor: 11.67, natureza: 'debito', tipo: 'taxa_adm' },
    { descricao: 'Intermediação 1/3', valor: 500, natureza: 'debito', tipo: 'taxa_unica' },
    { descricao: 'SANEPAR', valor: 96.73, natureza: 'debito', tipo: 'ajuste' },
  ],
}
afterEach(() => { cleanup(); salvarCompetenciaRepasse.mockClear() })

describe('Conferir extrato', () => {
  it('lê o extrato, compara com o projetado, acerta o saldo anterior, troca o tipo e confirma', async () => {
    const ler = vi.fn(async () => LEITURA)
    const fechar = vi.fn()
    render(<ConferirExtratoModal contrato={CONTRATO} competencia="2026-02" onClose={fechar} ler={ler} />)
    fireEvent.change(screen.getByLabelText('Arquivo do extrato'), { target: { files: [new File(['x'], 'extrato.pdf', { type: 'application/pdf' })] } })
    await vi.waitFor(() => expect(screen.getAllByTestId('item-extrato')).toHaveLength(4))
    expect(ler).toHaveBeenCalledTimes(1)

    // Lido × projetado: intermediação 500 no extrato, 470 projetado → diferença −30.
    const linha = (rotulo) => within(screen.getByTestId('comparacao-extrato')).getByText(rotulo).closest('tr')
    expect(within(linha('Intermediação')).getAllByRole('cell').map(c => nbsp(c.textContent))).toEqual(['Intermediação', '-R$ 500,00', '-R$ 470,00', '-R$ 30,00'])

    // A IA sugeriu "Outro ajuste" para a Sanepar: o usuário troca para despesa (consumo).
    fireEvent.change(screen.getByLabelText('Tipo de SANEPAR'), { target: { value: 'despesa' } })
    fireEvent.change(screen.getByLabelText('Natureza de SANEPAR'), { target: { value: 'consumo' } })
    expect(within(linha('Despesa do proprietário')).getAllByRole('cell').map(c => nbsp(c.textContent))[1]).toBe('-R$ 96,73')

    // Saldo anterior do extrato (+10,00) ≠ do Finup (0,00): aviso e ajuste de R$ 10,00.
    expect(screen.getByTestId('aviso-saldo-anterior').textContent).toMatch(/diferente do saldo do Finup/)
    fireEvent.click(screen.getByRole('button', { name: /Criar ajuste de R\$\s10,00/ }))
    expect(screen.queryByRole('button', { name: /Criar ajuste/ })).toBeNull()
    expect(screen.getAllByTestId('item-extrato')).toHaveLength(5)

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar conferência' }))
    await vi.waitFor(() => expect(salvarCompetenciaRepasse).toHaveBeenCalled())
    const [id, comp] = salvarCompetenciaRepasse.mock.calls[0]
    expect(id).toBe('c9')
    expect(comp).toMatchObject({ competencia: '2026-02', status: 'fechada' })
    expect(comp.conferencia).toMatchObject({ origem: 'ia', periodo: '02/2026', saldo_anterior_extrato: 10, saldo_anterior_finup: 0, repasse: 0, conferido_em: '2026-03-06' })
    expect(comp.itens.map(i => [i.tipo, i.valor, i.taxa_id ?? null, i.origem])).toEqual([
      ['aluguel', 586.67, null, 'auto'], ['taxa_adm', -11.67, null, 'auto'], ['taxa_unica', -500, 'tu', 'auto'],
      ['despesa', -96.73, null, 'manual'], ['ajuste', 10, null, 'manual'],
    ])
    expect(comp.itens[3].natureza).toBe('consumo')
    expect(fechar).toHaveBeenCalled()
  })

  it('digitar parte do projetado (sem diferenças); taxa única acima do que falta avisa', async () => {
    render(<ConferirExtratoModal contrato={CONTRATO} competencia="2026-02" onClose={() => {}} ler={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Digitar/ }))
    const cells = within(screen.getByTestId('comparacao-extrato')).getAllByRole('row').slice(1).map(r => nbsp(r.lastChild.textContent))
    expect(cells.every(c => c === '—')).toBe(true)
    fireEvent.change(screen.getByLabelText('Valor de Intermediação 1/3'), { target: { value: '2.500,00' } })
    expect(screen.getByText(/desconta R\$ 2\.500,00, mas faltavam R\$ 2\.200,00/)).toBeTruthy()
  })
})
