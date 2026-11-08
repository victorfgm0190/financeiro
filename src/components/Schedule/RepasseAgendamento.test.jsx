// @vitest-environment jsdom
// Agendamento do repasse (contrato a receber por administradora): valor = repasse da competência
// (saldo, com o saldo anterior). Caso de referência com 02–06 conferidas → 10/07/2026 = 1.370,65.
// Dados fictícios.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { gerarPlanoParcelas, planejarSincronizacao } from '../../lib/contratos/parcelas'
import { planoComCreditos, planoCreditosAluguel } from '../../lib/contratos/creditos'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|tem|set|add|update|delete|mark|register|skip|execut|efetiv|toggle|definir|baixar|confirm|criar|recalc|reconcil|desfazer|vincular|possiveis)/.test(k) ? vi.fn(() => []) : [])) }),
}))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useCamadaModal: () => {} }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../shared/ShortcutHint', () => ({ default: () => null }))
const { PayModal } = await import('./SchedulePanel.jsx')

const CONF = (periodo, repasse = 0) => ({ conferido_em: '2026-11-08', origem: 'ia', periodo, repasse })
const A = (descricao, valor, tipo, extra = {}) => ({ chave: tipo === 'aluguel' ? 'aluguel' : tipo === 'taxa_adm' ? 'adm' : `${tipo}:${descricao}`, tipo, descricao, valor, origem: 'auto', informado: false, valor_calculado: null, ...extra })
const CONTRATO = {
  id: 'c9', tipo: 'receber', modalidade: 'aluguel', modo_repasse: true, objeto: 'Imóvel Exemplo', favorecido: 'Administradora Exemplo',
  data_inicio: '2026-02-21', data_fim: '2026-12-31', valor_base: 2200, periodicidade: 'mensal', dia_vencimento: 5, dia_repasse: 10,
  repasse_meses_depois: 1, indice_reajuste: 'NENHUM', bonificacao_valor: 0, bonificacao_meses: 0, categoria_id: 'cat-alug',
  taxa_adm_pct: 10, taxa_adm_base: 'bruto', categoria_taxa_adm_id: 'cat-adm', perfil_id: 'pf', conta_id: 'cc',
  itens_repasse: [
    { id: 'tu', tipo_repasse: 'taxa_unica', descricao: 'Intermediação', valor: 2200, valores_parcelas: [2200], vigencia_inicio: '2026-02', ativo: true },
    { id: 'tf', tipo_repasse: 'tarifa_fixa', descricao: 'Banco', valor: 3, vigencia_inicio: '2026-06', ativo: true },
  ],
  competencias: [
    { competencia: '2026-02', status: 'fechada', conferencia: CONF('02/2026'), itens: [
      A('Aluguel dias', 586.67, 'aluguel'), { chave: 'm:1', tipo: 'despesa', natureza: 'consumo', descricao: 'Sanepar', valor: -96.73, origem: 'manual' },
      { chave: 'm:2', tipo: 'despesa', natureza: 'consumo', descricao: 'Luz', valor: -25.13, origem: 'manual' },
      A('Intermediação parte', -470, 'taxa_unica', { chave: 'taxa_unica:tu', taxa_id: 'tu' }), A('Administração', -11.67, 'taxa_adm')] },
    { competencia: '2026-03', status: 'fechada', conferencia: CONF('03/2026'), itens: [
      A('Aluguel 03', 2200, 'aluguel'), A('Intermediação parte', -865, 'taxa_unica', { chave: 'taxa_unica:tu', taxa_id: 'tu' }),
      { chave: 'm:3', tipo: 'benfeitoria', descricao: 'Benfeitorias', valor: -4799.49, origem: 'manual', somar_ao_bem: false }, A('Administração', -220, 'taxa_adm')] },
    { competencia: '2026-04', status: 'fechada', conferencia: CONF('04/2026'), itens: [
      A('Aluguel 04', 2200, 'aluguel'), A('Intermediação saldo', -865, 'taxa_unica', { chave: 'taxa_unica:tu', taxa_id: 'tu' }), A('Administração', -220, 'taxa_adm')] },
    { competencia: '2026-05', status: 'fechada', conferencia: CONF('05/2026'), itens: [A('Aluguel 05', 2200, 'aluguel'), A('Administração', -220, 'taxa_adm')] },
    { competencia: '2026-06', status: 'fechada', conferencia: CONF('06/2026', 1370.65), itens: [
      A('Aluguel 01/06/2026 a 30/06/2026', 2200, 'aluguel'), A('Administração', -220, 'taxa_adm'), A('Banco', -3, 'tarifa', { chave: 'tarifa:tf' })] },
  ],
}
const HOJE = '2026-07-01'
const ID_06 = 'ctr_c9_aluguel_202606'

