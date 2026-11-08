// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'

// Caso de referência (dados fictícios): aluguel 2.200, adm. 10%, início 21/02/2026, intermediação
// 2.200 descontada 470 (02) + 865 (03) + 865 (04), todas conferidas com o extrato. O contrato foi
// regravado depois de 02 e 03: a taxa única ganhou id novo e 02/03 guardam o id antigo.
const CONF = (periodo) => ({ conferido_em: '2026-11-08', origem: 'ia', periodo, repasse: 0 })
const CONTRATO = {
  id: 'c9', tipo: 'receber', modalidade: 'aluguel', modo_repasse: true, objeto: 'Imóvel Exemplo', favorecido: 'Administradora Exemplo',
  data_inicio: '2026-02-21', data_fim: '2026-12-31', valor_base: 2200, periodicidade: 'mensal', dia_vencimento: 5, dia_repasse: 10,
  repasse_meses_depois: 1, indice_reajuste: 'NENHUM', bonificacao_valor: 0, bonificacao_meses: 0, categoria_id: 'cat-alug',
  taxa_adm_pct: 10, taxa_adm_base: 'bruto', categoria_taxa_adm_id: 'cat-adm', perfil_id: 'pf', conta_id: 'cc',
  itens_repasse: [
    { id: 'tu-nova', tipo_repasse: 'taxa_unica', descricao: 'Intermediação', valor: 2200, valores_parcelas: [2200], vigencia_inicio: '2026-02', ativo: true },
    { id: 'tf', tipo_repasse: 'tarifa_fixa', descricao: 'Tarifa bancária', valor: 3, vigencia_inicio: '2026-06', ativo: true },
  ],
  competencias: [
    { competencia: '2026-02', status: 'fechada', conferencia: CONF('02/2026'), itens: [
      { chave: 'aluguel', tipo: 'aluguel', descricao: 'Aluguel dias', valor: 586.67, origem: 'auto', informado: false, valor_calculado: null, categoria_id: 'cat-alug' },
      { chave: 'm:x1', tipo: 'despesa', natureza: 'consumo', descricao: 'Sanepar', valor: -96.73, origem: 'manual', categoria_id: null, dedutivel_ir: false },
      { chave: 'm:x2', tipo: 'despesa', natureza: 'consumo', descricao: 'Regularização de luz', valor: -25.13, origem: 'manual', categoria_id: null, dedutivel_ir: false },
      { chave: 'taxa_unica:tu-antiga', tipo: 'taxa_unica', taxa_id: 'tu-antiga', descricao: 'Intermediação parte', valor: -470, origem: 'auto', informado: false, valor_calculado: null, categoria_id: 'cat-adm', dedutivel_ir: true },
      { chave: 'adm', tipo: 'taxa_adm', descricao: 'Administração', valor: -11.67, origem: 'auto', informado: false, valor_calculado: null, categoria_id: 'cat-adm', dedutivel_ir: true },
    ] },
    { competencia: '2026-03', status: 'fechada', conferencia: CONF('03/2026'), itens: [
      { chave: 'aluguel', tipo: 'aluguel', descricao: 'Aluguel 03', valor: 2200, origem: 'auto', informado: false, valor_calculado: null },
      { chave: 'taxa_unica:tu-antiga', tipo: 'taxa_unica', taxa_id: 'tu-antiga', descricao: 'Intermediação parte', valor: -865, origem: 'auto', informado: false, valor_calculado: null },
      { chave: 'm:x3', tipo: 'benfeitoria', descricao: 'Benfeitorias', valor: -4799.49, origem: 'manual', somar_ao_bem: false },
      { chave: 'adm', tipo: 'taxa_adm', descricao: 'Administração', valor: -220, origem: 'auto', informado: false, valor_calculado: null },
    ] },
    { competencia: '2026-04', status: 'fechada', conferencia: CONF('04/2026'), itens: [
      { chave: 'aluguel', tipo: 'aluguel', descricao: 'Aluguel 04', valor: 2200, origem: 'auto', informado: false, valor_calculado: null },
      { chave: 'taxa_unica:tu-nova', tipo: 'taxa_unica', taxa_id: 'tu-nova', descricao: 'Intermediação saldo', valor: -865, origem: 'auto', informado: false, valor_calculado: null },
      { chave: 'adm', tipo: 'taxa_adm', descricao: 'Administração', valor: -220, origem: 'auto', informado: false, valor_calculado: null },
    ] },
  ],
}
const salvarCompetenciaRepasse = vi.fn(async () => ({}))
const app = {
  categories: [{ id: 'cat-adm', name: 'Taxa adm', type: 'expense' }, { id: 'cat-casa', name: 'Contas da casa', type: 'expense' }, { id: 'cat-alug', name: 'Aluguel recebido', type: 'income' }],
  indicesContratos: {}, schedules: [], transactions: [], accounts: [], salvarCompetenciaRepasse, pode: () => true, registerScheduleOccurrence: vi.fn(),
  activeProfileId: 'pf', categoryGroupOrder: null,
}
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/contratos/datas', async (orig) => ({ ...(await orig()), hojeStr: () => '2026-06-06' }))

