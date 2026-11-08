// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'

// Etapa 6 — "Buscar repasses já lançados" na ficha e no aditivo (dados fictícios). Caso de referência:
// 02–06 conferidas, repasse 06 = 1.370,65; 07–09 = 1.977,00; os 4 recebimentos já estão na conta.
const CONF = (periodo, repasse = 0) => ({ conferido_em: '2026-11-08', origem: 'ia', periodo, repasse })
const A = (descricao, valor, tipo, extra = {}) => ({ chave: tipo === 'aluguel' ? 'aluguel' : tipo === 'taxa_adm' ? 'adm' : `${tipo}:${descricao}`, tipo, descricao, valor, origem: 'auto', informado: false, valor_calculado: null, ...extra })
const CONTRATO = {
  id: 'c9', tipo: 'receber', modalidade: 'aluguel', modo_repasse: true, objeto: 'Imóvel Exemplo', favorecido: 'Administradora Exemplo',
  data_inicio: '2026-02-21', data_fim: '2027-02-28', valor_base: 2200, periodicidade: 'mensal', dia_vencimento: 5, dia_repasse: 10,
  repasse_meses_depois: 1, indice_reajuste: 'NENHUM', bonificacao_valor: 0, bonificacao_meses: 0, categoria_id: 'cat-alug',
  taxa_adm_pct: 10, taxa_adm_base: 'bruto', categoria_taxa_adm_id: 'cat-adm', perfil_id: 'pf', conta_id: 'cc', excluidas: [],
  itens_repasse: [
    { id: 'tu', tipo_repasse: 'taxa_unica', descricao: 'Intermediação', valor: 2200, valores_parcelas: [2200], vigencia_inicio: '2026-02', ativo: true },
    { id: 'tf', tipo_repasse: 'tarifa_fixa', descricao: 'Banco', valor: 3, vigencia_inicio: '2026-06', ativo: true },
  ],
  competencias: [
    { competencia: '2026-02', status: 'fechada', conferencia: CONF('02/2026'), itens: [
      A('Aluguel dias', 586.67, 'aluguel'), { chave: 'm:1', tipo: 'despesa', natureza: 'consumo', descricao: 'Sanepar', valor: -96.73, origem: 'manual' },
      { chave: 'm:2', tipo: 'despesa', natureza: 'consumo', descricao: 'Luz', valor: -25.13, origem: 'manual' },
      A('Intermediação', -470, 'taxa_unica', { chave: 'taxa_unica:tu', taxa_id: 'tu' }), A('Administração', -11.67, 'taxa_adm')] },
    { competencia: '2026-03', status: 'fechada', conferencia: CONF('03/2026'), itens: [
      A('Aluguel 03', 2200, 'aluguel'), A('Intermediação', -865, 'taxa_unica', { chave: 'taxa_unica:tu', taxa_id: 'tu' }),
      { chave: 'm:3', tipo: 'benfeitoria', descricao: 'Benfeitorias', valor: -4799.49, origem: 'manual', somar_ao_bem: false }, A('Administração', -220, 'taxa_adm')] },
    { competencia: '2026-04', status: 'fechada', conferencia: CONF('04/2026'), itens: [
      A('Aluguel 04', 2200, 'aluguel'), A('Intermediação', -865, 'taxa_unica', { chave: 'taxa_unica:tu', taxa_id: 'tu' }), A('Administração', -220, 'taxa_adm')] },
    { competencia: '2026-05', status: 'fechada', conferencia: CONF('05/2026'), itens: [A('Aluguel 05', 2200, 'aluguel'), A('Administração', -220, 'taxa_adm')] },
    { competencia: '2026-06', status: 'fechada', conferencia: CONF('06/2026', 1370.65), itens: [
      A('Aluguel 06', 2200, 'aluguel'), A('Administração', -220, 'taxa_adm'), A('Banco', -3, 'tarifa', { chave: 'tarifa:tf' })] },
  ],
}
const TX = (id, date, amount) => ({ id, date, amount, payee: 'Administradora Exemplo', description: 'Repasse', type: 'income', accountId: 'cc', categoryId: 'cat-rec' })
const LANCADOS = [TX('t06', '2026-07-10', 1370.65), TX('t07', '2026-08-10', 1977), TX('t08', '2026-09-10', 1977), TX('t09', '2026-10-09', 1977)]