// Mesma aplicação de mudanças do useContratos (criar/atualizar/remover).
const aplicarMudancas = (schedules, { criar = [], atualizar = [], remover = [] }) => {
  const rem = new Set(remover.map(s => s.id))
  const mud = new Map()
  for (const m of atualizar) mud.set(m.id, { ...(mud.get(m.id) || {}), ...m.changes })
  const existentes = new Set(schedules.map(s => s.id))
  return [...schedules.filter(s => !rem.has(s.id)).map(s => (mud.has(s.id) ? { ...s, ...mud.get(s.id) } : s)), ...criar.filter(s => !existentes.has(s.id))]
}

// Agendamentos como o app grava: plano → sincronização → créditos (o caminho de aplicarParcelas).
function agendamentos() {
  const plano = gerarPlanoParcelas(CONTRATO, { hoje: HOJE })
  const sinc = planejarSincronizacao(CONTRATO, [], plano, {})
  const final = planoComCreditos(CONTRATO, [], sinc, [])
  let s = aplicarMudancas([], final)
  const pc = planoCreditosAluguel(CONTRATO, s, [])
  if (pc.length) s = aplicarMudancas(s, { atualizar: pc })
  return s
}

beforeEach(() => {
  Object.assign(app, {
    accounts: [{ id: 'cc', name: 'Conta', type: 'checking', profileId: 'pf' }], profiles: [], payees: [], transactions: [], schedules: [], settings: {},
    accountGroups: [], reserveFunctions: [], scheduleReservaFuncoes: [], rateiosByLancamento: new Map(), possiveisDuplicados: new Map(), tiposDocumento: [],
  })
})
afterEach(cleanup)

const nbsp = (s) => s.replace(/\u00a0/g, ' ')
const abrirRegistrar = (schedule) => render(<PayModal schedule={schedule} nextDate={schedule.startDate} accounts={app.accounts} categories={[]} gerencialGroups={[]}
  addTransaction={vi.fn(() => 'tx')} markScheduleRegistered={vi.fn()} onClose={() => {}} />)
const campoValor = () => screen.getAllByText('Valor', { selector: 'label' })[0].parentElement.querySelector('input')

describe('agendamento do repasse 06/2026 (02–06 conferidas)', () => {
  it('amount 1.370,65 em 10/07/2026; os créditos não trocam pela soma dos itens (1.977,00)', () => {
    const s06 = agendamentos().find(s => s.id === ID_06)
    expect(s06).toMatchObject({ startDate: '2026-07-10', amount: 1370.65 })
    expect(s06.composicao).toMatchObject({ tipo: 'repasse', repasse: 1370.65, total: 1370.65, saldo_anterior: -606.35, conferida: true })
    // 07: saldo zerado em 06 → 2.200 − 220 − 3 = 1.977,00 (valor da própria ocorrência, não o de 06).
    expect(agendamentos().find(s => s.id === 'ctr_c9_aluguel_202607').amount).toBe(1977)
  })

  it('gravado antes como 1.977,00 (soma dos itens): a redistribuição de créditos devolve 1.370,65', () => {
    const certo = agendamentos().find(s => s.id === ID_06)
    const errado = { ...certo, amount: 1977, composicao: { ...certo.composicao, total: 1977 } }
    const [m] = planoCreditosAluguel(CONTRATO, [errado], [])
    expect(m.changes).toMatchObject({ amount: 1370.65, composicao: { total: 1370.65 } })
  })

  it('Registrar → Recebimento: composição lista itens + saldo anterior, Total 1.370,65 e Valor 1.370,65', () => {
    abrirRegistrar(agendamentos().find(s => s.id === ID_06))
    const comp = nbsp(screen.getByTestId('composicao-parcela').textContent)
    expect(comp).toContain('Aluguel 01/06/2026 a 30/06/2026R$ 2.200,00')
    expect(comp).toContain('Administração-R$ 220,00')
    expect(comp).toContain('Banco-R$ 3,00')
    expect(comp).toContain('Saldo anterior com a administradora-R$ 606,35')
    expect(nbsp(screen.getByTestId('total-composicao-parcela').textContent)).toBe('R$ 1.370,65')
    expect(campoValor().value).toBe('1.370,65')
  })

  it('mesmo com o agendamento ainda gravado em 1.977,00: Total e Valor 1.370,65', () => {
    const certo = agendamentos().find(s => s.id === ID_06)
    abrirRegistrar({ ...certo, amount: 1977, composicao: { ...certo.composicao, total: 1977, resultado: 1977 } })
    expect(nbsp(screen.getByTestId('total-composicao-parcela').textContent)).toBe('R$ 1.370,65')
    expect(campoValor().value).toBe('1.370,65')
  })
})