const { default: ComposicaoRepasseModal } = await import('./ComposicaoRepasseModal.jsx')
const { default: ConferirExtratoModal } = await import('./ConferirExtratoModal.jsx')
const { competenciasDoRepasse } = await import('../../lib/contratos/parcelas.js')
const { saldoTaxasUnicas } = await import('../../lib/contratos/taxaUnica.js')

afterEach(() => { cleanup(); salvarCompetenciaRepasse.mockClear() })
const nbsp = (s) => s.replace(/\u00a0/g, ' ')
const linhaDe = (descricao) => screen.getByDisplayValue(descricao).closest('[class*="grid-cols-2"]')
function escolherCategoria(linha, nome) {
  fireEvent.click(within(linha).getByRole('button', { expanded: false }))
  const opcao = screen.getAllByRole('button').find(b => b.hasAttribute('data-item') && b.textContent === nome)
  fireEvent.mouseDown(opcao)
  fireEvent.click(opcao)
}
// Composição gravada → contrato com ela no lugar (como volta do banco).
const comGravada = (contrato, comp) => ({
  ...contrato, competencias: contrato.competencias.map(c => (c.competencia === comp.competencia ? { ...c, ...comp } : c)),
})

describe('competência conferida: regravar não recalcula', () => {
  it('mudar só a categoria da Sanepar e da luz e Gravar: valores, taxa_id e flags preservados (adm. continua 11,67)', async () => {
    render(<ComposicaoRepasseModal contrato={CONTRATO} competencia="2026-02" onClose={() => {}} />)
    escolherCategoria(linhaDe('Sanepar'), 'Contas da casa')
    escolherCategoria(linhaDe('Regularização de luz'), 'Contas da casa')
    expect(screen.getByLabelText('Valor de Administração').value).toBe('11,67')
    fireEvent.click(screen.getByRole('button', { name: 'Gravar' }))
    await vi.waitFor(() => expect(salvarCompetenciaRepasse).toHaveBeenCalled())
    const [, comp] = salvarCompetenciaRepasse.mock.calls[0]
    expect(comp.status).toBe('fechada')
    expect('conferencia' in comp).toBe(false) // não enviada = o servidor mantém o registro da conferência
    expect(comp.itens.map(i => [i.tipo, i.valor, i.informado ?? null])).toEqual([
      ['aluguel', 586.67, false], ['despesa', -96.73, null], ['despesa', -25.13, null], ['taxa_unica', -470, false], ['taxa_adm', -11.67, false],
    ])
    expect(comp.itens[3].taxa_id).toBe('tu-nova') // id antigo religado à taxa atual
    expect(comp.itens.filter(i => i.tipo === 'despesa').map(i => i.categoria_id)).toEqual(['cat-casa', 'cat-casa'])
    // Saldo de 02 continua −16,86.
    const regravado = comGravada(CONTRATO, comp)
    expect(competenciasDoRepasse(regravado, { hoje: '2026-06-06' }).find(l => l.competencia === '2026-02').saldo).toBe(-16.86)
  })

  it('mudar o VALOR pede confirmação; "Não" mantém, "Sim, alterar" libera sem recalcular a adm.', () => {
    render(<ComposicaoRepasseModal contrato={CONTRATO} competencia="2026-02" onClose={() => {}} />)
    const valorSanepar = () => within(linhaDe('Sanepar')).getByLabelText('Valor de Sanepar')
    fireEvent.change(valorSanepar(), { target: { value: '100,00' } })
    expect(screen.getByTestId('pergunta-valor-conferida').textContent).toContain('Esta competência foi conferida com o extrato. Alterar o valor?')
    expect(valorSanepar().readOnly).toBe(true) // no navegador, nem dá para digitar
    const resultado = () => nbsp(screen.getByText('Resultado do mês').querySelector('strong').textContent)
    expect(resultado()).toBe('-R$ 16,86') // 586,67 − 96,73 − 25,13 − 470 − 11,67: nada mudou
    fireEvent.click(screen.getByRole('button', { name: 'Não' }))
    expect(screen.queryByTestId('pergunta-valor-conferida')).toBeNull()
    fireEvent.focus(valorSanepar()) // clicar no valor de novo: pergunta outra vez
    fireEvent.click(screen.getByRole('button', { name: 'Sim, alterar' }))
    fireEvent.change(valorSanepar(), { target: { value: '99,00' } })
    fireEvent.change(valorSanepar(), { target: { value: '100,00' } })
    expect(valorSanepar().readOnly).toBe(false)
    expect(resultado()).toBe('-R$ 20,13') // só a Sanepar mudou (−100,00); a adm. segue 11,67
    expect(screen.getByLabelText('Valor de Administração').value).toBe('11,67')
  })
})