const vincularRepasseLancado = vi.fn(async () => {})
const app = {
  categories: [], indicesContratos: {}, schedules: [], transactions: [], accounts: [], pode: () => true,
  vincularRepasseLancado, vincularLancamento: vi.fn(), desvincularLancamento: vi.fn(), salvarCompetenciaRepasse: vi.fn(),
  activeProfileId: 'pf', categoryGroupOrder: null,
}
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/contratos/datas', async (orig) => ({ ...(await orig()), hojeStr: () => '2026-11-08' }))
const { default: TabelaRepasse } = await import('./TabelaRepasse.jsx')

beforeEach(() => { app.transactions = [...LANCADOS]; vincularRepasseLancado.mockClear() })
afterEach(cleanup)
const statusDe = (ym) => screen.getByText(ym).closest('tr').querySelectorAll('td')[7].textContent

describe('ficha: repasses já lançados na conta', () => {
  it('status "falta vincular" de 06 a 09, aviso com o botão; a busca sugere cada um e vincula só o que o usuário confirma', async () => {
    render(<TabelaRepasse contrato={CONTRATO} />)
    for (const ym of ['06/2026', '07/2026', '08/2026', '09/2026']) expect(statusDe(ym)).toBe('Lançado na conta — falta vincular')
    expect(screen.getByTestId('aviso-repasses-lancados').textContent).toContain('4 repasses já lançados na conta parecem ser deste contrato.')
    expect(vincularRepasseLancado).not.toHaveBeenCalled() // nunca sozinho

    fireEvent.click(screen.getByRole('button', { name: 'Revisar e vincular' }))
    const linhas = screen.getAllByTestId('busca-repasse')
    expect(linhas.map(l => l.textContent.slice(0, 7))).toEqual(['06/2026', '07/2026', '08/2026', '09/2026', '10/2026'])
    expect(['06/2026', '07/2026', '08/2026', '09/2026'].map(ym => screen.getByLabelText(`Lançamento para ${ym}`).value)).toEqual(['t06', 't07', 't08', 't09'])
    expect(within(linhas[4]).getByText('Pendente — não encontrado na conta')).toBeTruthy()

    // O usuário pula 08: vincula 06, 07 e 09, nessa ordem.
    fireEvent.change(screen.getByLabelText('Lançamento para 08/2026'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Vincular \(3\)/ }))
    await vi.waitFor(() => expect(vincularRepasseLancado).toHaveBeenCalledTimes(3))
    expect(vincularRepasseLancado.mock.calls.map(c => [c[0].id, c[1], c[2]])).toEqual([['c9', '2026-06', 't06'], ['c9', '2026-07', 't07'], ['c9', '2026-09', 't09']])
    expect(vincularRepasseLancado.mock.calls[0][3]).toMatchObject({ vincular: app.vincularLancamento, desvincular: app.desvincularLancamento })
    await vi.waitFor(() => expect(screen.getAllByText('Vinculado.')).toHaveLength(3))
  })

  it('sem lançamento na conta: "Pendente — não encontrado na conta" e nenhum aviso; o botão da ficha abre a busca vazia', () => {
    app.transactions = []
    render(<TabelaRepasse contrato={CONTRATO} />)
    for (const ym of ['06/2026', '07/2026', '08/2026', '09/2026']) expect(statusDe(ym)).toBe('Pendente — não encontrado na conta')
    expect(screen.queryByTestId('aviso-repasses-lancados')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Buscar repasses já lançados' }))
    expect(screen.getAllByText('Pendente — não encontrado na conta').length).toBeGreaterThan(4)
    expect(screen.queryByRole('button', { name: /^Vincular/ })).toBeNull()
  })

  it('aberta pelo aditivo (abrirBusca): a busca já vem aberta', () => {
    render(<TabelaRepasse contrato={CONTRATO} abrirBusca />)
    expect(screen.getAllByTestId('busca-repasse')).toHaveLength(5)
  })
})
