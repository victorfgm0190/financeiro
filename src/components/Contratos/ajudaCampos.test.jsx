// @vitest-environment jsdom
// Etapa 3, bloco 3 (Contratos): todo campo visível de cada formulário (data-help-form) está num
// data-help-id com conteúdo na base — inclusive os que só aparecem depois de uma ação. Dados fictícios.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { gerarPlanoParcelas, linhasDoContrato, idParcela } from '../../lib/contratos/parcelas.js'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|criar|trocar|justificar|confirmar|vincular|desvincular|atualizar|excluir)/.test(k) ? vi.fn(async () => ({})) : [])) }),
}))
vi.mock('../BoasVindas/subtelaGuia', () => ({ useSubtelaGuia: () => {} }))

const { controlesSemPasso } = await import('../../help/guiaPreenchimento.js')
const base = await import('../../help/index.js')
const { default: ComposicaoBoletoModal } = await import('./ComposicaoBoletoModal.jsx')
const { default: ConfirmarReajusteModal, ConfirmarReajusteRepasseModal } = await import('./ConfirmarReajusteModal.jsx')
const { CreditoManualModal, TrocarDestinoModal, JustificarDiferencaModal } = await import('./CreditosModais.jsx')
const { default: EncargosNaParcela } = await import('./EncargosNaParcela.jsx')
const { default: VincularPagamentoModal } = await import('./VincularPagamentoModal.jsx')
const { default: RegrasItensPanel } = await import('./RegrasItensPanel.jsx')

const nada = () => {}
const C = {
  id: 'c1', tipo: 'pagar', modalidade: 'aluguel', objeto: 'Imóvel Exemplo', favorecido: 'Imobiliária Exemplo', status: 'ativo',
  data_inicio: '2026-08-20', data_fim: '2031-08-20', valor_base: 1000, periodicidade: 'mensal', dia_vencimento: 20,
  indice_reajuste: 'NENHUM', bonificacao_valor: 0, bonificacao_meses: 0, tem_condominio: false, conta_id: 'cc', categoria_id: 'cat', excluidas: [],
}
const TX = { id: 'tx1', date: '2026-08-22', amount: 900, accountId: 'cc', categoryId: 'cat', payee: 'Imobiliária Exemplo', description: 'Aluguel', type: 'expense' }
const PARCELA = {
  id: idParcela('c1', 'aluguel', '2026-12'), contratoId: 'c1', contratoPapel: 'aluguel', frequency: 'once', startDate: '2026-12-20',
  amount: 1000, registered: [], registeredMeta: {}, skipped: [], overrides: {}, composicao: { itens: [], total: 1000, base: 1000, ciclo: 1 },
}
Object.assign(app, {
  schedules: [PARCELA], transactions: [TX], accounts: [], contratos: [C], regrasContratos: [], pode: () => true,
  creditosContratos: [{ id: 'k1', contrato_id: 'c1', status: 'aberto', valor: 50, data_origem: '2026-09-10', descricao: 'Crédito Exemplo' }],
})
afterEach(cleanup)

const auditar = (form) => {
  const raiz = document.querySelector(`[data-help-form="${form}"]`)
  expect(raiz, form).toBeTruthy()
  const semConteudo = [...raiz.querySelectorAll('[data-help-id]')].map(e => e.dataset.helpId).filter(id => !base.helpDoCampo(id))
  return [...controlesSemPasso(raiz).map(c => c.outerHTML.slice(0, 140)), ...semConteudo]
}

describe('Contratos: todo campo visível tem ajuda', () => {
  it('Composição do boleto: colar, itens lidos e dividir', () => {
    render(<ComposicaoBoletoModal contrato={C} tx={{ id: 't', date: '2026-10-08', amount: 900 }} modo="pagamento" onConfirmar={nada} onPular={nada} onClose={nada} />)
    fireEvent.click(screen.getByRole('button', { name: /Colar texto/ }))
    expect(auditar('composicaoBoleto')).toEqual([])
    fireEvent.change(screen.getByPlaceholderText(/Cole aqui o texto/), { target: { value: 'Taxa Exemplo 800,00\nFundo Exemplo 100,00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ler texto' }))
    fireEvent.click(screen.getByRole('button', { name: /Digitar itens/ }))
    fireEvent.change(screen.getAllByLabelText('De quem é')[0], { target: { value: 'inquilino' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Dividir entre inquilino e proprietário/ })[0])
    expect(auditar('composicaoBoleto')).toEqual([])
  })
  it('Confirmar reajuste (parcela e repasse)', () => {
    render(<ConfirmarReajusteModal contrato={C} parcela={PARCELA} onClose={nada} />)
    expect(auditar('reajusteContrato')).toEqual([])
    cleanup()
    render(<ConfirmarReajusteRepasseModal contrato={C} pendente={{ ciclo: 2, competencia: '2027-08', base: 1100, baseAnterior: 1000 }} onClose={nada} />)
    expect(auditar('reajusteRepasse')).toEqual([])
  })
  it('Créditos: novo manual, trocar destino e justificar diferença', () => {
    render(<CreditoManualModal contrato={C} onClose={nada} />)
    expect(auditar('creditoManual')).toEqual([])
    cleanup()
    render(<TrocarDestinoModal contrato={C} credito={{ id: 'k1', valor: 50, descricao: 'Crédito Exemplo' }} onClose={nada} />)
    expect(auditar('trocarDestino')).toEqual([])
    cleanup()
    render(<JustificarDiferencaModal contrato={C} linha={{ tx: TX, schedule: null }} esperado={1000} onClose={nada} />)
    expect(auditar('justificarDiferenca')).toEqual([])
  })
  it('Encargos e descontos na parcela (dentro do formulário do contrato), nos dois modos de início', () => {
    const linha = { descricao: 'Encargo Exemplo', sinal: 'encargo', valor: '10,00', parcelas_total: '12', modo: 'inicio', parcela_inicio: '1', parcela_atual: '' }
    const { rerender } = render(<div data-help-form="contrato"><EncargosNaParcela linhas={[linha]} onChange={nada} proxima={3} /></div>)
    expect(auditar('contrato')).toEqual([])
    rerender(<div data-help-form="contrato"><EncargosNaParcela linhas={[{ ...linha, modo: 'atual', parcela_atual: '2' }]} onChange={nada} proxima={3} /></div>)
    expect(auditar('contrato')).toEqual([])
  })
  it('Vincular pagamento já lançado', () => {
    const plano = gerarPlanoParcelas(C, { hoje: '2026-11-03' })
    const out = { ...PARCELA, id: idParcela('c1', 'aluguel', '2026-10'), startDate: '2026-10-20' }
    const linha = linhasDoContrato(C, [out], [TX], { hoje: '2026-11-03', plano }).find(l => l.semParcela && l.competencia === '2026-08')
    expect(linha).toBeTruthy()
    render(<VincularPagamentoModal contrato={C} linha={linha} onClose={nada} onConcluido={nada} />)
    expect(auditar('vincularPagamento')).toEqual([])
  })
  it('Regras de itens: escopo, nova regra e testar', () => {
    render(<RegrasItensPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Regra/ }))
    expect(screen.getByLabelText('Texto do item')).toBeTruthy()
    expect(auditar('regraItem')).toEqual([])
  })
})