describe('taxa única: 2.200 descontados em 02/03/04 zeram o saldo', () => {
  it('mesmo com 02/03 no id antigo e depois de regravar 02 pela composição', async () => {
    const semIntermediacaoEm05 = (c) => !competenciasDoRepasse(c, { hoje: '2026-06-06' }).find(l => l.competencia === '2026-05').itens.some(i => i.tipo === 'taxa_unica')
    const linhas = (c) => competenciasDoRepasse(c, { hoje: '2026-06-06' }).map(l => ({ competencia: l.competencia, cobrada: !l.semCobranca, linha: l.linha }))
    expect(saldoTaxasUnicas(CONTRATO, linhas(CONTRATO), '2026-05')['tu-nova']).toEqual({ total: 2200, descontado: 2200, falta: 0 })
    expect(semIntermediacaoEm05(CONTRATO)).toBe(true)

    render(<ComposicaoRepasseModal contrato={CONTRATO} competencia="2026-02" onClose={() => {}} />)
    fireEvent.click(within(linhaDe('Sanepar')).getByLabelText('Dedutível IR'))
    fireEvent.click(screen.getByRole('button', { name: 'Gravar' }))
    await vi.waitFor(() => expect(salvarCompetenciaRepasse).toHaveBeenCalled())
    const regravado = comGravada(CONTRATO, salvarCompetenciaRepasse.mock.calls[0][1])
    expect(saldoTaxasUnicas(regravado, linhas(regravado), '2026-05')['tu-nova'].falta).toBe(0)
    expect(semIntermediacaoEm05(regravado)).toBe(true)
    // Maio: −2.586,35 + 2.200 − 220 = −606,35.
    expect(competenciasDoRepasse(regravado, { hoje: '2026-06-06' }).find(l => l.competencia === '2026-05').saldo).toBe(-606.35)
  })
})

