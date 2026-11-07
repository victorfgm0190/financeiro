// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'

// Dados fictícios. Caso de referência (aluguel 2.200, adm 10%, início 21/02/2026, taxa única 470/865/865).
const CONTRATO = {
  id: 'c9', tipo: 'receber', modalidade: 'aluguel', modo_repasse: true, objeto: 'Imóvel Exemplo', favorecido: 'Administradora Exemplo',
  data_inicio: '2026-02-21', data_fim: '2026-09-30', valor_base: 2200, periodicidade: 'mensal', dia_vencimento: 5, dia_repasse: 10,
  repasse_meses_depois: 1, indice_reajuste: 'NENHUM', bonificacao_valor: 0, bonificacao_meses: 0, taxa_adm_pct: 10, taxa_adm_base: 'bruto',
  perfil_id: 'pf', informes_adm: {},
  itens_repasse: [{ id: 'tu', tipo_repasse: 'taxa_unica', descricao: 'Intermediação', valor: 2200, valores_parcelas: [470, 865, 865], vigencia_inicio: '2026-02', ativo: true }],
  competencias: [{ competencia: '2026-03', status: 'aberta', itens: [
    { chave: 'm:b', tipo: 'benfeitoria', descricao: 'Reparo', valor: -300, origem: 'manual', dedutivel_ir: false },
  ] }],
}
const atualizarContrato = vi.fn(async () => ({}))
const app = {
  contratos: [CONTRATO, { id: 'p1', tipo: 'pagar', objeto: 'Outro', perfil_id: 'pf' }], schedules: [], transactions: [], indicesContratos: {},
  activeProfileId: 'pf', activeProfile: { id: 'pf', name: 'Perfil Exemplo' }, atualizarContrato, pode: () => true,
}
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/contratos/datas', async (orig) => ({ ...(await orig()), hojeStr: () => '2026-11-07' }))

const { default: RelatorioRendimentos } = await import('./RelatorioRendimentos.jsx')
const nbsp = (s) => s.replace(/\u00a0/g, ' ')
const celulas = (rotulo) => within(screen.getByText(rotulo).closest('tr')).getAllByRole('cell').map(c => nbsp(c.textContent))

afterEach(() => { cleanup(); atualizarContrato.mockClear() })

describe('relatório de rendimentos de aluguel', () => {
  it('2026, Pagamento do inquilino: bruto 15.986,67, repasses no mês em que caem, saldo no fim do mês', () => {
    render(<RelatorioRendimentos />)
    expect(screen.getByText('Confira com seu contador o mês de reconhecimento e as deduções aceitas.')).toBeTruthy()
    const total = celulas('Total 2026')
    expect(total[1]).toBe('R$ 15.986,67')
    // Deduções: adm 58,67 + 7 × 220; taxa única 2.200; benfeitoria 300 → repasses no ano = 11.888,00 (previstos).
    expect(total.at(-2)).toBe('R$ 11.888,00 *')
    // 02 sobra 58,00 → repasse em 03; saldo no fim de 02 = 58,00.
    expect(celulas('Fev/2026').at(-1)).toBe('R$ 58,00')
    const mar = celulas('Mar/2026')
    expect(mar[1]).toBe('R$ 2.200,00')
    expect(mar.at(-2)).toBe('R$ 58,00 *')
    // Contrato a pagar fica fora da lista.
    expect(screen.queryByRole('option', { name: 'Outro' })).toBeNull()
  })

  it('muda a referência para Repasse: 02 a 06 entram no mês do 1º repasse', () => {
    render(<RelatorioRendimentos />)
    fireEvent.click(screen.getByRole('button', { name: 'Repasse' }))
    expect(celulas('Fev/2026')[1]).toBe('—')
    expect(celulas('Total 2026')[1]).toBe('R$ 15.986,67')
  })

  it('deduções por tipo e conferência com o informe gravada no contrato (por ano)', async () => {
    render(<RelatorioRendimentos />)
    expect(screen.getByText('Deduções por tipo — 2026')).toBeTruthy()
    expect(within(screen.getByText('Benfeitoria').closest('tr')).getAllByRole('cell').map(c => nbsp(c.textContent))).toEqual(['Benfeitoria', '—', 'R$ 300,00'])
    fireEvent.change(screen.getByLabelText('Rendimentos informados Imóvel Exemplo'), { target: { value: '16.000,00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gravar informe' }))
    await vi.waitFor(() => expect(atualizarContrato).toHaveBeenCalled())
    expect(atualizarContrato.mock.calls[0]).toEqual(['c9', { informes_adm: { 2026: { rendimentos: 16000, deducoes: null } } }])
  })
})