describe('extrato de maio com "Repasse −606,35" (não houve repasse)', () => {
  const abrir = (leitura) => {
    render(<ConferirExtratoModal contrato={CONTRATO} competencia="2026-05" onClose={() => {}} ler={vi.fn(async () => leitura)} />)
    fireEvent.change(screen.getByLabelText('Arquivo do extrato'), { target: { files: [new File(['x'], 'maio.pdf', { type: 'application/pdf' })] } })
  }
  const ITENS = [
    { descricao: 'Aluguel 05/2026', valor: 2200, natureza: 'credito', tipo: 'aluguel' },
    { descricao: 'Taxa de administração', valor: 220, natureza: 'debito', tipo: 'taxa_adm' },
  ]

  it('repasse −606,35 sem total: repasse 0, total −606,35, não pergunta nada e grava sem ajuste', async () => {
    abrir({ periodo: '05/2026', saldo_anterior: -2586.35, total_extrato: null, valor_repasse: -606.35, itens: ITENS })
    await vi.waitFor(() => expect(screen.getAllByTestId('item-extrato')).toHaveLength(2))
    expect(screen.getByLabelText('Valor do repasse do extrato').value).toBe('0,00')
    expect(screen.getByLabelText('Sinal do total do extrato').value).toBe('-1')
    expect(screen.getByLabelText('Total do extrato').value).toBe('606,35')
    expect(screen.queryByTestId('aviso-repasse')).toBeNull()
    expect(screen.queryByTestId('aviso-saldo-anterior')).toBeNull()
    expect(nbsp(screen.getByTestId('resumo-conferencia').textContent)).toContain('Sem repasse')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar conferência' }))
    await vi.waitFor(() => expect(salvarCompetenciaRepasse).toHaveBeenCalled())
    const [, comp] = salvarCompetenciaRepasse.mock.calls[0]
    expect(comp.conferencia).toMatchObject({ repasse: 0, total_extrato: -606.35 })
    expect(comp.itens.some(i => i.tipo === 'ajuste')).toBe(false)
  })

  it('repasse −606,35 e total −606,35: também não pergunta', async () => {
    abrir({ periodo: '05/2026', saldo_anterior: -2586.35, total_extrato: -606.35, valor_repasse: -606.35, itens: ITENS })
    await vi.waitFor(() => expect(screen.getAllByTestId('item-extrato')).toHaveLength(2))
    expect(screen.queryByTestId('aviso-repasse')).toBeNull()
    expect(screen.getByRole('button', { name: 'Confirmar conferência' }).disabled).toBe(false)
  })
})

describe('total do extrato: layout novo (Débito/Crédito + líquido embaixo) × antigo', () => {
  const C = (descricao, valor, tipo) => ({ descricao, valor, natureza: 'credito', tipo })
  const D = (descricao, valor, tipo, extra = {}) => ({ descricao, valor, natureza: 'debito', tipo, ...extra })
  // Extratos do caso de referência: saldo anterior, itens, líquido e a soma dos débitos (com o saldo
  // anterior devedor) que a IA leu no layout novo.
  const EXTRATOS = [
    { comp: '2026-02', sa: 0, liquido: -16.86, debitos: -603.53, repasse: null, itens: [
      C('Aluguel proporcional', 586.67, 'aluguel'), D('Sanepar', 96.73, 'despesa', { natureza_despesa: 'consumo' }),
      D('Regularização de luz', 25.13, 'despesa', { natureza_despesa: 'consumo' }), D('Intermediação parte', 470, 'taxa_unica'), D('Taxa de administração', 11.67, 'taxa_adm')] },
    { comp: '2026-03', sa: -16.86, liquido: -3701.35, debitos: -5901.35, repasse: null, itens: [
      C('Aluguel 03/2026', 2200, 'aluguel'), D('Intermediação parte', 865, 'taxa_unica'), D('Benfeitorias', 4799.49, 'benfeitoria'), D('Taxa de administração', 220, 'taxa_adm')] },
    { comp: '2026-04', sa: -3701.35, liquido: -2586.35, debitos: -4786.35, repasse: null, itens: [
      C('Aluguel 04/2026', 2200, 'aluguel'), D('Intermediação saldo', 865, 'taxa_unica'), D('Taxa de administração', 220, 'taxa_adm')] },
    { comp: '2026-05', sa: -2586.35, liquido: -606.35, debitos: -2806.35, repasse: -606.35, itens: [
      C('Aluguel 05/2026', 2200, 'aluguel'), D('Taxa de administração', 220, 'taxa_adm')] },
    { comp: '2026-06', sa: -606.35, liquido: 1370.65, debitos: -829.35, repasse: 1370.65, itens: [
      C('Aluguel 06/2026', 2200, 'aluguel'), D('Taxa de administração', 220, 'taxa_adm'), D('Tarifa bancária', 3, 'tarifa')] },
  ]
  const ler = async (e, total) => {
    render(<ConferirExtratoModal contrato={CONTRATO} competencia={e.comp} onClose={() => {}}
      ler={vi.fn(async () => ({ periodo: e.comp.split('-').reverse().join('/'), saldo_anterior: e.sa, total_extrato: total, valor_repasse: e.repasse, itens: e.itens }))} />)
    fireEvent.change(screen.getByLabelText('Arquivo do extrato'), { target: { files: [new File(['x'], 'extrato.pdf', { type: 'application/pdf' })] } })
    await vi.waitFor(() => expect(screen.getAllByTestId('item-extrato')).toHaveLength(e.itens.length))
  }
  const totalNaTela = () => (screen.getByLabelText('Sinal do total do extrato').value === '-1' ? '-' : '') + screen.getByLabelText('Total do extrato').value
  const fmtBR = (v) => (v < 0 ? '-' : '') + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

  it('maio, layout novo: IA devolve −2.806,35 (débitos) → a tela usa −606,35 com a nota e não pergunta nada', async () => {
    await ler(EXTRATOS[3], -2806.35)
    expect(totalNaTela()).toBe('-606,35')
    expect(screen.getByTestId('nota-total-recalculado').textContent).toBe('Total recalculado a partir dos itens do extrato')
    expect(screen.queryByTestId('aviso-repasse')).toBeNull()
    expect(screen.queryByTestId('aviso-saldo-anterior')).toBeNull()
    expect(screen.getByRole('button', { name: 'Confirmar conferência' }).disabled).toBe(false)
  })

  for (const e of EXTRATOS) {
    for (const [layout, total, nota] of [['antigo (só o líquido)', e.liquido, false], ['novo (IA leu os débitos)', e.debitos, true], ['novo (IA leu os créditos)', e.itens.filter(i => i.natureza === 'credito').reduce((a, i) => a + i.valor, 0), true]]) {
      it(`${e.comp.split('-').reverse().join('/')} · layout ${layout}: total = ${fmtBR(e.liquido)}, nenhum aviso`, async () => {
        await ler(e, total)
        expect(totalNaTela()).toBe(fmtBR(e.liquido))
        expect(!!screen.queryByTestId('nota-total-recalculado')).toBe(nota)
        expect(screen.queryByTestId('aviso-repasse')).toBeNull()
        expect(screen.queryByTestId('aviso-saldo-anterior')).toBeNull()
        expect(screen.getByRole('button', { name: 'Confirmar conferência' }).disabled).toBe(false)
      })
    }
  }

  it('total diferente por outro motivo: mantém o lido e o aviso segue valendo', async () => {
    await ler(EXTRATOS[3], -650)
    expect(totalNaTela()).toBe('-650,00')
    expect(screen.queryByTestId('nota-total-recalculado')).toBeNull()
    expect(screen.getByTestId('aviso-repasse')).toBeTruthy()
  })
})
