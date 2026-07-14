import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { addMonths, addWeeks, addDays, addYears, format, parseISO } from 'date-fns'
import {
  loadFromDb, seedDefaults, pingDb,
  syncSection, syncAccounts, syncPayees, syncSettings,
  accountToRow, txToRow, scheduleToRow, categoryToRow,
  budgetToRow, ruleToRow, gerencialGroupToRow, payableToRow, envelopeToRow, accountGroupToRow, perfilToRow,
  importToRow, gerencialRuleToRow, reserveFunctionToRow,
  saveRateios, deleteRateios,
  scheduleReservaFuncaoToRow,
  bulkUpdateTransactionsApi,
  fetchReservePeriods, createReservePeriod, deleteReservePeriodApi,
  fetchReserveAdjustments, createReserveAdjustment, updateReserveAdjustmentApi, deleteReserveAdjustmentApi,
} from '../lib/db'
import { getToken } from '../lib/api'
import { saveLocal, loadLocal } from '../lib/storage'
import { computeFaturaRef, computeScheduleDate, gerencialKey, nextMonthScheduleDate, prevMonthScheduleDate } from '../lib/fatura'
import { installmentSystemDate } from '../lib/parcelas'
import { installmentKey } from '../lib/installments'
import { computeFluxoCaixa, occEfetiva } from '../lib/fluxoCaixa'

const rb = v => Math.round(v * 100) / 100
const INSTALL_RE = /(?<!\d)\d{1,2}\/\d{1,2}(?!\d)/
// Despesa parcelada (parte de uma série) — distinta de uma compra à vista. Usa a coluna
// installment_num (parcelas manuais novas têm a MESMA descrição, sem marcador "N/N") e mantém
// o marcador "N/N" na descrição como fonte (parcelas importadas/legadas). Superconjunto estrito
// do antigo teste por descrição: não muda a classificação de nenhum dado existente.
const isParcelada = (tx) =>
  Number(tx?.installmentNum) > 1 || INSTALL_RE.test(tx?.description || '')
// Item 8: id determinístico da transferência imediata do Grupo G ("etapa A"),
// derivado da despesa que a originou. Fonte única (reconcile, delete, reverse, revert).
const etapaAId = (expenseId) => `tx_gerA_${expenseId}`

// Deriva a fatura_ref (MM/YYYY) de um lançamento a partir de faturaRef (já MM/YYYY) ou de
// faturaMonthYear (YYYY-MM). null quando não há referência. Usado para propagar a
// rastreabilidade da despesa de origem aos lançamentos derivados (etapa A, provisões, resgates).
function resolveFaturaRef(tx) {
  if (!tx) return null
  if (tx.faturaRef) return tx.faturaRef
  if (tx.faturaMonthYear) {
    const [y, m] = tx.faturaMonthYear.split('-')
    return y && m ? `${m}/${y}` : null
  }
  return null
}

// Um grupo gerencial só comporta função de reserva se for NUMERADO (number numérico ≠ 1),
// com conta-origem (defaultAccountId) que tenha pelo menos uma função vinculada. Espelha
// reserveFuncsForGroup do ImportPanel. Grupo G (number 1) e D nunca têm função.
const grupoTemFuncoes = (grupoId, gerencialGroups, reserveFunctions) => {
  const g = gerencialGroups?.find(x => x.id === grupoId)
  if (!g || typeof g.number !== 'number' || g.number === 1 || !g.defaultAccountId) return false
  return (reserveFunctions || []).some(f => f.accountId === g.defaultAccountId)
}
// Guarda de integridade: zera reserva_funcao_id quando o grupo do lançamento não comporta
// função de reserva (evita função órfã grudada, ex.: despesa do Grupo G com função de outro grupo).
// Exceção: quando há reservaContaId ("Será pago com reserva" em despesa de conta corrente), a
// função é o par do vínculo de reserva — não depende de grupo gerencial e NÃO deve ser zerada.
const sanitizeReservaFuncao = (tx, gerencialGroups, reserveFunctions) =>
  (tx?.reservaFuncaoId && !tx?.reservaContaId && !grupoTemFuncoes(tx.grupoGerencial, gerencialGroups, reserveFunctions))
    ? { ...tx, reservaFuncaoId: null }
    : tx

// Prev vazio para forçar full-sync ao reconectar
const EMPTY_PREV = {
  accounts: [], transactions: [], schedules: [], categories: [],
  budgets: [], classificationRules: [], gerencialGroups: [], gerencialRules: [],
  payables: [], payees: [], envelopes: [], accountGroups: [],
  profiles: [], cardImports: [], reserveFunctions: [], scheduleReservaFuncoes: [],
  settings: {}, costCenters: [],
}

export const DEFAULT_ACCOUNT_GROUPS = [
  { id: 'grp_acc_1', name: 'Conta Corrente',          type: 'financeiro',  order: 0, behavior: null },
  { id: 'grp_acc_2', name: 'Poupança',                type: 'financeiro',  order: 1, behavior: null },
  { id: 'grp_acc_3', name: 'Investimentos',           type: 'financeiro',  order: 2, behavior: null },
  { id: 'grp_acc_4', name: 'Cartão de Crédito',       type: 'financeiro',  order: 3, behavior: null },
  { id: 'grp_acc_5', name: 'Dinheiro',                type: 'financeiro',  order: 4, behavior: null },
  { id: 'grp_acc_6', name: 'Imóveis',                 type: 'patrimonial', order: 5, behavior: null },
  { id: 'grp_acc_7', name: 'Veículos',                type: 'patrimonial', order: 6, behavior: null },
  { id: 'grp_acc_8', name: 'Principais Dívidas',      type: 'patrimonial', order: 7, behavior: 'divida' },
  { id: 'grp_acc_9', name: 'Empréstimos a Terceiros', type: 'patrimonial', order: 8, behavior: 'emprestimo' },
]

const AppContext = createContext(null)

// Retorna todas as ocorrências pendentes de um agendamento até upToDateStr (inclusive)
function computePendingUpTo(schedule, upToDateStr) {
  const allDone = new Set([...(schedule.registered || []), ...(schedule.skipped || [])])
  const pending = []
  // next_occurrence re-ancora a série (dia de vencimento atual); null → desde start_date.
  let current = parseISO(schedule.nextOccurrence || schedule.startDate)
  const maxInstallments = schedule.occurrenceType === 'installment' ? (schedule.installments || 1) : 9999
  let count = 0
  while (count < maxInstallments) {
    const dateStr = format(current, 'yyyy-MM-dd')
    if (dateStr > upToDateStr) break
    if (!allDone.has(dateStr)) pending.push(dateStr)
    count++
    switch (schedule.frequency) {
      case 'daily':         current = addDays(current, 1); break
      case 'weekly':        current = addWeeks(current, 1); break
      case 'biweekly':      current = addWeeks(current, 2); break
      case 'monthly':       current = addMonths(current, 1); break
      case 'bimonthly':     current = addMonths(current, 2); break
      case 'quarterly':     current = addMonths(current, 3); break
      case 'quadrimestral': current = addMonths(current, 4); break
      case 'semiannual':    current = addMonths(current, 6); break
      case 'annual':        current = addYears(current, 1); break
      default: break
    }
    if (schedule.frequency === 'once') break
  }
  return pending
}

// Avança uma data (YYYY-MM-DD) por UM intervalo da frequência informada (ex.: semanal → +7d).
// Usado ao efetivar uma provisão recorrente: a série reinicia em data_real + 1 intervalo.
function advanceByFrequency(dateStr, frequency) {
  let d = parseISO(dateStr)
  switch (frequency) {
    case 'daily':         d = addDays(d, 1); break
    case 'weekly':        d = addWeeks(d, 1); break
    case 'biweekly':      d = addWeeks(d, 2); break
    case 'monthly':       d = addMonths(d, 1); break
    case 'bimonthly':     d = addMonths(d, 2); break
    case 'quarterly':     d = addMonths(d, 3); break
    case 'quadrimestral': d = addMonths(d, 4); break
    case 'semiannual':    d = addMonths(d, 6); break
    case 'annual':        d = addYears(d, 1); break
    default: break
  }
  return format(d, 'yyyy-MM-dd')
}

const defaultData = {
  settings: {
    financialMonthStartDay: 1,
    financialMonthMode: 'custom', // 'calendar' = 01..fim do mês | 'custom' = a partir do dia de início
    currency: 'BRL',
    recurringMatchExceptions: [],
    categoryGroups: [], // rótulos de grupos de categoria (inclui grupos vazios criados manualmente)
    // Estornos de cartão: quando enabled === true, aplica a categoria estornoCartaoCategoryId
    // (+ grupo D) aos estornos na importação/conciliação. null = ainda não configurado (dispara
    // o modal na primeira importação com estorno); false = não perguntar mais.
    estornoCartaoEnabled: null,
    estornoCartaoCategoryId: null,
  },
  accounts: [],
  transactions: [],
  schedules: [],
  budgets: [],
  categories: [
    // ── Categorias legadas (sem grupo) ────────────────────────────────────────
    { id: 'cat_1',  name: 'Alimentação',  type: 'expense', color: '#f97316', icon: '🍽️' },
    { id: 'cat_2',  name: 'Transporte',   type: 'expense', color: '#3b82f6', icon: '🚗' },
    { id: 'cat_3',  name: 'Moradia',      type: 'expense', color: '#8b5cf6', icon: '🏠' },
    { id: 'cat_4',  name: 'Saúde',        type: 'expense', color: '#ef4444', icon: '❤️' },
    { id: 'cat_5',  name: 'Lazer',        type: 'expense', color: '#06b6d4', icon: '🎬' },
    { id: 'cat_6',  name: 'Educação',     type: 'expense', color: '#84cc16', icon: '📚' },
    { id: 'cat_7',  name: 'Roupas',       type: 'expense', color: '#ec4899', icon: '👕' },
    { id: 'cat_8',  name: 'Mercado',      type: 'expense', color: '#14b8a6', icon: '🛒' },
    { id: 'cat_9',  name: 'Salário',      type: 'income',  color: '#22c55e', icon: '💰' },
    { id: 'cat_10', name: 'Freelance',    type: 'income',  color: '#10b981', icon: '💻' },
    { id: 'cat_11', name: 'Investimentos',type: 'income',  color: '#6366f1', icon: '📈' },
    { id: 'cat_12', name: 'Outros',       type: 'both',    color: '#6b7280', icon: '📌' },
    { id: 'cat_res_ger', name: 'Reservas Gerais', type: 'expense', color: '#6b7280', icon: '🏦' },

    // ── DESPESAS ──────────────────────────────────────────────────────────────

    // Alimentação (#0EA5E9)
    { id: 'cat_ali_acu', name: 'Açougue',         type: 'expense', color: '#0ea5e9', icon: '🥩', group: 'Alimentação' },
    { id: 'cat_ali_fei', name: 'Feira',            type: 'expense', color: '#0ea5e9', icon: '🛒', group: 'Alimentação' },
    { id: 'cat_ali_pad', name: 'Padaria',          type: 'expense', color: '#0ea5e9', icon: '🥐', group: 'Alimentação' },
    { id: 'cat_ali_ref', name: 'Refeições Fora',   type: 'expense', color: '#0ea5e9', icon: '🍽️', group: 'Alimentação' },
    { id: 'cat_ali_sup', name: 'Supermercado',     type: 'expense', color: '#0ea5e9', icon: '🏪', group: 'Alimentação' },
    { id: 'cat_ali_del', name: 'Delivery',         type: 'expense', color: '#0ea5e9', icon: '📦', group: 'Alimentação' },

    // Bancos (#F97316)
    { id: 'cat_ban_anu', name: 'Anuidade do Cartão',               type: 'expense', color: '#f97316', icon: '💳', group: 'Bancos' },
    { id: 'cat_ban_emf', name: 'Empréstimos/Financiamentos',        type: 'expense', color: '#f97316', icon: '🏦', group: 'Bancos' },
    { id: 'cat_ban_jur', name: 'Juros',                            type: 'expense', color: '#f97316', icon: '💸', group: 'Bancos' },
    { id: 'cat_ban_jum', name: 'Juros/Multas',                     type: 'expense', color: '#f97316', icon: '💸', group: 'Bancos' },
    { id: 'cat_ban_mac', name: 'Manutenção da Conta',              type: 'expense', color: '#f97316', icon: '💳', group: 'Bancos' },
    { id: 'cat_ban_rti', name: 'Rendimento(-) TESOURO IPCA',       type: 'expense', color: '#f97316', icon: '📉', group: 'Bancos' },
    { id: 'cat_ban_tcb', name: 'Taxa de custódia da BM&F Bovespa', type: 'expense', color: '#f97316', icon: '💹', group: 'Bancos' },
    { id: 'cat_ban_tar', name: 'Tarifas',                          type: 'expense', color: '#f97316', icon: '💳', group: 'Bancos' },
    { id: 'cat_ban_fin', name: 'Financiamento',                    type: 'expense', color: '#f97316', icon: '🏦', group: 'Bancos' },

    // Contribuicoes (#EF4444)
    { id: 'cat_con_mov', name: 'Movimentos', type: 'expense', color: '#ef4444', icon: '🔄', group: 'Contribuicoes' },

    // Cuidados Pessoais (#EAB308)
    { id: 'cat_cup_aca', name: 'Academia',    type: 'expense', color: '#eab308', icon: '💪', group: 'Cuidados Pessoais' },
    { id: 'cat_cup_cos', name: 'Cosmeticos',  type: 'expense', color: '#eab308', icon: '💄', group: 'Cuidados Pessoais' },
    { id: 'cat_cup_dro', name: 'Drogaria',    type: 'expense', color: '#eab308', icon: '💊', group: 'Cuidados Pessoais' },
    { id: 'cat_cup_pre', name: 'Presentes',   type: 'expense', color: '#eab308', icon: '🎁', group: 'Cuidados Pessoais' },
    { id: 'cat_cup_sal', name: 'Salão',       type: 'expense', color: '#eab308', icon: '✂️', group: 'Cuidados Pessoais' },
    { id: 'cat_cup_ves', name: 'Vestuário',   type: 'expense', color: '#eab308', icon: '👗', group: 'Cuidados Pessoais' },

    // Doações (#22C55E)
    { id: 'cat_doa_igr', name: 'Igreja',                    type: 'expense', color: '#22c55e', icon: '⛪', group: 'Doações' },
    { id: 'cat_doa_ins', name: 'Instituições de Caridade',  type: 'expense', color: '#22c55e', icon: '🤝', group: 'Doações' },
    { id: 'cat_doa_par', name: 'Particulares',              type: 'expense', color: '#22c55e', icon: '👥', group: 'Doações' },

    // Educação (#0EA5E9)
    { id: 'cat_edu_col', name: 'Colégio',           type: 'expense', color: '#0ea5e9', icon: '🏫', group: 'Educação' },
    { id: 'cat_edu_cur', name: 'Curso',              type: 'expense', color: '#0ea5e9', icon: '📝', group: 'Educação' },
    { id: 'cat_edu_fac', name: 'Faculdade',          type: 'expense', color: '#0ea5e9', icon: '🎓', group: 'Educação' },
    { id: 'cat_edu_mat', name: 'Material de Estudo', type: 'expense', color: '#0ea5e9', icon: '📖', group: 'Educação' },
    { id: 'cat_edu_esc', name: 'Escola',             type: 'expense', color: '#0ea5e9', icon: '🏫', group: 'Educação' },
    { id: 'cat_edu_liv', name: 'Livros',             type: 'expense', color: '#0ea5e9', icon: '📚', group: 'Educação' },

    // Empresa (#F97316)
    { id: 'cat_emp_ass', name: 'Assinaturas', type: 'expense', color: '#f97316', icon: '📋', group: 'Empresa' },
    { id: 'cat_emp_est', name: 'Estoques',    type: 'expense', color: '#f97316', icon: '📦', group: 'Empresa' },

    // Escritorio Contabilidade (#EF4444)
    { id: 'cat_esc_hon', name: 'Honorarios Emerson/Piratininga', type: 'expense', color: '#ef4444', icon: '👨‍💼', group: 'Escritorio Contabilidade' },
    { id: 'cat_esc_mda', name: 'Multas Darf',                   type: 'expense', color: '#ef4444', icon: '📝', group: 'Escritorio Contabilidade' },
    { id: 'cat_esc_sof', name: 'Software',                      type: 'expense', color: '#ef4444', icon: '💻', group: 'Escritorio Contabilidade' },
    { id: 'cat_esc_tax', name: 'Taxas',                         type: 'expense', color: '#ef4444', icon: '💸', group: 'Escritorio Contabilidade' },

    // Filhos (#EAB308)
    { id: 'cat_fil_abe', name: 'Acessorios Bebe',    type: 'expense', color: '#eab308', icon: '👶', group: 'Filhos' },
    { id: 'cat_fil_ani', name: 'Aniversario',        type: 'expense', color: '#eab308', icon: '🎂', group: 'Filhos' },
    { id: 'cat_fil_chb', name: 'Cha de Bebe',        type: 'expense', color: '#eab308', icon: '🍼', group: 'Filhos' },
    { id: 'cat_fil_cdi', name: 'Cursos Diversos',    type: 'expense', color: '#eab308', icon: '📚', group: 'Filhos' },
    { id: 'cat_fil_fra', name: 'Fralda',             type: 'expense', color: '#eab308', icon: '👶', group: 'Filhos' },
    { id: 'cat_fil_lan', name: 'Lanche',             type: 'expense', color: '#eab308', icon: '🍎', group: 'Filhos' },
    { id: 'cat_fil_mes', name: 'Material Escolar',   type: 'expense', color: '#eab308', icon: '📐', group: 'Filhos' },
    { id: 'cat_fil_men', name: 'Mensalidade Escolar',type: 'expense', color: '#eab308', icon: '🏫', group: 'Filhos' },
    { id: 'cat_fil_msa', name: 'Mesada',             type: 'expense', color: '#eab308', icon: '💰', group: 'Filhos' },
    { id: 'cat_fil_tes', name: 'Transporte Escolar', type: 'expense', color: '#eab308', icon: '🚌', group: 'Filhos' },
    { id: 'cat_fil_uni', name: 'Uniforme',           type: 'expense', color: '#eab308', icon: '👕', group: 'Filhos' },
    { id: 'cat_fil_vac', name: 'Vacinas',            type: 'expense', color: '#eab308', icon: '💉', group: 'Filhos' },
    { id: 'cat_fil_ves', name: 'Vestuário Filho',    type: 'expense', color: '#eab308', icon: '👕', group: 'Filhos' },

    // Finaciamentos (#22C55E)
    { id: 'cat_finc_cap', name: 'CAPITAL', type: 'expense', color: '#22c55e', icon: '🏢', group: 'Finaciamentos' },

    // Impostos (#0EA5E9)
    { id: 'cat_imp_dsm', name: 'DASMEI',                       type: 'expense', color: '#0ea5e9', icon: '📋', group: 'Impostos' },
    { id: 'cat_imp_imb', name: 'IMPOSTO BOLSA',                type: 'expense', color: '#0ea5e9', icon: '📈', group: 'Impostos' },
    { id: 'cat_imp_iof', name: 'IOF',                          type: 'expense', color: '#0ea5e9', icon: '💸', group: 'Impostos' },
    { id: 'cat_imp_ipt', name: 'IPTU',                         type: 'expense', color: '#0ea5e9', icon: '🏠', group: 'Impostos' },
    { id: 'cat_imp_ipv', name: 'IPVA',                         type: 'expense', color: '#0ea5e9', icon: '🚘', group: 'Impostos' },
    { id: 'cat_imp_ira', name: 'IRPF Ajuste',                  type: 'expense', color: '#0ea5e9', icon: '📊', group: 'Impostos' },
    { id: 'cat_imp_irr', name: 'IRRF',                         type: 'expense', color: '#0ea5e9', icon: '💰', group: 'Impostos' },
    { id: 'cat_imp_iri', name: 'IRRF IPCA',                    type: 'expense', color: '#0ea5e9', icon: '💹', group: 'Impostos' },
    { id: 'cat_imp_itc', name: 'ITCMD',                        type: 'expense', color: '#0ea5e9', icon: '📋', group: 'Impostos' },
    { id: 'cat_imp_ins', name: 'Inss',                         type: 'expense', color: '#0ea5e9', icon: '🏛️', group: 'Impostos' },
    { id: 'cat_imp_lic', name: 'Licenciamento dpvat',          type: 'expense', color: '#0ea5e9', icon: '🚗', group: 'Impostos' },
    { id: 'cat_imp_pas', name: 'Passaporte',                   type: 'expense', color: '#0ea5e9', icon: '🛂', group: 'Impostos' },
    { id: 'cat_imp_cnh', name: 'Renovacao CNH',                type: 'expense', color: '#0ea5e9', icon: '🪪', group: 'Impostos' },
    { id: 'cat_imp_sna', name: 'SIMPLES NACIONAL',             type: 'expense', color: '#0ea5e9', icon: '📋', group: 'Impostos' },
    { id: 'cat_imp_tts', name: 'Taxa Semestral Tesouro selic', type: 'expense', color: '#0ea5e9', icon: '📈', group: 'Impostos' },
    { id: 'cat_imp_ir',  name: 'IR',                           type: 'expense', color: '#0ea5e9', icon: '📊', group: 'Impostos' },
    { id: 'cat_imp_tax', name: 'Taxas',                        type: 'expense', color: '#0ea5e9', icon: '💸', group: 'Impostos' },

    // Lazer (#F97316)
    { id: 'cat_laz_ace', name: 'Acessórios Esportivos',    type: 'expense', color: '#f97316', icon: '🏃', group: 'Lazer' },
    { id: 'cat_laz_arm', name: 'Armarinhos/linhas',        type: 'expense', color: '#f97316', icon: '🧵', group: 'Lazer' },
    { id: 'cat_laz_clu', name: 'Clube',                    type: 'expense', color: '#f97316', icon: '🏊', group: 'Lazer' },
    { id: 'cat_laz_cam', name: 'Confraternizacao Amigos',  type: 'expense', color: '#f97316', icon: '🍻', group: 'Lazer' },
    { id: 'cat_laz_cfe', name: 'Confraternizacao Ferias',  type: 'expense', color: '#f97316', icon: '🏖️', group: 'Lazer' },
    { id: 'cat_laz_ele', name: 'Eletrônicos',              type: 'expense', color: '#f97316', icon: '📱', group: 'Lazer' },
    { id: 'cat_laz_lsw', name: 'Licenca Software',         type: 'expense', color: '#f97316', icon: '💻', group: 'Lazer' },
    { id: 'cat_laz_liv', name: 'Livros/Revistas',          type: 'expense', color: '#f97316', icon: '📚', group: 'Lazer' },
    { id: 'cat_laz_loc', name: 'Locadora de Filmes/Games', type: 'expense', color: '#f97316', icon: '🎮', group: 'Lazer' },
    { id: 'cat_laz_pas', name: 'Passeios',                 type: 'expense', color: '#f97316', icon: '🌳', group: 'Lazer' },
    { id: 'cat_laz_ssa', name: 'Streaming/assinaturas',    type: 'expense', color: '#f97316', icon: '📺', group: 'Lazer' },
    { id: 'cat_laz_vgm', name: 'Viagens',                  type: 'expense', color: '#f97316', icon: '✈️', group: 'Lazer' },
    { id: 'cat_laz_str', name: 'Streaming',                type: 'expense', color: '#f97316', icon: '📺', group: 'Lazer' },
    { id: 'cat_laz_cin', name: 'Cinema',                   type: 'expense', color: '#f97316', icon: '🎬', group: 'Lazer' },
    { id: 'cat_laz_via', name: 'Viagem',                   type: 'expense', color: '#f97316', icon: '✈️', group: 'Lazer' },
    { id: 'cat_laz_res', name: 'Restaurante',              type: 'expense', color: '#f97316', icon: '🍴', group: 'Lazer' },
    { id: 'cat_laz_ass', name: 'Assinaturas',              type: 'expense', color: '#f97316', icon: '🔖', group: 'Lazer' },

    // Moradia (#EF4444)
    { id: 'cat_mor_alg', name: 'Aluguel',              type: 'expense', color: '#ef4444', icon: '🏠', group: 'Moradia' },
    { id: 'cat_mor_cdn', name: 'Condomínio',           type: 'expense', color: '#ef4444', icon: '🏢', group: 'Moradia' },
    { id: 'cat_mor_edt', name: 'Eletrodomésticos',     type: 'expense', color: '#ef4444', icon: '🧊', group: 'Moradia' },
    { id: 'cat_mor_gas', name: 'Gás',                  type: 'expense', color: '#ef4444', icon: '🔥', group: 'Moradia' },
    { id: 'cat_mor_int', name: 'Internet',             type: 'expense', color: '#ef4444', icon: '📡', group: 'Moradia' },
    { id: 'cat_mor_lav', name: 'Lavanderia',           type: 'expense', color: '#ef4444', icon: '👔', group: 'Moradia' },
    { id: 'cat_mor_luz', name: 'Luz',                  type: 'expense', color: '#ef4444', icon: '⚡', group: 'Moradia' },
    { id: 'cat_mor_mob', name: 'Mobiliário',           type: 'expense', color: '#ef4444', icon: '🛋️', group: 'Moradia' },
    { id: 'cat_mor_obr', name: 'Obra/Manutenção',      type: 'expense', color: '#ef4444', icon: '🔧', group: 'Moradia' },
    { id: 'cat_mor_pim', name: 'Prestação do Imóvel',  type: 'expense', color: '#ef4444', icon: '🏠', group: 'Moradia' },
    { id: 'cat_mor_ser', name: 'Serviços Domésticos',  type: 'expense', color: '#ef4444', icon: '🧹', group: 'Moradia' },
    { id: 'cat_mor_tce', name: 'Telefone Celular',     type: 'expense', color: '#ef4444', icon: '📱', group: 'Moradia' },
    { id: 'cat_mor_tfi', name: 'Telefone Fixo',        type: 'expense', color: '#ef4444', icon: '☎️', group: 'Moradia' },
    { id: 'cat_mor_tvs', name: 'Tv por Assinatura',    type: 'expense', color: '#ef4444', icon: '📺', group: 'Moradia' },
    { id: 'cat_mor_agu', name: 'Água',                 type: 'expense', color: '#ef4444', icon: '💧', group: 'Moradia' },
    { id: 'cat_mor_ipt', name: 'IPTU',                 type: 'expense', color: '#ef4444', icon: '📋', group: 'Moradia' },
    { id: 'cat_mor_tel', name: 'Telefone',             type: 'expense', color: '#ef4444', icon: '📱', group: 'Moradia' },

    // Saúde (#0EA5E9)
    { id: 'cat_sau_con', name: 'Consultas',       type: 'expense', color: '#0ea5e9', icon: '🩺', group: 'Saúde' },
    { id: 'cat_sau_den', name: 'Dentista',        type: 'expense', color: '#0ea5e9', icon: '🦷', group: 'Saúde' },
    { id: 'cat_sau_hos', name: 'Hospital',        type: 'expense', color: '#0ea5e9', icon: '🏥', group: 'Saúde' },
    { id: 'cat_sau_pls', name: 'Plano de saúde', type: 'expense', color: '#0ea5e9', icon: '🏥', group: 'Saúde' },
    { id: 'cat_sau_rem', name: 'Remédios',        type: 'expense', color: '#0ea5e9', icon: '💊', group: 'Saúde' },
    { id: 'cat_sau_tra', name: 'Tratamentos',     type: 'expense', color: '#0ea5e9', icon: '⚕️', group: 'Saúde' },
    { id: 'cat_sau_tgi', name: 'Tratamentos Gi',  type: 'expense', color: '#0ea5e9', icon: '⚕️', group: 'Saúde' },
    { id: 'cat_sau_far', name: 'Farmácia',        type: 'expense', color: '#0ea5e9', icon: '💊', group: 'Saúde' },
    { id: 'cat_sau_med', name: 'Consulta Médica', type: 'expense', color: '#0ea5e9', icon: '🩺', group: 'Saúde' },
    { id: 'cat_sau_exa', name: 'Exames',          type: 'expense', color: '#0ea5e9', icon: '🔬', group: 'Saúde' },
    { id: 'cat_sau_aca', name: 'Academia',        type: 'expense', color: '#0ea5e9', icon: '💪', group: 'Saúde' },

    // Seguro (#F97316)
    { id: 'cat_sgr_sau', name: 'Seguro Saúde',       type: 'expense', color: '#f97316', icon: '❤️', group: 'Seguro' },
    { id: 'cat_sgr_cas', name: 'Seguro da Casa',     type: 'expense', color: '#f97316', icon: '🏡', group: 'Seguro' },
    { id: 'cat_sgr_vda', name: 'Seguro de Vida',     type: 'expense', color: '#f97316', icon: '💙', group: 'Seguro' },
    { id: 'cat_sgr_aut', name: 'Seguro do Automóvel',type: 'expense', color: '#f97316', icon: '🚗', group: 'Seguro' },

    // Seguros (legado)
    { id: 'cat_seg_aut', name: 'Seguro Auto',        type: 'expense', color: '#14b8a6', icon: '🛡️', group: 'Seguros' },
    { id: 'cat_seg_vid', name: 'Seguro Vida',        type: 'expense', color: '#14b8a6', icon: '💙', group: 'Seguros' },
    { id: 'cat_seg_res', name: 'Seguro Residencial', type: 'expense', color: '#14b8a6', icon: '🏡', group: 'Seguros' },

    // Transporte (#EF4444)
    { id: 'cat_tra_com', name: 'Combustível',          type: 'expense', color: '#ef4444', icon: '⛽', group: 'Transporte' },
    { id: 'cat_tra_des', name: 'Despachante',          type: 'expense', color: '#ef4444', icon: '📋', group: 'Transporte' },
    { id: 'cat_tra_est', name: 'Estacionamento',       type: 'expense', color: '#ef4444', icon: '🅿️', group: 'Transporte' },
    { id: 'cat_tra_frs', name: 'Franquia Seguro',      type: 'expense', color: '#ef4444', icon: '🛡️', group: 'Transporte' },
    { id: 'cat_tra_lav', name: 'Lavajato',             type: 'expense', color: '#ef4444', icon: '🚿', group: 'Transporte' },
    { id: 'cat_tra_loc', name: 'Locacao Veiculo',      type: 'expense', color: '#ef4444', icon: '🚗', group: 'Transporte' },
    { id: 'cat_tra_mre', name: 'Manutenção/Revisão',   type: 'expense', color: '#ef4444', icon: '🔧', group: 'Transporte' },
    { id: 'cat_tra_met', name: 'Metrô',                type: 'expense', color: '#ef4444', icon: '🚇', group: 'Transporte' },
    { id: 'cat_tra_mul', name: 'Multas',               type: 'expense', color: '#ef4444', icon: '🚨', group: 'Transporte' },
    { id: 'cat_tra_ped', name: 'Pedágio',              type: 'expense', color: '#ef4444', icon: '🛣️', group: 'Transporte' },
    { id: 'cat_tra_pre', name: 'Prestação do Automóvel',type: 'expense', color: '#ef4444', icon: '🚗', group: 'Transporte' },
    { id: 'cat_tra_tax', name: 'Táxi',                 type: 'expense', color: '#ef4444', icon: '🚕', group: 'Transporte' },
    { id: 'cat_tra_oni', name: 'Ônibus',               type: 'expense', color: '#ef4444', icon: '🚌', group: 'Transporte' },
    { id: 'cat_tra_pub', name: 'Transporte Público',   type: 'expense', color: '#ef4444', icon: '🚌', group: 'Transporte' },
    { id: 'cat_tra_man', name: 'Manutenção Veículo',   type: 'expense', color: '#ef4444', icon: '🔧', group: 'Transporte' },

    // Vestuário (legado)
    { id: 'cat_ves_rou', name: 'Roupas',      type: 'expense', color: '#ec4899', icon: '👗', group: 'Vestuário' },
    { id: 'cat_ves_cal', name: 'Calçados',    type: 'expense', color: '#ec4899', icon: '👟', group: 'Vestuário' },
    { id: 'cat_ves_ace', name: 'Acessórios',  type: 'expense', color: '#ec4899', icon: '💍', group: 'Vestuário' },

    // Fotografia (#8B5CF6)
    { id: 'cat_fot_fot', name: 'Fotógrafo',              type: 'expense', color: '#8b5cf6', icon: '📷', group: 'Fotografia' },
    { id: 'cat_fot_equ', name: 'Equipamentos Fotografia', type: 'expense', color: '#8b5cf6', icon: '📸', group: 'Fotografia' },
    { id: 'cat_fot_ace', name: 'Acessórios Fotografia',  type: 'expense', color: '#8b5cf6', icon: '🔭', group: 'Fotografia' },
    { id: 'cat_fot_rev', name: 'Revelação/Impressão',    type: 'expense', color: '#8b5cf6', icon: '🖨️', group: 'Fotografia' },
    { id: 'cat_fot_edi', name: 'Edição/Software Foto',   type: 'expense', color: '#8b5cf6', icon: '💻', group: 'Fotografia' },

    // Outras Despesas (legado)
    { id: 'cat_out_pre', name: 'Presentes',         type: 'expense', color: '#78716c', icon: '🎁', group: 'Outras Despesas' },
    { id: 'cat_out_doa', name: 'Doações',           type: 'expense', color: '#78716c', icon: '🤝', group: 'Outras Despesas' },
    { id: 'cat_out_div', name: 'Despesas Diversas', type: 'expense', color: '#78716c', icon: '📌', group: 'Outras Despesas' },

    // ── RECEITAS ──────────────────────────────────────────────────────────────

    // Remunerações (#F97316)
    { id: 'cat_rem_13',  name: '13º Salário',          type: 'income', color: '#f97316', icon: '🎄', group: 'Remunerações' },
    { id: 'cat_rem_alg', name: 'Aluguel',              type: 'income', color: '#f97316', icon: '🏘️', group: 'Remunerações' },
    { id: 'cat_rem_com', name: 'Comissão',             type: 'income', color: '#f97316', icon: '💼', group: 'Remunerações' },
    { id: 'cat_rem_dlc', name: 'Distribuicao de Lucros',type: 'income', color: '#f97316', icon: '💼', group: 'Remunerações' },
    { id: 'cat_rem_fer', name: 'Férias',               type: 'income', color: '#f97316', icon: '🌴', group: 'Remunerações' },
    { id: 'cat_rem_hoc', name: 'Honorarios Contabeis', type: 'income', color: '#f97316', icon: '📋', group: 'Remunerações' },
    { id: 'cat_rem_pen', name: 'Pensão',               type: 'income', color: '#f97316', icon: '👴', group: 'Remunerações' },
    { id: 'cat_rem_pre', name: 'Presentes Recebidos',  type: 'income', color: '#f97316', icon: '🎁', group: 'Remunerações' },
    { id: 'cat_rem_rpo', name: 'Receitas Pontua',      type: 'income', color: '#f97316', icon: '⭐', group: 'Remunerações' },
    { id: 'cat_rem_rsm', name: 'Receitas Social Midia', type: 'income', color: '#f97316', icon: '📱', group: 'Remunerações' },
    { id: 'cat_rem_sal', name: 'Salário',              type: 'income', color: '#f97316', icon: '💰', group: 'Remunerações' },
    { id: 'cat_rem_sgi', name: 'Salário GI',           type: 'income', color: '#f97316', icon: '💰', group: 'Remunerações' },
    { id: 'cat_rem_tex', name: 'Trabalhos Extras',     type: 'income', color: '#f97316', icon: '🔨', group: 'Remunerações' },
    { id: 'cat_rem_tgi', name: 'Trabalhos Extras GI',  type: 'income', color: '#f97316', icon: '🔨', group: 'Remunerações' },
    { id: 'cat_rem_val', name: 'Vale Alimentacao',     type: 'income', color: '#f97316', icon: '🍽️', group: 'Remunerações' },
    { id: 'cat_rem_bon', name: 'Bônus',                type: 'income', color: '#f97316', icon: '🎯', group: 'Remunerações' },

    // Rendimentos (#EF4444)
    { id: 'cat_ren_div', name: 'Dividendos',                  type: 'income', color: '#ef4444', icon: '📈', group: 'Rendimentos' },
    { id: 'cat_ren_jin', name: 'Juros Investimentos',          type: 'income', color: '#ef4444', icon: '💹', group: 'Rendimentos' },
    { id: 'cat_ren_jii', name: 'Juros Investimentos IPCA',     type: 'income', color: '#ef4444', icon: '💹', group: 'Rendimentos' },
    { id: 'cat_ren_jpo', name: 'Juros Poupança',               type: 'income', color: '#ef4444', icon: '🏦', group: 'Rendimentos' },
    { id: 'cat_ren_jpp', name: 'Juros Previdência Privada',    type: 'income', color: '#ef4444', icon: '🛡️', group: 'Rendimentos' },
    { id: 'cat_ren_jrs', name: 'Juros Rendimento Salario',     type: 'income', color: '#ef4444', icon: '💵', group: 'Rendimentos' },
    { id: 'cat_ren_jtp', name: 'Juros sob TITULO PUBLICO',     type: 'income', color: '#ef4444', icon: '📜', group: 'Rendimentos' },
    { id: 'cat_ren_jca', name: 'Juros sob capital',            type: 'income', color: '#ef4444', icon: '💵', group: 'Rendimentos' },
    { id: 'cat_ren_jur', name: 'Juros Recebidos',              type: 'income', color: '#ef4444', icon: '💹', group: 'Rendimentos' },
    { id: 'cat_ren_alg', name: 'Aluguel Recebido',             type: 'income', color: '#ef4444', icon: '🏘️', group: 'Rendimentos' },

    // Rendimentos Empresariais (#EAB308)
    { id: 'cat_ren_emp', name: 'Comissão Sobre Vendas', type: 'income', color: '#eab308', icon: '💼', group: 'Rendimentos Empresariais' },

    // Outras Receitas (#0EA5E9)
    { id: 'cat_ore_aju', name: 'ACAO JUSTICA',                 type: 'income', color: '#0ea5e9', icon: '⚖️', group: 'Outras Receitas' },
    { id: 'cat_ore_agi', name: 'Agio em Acoes',                type: 'income', color: '#0ea5e9', icon: '📈', group: 'Outras Receitas' },
    { id: 'cat_ore_ajm', name: 'Ajuste - imobilizado',         type: 'income', color: '#0ea5e9', icon: '🔄', group: 'Outras Receitas' },
    { id: 'cat_ore_anr', name: 'Aniversario Reembolso',        type: 'income', color: '#0ea5e9', icon: '🎂', group: 'Outras Receitas' },
    { id: 'cat_ore_dns', name: 'Desconto Nubank - antecipacao',type: 'income', color: '#0ea5e9', icon: '💜', group: 'Outras Receitas' },
    { id: 'cat_ore_doa', name: 'Doacao',                       type: 'income', color: '#0ea5e9', icon: '🤲', group: 'Outras Receitas' },
    { id: 'cat_ore_emr', name: 'Empréstimos Recebidos',        type: 'income', color: '#0ea5e9', icon: '💲', group: 'Outras Receitas' },
    { id: 'cat_ore_eta', name: 'Estorno de Anuidade',          type: 'income', color: '#0ea5e9', icon: '↩️', group: 'Outras Receitas' },
    { id: 'cat_ore_fgt', name: 'FGTS',                         type: 'income', color: '#0ea5e9', icon: '🏛️', group: 'Outras Receitas' },
    { id: 'cat_ore_mel', name: 'Meliuz',                       type: 'income', color: '#0ea5e9', icon: '💰', group: 'Outras Receitas' },
    { id: 'cat_ore_pis', name: 'PIS PASEP',                    type: 'income', color: '#0ea5e9', icon: '📋', group: 'Outras Receitas' },
    { id: 'cat_ore_rei', name: 'Reembolsos',                   type: 'income', color: '#0ea5e9', icon: '💵', group: 'Outras Receitas' },
    { id: 'cat_ore_rir', name: 'Restituicao IR',               type: 'income', color: '#0ea5e9', icon: '🏦', group: 'Outras Receitas' },
    { id: 'cat_ore_vab', name: 'Valorização de Bens',          type: 'income', color: '#0ea5e9', icon: '📊', group: 'Outras Receitas' },
    { id: 'cat_ore_vdb', name: 'Venda de Bens',                type: 'income', color: '#0ea5e9', icon: '🏷️', group: 'Outras Receitas' },
    { id: 'cat_ore_ven', name: 'Vendas',                       type: 'income', color: '#0ea5e9', icon: '🏷️', group: 'Outras Receitas' },

    // ── INVESTIMENTOS ─────────────────────────────────────────────────────────

    // Aplicações (#22C55E)
    { id: 'cat_apl_aco', name: 'Ações',                  type: 'expense', color: '#22c55e', icon: '📈', group: 'Aplicações' },
    { id: 'cat_apl_cso', name: 'Cotas em Sociedade',     type: 'expense', color: '#22c55e', icon: '🤝', group: 'Aplicações' },
    { id: 'cat_apl_fdi', name: 'Fundos de Investimento', type: 'expense', color: '#22c55e', icon: '💼', group: 'Aplicações' },
    { id: 'cat_apl_ppv', name: 'Previdência Privada',    type: 'expense', color: '#22c55e', icon: '🛡️', group: 'Aplicações' },
    { id: 'cat_apl_ted', name: 'Tesouro Direto',         type: 'expense', color: '#22c55e', icon: '🏛️', group: 'Aplicações' },
  ],
  classificationRules: [],
  gerencialRules: [],
  envelopes: [],
  accountGroups: DEFAULT_ACCOUNT_GROUPS,
  costCenters: ['Pessoal', 'Família', 'Trabalho', 'Casa'],
  payees: [],
  gerencialGroups: [
    { id: 'grp_1', number: 1, name: 'Gerencial', alias: 'G', fixed: true, defaultAccountId: null },
    { id: 'grp_D', number: 'D', name: 'Despesa', alias: 'D', fixed: true, defaultAccountId: null },
  ],
  payables: [],
  profiles: [],
  cardImports: [],
  reserveFunctions: [],
  rateios: [],
  scheduleReservaFuncoes: [],
}

// Gera lançamentos automáticos de reserva (accountId: null, reservaAuto: true) e de
// patrimônio (accountId: null, origin: 'patrimonioAuto'). Ambos seguem a mesma mecânica:
// transferência PARA a conta vinculada = despesa; transferência DA conta = receita.
// Efeito de uma transferência nos saldos. Pagamento de fatura VINCULADO (destino = cartão
// type 'credit' + faturaMonthYear preenchido) abate creditDebt/creditMonthBill como um
// credit_payment, em vez de creditar o balance do cartão. dir=1 aplica, dir=-1 reverte.
function applyTransferEffect(accounts, tx, dir = 1) {
  const amt = Number(tx.amount) || 0
  const toAcc = accounts.find(a => a.id === tx.toAccountId)
  const isFaturaPay = toAcc?.type === 'credit' && !!tx.faturaMonthYear
  return accounts.map(a => {
    if (a.id === tx.accountId) return { ...a, balance: rb(a.balance - dir * amt) }
    if (a.id === tx.toAccountId) {
      if (isFaturaPay) return {
        ...a,
        creditDebt: Math.max(0, (a.creditDebt || 0) - dir * amt),
        creditMonthBill: Math.max(0, (a.creditMonthBill || 0) - dir * amt),
      }
      return { ...a, balance: rb(a.balance + dir * amt) }
    }
    return a
  })
}

// Aplica (dir=+1) ou reverte (dir=-1) o efeito de UM lançamento nos saldos das contas. Espelha
// exatamente o saldo de addTransaction (dir=+1) e o reverseBalance de deleteTransaction (dir=-1).
// Fonte única para que EDITAR reaproveite a mesma matemática: reverter o antigo + aplicar o novo.
function applyBalanceEffect(accounts, t, dir = 1) {
  const amt = Number(t.amount) || 0
  if (t.type === 'income') {
    if (t.accountType === 'credit') {
      // Estorno em cartão abate a dívida da fatura.
      return accounts.map(a => a.id === t.accountId ? {
        ...a,
        creditDebt: Math.max(0, (a.creditDebt || 0) - dir * amt),
        creditMonthBill: Math.max(0, (a.creditMonthBill || 0) - dir * amt),
      } : a)
    }
    return accounts.map(a => a.id === t.accountId ? { ...a, balance: rb(a.balance + dir * amt) } : a)
  }
  if (t.type === 'expense') {
    if (t.accountType === 'credit') {
      return accounts.map(a => a.id === t.accountId ? {
        ...a,
        creditDebt: Math.max(0, (a.creditDebt || 0) + dir * amt),
        creditMonthBill: Math.max(0, (a.creditMonthBill || 0) + dir * amt),
      } : a)
    }
    return accounts.map(a => a.id === t.accountId ? { ...a, balance: rb(a.balance - dir * amt) } : a)
  }
  if (t.type === 'transfer') {
    return applyTransferEffect(accounts, t, dir)
  }
  if (t.type === 'credit_payment') {
    return accounts.map(a => {
      if (a.id === t.fromAccountId) return { ...a, balance: rb(a.balance - dir * amt) }
      if (a.id === t.accountId) return {
        ...a,
        creditDebt: Math.max(0, (a.creditDebt || 0) - dir * amt),
        creditMonthBill: Math.max(0, (a.creditMonthBill || 0) - dir * amt),
      }
      return a
    })
  }
  return accounts
}

function buildReservaAutoTxs(tx, accounts, parentTxId = null, reserveFunctions = []) {
  if (tx.type !== 'transfer') return []
  const extraTxs = []
  const toAcc = accounts.find(a => a.id === tx.toAccountId)
  const fromAcc = accounts.find(a => a.id === tx.accountId)
  const now = new Date().toISOString()
  const base = Date.now()
  // Vincula a sombra de reserva à função: a do lançamento (tx.reservaFuncaoId) ou, quando a
  // reserva tem função ÚNICA, a sua. Permite que os predicados de despesa respeitem o flag
  // exibir_como_despesa também nas sombras "Reserva:"/"Resgate Reserva:".
  const resolveReservaFunc = (acc) => {
    if (tx.reservaFuncaoId) return tx.reservaFuncaoId
    const funcs = (reserveFunctions || []).filter(f => f.accountId === acc?.id)
    return funcs.length === 1 ? funcs[0].id : null
  }

  // ── Patrimônio/Investimento ──────────────────────────────────────────────
  // Ida (Principal → Patrimônio) = despesa; volta (Patrimônio → Principal) = receita.
  const isPatrimonio = (acc) => acc?.vinculoTipo === 'patrimonio' && !!acc?.patrimonioCategoryId
  if (isPatrimonio(toAcc)) {
    extraTxs.push({
      id: 'tx_patr_' + base + '_' + Math.random().toString(36).slice(2),
      type: 'expense', accountId: null, amount: Number(tx.amount),
      categoryId: toAcc.patrimonioCategoryId,
      description: `Patrimônio: ${toAcc.apelido || toAcc.name}`,
      date: tx.date, createdAt: now, origin: 'patrimonioAuto',
      ...(parentTxId ? { parentTxId } : {}),
    })
  }
  if (isPatrimonio(fromAcc)) {
    extraTxs.push({
      id: 'tx_patr_' + base + '_' + Math.random().toString(36).slice(2) + '_r',
      type: 'income', accountId: null, amount: Number(tx.amount),
      categoryId: fromAcc.patrimonioCategoryId,
      description: `Resgate Patrimônio: ${fromAcc.apelido || fromAcc.name}`,
      date: tx.date, createdAt: now, origin: 'patrimonioAuto',
      ...(parentTxId ? { parentTxId } : {}),
    })
  }

  // ── Investimento (Poupança / Bem-Ativo) ─────────────────────────────────
  // Igual à reserva específica em comportamento: ida (→ conta) = despesa,
  // volta (conta →) = receita, na investment_category_id. Usa o flag reservaAuto
  // para herdar o cascade de estorno/deleção já existente.
  const isInvestimento = (acc) => !!acc?.isInvestimento && !!acc?.investmentCategoryId
  if (isInvestimento(toAcc)) {
    extraTxs.push({
      id: 'tx_inv_' + base + '_' + Math.random().toString(36).slice(2),
      type: 'expense', accountId: null, amount: Number(tx.amount),
      categoryId: toAcc.investmentCategoryId,
      description: `Investimento - ${toAcc.apelido || toAcc.name}`,
      date: tx.date, createdAt: now, reservaAuto: true,
      ...(parentTxId ? { parentTxId } : {}),
    })
  }
  if (isInvestimento(fromAcc)) {
    extraTxs.push({
      id: 'tx_inv_' + base + '_' + Math.random().toString(36).slice(2) + '_r',
      type: 'income', accountId: null, amount: Number(tx.amount),
      categoryId: fromAcc.investmentCategoryId,
      description: `Resgate Investimento - ${fromAcc.apelido || fromAcc.name}`,
      date: tx.date, createdAt: now, reservaAuto: true,
      ...(parentTxId ? { parentTxId } : {}),
    })
  }

  if (toAcc?.isReserva) {
    const funcId = resolveReservaFunc(toAcc)
    const reserveFunc = (reserveFunctions || []).find(f => f.id === funcId)
    // Categoria da sombra de DEPÓSITO: a categoria da função de reserva tem PRIORIDADE sobre
    // o reservaExpenseCategoryId do lançamento (garante que o depósito apareça na categoria
    // vinculada à função quando ela existe). Resgates não são alterados.
    const catId = reserveFunc?.categoryId ||
      tx.reservaExpenseCategoryId ||
      (toAcc.reservaType === 'especifica' ? (toAcc.reservaCategoryId || 'cat_res_ger') : 'cat_res_ger')
    extraTxs.push({
      id: 'tx_res_' + base + '_' + Math.random().toString(36).slice(2),
      type: 'expense', accountId: null, amount: Number(tx.amount),
      categoryId: catId,
      reservaFuncaoId: funcId,
      description: `Reserva: ${toAcc.apelido || toAcc.name}`,
      date: tx.date, createdAt: now, reservaAuto: true,
      ...(parentTxId ? { parentTxId } : {}),
    })
  }

  if (fromAcc?.isReserva) {
    const rsgFunc = resolveReservaFunc(fromAcc)
    const reserveFunc = (reserveFunctions || []).find(f => f.id === rsgFunc)
    const catId = tx.reservaExpenseCategoryId ||
      reserveFunc?.categoryId ||
      (fromAcc.reservaType === 'especifica' ? (fromAcc.reservaCategoryId || 'cat_res_ger') : 'cat_res_ger')
    const baseId = 'tx_rsg_' + base + '_' + Math.random().toString(36).slice(2)
    extraTxs.push({
      id: baseId + '_r',
      type: 'income', accountId: null, amount: Number(tx.amount),
      categoryId: catId,
      reservaFuncaoId: rsgFunc,
      description: `Resgate Reserva: ${fromAcc.apelido || fromAcc.name}`,
      date: tx.date, createdAt: now, reservaAuto: true,
      ...(parentTxId ? { parentTxId } : {}),
    })
    extraTxs.push({
      id: baseId + '_d',
      type: 'expense', accountId: null, amount: Number(tx.amount),
      categoryId: catId,
      reservaFuncaoId: rsgFunc,
      description: `Resgate Reserva: ${fromAcc.apelido || fromAcc.name}`,
      date: tx.date, createdAt: now, reservaAuto: true,
      ...(parentTxId ? { parentTxId } : {}),
    })
  }

  return extraTxs
}

// Empréstimos — Conta Espelho. Dado um lançamento (income/expense), gera os lançamentos
// espelho conforme a categoria (gera_espelho + conta_espelho_id) ou a conta (despesa numa
// conta-espelho). Todos os gerados carregam isEspelho=true (proteção contra loop) e são
// injetados direto no estado — nunca passam por addTransaction de novo.
function buildEspelhoTxs(tx, parentId, categories, accounts) {
  if (tx.isEspelho) return [] // proteção contra loop
  if (tx.type !== 'expense' && tx.type !== 'income') return []
  const amount = Number(tx.amount)
  if (!amount) return []
  const now = new Date().toISOString()
  const base = Date.now()
  const mk = (suffix, obj) => ({
    id: 'tx_esp_' + base + '_' + Math.random().toString(36).slice(2) + suffix,
    amount, date: tx.date, isEspelho: true, origin: 'espelho',
    parentTxId: parentId, createdAt: now, ...obj,
  })

  // Contas que são "conta-espelho" de alguma categoria com gera_espelho.
  const espelhoAccountIds = new Set(
    (categories || []).filter(c => c.geraEspelho && c.contaEspelhoId).map(c => c.contaEspelhoId)
  )

  // CASO C: despesa diretamente numa conta-espelho → transfere para "Dinheiro Ger" e gera
  // a despesa real lá. NÃO aplica o espelho por categoria neste caso.
  if (tx.type === 'expense' && espelhoAccountIds.has(tx.accountId)) {
    const dinger = (accounts || []).find(a => a.name === 'Dinheiro Ger' || a.apelido === 'dinger')
    if (!dinger) return []
    return [
      mk('_trf', {
        type: 'transfer', accountId: tx.accountId, toAccountId: dinger.id,
        description: tx.description || '(espelho)', categoryId: null,
      }),
      mk('_desp', {
        type: 'expense', accountId: dinger.id, toAccountId: null,
        description: tx.description || '(espelho)', categoryId: tx.categoryId || null,
      }),
    ]
  }

  // CASO A/B: categoria com gera_espelho + conta vinculada.
  const cat = (categories || []).find(c => c.id === tx.categoryId)
  if (!cat || !cat.geraEspelho || !cat.contaEspelhoId) return []
  if (tx.type === 'expense') {
    // CASO A: despesa → receita na conta-espelho (empréstimo concedido).
    return [mk('_r', {
      type: 'income', accountId: cat.contaEspelhoId, toAccountId: null,
      description: 'Empréstimo: ' + (tx.description || ''), categoryId: tx.categoryId || null,
      espelhoOrigemId: parentId, // vínculo p/ cascata (CASO A — original é salvo)
    })]
  }
  // CASO B: receita → despesa na conta-espelho (recebimento do empréstimo).
  return [mk('_d', {
    type: 'expense', accountId: cat.contaEspelhoId, toAccountId: null,
    description: 'Recebimento empréstimo: ' + (tx.description || ''), categoryId: tx.categoryId || null,
    espelhoOrigemId: parentId, // vínculo p/ cascata (CASO B — original é salvo)
  })]
}

// Gera a receita/aporte automático numa conta de investimento quando uma despesa
// (de qualquer tipo de conta) tem categoria vinculada a uma conta de investimento
// (categoria com investmentAccountId). Retorna o lançamento de entrada (origin: 'investAuto') ou null.
function buildInvestAutoIncomeTx(tx, categories, accounts, parentTxId = null) {
  if (tx.type !== 'expense') return null
  const cat = (categories || []).find(c => c.id === tx.categoryId)
  if (!cat?.investmentAccountId) return null
  const invAcc = (accounts || []).find(a => a.id === cat.investmentAccountId)
  if (!invAcc) return null
  return {
    id: 'tx_invauto_' + Date.now() + '_' + Math.random().toString(36).slice(2),
    type: 'income',
    accountId: cat.investmentAccountId,
    accountType: invAcc.type || null,
    amount: Number(tx.amount),
    categoryId: null,
    date: tx.date,
    description: `${tx.description || ''} [aporte auto]`.trim(),
    origin: 'investAuto',
    parentTxId,
    createdAt: new Date().toISOString(),
  }
}

// Fatura (YYYY-MM) de uma despesa de cartão: usa faturaMonthYear (override) quando
// presente; senão calcula pelo dia de fechamento do cartão.
function faturaMesAnoOf(card, date, faturaMonthYear) {
  if (faturaMonthYear) return faturaMonthYear
  if (!date) return null
  const ref = computeFaturaRef(new Date(date + 'T00:00:00'), card?.closingDay || 14) // MM/YYYY
  const [mm, yyyy] = ref.split('/')
  return `${yyyy}-${mm}`
}

export function AppProvider({ children }) {
  const [data, setData] = useState(defaultData)
  const [initialized, setInitialized] = useState(false)
  const [dbStatus, setDbStatus] = useState('connecting')
  const [syncError, setSyncError] = useState(null) // mensagem visível quando um sync falha
  const [activeProfileId, setActiveProfileId] = useState(null) // session-only, not persisted
  const prevDataRef = useRef(null)
  const syncTimerRef = useRef(null)
  const retryTimerRef = useRef(null)
  const fullSyncRef = useRef(false)
  const autoRegisterDoneRef = useRef(false)
  // Recalcula contas a pagar de fatura a partir de addTransaction/updateTransaction
  // (definido mais abaixo); usamos ref p/ contornar a ordem de declaração.
  const recalcFaturaRef = useRef(null)
  // Recálculo dos agendamentos acumulativos de fatura (definido mais abaixo); ref p/ contornar
  // a ordem de declaração — chamado por deleteTransaction/reverseTransaction/revertCardImport.
  const recalcAgendamentosRef = useRef(null)
  // Reconciliador gerencial (definido mais abaixo); ref p/ ser chamado pelos gatilhos
  // add/update/deleteTransaction de cartão antes da sua declaração.
  const reconcileGerencialRef = useRef(null)
  const dataRef = useRef(data)

  // ── Reservas: histórico de períodos e ajustes ──────────────────────────────
  // Vivem fora do objeto `data` (que é sincronizado por diff debounced): são gravados
  // diretamente no banco por operação e o state local é atualizado após sucesso.
  // Registros em snake_case, na mesma forma do endpoint/banco.
  const [reservePeriods, setReservePeriods] = useState([])
  const [reserveAdjustments, setReserveAdjustments] = useState([])

  // Carrega os dois históricos no mount (paralelo ao load principal). Falha silenciosa
  // (banco indisponível) → mantém arrays vazios; o ReservasPanel cai nos fallbacks legados.
  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    Promise.all([
      fetchReservePeriods().catch(() => ({ periods: [] })),
      fetchReserveAdjustments().catch(() => ({ adjustments: [] })),
    ]).then(([p, a]) => {
      if (cancelled) return
      setReservePeriods(p?.periods || [])
      setReserveAdjustments(a?.adjustments || [])
    })
    return () => { cancelled = true }
  }, [])

  // ── Inicialização: Supabase é o storage principal, localStorage é cache rápido ──
  useEffect(() => {
    // 1. Carrega cache local para renderização imediata enquanto conecta ao Supabase
    const local = loadLocal()
    if (local) {
      const merged = { ...defaultData, ...local, settings: { ...defaultData.settings, ...(local.settings || {}) } }
      // Migração: garante grupos de dívida/empréstimo mesmo em dados existentes
      const groups = merged.accountGroups || []
      const missingGroups = DEFAULT_ACCOUNT_GROUPS.filter(
        dg => dg.behavior && !groups.some(g => g.behavior === dg.behavior)
      )
      if (missingGroups.length > 0) merged.accountGroups = [...groups, ...missingGroups]
      setData(merged)
      prevDataRef.current = merged
    } else {
      prevDataRef.current = defaultData
    }
    setInitialized(true)

    // 2. Conecta ao Neon via API (storage principal) — substitui cache local quando disponível
    loadFromDb(defaultData).then(async (result) => {
      if (result.status === 'connected') {
        // Supabase tem dados do usuário — é a fonte autoritativa
        setDbStatus('connected')
        const merged = {
          ...result.data,
          accountGroups: result.data.accountGroups ?? DEFAULT_ACCOUNT_GROUPS,
          profiles: result.data.profiles ?? [],
          cardImports: result.data.cardImports ?? [],
          reserveFunctions: result.data.reserveFunctions ?? [],
          rateios: result.data.rateios ?? [],
          scheduleReservaFuncoes: result.data.scheduleReservaFuncoes ?? [],
        }

        // Migração: funções de reserva do localStorage → Neon.
        // O localStorage só é limpo quando o banco já tem as funções (evita perda em reload
        // antes do sync concluir).
        let legado = []
        try { legado = JSON.parse(localStorage.getItem('finup_reserve_funcs') || '[]') } catch { legado = [] }
        if (merged.reserveFunctions.length === 0 && Array.isArray(legado) && legado.length > 0) {
          merged.reserveFunctions = legado.map((f, i) => ({
            id: f.id || ('res_' + Date.now() + '_' + i),
            name: f.name || 'Função',
            accountId: f.accountId || null,
            saldoInicial: Number(f.saldoInicial) || 0,
            entradas: Number(f.entradas) || 0,
            saidas: Number(f.saidas) || 0,
            despesaAnual: Number(f.despesaAnual) || 0,
            depositoMensal: Number(f.depositoMensal) || 0,
            mesVencimento: f.mesVencimento ?? null,
            ordem: i,
          }))
        } else if (merged.reserveFunctions.length > 0) {
          localStorage.removeItem('finup_reserve_funcs') // banco é autoritativo — limpa legado
        }

        setData(() => {
          prevDataRef.current = { ...merged, reserveFunctions: result.data.reserveFunctions ?? [] }
          return merged
        })
        saveLocal(merged)
      } else if (result.status === 'empty') {
        // Supabase acessível mas sem dados do usuário — migra dados locais para o Supabase
        setDbStatus('connected')
        try { await seedDefaults(defaultData) } catch {}
        fullSyncRef.current = true  // dispara push completo dos dados locais no próximo sync
      } else {
        // Supabase indisponível (schema ausente ou erro de rede) — usa localStorage como fallback
        console.warn('[finup] Fallback para localStorage (Neon indisponível):', result.status, result.error || '')
        setDbStatus('local')
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync: localStorage (sempre) + Supabase (quando conectado) ───────────────
  useEffect(() => {
    if (!initialized) return

    // Sempre persiste no localStorage imediatamente
    saveLocal(data)

    // Sync Supabase apenas quando conectado
    if (dbStatus !== 'connected') return

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(async () => {
      // Se full sync pedido (reconexão ou seed vazio), reseta prev para forçar push total
      if (fullSyncRef.current) {
        fullSyncRef.current = false
        prevDataRef.current = EMPTY_PREV
      }

      const prev = prevDataRef.current
      if (!prev) return

      const tasks = []

      if (prev.accounts !== data.accounts)
        tasks.push(syncAccounts(prev.accounts, data.accounts))
      if (prev.transactions !== data.transactions)
        tasks.push(syncSection('lancamentos', prev.transactions, data.transactions, txToRow))
      if (prev.schedules !== data.schedules)
        tasks.push(syncSection('agendamentos', prev.schedules, data.schedules, scheduleToRow))
      if (prev.categories !== data.categories)
        tasks.push(syncSection('categorias', prev.categories, data.categories, categoryToRow))
      if (prev.budgets !== data.budgets)
        tasks.push(syncSection('orcamento', prev.budgets, data.budgets, budgetToRow))
      if (prev.classificationRules !== data.classificationRules)
        tasks.push(syncSection('regras_classificacao', prev.classificationRules, data.classificationRules, ruleToRow))
      if (prev.gerencialRules !== data.gerencialRules)
        tasks.push(syncSection('gerencial_rules', prev.gerencialRules, data.gerencialRules, gerencialRuleToRow))
      if (prev.gerencialGroups !== data.gerencialGroups)
        tasks.push(syncSection('reservas_funcoes', prev.gerencialGroups, data.gerencialGroups, gerencialGroupToRow))
      if (prev.payables !== data.payables)
        tasks.push(syncSection('reservas', prev.payables, data.payables, payableToRow))
      if (prev.payees !== data.payees)
        tasks.push(syncPayees(prev.payees, data.payees))
      if (prev.envelopes !== data.envelopes)
        tasks.push(syncSection('envelopes', prev.envelopes, data.envelopes, envelopeToRow))
      if (prev.accountGroups !== data.accountGroups)
        tasks.push(syncSection('grupos_conta', prev.accountGroups, data.accountGroups, accountGroupToRow))
      if (prev.profiles !== data.profiles)
        tasks.push(syncSection('perfis', prev.profiles, data.profiles, perfilToRow))
      if (prev.cardImports !== data.cardImports)
        tasks.push(syncSection('card_imports', prev.cardImports || [], data.cardImports || [], importToRow))
      if (prev.reserveFunctions !== data.reserveFunctions)
        tasks.push(syncSection('reserve_functions', prev.reserveFunctions || [], data.reserveFunctions || [], reserveFunctionToRow))
      if (prev.scheduleReservaFuncoes !== data.scheduleReservaFuncoes)
        tasks.push(syncSection('schedule_reserva_funcoes', prev.scheduleReservaFuncoes || [], data.scheduleReservaFuncoes || [], scheduleReservaFuncaoToRow))
      if (prev.settings !== data.settings || prev.costCenters !== data.costCenters)
        tasks.push(syncSettings(data.settings, data.costCenters))

      if (tasks.length === 0) {
        prevDataRef.current = data
        return
      }
      try {
        await Promise.all(tasks)
        // Só marca como sincronizado quando o Neon confirmou TODAS as tabelas do lote.
        prevDataRef.current = data
        setSyncError(prev => (prev ? null : prev)) // limpa erro anterior sem re-render à toa
      } catch (err) {
        // NÃO avança prevDataRef: as tabelas seguem "sujas" e serão reenviadas no próximo
        // sync (ou no full-sync ao reconectar). Torna o erro visível e ativa o retry (dbStatus).
        console.error('[sync] falha ao sincronizar com o Neon:', err?.message || err)
        setDbStatus('local')
        setSyncError('Erro ao sincronizar dados com o servidor. Suas alterações estão salvas localmente e serão reenviadas automaticamente.')
      }
    }, 500)

    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current) }
  }, [data, initialized, dbStatus])

  // ── Retry automático quando offline — tenta reconectar a cada 30s ────────────
  useEffect(() => {
    if (dbStatus !== 'local') {
      if (retryTimerRef.current) { clearInterval(retryTimerRef.current); retryTimerRef.current = null }
      return
    }
    retryTimerRef.current = setInterval(async () => {
      const ok = await pingDb()
      if (ok) {
        clearInterval(retryTimerRef.current)
        retryTimerRef.current = null
        fullSyncRef.current = true  // push tudo ao reconectar
        setDbStatus('connected')
      }
    }, 30000)
    return () => { if (retryTimerRef.current) { clearInterval(retryTimerRef.current); retryTimerRef.current = null } }
  }, [dbStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((updater) => {
    setData(prev => typeof updater === 'function' ? updater(prev) : updater)
  }, [])

  // ── Profile-filtered views ────────────────────────────────────────────────────
  const profileAccounts = useMemo(() => {
    if (!activeProfileId) return data.accounts
    return data.accounts.filter(a => a.profileId === activeProfileId)
  }, [data.accounts, activeProfileId])

  const profileAccountIds = useMemo(() => new Set(profileAccounts.map(a => a.id)), [profileAccounts])

  const profileTransactions = useMemo(() => {
    if (!activeProfileId) return data.transactions
    return data.transactions.filter(t =>
      t.reservaAuto === true ||
      profileAccountIds.has(t.accountId) || profileAccountIds.has(t.toAccountId)
    )
  }, [data.transactions, profileAccountIds, activeProfileId])

  const profileSchedules = useMemo(() => {
    if (!activeProfileId) return data.schedules
    return data.schedules.filter(s => !s.accountId || profileAccountIds.has(s.accountId))
  }, [data.schedules, profileAccountIds, activeProfileId])

  const activeProfile = useMemo(
    () => activeProfileId ? (data.profiles || []).find(p => p.id === activeProfileId) || null : null,
    [data.profiles, activeProfileId],
  )

  // Rateios indexados por lançamento (lancamento_id → [rateios]).
  const rateiosByLancamento = useMemo(() => {
    const m = new Map()
    for (const r of (data.rateios || [])) {
      if (!r.lancamentoId) continue
      const arr = m.get(r.lancamentoId) || []
      arr.push(r); m.set(r.lancamentoId, arr)
    }
    return m
  }, [data.rateios])

  // ── Rateio de lançamento ────────────────────────────────────────────────────
  // Grava (substitui) os rateios de um lançamento no banco (endpoint) e atualiza o
  // estado global. rateios: [{ id, categoriaId, valor, descricao }].
  const saveRateiosFor = useCallback((lancamentoId, rateios) => {
    if (!lancamentoId) return
    const lista = (rateios || []).map((r, i) => ({
      id: r.id || ('rat_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 5)),
      categoriaId: r.categoriaId || '',
      valor: Number(r.valor) || 0,
      descricao: r.descricao || '',
    }))
    saveRateios(lancamentoId, lista).catch(e => console.error('[rateios] save', e.message))
    update(d => {
      const outros = (d.rateios || []).filter(r => r.lancamentoId !== lancamentoId)
      const novos = lista.map(r => ({ ...r, lancamentoId }))
      return { ...d, rateios: [...outros, ...novos] }
    })
  }, [update])

  const deleteRateiosFor = useCallback((lancamentoId) => {
    if (!lancamentoId) return
    deleteRateios(lancamentoId).catch(e => console.error('[rateios] delete', e.message))
    update(d => ({ ...d, rateios: (d.rateios || []).filter(r => r.lancamentoId !== lancamentoId) }))
  }, [update])

  // Transações normalizadas para relatórios/KPIs:
  //  1) Transferência ENTRE PERFIS (perfil ativo dono de um lado) vira receita/despesa
  //     sintética na categoria da visão do perfil (categoria_cnpj_id / categoria_cpf_id).
  //  2) Lançamento COM RATEIO é explodido em uma transação por rateio (cada categoria com
  //     seu valor); o valor não atribuído fica na categoria original do lançamento.
  const profileReportTransactions = useMemo(() => {
    if (!activeProfile && rateiosByLancamento.size === 0) return profileTransactions
    const accById = new Map(data.accounts.map(a => [a.id, a]))
    const interProfile = (tx) => {
      if (!activeProfile || tx.type !== 'transfer') return tx
      const fromP = accById.get(tx.accountId)?.profileId || null
      const toP = accById.get(tx.toAccountId)?.profileId || null
      if (!fromP || !toP || fromP === toP) return tx
      const fromIsActive = fromP === activeProfile.id
      const toIsActive = toP === activeProfile.id
      if (fromIsActive === toIsActive) return tx
      const categoryId = (activeProfile.type === 'pj' ? tx.categoriaCnpjId : tx.categoriaCpfId) || ''
      return fromIsActive
        ? { ...tx, type: 'expense', categoryId }
        : { ...tx, type: 'income', categoryId, accountId: tx.toAccountId }
    }
    const out = []
    for (const tx0 of profileTransactions) {
      const tx = interProfile(tx0)
      const rateios = rateiosByLancamento.get(tx0.id)
      if (rateios && rateios.length > 0 && (tx.type === 'income' || tx.type === 'expense')) {
        let assigned = 0
        rateios.forEach((r, i) => {
          const v = rb(Number(r.valor) || 0)
          out.push({ ...tx, id: `${tx.id}:r${i}`, categoryId: r.categoriaId, amount: v, _rateioOf: tx0.id })
          assigned += v
        })
        const remainder = rb((tx.amount || 0) - assigned)
        if (remainder > 0.005) out.push({ ...tx, id: `${tx.id}:rem`, amount: remainder, _rateioOf: tx0.id })
      } else {
        out.push(tx)
      }
    }
    return out
  }, [profileTransactions, activeProfile, data.accounts, rateiosByLancamento])

  // ── Registrar automático na inicialização ───────────────────────────────────
  useEffect(() => {
    if (!initialized || autoRegisterDoneRef.current) return
    autoRegisterDoneRef.current = true
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    // Rateios a propagar para os lançamentos auto-registrados. Chave estável
    // (scheduleId|date) para que o double-invoke do StrictMode sobrescreva (e não
    // duplique) com o txId efetivamente commitado.
    const collectedRateios = new Map()

    setData(prev => {
      let schedules = prev.schedules
      let accounts = prev.accounts
      let transactions = prev.transactions
      let changed = false

      for (const schedule of prev.schedules) {
        if (!schedule.autoRegister) continue
        const pending = computePendingUpTo(schedule, todayStr)
        if (pending.length === 0) continue
        const schedRateios = (prev.rateios || []).filter(r => r.lancamentoId === schedule.id)

        for (const date of pending) {
          changed = true
          const txId = 'tx_auto_' + Date.now() + '_' + Math.random().toString(36).slice(2)
          if (schedRateios.length > 0) {
            collectedRateios.set(`${schedule.id}|${date}`, {
              txId,
              rateios: schedRateios.map(r => ({ categoriaId: r.categoriaId, valor: r.valor, descricao: r.descricao })),
            })
          }
          const newTx = {
            id: txId,
            type: schedule.transactionType,
            accountId: schedule.accountId || null,
            accountType: schedule.accountType || null,
            toAccountId: schedule.toAccountId || null,
            fromAccountId: null,
            amount: Number(schedule.amount),
            categoryId: schedule.categoryId || null,
            description: schedule.description,
            payee: schedule.payee || null,
            costCenter: schedule.costCenter || null,
            date,
            scheduleId: schedule.id,
            reservaFuncaoId: schedule.reservaFuncaoId || null,
            origin: 'agendamento',
            createdAt: new Date().toISOString(),
          }
          if (schedule.transactionType === 'income') {
            accounts = accounts.map(a => a.id === schedule.accountId
              ? { ...a, balance: rb(a.balance + Number(schedule.amount)) } : a)
          } else if (schedule.transactionType === 'expense') {
            if (schedule.accountType === 'credit') {
              accounts = accounts.map(a => a.id === schedule.accountId ? {
                ...a,
                creditDebt: (a.creditDebt || 0) + Number(schedule.amount),
                creditMonthBill: (a.creditMonthBill || 0) + Number(schedule.amount),
              } : a)
            } else {
              accounts = accounts.map(a => a.id === schedule.accountId
                ? { ...a, balance: rb(a.balance - Number(schedule.amount)) } : a)
            }
          } else if (schedule.transactionType === 'transfer') {
            accounts = accounts.map(a => {
              if (a.id === schedule.accountId) return { ...a, balance: rb(a.balance - Number(schedule.amount)) }
              if (a.id === schedule.toAccountId) return { ...a, balance: rb(a.balance + Number(schedule.amount)) }
              return a
            })
          }
          const autoTxs = buildReservaAutoTxs(
            { type: schedule.transactionType, accountId: schedule.accountId, toAccountId: schedule.toAccountId, amount: schedule.amount, date, reservaExpenseCategoryId: schedule.reservaExpenseCategoryId, reservaFuncaoId: schedule.reservaFuncaoId },
            accounts,
            txId,
            prev.reserveFunctions
          )
          const investIncome = buildInvestAutoIncomeTx(newTx, prev.categories, accounts, txId)
          if (investIncome) {
            accounts = accounts.map(a => a.id === investIncome.accountId ? { ...a, balance: rb(a.balance + investIncome.amount) } : a)
          }
          transactions = [...transactions, newTx, ...autoTxs, ...(investIncome ? [investIncome] : [])]
          schedules = schedules.map(s => s.id === schedule.id
            ? { ...s, registered: [...(s.registered || []), date], confirmado: false } : s)
        }
      }

      if (!changed) return prev
      return { ...prev, schedules, accounts, transactions }
    })

    // Propaga os rateios dos agendamentos para os novos lançamentos, depois que o
    // React aplica o auto-registro (mesmo comportamento do registro manual).
    if (collectedRateios.size > 0) {
      setTimeout(() => {
        collectedRateios.forEach(({ txId, rateios }) => saveRateiosFor(txId, rateios))
      }, 0)
    }
  }, [initialized]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Settings ────────────────────────────────────────────────────────────────
  const updateSettings = useCallback((settings) => {
    update(d => ({ ...d, settings: { ...d.settings, ...settings } }))
  }, [update])

  // ── Accounts ────────────────────────────────────────────────────────────────
  const addAccount = useCallback((account) => {
    const id = 'acc_' + Date.now()
    const initBal = rb(Number(account.balance) || 0)
    update(d => ({ ...d, accounts: [...d.accounts, { ...account, id, balance: initBal, initialBalance: initBal }] }))
    return id
  }, [update])

  const updateAccount = useCallback((id, changes) => {
    update(d => ({ ...d, accounts: d.accounts.map(a => a.id === id ? { ...a, ...changes } : a) }))
  }, [update])

  const deleteAccount = useCallback((id) => {
    update(d => ({ ...d, accounts: d.accounts.filter(a => a.id !== id) }))
  }, [update])

  const setMainAccount = useCallback((id) => {
    update(d => ({ ...d, accounts: d.accounts.map(a => ({ ...a, isMain: a.id === id })) }))
  }, [update])

  // ── Transactions ────────────────────────────────────────────────────────────
  const addTransaction = useCallback((tx) => {
    // _fromImport: a importação gera as contas a pagar uma vez no fim (com importId);
    // não disparar o recálculo por lançamento aqui para não quebrar esse vínculo.
    const { _fromImport, ...txClean } = tx
    const id = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    // Guarda: não grava função de reserva quando o grupo do lançamento não comporta função.
    const newTx = sanitizeReservaFuncao(
      { ...txClean, id, amount: Number(txClean.amount), createdAt: new Date().toISOString() },
      dataRef.current.gerencialGroups, dataRef.current.reserveFunctions,
    )
    update(d => {
      let accounts = [...d.accounts]

      // Empréstimos — espelho (CASO A/B/C). CASO C = despesa direto numa conta-espelho:
      // BLOQUEIA o lançamento original (não salva, não mexe no saldo dele); existem apenas
      // os dois espelhos (transferência p/ Dinger + despesa no Dinger).
      const espelhoTxs = buildEspelhoTxs({ ...tx, amount: Number(tx.amount) }, id, d.categories, d.accounts)
      const isCasoC = espelhoTxs.length > 0 && espelhoTxs[0].type === 'transfer'

      // Saldo do lançamento ORIGINAL (pulado por completo no CASO C).
      if (!isCasoC) {
      if (tx.type === 'income') {
        if (tx.accountType === 'credit') {
          // Estorno em cartão → abate a dívida da fatura (consistente com o totalizador
          // visual e com o agendamento pagamento_fatura).
          accounts = accounts.map(a => a.id === tx.accountId ? {
            ...a,
            creditDebt: Math.max(0, (a.creditDebt || 0) - Number(tx.amount)),
            creditMonthBill: Math.max(0, (a.creditMonthBill || 0) - Number(tx.amount)),
          } : a)
        } else {
          accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: rb(a.balance + Number(tx.amount)) } : a)
        }
      } else if (tx.type === 'expense') {
        if (tx.accountType === 'credit') {
          accounts = accounts.map(a => a.id === tx.accountId ? {
            ...a,
            creditDebt: (a.creditDebt || 0) + Number(tx.amount),
            creditMonthBill: (a.creditMonthBill || 0) + Number(tx.amount),
          } : a)
        } else {
          accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: rb(a.balance - Number(tx.amount)) } : a)
        }
      } else if (tx.type === 'transfer') {
        // Pagamento de fatura vinculado abate a dívida do cartão (uma única vez); demais
        // transferências mantêm o comportamento normal (debita origem, credita destino).
        accounts = applyTransferEffect(accounts, tx, 1)
      } else if (tx.type === 'credit_payment') {
        accounts = accounts.map(a => {
          if (a.id === tx.fromAccountId) return { ...a, balance: rb(a.balance - Number(tx.amount)) }
          if (a.id === tx.accountId) return {
            ...a,
            creditDebt: Math.max(0, (a.creditDebt || 0) - Number(tx.amount)),
            creditMonthBill: Math.max(0, (a.creditMonthBill || 0) - Number(tx.amount)),
          }
          return a
        })
      }
      } // fim do saldo do lançamento original (pulado no CASO C)

      // Auto-txs do original (reserva/aporte) só quando ele NÃO é bloqueado (CASO C não salva).
      const extraTxs = isCasoC ? [] : buildReservaAutoTxs(tx, d.accounts, id, d.reserveFunctions)

      // Aporte automático: despesa de cartão com categoria vinculada a conta de investimento
      // gera uma receita (crédito) na conta de investimento.
      const investIncome = isCasoC ? null : buildInvestAutoIncomeTx({ ...tx, amount: Number(tx.amount) }, d.categories, d.accounts, id)
      if (investIncome) {
        accounts = accounts.map(a => a.id === investIncome.accountId ? { ...a, balance: rb(a.balance + investIncome.amount) } : a)
      }

      // Saldo das contas reais dos lançamentos espelho (CASO A/B/C).
      for (const et of espelhoTxs) {
        accounts = accounts.map(a => {
          if (et.type === 'income' && a.id === et.accountId) return { ...a, balance: rb(a.balance + et.amount) }
          if (et.type === 'expense' && a.id === et.accountId) return { ...a, balance: rb(a.balance - et.amount) }
          if (et.type === 'transfer') {
            if (a.id === et.accountId) return { ...a, balance: rb(a.balance - et.amount) }
            if (a.id === et.toAccountId) return { ...a, balance: rb(a.balance + et.amount) }
          }
          return a
        })
      }

      return {
        ...d,
        accounts,
        // CASO C: não salva o lançamento original — só os espelhos.
        transactions: [...d.transactions, ...(isCasoC ? [] : [newTx]), ...extraTxs, ...(investIncome ? [investIncome] : []), ...espelhoTxs],
      }
    })
    // TAREFA 1: despesa de cartão (não vinda de importação) gera/atualiza a conta a
    // pagar da fatura — mesmo comportamento da importação (por grupo gerencial).
    if (!_fromImport && newTx.type === 'expense' && newTx.accountType === 'credit') {
      recalcFaturaRef.current?.(newTx.accountId, newTx.date, newTx.faturaMonthYear)
      // Gatilho do reconciliador gerencial (cartão): mantém agendamentos geridos + saldos Ger.
      // consistentes. Restrito à fatura do próprio lançamento — não varre as demais faturas.
      const card = dataRef.current.accounts.find(a => a.id === newTx.accountId)
      const fMesAno = faturaMesAnoOf(card, newTx.date, newTx.faturaMonthYear)
      reconcileGerencialRef.current?.(newTx.accountId, fMesAno ? [fMesAno] : null)
    }
    return id
  }, [update])

  const addCardImport = useCallback((imp) => {
    update(d => ({ ...d, cardImports: [imp, ...(d.cardImports || [])] }))
  }, [update])

  const updateCardImport = useCallback((id, changes) => {
    update(d => ({ ...d, cardImports: (d.cardImports || []).map(i => i.id === id ? { ...i, ...changes } : i) }))
  }, [update])

  const revertCardImport = useCallback((importId) => {
    // Faturas afetadas pelo lote (cartão + mês de cada despesa), capturadas antes do update.
    const before = dataRef.current
    const impBefore = (before.cardImports || []).find(i => i.id === importId)
    const faturasParaRecalcular = []
    if (impBefore) {
      const ids = new Set(impBefore.txIds || [])
      for (const t of before.transactions) {
        if (!ids.has(t.id)) continue
        if (t.type === 'expense' && t.accountType === 'credit') {
          const card = before.accounts.find(a => a.id === t.accountId)
          const mesAno = faturaMesAnoOf(card, t.date, t.faturaMonthYear)
          if (mesAno) faturasParaRecalcular.push([t.accountId, mesAno])
        }
      }
    }

    update(d => {
      const imp = (d.cardImports || []).find(i => i.id === importId)
      if (!imp) return d
      const txIds = new Set(imp.txIds || [])
      const txs = d.transactions.filter(t => txIds.has(t.id))
      let accounts = [...d.accounts]
      let transactions = d.transactions

      for (const tx of txs) {
        // Reverte o impacto no(s) saldo(s). Os agendamentos da fatura são reconstruídos no fim
        // por recalcularAgendamentosFatura (não há mais decremento incremental aqui).
        if (tx.type === 'expense' && tx.accountType === 'credit') {
          accounts = accounts.map(a => a.id === tx.accountId ? {
            ...a,
            creditDebt: Math.max(0, (a.creditDebt || 0) - tx.amount),
            creditMonthBill: Math.max(0, (a.creditMonthBill || 0) - tx.amount),
          } : a)
        } else if (tx.type === 'income') {
          if (tx.accountType === 'credit') {
            // Desfaz o estorno de cartão → devolve o valor à dívida da fatura.
            accounts = accounts.map(a => a.id === tx.accountId ? {
              ...a,
              creditDebt: (a.creditDebt || 0) + tx.amount,
              creditMonthBill: (a.creditMonthBill || 0) + tx.amount,
            } : a)
          } else {
            accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: rb(a.balance - tx.amount) } : a)
          }
        } else if (tx.type === 'expense') {
          accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: rb(a.balance + tx.amount) } : a)
        } else if (tx.type === 'transfer') {
          accounts = accounts.map(a => {
            if (a.id === tx.accountId) return { ...a, balance: rb(a.balance + tx.amount) }
            if (a.id === tx.toAccountId) return { ...a, balance: rb(a.balance - tx.amount) }
            return a
          })
        }
      }

      // Reverte saldos das auto-provisões geradas para as parcelas importadas
      for (const p of transactions.filter(t => t.origin === 'auto-provisao' && txIds.has(t.parentTxId))) {
        accounts = accounts.map(a => {
          if (a.id === p.accountId) return { ...a, balance: rb(a.balance + p.amount) }
          if (a.id === p.toAccountId) return { ...a, balance: rb(a.balance - p.amount) }
          return a
        })
      }

      // Reverte saldos das receitas investAuto (aportes) geradas para despesas importadas
      for (const p of transactions.filter(t => t.origin === 'investAuto' && txIds.has(t.parentTxId))) {
        accounts = accounts.map(a => a.id === p.accountId ? { ...a, balance: rb(a.balance - p.amount) } : a)
      }

      // Item 8: etapa A determinística (tx_gerA_<expenseId>) das despesas G do lote — reverte
      // saldo e marca para remoção. Imports antigos guardavam a etapa A (id aleatório) em
      // txIds e já caem no loop acima; este cobre as criadas pelo motor (pós-migração).
      const etapaAIds = new Set()
      for (const tx of txs) {
        if (tx.type !== 'expense' || tx.accountType !== 'credit') continue
        const a = d.transactions.find(t => t.id === etapaAId(tx.id))
        if (!a || txIds.has(a.id)) continue
        etapaAIds.add(a.id)
        accounts = accounts.map(acc => {
          if (acc.id === a.accountId) return { ...acc, balance: rb(acc.balance + a.amount) }
          if (acc.id === a.toAccountId) return { ...acc, balance: rb(acc.balance - a.amount) }
          return acc
        })
      }

      // Remove imported txs + reservaAuto + auto-provisões + investAuto vinculadas a elas
      transactions = transactions.filter(t =>
        !txIds.has(t.id) &&
        !etapaAIds.has(t.id) &&
        !(t.reservaAuto && txIds.has(t.parentTxId)) &&
        !(t.origin === 'auto-provisao' && txIds.has(t.parentTxId)) &&
        !(t.origin === 'investAuto' && txIds.has(t.parentTxId)) &&
        !(t.origin === 'patrimonioAuto' && txIds.has(t.parentTxId))
      )

      // Remove os contas-a-pagar (payables) gerados por ESTE lote. Operação SOMENTE de
      // exclusão: o estorno nunca recria/atualiza um payable (não chama gerarContasPagarFatura).
      // Prioridade: vínculo direto por importId (lotes novos). Para lotes antigos sem importId,
      // mantém a heurística por cartão + mesAno / janela de datas como fallback.
      const impExpenseDates = txs
        .filter(t => t.type === 'expense' && t.date)
        .map(t => t.date)
      const payables = (d.payables || []).filter(p => {
        if (p.status === 'paid') return true                 // já paga — nunca remove
        if (p.importId) return p.importId !== importId       // vínculo direto: remove só os do lote
        // — Legado (sem importId): heurística por cartão + mesAno / janela de datas —
        if (p.cartaoId !== imp.accountId) return true        // outro cartão — mantém
        if (imp.mesAno && p.mesAno === imp.mesAno) return false              // mesAno casa — remove
        if (p.billStart && p.billEnd && impExpenseDates.some(dt => dt >= p.billStart && dt <= p.billEnd))
          return false                                       // data importada cai na janela — remove
        return true
      })

      return {
        ...d,
        accounts,
        transactions,
        payables,
        cardImports: (d.cardImports || []).filter(i => i.id !== importId),
      }
    })

    // Gatilho: estorno de importação → recalcula os agendamentos de cada fatura afetada
    // (após a remoção dos lançamentos do lote).
    const seen = new Set()
    for (const [cardId, mesAno] of faturasParaRecalcular) {
      const key = `${cardId}|${mesAno}`
      if (seen.has(key)) continue
      seen.add(key)
      const [y, m] = mesAno.split('-')
      recalcAgendamentosRef.current?.(cardId, y, m)
    }
  }, [update])

  // ── Reconcile de estado esperado gerencial por lançamento de cartão ───────────
  // Garante, para o GRUPO ATUAL do lançamento, o estado gerencial esperado — sempre que se salva,
  // mudando o grupo ou não. Complementa o motor reconcileFaturaState (que só materializa a etapa A /
  // resgates para faturas do ciclo financeiro ATUAL/futuro): aqui o estado é garantido também para
  // faturas de ciclo já encerrado, de forma SÍNCRONA e idempotente, reutilizando os MESMOS ids
  // determinísticos do motor (tx_gerA_<id> e fsch_<card>_<AAAAMM>_resgate_reserva_<origem>) — assim o
  // reconcile do ciclo atual reencontra e não duplica. Regras:
  //   Grupo G (number 1, à vista/parcela 1): garante a etapa A (Principal → Ger.) — cria/ajusta/no-op.
  //   Grupo numerado (>1): garante o resgate_reserva da fatura+origem — cria se faltar e NÃO pago.
  //   Grupo D / sem grupo: remove a etapa A do lançamento.
  //   Sempre: remove resgates PENDENTES desta fatura cuja origem ficou sem gastos numerados (grupo
  //   antigo esvaziado), preservando os já pagos/registrados. Agendamentos (schedules) são pendências
  //   e não afetam saldo; só a etapa A (transferência real) ajusta saldos.
  // Núcleo PURO do reconcile por lançamento: recebe e devolve `d`. Extraído para ser
  // composto (revisarMovimentosFatura roda-o em cadeia sobre a fatura inteira, sem mutar).
  const applyEnsureGerencial = useCallback((d, lancId) => {
      const lanc = d.transactions.find(t => t.id === lancId)
      if (!lanc || lanc.type !== 'expense' || lanc.accountType !== 'credit') return d
      const card = d.accounts.find(a => a.id === lanc.accountId)
      if (!card) return d
      const contaPrincipal = d.accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal)
        || d.accounts.find(a => a.isMain && a.type !== 'credit')
        || d.accounts.find(a => a.type === 'checking')
      if (!contaPrincipal) return d

      const faturaMesAno = faturaMesAnoOf(card, lanc.date, lanc.faturaMonthYear) // YYYY-MM
      if (!faturaMesAno) return d
      const [yyyy, mm] = faturaMesAno.split('-')
      const faturaRef = `${mm}/${yyyy}`
      const apelido = card.apelido || card.name?.slice(0, 6) || 'CC'

      const grupo = d.gerencialGroups?.find(g => g.id === lanc.grupoGerencial)
      const isG = grupo?.number === 1
      const isNumbered = typeof grupo?.number === 'number' && grupo.number !== 1
      const ehParcela2aN = Number(lanc.installmentNum) > 1 || lanc.parentTxId != null || lanc.origin === 'parcela'

      let accounts = d.accounts
      let transactions = d.transactions
      let schedules = d.schedules

      // ── 1. Etapa A (Grupo G) ────────────────────────────────────────────
      const etId = etapaAId(lancId)
      const existingEt = transactions.find(t => t.id === etId)
      if (isG) {
        // Grupo G. Parcela 2..N não tem etapa A imediata em ciclo passado (provisão fica p/ o
        // Executar Gerenciais) e no ciclo atual é gerida pelo motor — por isso, para parcela 2..N,
        // NÃO criamos nem removemos aqui (deixamos como está). À vista / parcela 1: garante a etapa A.
        if (ehParcela2aN) {
          // nada a fazer para parcela 2..N
        } else {
        const amount = Number(lanc.amount) || 0
        const subcontaName = `Ger. ${apelido}`
        let subconta = accounts.find(a => a.name === subcontaName)
        if (!subconta) {
          subconta = {
            id: 'acc_ger_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            name: subcontaName, type: 'checking', balance: 0,
            bank: contaPrincipal.bank || '', apelido: `G${apelido}`.slice(0, 8),
            fluxoCaixaPrincipal: false, isMain: false, contaCorrentePrincipal: false,
            grupoGerencial: grupo.id, accountGroupId: contaPrincipal.accountGroupId || null,
          }
          accounts = [...accounts, subconta]
        }
        const etFields = {
          id: etId, type: 'transfer', accountId: contaPrincipal.id, toAccountId: subconta.id,
          amount, date: lanc.date, description: `Reserva Gerencial - ${lanc.description || ''}`.trim(),
          grupoGerencial: grupo.id, cardId: lanc.accountId, faturaRef, sourceExpenseId: lancId,
        }
        if (!existingEt) {
          transactions = [...transactions, { ...etFields, createdAt: new Date().toISOString() }]
          accounts = accounts.map(a => {
            if (a.id === contaPrincipal.id) return { ...a, balance: rb((a.balance || 0) - amount) }
            if (a.id === subconta.id)       return { ...a, balance: rb((a.balance || 0) + amount) }
            return a
          })
        } else if (Math.abs((Number(existingEt.amount) || 0) - amount) > 0.005) {
          const delta = amount - (Number(existingEt.amount) || 0)
          transactions = transactions.map(t => t.id === etId ? { ...t, ...etFields } : t)
          accounts = accounts.map(a => {
            if (a.id === contaPrincipal.id) return { ...a, balance: rb((a.balance || 0) - delta) }
            if (a.id === subconta.id)       return { ...a, balance: rb((a.balance || 0) + delta) }
            return a
          })
        }
        // valor igual → idempotente, nada a fazer
        }
      } else if (existingEt) {
        // Não é Grupo G (numerado / D / sem grupo) → remove a etapa A órfã e reverte o saldo.
        accounts = accounts.map(a => {
          if (a.id === existingEt.accountId)   return { ...a, balance: rb((a.balance || 0) + existingEt.amount) }
          if (a.id === existingEt.toAccountId) return { ...a, balance: rb((a.balance || 0) - existingEt.amount) }
          return a
        })
        transactions = transactions.filter(t => t.id !== etId)
      }

      // ── 2. resgate_reserva (grupos numerados) ───────────────────────────
      // Soma dos gastos numerados por conta-origem (defaultAccountId) nesta fatura — usada para
      // criar o resgate faltante da origem do lançamento e detectar origens esvaziadas.
      const origemById = new Map(
        (d.gerencialGroups || [])
          .filter(g => typeof g.number === 'number' && g.number !== 1 && g.defaultAccountId)
          .map(g => [g.id, g.defaultAccountId])
      )
      const isAutomacao = (t) => t.reservaAuto || t.origin === 'auto-provisao' || t.origin === 'investAuto' || t.origin === 'patrimonioAuto'
      const somaPorOrigem = new Map()
      for (const t of d.transactions) {
        if (t.type !== 'expense' || t.accountType !== 'credit' || t.accountId !== card.id || isAutomacao(t)) continue
        if (faturaMesAnoOf(card, t.date, t.faturaMonthYear) !== faturaMesAno) continue
        const origem = origemById.get(t.grupoGerencial)
        if (!origem) continue
        somaPorOrigem.set(origem, rb((somaPorOrigem.get(origem) || 0) + (Number(t.amount) || 0)))
      }
      const isPago = (s) => (s.registered || []).length > 0 || (s.skipped || []).length > 0 || s.confirmado === true

      if (isNumbered && grupo.defaultAccountId) {
        const origem = grupo.defaultAccountId
        const soma = somaPorOrigem.get(origem) || 0
        const schedId = `fsch_${card.id}_${yyyy}${mm}_resgate_reserva_${origem}`
        const existing = schedules.find(s =>
          s.id === schedId ||
          (s.tipo === 'resgate_reserva' && s.cardId === card.id && s.faturaMesAno === faturaMesAno && s.accountId === origem)
        )
        // "já pago": schedule presente (qualquer estado) OU resgate já executado (transferência
        // com sourceScheduleId apontando p/ este slot, caso o schedule tenha sido removido).
        const jaPago = transactions.some(t => t.type === 'transfer' && t.sourceScheduleId === schedId)
        if (!existing && !jaPago && soma > 0) {
          const dueDate = `${yyyy}-${mm}-${String(card.dueDay || 10).padStart(2, '0')}`
          schedules = [...schedules, {
            id: schedId, tipo: 'resgate_reserva',
            transactionType: 'transfer', accountId: origem, toAccountId: contaPrincipal.id,
            startDate: dueDate, amount: soma,
            description: `Resgate Reserva ${apelido} - Fatura ${faturaRef}`,
            reservaFuncaoId: lanc.reservaFuncaoId || null,
            frequency: 'once', occurrenceType: 'installment', installments: 1, autoRegister: false,
            registered: [], skipped: [], cardId: card.id, faturaMesAno, faturaRef,
            overrides: { _gerencial: { faturaRef, cardId: card.id, checkingAccountId: contaPrincipal.id } },
          }]
        }
      }

      // Remove resgates PENDENTES desta fatura cuja origem ficou sem gastos numerados (ex.: grupo
      // reclassificado p/ D / outro). Preserva os já pagos/registrados (histórico).
      const removedResgateIds = []
      schedules = schedules.filter(s => {
        if (s.tipo !== 'resgate_reserva' || s.cardId !== card.id || s.faturaMesAno !== faturaMesAno) return true
        if (isPago(s)) return true
        if ((somaPorOrigem.get(s.accountId) || 0) > 0) return true
        removedResgateIds.push(s.id)
        return false
      })
      let scheduleReservaFuncoes = d.scheduleReservaFuncoes
      if (removedResgateIds.length) {
        const removed = new Set(removedResgateIds)
        scheduleReservaFuncoes = (d.scheduleReservaFuncoes || []).filter(srf => !removed.has(srf.scheduleId))
      }

      if (accounts === d.accounts && transactions === d.transactions && schedules === d.schedules) return d
      return { ...d, accounts, transactions, schedules, scheduleReservaFuncoes }
  }, [])

  const ensureGerencialState = useCallback((lancId) => {
    update(d => applyEnsureGerencial(d, lancId))
  }, [update, applyEnsureGerencial])

  const updateTransaction = useCallback((id, changes) => {
    // TAREFA 2: se uma despesa de cartão muda de valor ou de fatura, recalcula a(s)
    // conta(s) a pagar afetada(s). Lê o tx antigo do dataRef (síncrono) antes do update.
    const old = dataRef.current.transactions.find(t => t.id === id)
    let recalcArgs = null
    if (old && old.type === 'expense' && old.accountType === 'credit') {
      const updated = { ...old, ...changes }
      const amountChanged = 'amount' in changes && Number(changes.amount) !== old.amount
      const faturaChanged =
        ('faturaMonthYear' in changes && (changes.faturaMonthYear || null) !== (old.faturaMonthYear || null)) ||
        ('date' in changes && changes.date !== old.date)
      // Mudança de grupo gerencial reclassifica o gasto (G ↔ numerado ↔ D) → recalcula a fatura.
      const grupoChanged =
        'grupoGerencial' in changes && (changes.grupoGerencial || null) !== (old.grupoGerencial || null)
      if (amountChanged || faturaChanged || grupoChanged) {
        recalcArgs = { cartaoId: old.accountId, old, updated, faturaChanged }
      }
    }
    update(d => {
      const oldTx = d.transactions.find(t => t.id === id)
      if (!oldTx) return d
      const newTx = sanitizeReservaFuncao({ ...oldTx, ...changes }, d.gerencialGroups, d.reserveFunctions)
      // Atualiza os saldos das contas igual a adicionar/excluir: reverte o efeito do lançamento
      // ANTIGO e aplica o do NOVO. Cobre mudança de valor, conta, tipo, destino e fatura vinculada
      // (saldo das contas comuns, dívida do cartão e abatimento de pagamento de fatura). Quando os
      // campos de saldo não mudam (ex.: só descrição/categoria/reconciliado), o efeito é nulo.
      let accounts = applyBalanceEffect(d.accounts, oldTx, -1)
      accounts = applyBalanceEffect(accounts, newTx, 1)
      return { ...d, accounts, transactions: d.transactions.map(t => t.id === id ? newTx : t) }
    })
    if (recalcArgs) {
      recalcFaturaRef.current?.(recalcArgs.cartaoId, recalcArgs.updated.date, recalcArgs.updated.faturaMonthYear)
      if (recalcArgs.faturaChanged) {
        recalcFaturaRef.current?.(recalcArgs.cartaoId, recalcArgs.old.date, recalcArgs.old.faturaMonthYear)
      }
      // Gatilho do reconciliador gerencial (cartão): agendamentos geridos + saldos Ger.
      // Restrito às faturas REALMENTE afetadas (nova + antiga quando a fatura mudou) — não
      // varre as demais faturas do cartão (evitava criar agendamento fantasma em outro mês).
      const card = dataRef.current.accounts.find(a => a.id === recalcArgs.cartaoId)
      const faturasAfetadas = new Set()
      const fNova = faturaMesAnoOf(card, recalcArgs.updated.date, recalcArgs.updated.faturaMonthYear)
      if (fNova) faturasAfetadas.add(fNova)
      if (recalcArgs.faturaChanged) {
        const fAntiga = faturaMesAnoOf(card, recalcArgs.old.date, recalcArgs.old.faturaMonthYear)
        if (fAntiga) faturasAfetadas.add(fAntiga)
      }
      reconcileGerencialRef.current?.(recalcArgs.cartaoId, [...faturasAfetadas])
    }
    // Reconcile de estado esperado gerencial deste lançamento — SEMPRE, mudou o grupo ou não.
    // Complementa o motor (que só materializa faturas do ciclo atual/futuro) e é idempotente.
    if (old && old.type === 'expense' && old.accountType === 'credit') {
      ensureGerencialState(id)
    }
  }, [update, ensureGerencialState])

  // Marca/desmarca reconciliação de um ou vários lançamentos (em lote).
  const setReconciled = useCallback((ids, value) => {
    const idSet = new Set(Array.isArray(ids) ? ids : [ids])
    update(d => ({ ...d, transactions: d.transactions.map(t => idSet.has(t.id) ? { ...t, reconciled: !!value } : t) }))
  }, [update])

  // Edição em lote de lançamentos: altera Data e/ou Categoria de vários registros.
  // Reaproveita updateTransaction por id para herdar o recálculo de fatura/saldo do cartão
  // (mudança de data realoca a fatura → recalcula creditDebt) e a persistência via sync.
  // Dispara também o endpoint /api/transactions-bulk-update para a gravação em lote no banco.
  const bulkUpdateTransactions = useCallback((ids, { date, categoryId } = {}) => {
    const list = Array.isArray(ids) ? ids.filter(Boolean) : []
    if (list.length === 0) return
    const changes = {}
    if (date) changes.date = date
    if (categoryId !== undefined && categoryId !== null && categoryId !== '') changes.categoryId = categoryId
    if (Object.keys(changes).length === 0) return

    // Gravação atômica em lote no banco (não bloqueia a UI; o sync por estado é o backstop).
    bulkUpdateTransactionsApi(list, { date: changes.date || null, categoryId: 'categoryId' in changes ? changes.categoryId : undefined })
      .catch(e => console.error('[bulkUpdate] api', e.message))

    // Estado + recálculo de fatura/saldo por lançamento (e persistência via diff-sync).
    for (const id of list) updateTransaction(id, changes)
  }, [updateTransaction])

  const deleteTransaction = useCallback((id) => {
    // Captura as faturas afetadas (gasto + parcelas-filhas) antes do update p/ recalcular depois.
    const before = dataRef.current
    const txBefore = before.transactions.find(t => t.id === id)
    const faturasParaRecalcular = []
    const addFatura = (t) => {
      if (t && t.type === 'expense' && t.accountType === 'credit') {
        const card = before.accounts.find(a => a.id === t.accountId)
        const mesAno = faturaMesAnoOf(card, t.date, t.faturaMonthYear)
        if (mesAno) faturasParaRecalcular.push([t.accountId, mesAno])
      }
    }
    if (txBefore) {
      addFatura(txBefore)
      before.transactions.filter(t => t.parentTxId === id && t.origin === 'parcela').forEach(addFatura)
    }

    update(d => {
      const tx = d.transactions.find(t => t.id === id)
      if (!tx) return d
      let accounts = [...d.accounts]
      // Desfaz o impacto de um lançamento no(s) saldo(s) ao removê-lo.
      const reverseBalance = (t) => {
        if (t.type === 'income') {
          if (t.accountType === 'credit') {
            // Desfaz o estorno de cartão → devolve o valor à dívida da fatura.
            accounts = accounts.map(a => a.id === t.accountId ? {
              ...a,
              creditDebt: (a.creditDebt || 0) + t.amount,
              creditMonthBill: (a.creditMonthBill || 0) + t.amount,
            } : a)
          } else {
            accounts = accounts.map(a => a.id === t.accountId ? { ...a, balance: rb(a.balance - t.amount) } : a)
          }
        } else if (t.type === 'expense') {
          if (t.accountType === 'credit') {
            accounts = accounts.map(a => a.id === t.accountId ? {
              ...a,
              creditDebt: Math.max(0, (a.creditDebt || 0) - t.amount),
              creditMonthBill: Math.max(0, (a.creditMonthBill || 0) - t.amount),
            } : a)
          } else {
            accounts = accounts.map(a => a.id === t.accountId ? { ...a, balance: rb(a.balance + t.amount) } : a)
          }
        } else if (t.type === 'transfer') {
          accounts = applyTransferEffect(accounts, t, -1)
        }
      }

      reverseBalance(tx)
      let transactions = d.transactions.filter(t => t.id !== id)

      // Grupo G: remove a transferência imediata (etapa A) vinculada a este gasto.
      if (tx.grupoGerencial && tx.type === 'expense' && tx.accountType === 'credit') {
        const grupo = d.gerencialGroups?.find(g => g.id === tx.grupoGerencial)
        if (grupo?.number === 1) {
          const etapaATx = d.transactions.find(t => t.id === etapaAId(id))
          if (etapaATx) {
            reverseBalance(etapaATx)
            transactions = transactions.filter(t => t.id !== etapaATx.id)
          }
        }
      }

      // Remove e reverte os lançamentos-filhos (parcelas futuras, reservaAuto, patrimonioAuto, auto-provisão, investAuto)
      const children = transactions.filter(t =>
        t.parentTxId === id &&
        (t.origin === 'parcela' || t.origin === 'auto-provisao' || t.origin === 'investAuto' || t.origin === 'patrimonioAuto' || t.reservaAuto)
      )
      for (const c of children) reverseBalance(c)
      const childIds = new Set(children.map(c => c.id))
      transactions = transactions.filter(t => !childIds.has(t.id))

      // Empréstimos: cascata dos lançamentos espelho (espelhoOrigemId === id). Só lançamentos
      // ORIGINAIS disparam a cascata — deletar/estornar um espelho diretamente não remove outros.
      if (!tx.isEspelho) {
        const espelhos = transactions.filter(t => t.espelhoOrigemId === id)
        for (const e of espelhos) reverseBalance(e)
        const espIds = new Set(espelhos.map(e => e.id))
        transactions = transactions.filter(t => !espIds.has(t.id))
      }

      return { ...d, accounts, transactions, rateios: (d.rateios || []).filter(r => r.lancamentoId !== id && !childIds.has(r.lancamentoId)) }
    })

    // Remove os rateios do lançamento excluído no banco (quando houver).
    if ((before.rateios || []).some(r => r.lancamentoId === id)) {
      deleteRateios(id).catch(e => console.error('[rateios] delete', e.message))
    }

    // Recalcula os agendamentos das faturas afetadas (gatilho: deleção de gasto de cartão).
    const seen = new Set()
    for (const [cardId, mesAno] of faturasParaRecalcular) {
      const key = `${cardId}|${mesAno}`
      if (seen.has(key)) continue
      seen.add(key)
      const [y, m] = mesAno.split('-')
      recalcAgendamentosRef.current?.(cardId, y, m)
    }
    // Gatilho do reconciliador gerencial: reconcilia os cartões afetados pela deleção.
    for (const cardId of new Set(faturasParaRecalcular.map(([c]) => c))) {
      reconcileGerencialRef.current?.(cardId)
    }
  }, [update])

  const reverseTransaction = useCallback((id) => {
    // Faturas afetadas (gasto + parcelas-filhas), capturadas antes do update.
    const before = dataRef.current
    const txBefore = before.transactions.find(t => t.id === id)
    const faturasParaRecalcular = []
    const addFatura = (t) => {
      if (t && t.type === 'expense' && t.accountType === 'credit') {
        const card = before.accounts.find(a => a.id === t.accountId)
        const mesAno = faturaMesAnoOf(card, t.date, t.faturaMonthYear)
        if (mesAno) faturasParaRecalcular.push([t.accountId, mesAno])
      }
    }
    if (txBefore) {
      addFatura(txBefore)
      before.transactions.filter(t => t.parentTxId === id && t.origin === 'parcela').forEach(addFatura)
    }

    update(d => {
      const tx = d.transactions.find(t => t.id === id)
      if (!tx) return d
      let accounts = [...d.accounts]
      const reverseBalance = (t) => {
        if (t.type === 'income') {
          if (t.accountType === 'credit') {
            // Desfaz o estorno de cartão → devolve o valor à dívida da fatura.
            accounts = accounts.map(a => a.id === t.accountId ? {
              ...a,
              creditDebt: (a.creditDebt || 0) + t.amount,
              creditMonthBill: (a.creditMonthBill || 0) + t.amount,
            } : a)
          } else {
            accounts = accounts.map(a => a.id === t.accountId ? { ...a, balance: rb(a.balance - t.amount) } : a)
          }
        } else if (t.type === 'expense') {
          if (t.accountType === 'credit') {
            accounts = accounts.map(a => a.id === t.accountId ? {
              ...a,
              creditDebt: Math.max(0, (a.creditDebt || 0) - t.amount),
              creditMonthBill: Math.max(0, (a.creditMonthBill || 0) - t.amount),
            } : a)
          } else {
            accounts = accounts.map(a => a.id === t.accountId ? { ...a, balance: rb(a.balance + t.amount) } : a)
          }
        } else if (t.type === 'transfer') {
          accounts = applyTransferEffect(accounts, t, -1)
        }
      }

      reverseBalance(tx)

      // Desfaz o registro da ocorrência no agendamento vinculado (estorno reabre a ocorrência).
      let schedules = d.schedules
      if (tx.scheduleId) {
        schedules = d.schedules.map(s =>
          s.id === tx.scheduleId
            ? { ...s, registered: (s.registered || []).filter(r => r !== tx.date) }
            : s
        )
      }
      let transactions = d.transactions.filter(t => t.id !== id)

      // Grupo G: remove a transferência imediata (etapa A) vinculada a este gasto.
      if (tx.grupoGerencial && tx.type === 'expense' && tx.accountType === 'credit') {
        const grupo = d.gerencialGroups?.find(g => g.id === tx.grupoGerencial)
        if (grupo?.number === 1) {
          const etapaATx = d.transactions.find(t => t.id === etapaAId(id))
          if (etapaATx) {
            reverseBalance(etapaATx)
            transactions = transactions.filter(t => t.id !== etapaATx.id)
          }
        }
      }

      // Remove e reverte os lançamentos-filhos (parcelas futuras, reservaAuto, patrimonioAuto, auto-provisão, investAuto)
      const children = transactions.filter(t =>
        t.parentTxId === id &&
        (t.origin === 'parcela' || t.origin === 'auto-provisao' || t.origin === 'investAuto' || t.origin === 'patrimonioAuto' || t.reservaAuto)
      )
      for (const c of children) reverseBalance(c)
      const childIds = new Set(children.map(c => c.id))
      transactions = transactions.filter(t => !childIds.has(t.id))

      // Empréstimos: cascata dos lançamentos espelho (espelhoOrigemId === id). Só lançamentos
      // ORIGINAIS disparam a cascata — deletar/estornar um espelho diretamente não remove outros.
      if (!tx.isEspelho) {
        const espelhos = transactions.filter(t => t.espelhoOrigemId === id)
        for (const e of espelhos) reverseBalance(e)
        const espIds = new Set(espelhos.map(e => e.id))
        transactions = transactions.filter(t => !espIds.has(t.id))
      }

      return { ...d, accounts, transactions, schedules }
    })

    const seen = new Set()
    for (const [cardId, mesAno] of faturasParaRecalcular) {
      const key = `${cardId}|${mesAno}`
      if (seen.has(key)) continue
      seen.add(key)
      const [y, m] = mesAno.split('-')
      recalcAgendamentosRef.current?.(cardId, y, m)
    }
  }, [update])

  // Reverte apenas a transferência imediata do Grupo G (ETAPA A) sem tocar na própria tx.
  // Os agendamentos da fatura são reconstruídos por recalcularAgendamentosFatura após a edição.
  const reverseGerencialCascadeOnly = useCallback((tx) => {
    if (!tx?.grupoGerencial || tx.type !== 'expense' || tx.accountType !== 'credit') return
    update(d => {
      const grupo = d.gerencialGroups?.find(g => g.id === tx.grupoGerencial)
      if (grupo?.number !== 1) return d // só o Grupo G tem transferência imediata
      const etapaATx = d.transactions.find(t => t.id === etapaAId(tx.id))
      if (!etapaATx) return d
      const accounts = d.accounts.map(a => {
        if (a.id === etapaATx.accountId) return { ...a, balance: rb(a.balance + etapaATx.amount) }
        if (a.id === etapaATx.toAccountId) return { ...a, balance: rb(a.balance - etapaATx.amount) }
        return a
      })
      return { ...d, accounts, transactions: d.transactions.filter(t => t.id !== etapaATx.id) }
    })
  }, [update])

  // ── Categories ──────────────────────────────────────────────────────────────
  // Garante que o rótulo de grupo exista em settings.categoryGroups (idempotente,
  // case-insensitive). Retorna o objeto settings (novo se mudou, mesmo se não).
  const ensureCategoryGroup = (settings, rawName) => {
    const name = (rawName || '').trim()
    if (!name) return settings
    const list = settings.categoryGroups || []
    if (list.some(g => g.toLowerCase() === name.toLowerCase())) return settings
    return { ...settings, categoryGroups: [...list, name] }
  }

  const addCategory = useCallback((category) => {
    const id = 'cat_' + Date.now()
    const group = (category.group || '').trim() || null
    update(d => ({
      ...d,
      settings: ensureCategoryGroup(d.settings, group),
      categories: [...d.categories, { ...category, group, id }],
    }))
  }, [update])

  const updateCategory = useCallback((id, changes) => {
    update(d => {
      let next = changes
      let settings = d.settings
      // Reclassificação de grupo: normaliza e auto-cria o grupo se for novo.
      // Nenhum lançamento/saldo é alterado — só o vínculo categoria→grupo.
      if (Object.prototype.hasOwnProperty.call(changes, 'group')) {
        const group = (changes.group || '').trim() || null
        next = { ...changes, group }
        settings = ensureCategoryGroup(d.settings, group)
      }
      return { ...d, settings, categories: d.categories.map(c => c.id === id ? { ...c, ...next } : c) }
    })
  }, [update])

  const deleteCategory = useCallback((id) => {
    update(d => ({ ...d, categories: d.categories.filter(c => c.id !== id) }))
  }, [update])

  // ── Category groups (rótulos persistidos em settings.categoryGroups) ──────────
  const addCategoryGroup = useCallback((name) => {
    const n = (name || '').trim()
    if (!n) return
    update(d => ({ ...d, settings: ensureCategoryGroup(d.settings, n) }))
  }, [update])

  // Renomeia o grupo: atualiza o rótulo na lista e reclassifica as categorias
  // vinculadas (apenas o campo `group`; lançamentos/saldos não mudam).
  const renameCategoryGroup = useCallback((oldName, newName) => {
    const from = (oldName || '').trim()
    const to = (newName || '').trim()
    if (!from || !to || from === to) return
    update(d => {
      const renamed = (d.settings.categoryGroups || []).map(g => g === from ? to : g)
      const categoryGroups = [...new Set(renamed)]
      return {
        ...d,
        settings: { ...d.settings, categoryGroups },
        categories: d.categories.map(c => c.group === from ? { ...c, group: to } : c),
      }
    })
  }, [update])

  // Exclui um grupo — só permitido quando não há categorias vinculadas.
  const deleteCategoryGroup = useCallback((name) => {
    const n = (name || '').trim()
    if (!n) return
    update(d => {
      if (d.categories.some(c => c.group === n)) return d // bloqueado: tem categorias
      return { ...d, settings: { ...d.settings, categoryGroups: (d.settings.categoryGroups || []).filter(g => g !== n) } }
    })
  }, [update])

  // ── Schedules ───────────────────────────────────────────────────────────────
  const addSchedule = useCallback((schedule) => {
    const id = 'sch_' + Date.now()
    update(d => ({ ...d, schedules: [...d.schedules, { ...schedule, id, skipped: [], registered: [] }] }))
    return id
  }, [update])

  const updateSchedule = useCallback((id, changes) => {
    update(d => ({ ...d, schedules: d.schedules.map(s => s.id === id ? { ...s, ...changes } : s) }))
  }, [update])

  // Alterna a flag visual "Confirmado / A Confirmar" do agendamento.
  const toggleScheduleConfirmado = useCallback((id) => {
    update(d => ({ ...d, schedules: d.schedules.map(s => s.id === id ? { ...s, confirmado: !s.confirmado } : s) }))
  }, [update])

  const deleteSchedule = useCallback((id) => {
    update(d => ({ ...d, schedules: d.schedules.filter(s => s.id !== id) }))
  }, [update])

  // Chain ID: agendamento de resgate avulso vinculado a um lançamento (source_tx_id), se houver.
  // Usado pelos painéis de exclusão para avisar que o resgate vinculado também será removido.
  const findLinkedResgate = useCallback((txId) => {
    if (!txId) return null
    return data.schedules.find(s => s.sourceTxId === txId && s.tipo === 'resgate_reserva') || null
  }, [data.schedules])

  // Efetiva uma Provisão de Despesa com o valor/data reais informados.
  //
  // • Provisão "Uma vez" (frequency === 'once'): grava valor/data no próprio registro e o marca
  //   como efetivado (provisao_efetivada = true; volta a auto-registrar como despesa normal).
  //
  // • Provisão recorrente (Contínua/Parcelada): cria um agendamento NORMAL de despesa
  //   (is_provisao = false, autoRegister = false) com o valor/data reais — entra na lista normal
  //   para ser pago — e AVANÇA a própria provisão para data_real + 1 intervalo da frequência
  //   (ex.: semanal efetivada em 15/06 → próxima ocorrência 22/06). A série continua como
  //   provisão recorrente para as próximas ocorrências.
  //
  // Em ambos os casos, havendo reservaFuncaoId, cria um agendamento de Transferência (Uma vez)
  // da conta da reserva → conta principal com o valor/data confirmados e o mesmo reservaFuncaoId:
  // é o resgate REAL que substitui a projeção provisória no Fluxo Futuro da reserva.
  const efetivarProvisao = useCallback((id, { amount, date }) => {
    update(d => {
      const prov = d.schedules.find(s => s.id === id)
      if (!prov) return d
      const valor = Number(amount)
      const isOnce = (prov.frequency || 'once') === 'once'

      let schedules = d.schedules.map(s => {
        if (s.id !== id) return s
        if (isOnce) {
          return { ...s, amount: valor, startDate: date, provisaoEfetivada: true, autoRegister: true }
        }
        // Recorrente: a série continua como provisão, reiniciando em data_real + 1 intervalo
        // da frequência (ex.: semanal efetivada em 15/06 → próxima ocorrência 22/06). O
        // lançamento real vira um agendamento NORMAL separado (criado abaixo). Limpa o
        // provisao_efetivada_until legado (o modelo agora avança a própria startDate).
        const proximaInicio = advanceByFrequency(date, s.frequency || 'weekly')
        return { ...s, startDate: proximaInicio, provisaoEfetivadaUntil: null }
      })

      // Provisão recorrente: cria o agendamento NORMAL de despesa (is_provisao=false) com
      // valor/data REAIS, copiando os campos definitivos da provisão. Não auto-registra —
      // entra na lista normal para ser pago. (Provisão "Uma vez" continua virando ela mesma
      // a despesa efetivada, acima — sem agendamento duplicado.)
      if (!isOnce) {
        schedules = [...schedules, {
          id: 'sch_' + Date.now() + '_' + Math.random().toString(36).slice(2),
          description: prov.description,
          transactionType: prov.transactionType || 'expense',
          accountId: prov.accountId,
          accountType: prov.accountType || null,
          toAccountId: prov.toAccountId || '',
          amount: valor,
          categoryId: prov.categoryId || '',
          payee: prov.payee || '',
          costCenter: prov.costCenter || '',
          frequency: 'once',
          startDate: date,
          occurrenceType: 'continuous',
          installments: 0,
          registered: [],
          skipped: [],
          remindDaysBefore: prov.remindDaysBefore ?? 3,
          autoRegister: false,
          overrides: {},
          grupoGerencial: prov.grupoGerencial ?? null,
          reservaExpenseCategoryId: prov.reservaExpenseCategoryId ?? null,
          // O resgate da reserva (transferência) é criado à parte; a despesa em si não carrega função.
          reservaFuncaoId: null,
          isProvisao: false,
          provisaoEfetivada: false,
        }]
      }

      if (prov.reservaFuncaoId) {
        const func = (d.reserveFunctions || []).find(f => f.id === prov.reservaFuncaoId)
        const contaReserva = func?.accountId ? d.accounts.find(a => a.id === func.accountId) : null
        const contaPrincipal =
          d.accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal) ||
          d.accounts.find(a => a.isMain && a.type !== 'credit') ||
          d.accounts.find(a => a.type === 'checking')
        if (contaReserva && contaPrincipal) {
          schedules = [...schedules, {
            id: 'sch_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            description: `Resgate provisão — ${prov.description}`,
            transactionType: 'transfer',
            accountId: contaReserva.id,
            accountType: contaReserva.type || null,
            toAccountId: contaPrincipal.id,
            amount: valor,
            categoryId: '',
            payee: '',
            costCenter: '',
            frequency: 'once',
            startDate: date,
            occurrenceType: 'continuous',
            installments: 0,
            registered: [],
            skipped: [],
            remindDaysBefore: 3,
            autoRegister: true,
            overrides: {},
            grupoGerencial: null,
            reservaExpenseCategoryId: null,
            reservaFuncaoId: prov.reservaFuncaoId,
            isProvisao: false,
            provisaoEfetivada: false,
          }]
        }
      }
      return { ...d, schedules }
    })
  }, [update])

  // `date` = data do lançamento criado. `occurrenceDate` = data da OCORRÊNCIA do agendamento
  // a registrar (default = date). Decouplá-las permite baixar a ocorrência correta (nextDate)
  // mesmo lançando numa data diferente — usado pelo pagamento em lote.
  const registerScheduleOccurrence = useCallback((scheduleId, date, occurrenceDate = date) => {
    const newTxId = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    update(d => {
      const schedule = d.schedules.find(s => s.id === scheduleId)
      if (!schedule) return d

      // Rastreabilidade: para os agendamentos gerenciais (gerencial_devolucao / resgate_reserva /
      // pagamento_fatura), copia cartão, fatura e o próprio agendamento para o lançamento gerado.
      const gerTrace = ['gerencial_devolucao', 'resgate_reserva', 'pagamento_fatura'].includes(schedule.tipo)
        ? { cardId: schedule.cardId || null, faturaRef: schedule.faturaRef || null, sourceScheduleId: scheduleId }
        : {}

      // Resgate com detalhamento por função (Etapa B): gera UMA transferência por linha
      // de schedule_reserva_funcoes (valor + função própria), em vez da transferência única.
      const detalhe = (d.scheduleReservaFuncoes || []).filter(srf => srf.scheduleId === scheduleId)
      if (schedule.transactionType === 'transfer' && detalhe.length > 0) {
        const funcName = new Map((d.reserveFunctions || []).map(f => [f.id, f.name]))
        const nowIso = new Date().toISOString()
        const baseTs = Date.now()
        const detTxs = detalhe.map((srf, i) => ({
          id: 'tx_' + baseTs + '_' + i + '_' + Math.random().toString(36).slice(2),
          type: 'transfer',
          accountId: schedule.accountId,
          accountType: schedule.accountType,
          toAccountId: schedule.toAccountId,
          amount: Number(srf.valor) || 0,
          categoryId: schedule.categoryId,
          description: `${schedule.description} — ${funcName.get(srf.reservaFuncaoId) || 'Função'}`,
          payee: schedule.payee,
          costCenter: schedule.costCenter,
          date,
          scheduleId,
          reservaFuncaoId: srf.reservaFuncaoId,
          origin: 'agendamento',
          ...gerTrace,
          createdAt: nowIso,
        }))
        const totalLines = rb(detTxs.reduce((s, t) => s + Number(t.amount), 0))
        const accounts = d.accounts.map(a => {
          if (a.id === schedule.accountId) return { ...a, balance: rb(a.balance - totalLines) }
          if (a.id === schedule.toAccountId) return { ...a, balance: rb(a.balance + totalLines) }
          return a
        })
        // Sombras de reserva (reservaAuto) por linha — MESMA lógica do resgate manual
        // (buildReservaAutoTxs gera o par _r/_d "Resgate Reserva:"). Sem isso, os resgates de
        // fatura com detalhamento não apareciam no Demonstrativo. Cada sombra é vinculada à sua
        // transferência física via parentTxId (cascade de estorno/deleção). A transferência
        // física (reservaAuto ausente/false) permanece INALTERADA.
        const detAutoTxs = detTxs.flatMap(t => buildReservaAutoTxs(
          { type: 'transfer', accountId: t.accountId, toAccountId: t.toAccountId, amount: t.amount, date, reservaExpenseCategoryId: schedule.reservaExpenseCategoryId, reservaFuncaoId: t.reservaFuncaoId },
          accounts,
          t.id,
          d.reserveFunctions,
        ))
        return {
          ...d, accounts,
          transactions: [...d.transactions, ...detTxs, ...detAutoTxs],
          schedules: d.schedules.map(s =>
            s.id === scheduleId ? { ...s, registered: [...(s.registered || []), occurrenceDate], confirmado: false } : s
          ),
        }
      }

      const tx = {
        type: schedule.transactionType,
        accountId: schedule.accountId,
        accountType: schedule.accountType,
        toAccountId: schedule.toAccountId,
        amount: schedule.amount,
        categoryId: schedule.categoryId,
        description: schedule.description,
        payee: schedule.payee,
        costCenter: schedule.costCenter,
        date,
        scheduleId,
        reservaFuncaoId: schedule.reservaFuncaoId || null,
        origin: 'agendamento',
        ...gerTrace,
      }
      const newTx = { ...tx, id: newTxId, createdAt: new Date().toISOString() }
      let accounts = [...d.accounts]
      if (tx.type === 'income') {
        if (tx.accountType === 'credit') {
          // Estorno em cartão → abate a dívida da fatura (consistente com o totalizador
          // visual e com o agendamento pagamento_fatura).
          accounts = accounts.map(a => a.id === tx.accountId ? {
            ...a,
            creditDebt: Math.max(0, (a.creditDebt || 0) - Number(tx.amount)),
            creditMonthBill: Math.max(0, (a.creditMonthBill || 0) - Number(tx.amount)),
          } : a)
        } else {
          accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: rb(a.balance + Number(tx.amount)) } : a)
        }
      } else if (tx.type === 'expense') {
        if (tx.accountType === 'credit') {
          accounts = accounts.map(a => a.id === tx.accountId ? {
            ...a,
            creditDebt: (a.creditDebt || 0) + Number(tx.amount),
            creditMonthBill: (a.creditMonthBill || 0) + Number(tx.amount),
          } : a)
        } else {
          accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: rb(a.balance - Number(tx.amount)) } : a)
        }
      } else if (tx.type === 'transfer') {
        // Pagamento de fatura (agendamento tipo='pagamento_fatura'): a perna de DESTINO é o
        // cartão. Em vez de creditar o saldo do cartão, abate a dívida da fatura
        // (creditDebt/creditMonthBill, clampado em 0) — mesma lógica do pagamento manual
        // (credit_payment). Demais transferências mantêm o comportamento atual.
        const isFaturaPayment = schedule.tipo === 'pagamento_fatura'
        accounts = accounts.map(a => {
          if (a.id === tx.accountId) return { ...a, balance: rb(a.balance - Number(tx.amount)) }
          if (a.id === tx.toAccountId) {
            if (isFaturaPayment) return {
              ...a,
              creditDebt: Math.max(0, (a.creditDebt || 0) - Number(tx.amount)),
              creditMonthBill: Math.max(0, (a.creditMonthBill || 0) - Number(tx.amount)),
            }
            return { ...a, balance: rb(a.balance + Number(tx.amount)) }
          }
          return a
        })
      }
      const autoTxs = buildReservaAutoTxs(
        { type: tx.type, accountId: tx.accountId, toAccountId: tx.toAccountId, amount: tx.amount, date, reservaExpenseCategoryId: schedule.reservaExpenseCategoryId, reservaFuncaoId: tx.reservaFuncaoId || schedule.reservaFuncaoId },
        accounts,
        newTxId,
        d.reserveFunctions
      )
      const investIncome = buildInvestAutoIncomeTx(newTx, d.categories, accounts, newTxId)
      if (investIncome) {
        accounts = accounts.map(a => a.id === investIncome.accountId ? { ...a, balance: rb(a.balance + investIncome.amount) } : a)
      }
      return {
        ...d, accounts,
        transactions: [...d.transactions, newTx, ...autoTxs, ...(investIncome ? [investIncome] : [])],
        schedules: d.schedules.map(s =>
          s.id === scheduleId ? { ...s, registered: [...(s.registered || []), occurrenceDate], confirmado: false } : s
        ),
      }
    })
    // PARTE 1: propaga o rateio do agendamento para o lançamento recém-criado.
    const schedRateios = (dataRef.current.rateios || []).filter(r => r.lancamentoId === scheduleId)
    if (schedRateios.length > 0) {
      saveRateiosFor(newTxId, schedRateios.map(r => ({ categoriaId: r.categoriaId, valor: r.valor, descricao: r.descricao })))
    }
    return newTxId
  }, [update, saveRateiosFor])

  const skipScheduleOccurrence = useCallback((scheduleId, date) => {
    update(d => ({
      ...d,
      schedules: d.schedules.map(s =>
        s.id === scheduleId ? { ...s, skipped: [...(s.skipped || []), date] } : s
      ),
    }))
  }, [update])

  // ── Budgets ─────────────────────────────────────────────────────────────────
  const addBudget = useCallback((budget) => {
    const id = 'bud_' + Date.now()
    update(d => ({ ...d, budgets: [...d.budgets, { ...budget, id }] }))
  }, [update])

  const updateBudget = useCallback((id, changes) => {
    update(d => ({ ...d, budgets: d.budgets.map(b => b.id === id ? { ...b, ...changes } : b) }))
  }, [update])

  const deleteBudget = useCallback((id) => {
    update(d => ({ ...d, budgets: d.budgets.filter(b => b.id !== id) }))
  }, [update])

  // ── Classification Rules ────────────────────────────────────────────────────
  const addRule = useCallback((rule) => {
    const id = 'rule_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    update(d => ({ ...d, classificationRules: [...d.classificationRules, { ...rule, id }] }))
  }, [update])

  const updateRule = useCallback((id, changes) => {
    update(d => ({ ...d, classificationRules: d.classificationRules.map(r => r.id === id ? { ...r, ...changes } : r) }))
  }, [update])

  const deleteRule = useCallback((id) => {
    update(d => ({ ...d, classificationRules: d.classificationRules.filter(r => r.id !== id) }))
  }, [update])

  // ── Gerencial Rules (Regras de Grupo Gerencial) ────────────────────────────
  const addGerencialRule = useCallback((rule) => {
    const id = 'grule_' + Date.now()
    update(d => {
      const order = (d.gerencialRules || []).length
      return { ...d, gerencialRules: [...(d.gerencialRules || []), { ...rule, id, order }] }
    })
  }, [update])

  const updateGerencialRule = useCallback((id, changes) => {
    update(d => ({ ...d, gerencialRules: (d.gerencialRules || []).map(r => r.id === id ? { ...r, ...changes } : r) }))
  }, [update])

  const deleteGerencialRule = useCallback((id) => {
    update(d => ({
      ...d,
      gerencialRules: (d.gerencialRules || []).filter(r => r.id !== id).map((r, i) => ({ ...r, order: i })),
    }))
  }, [update])

  const moveGerencialRule = useCallback((id, dir) => {
    update(d => {
      const rules = [...(d.gerencialRules || [])].sort((a, b) => a.order - b.order)
      const idx = rules.findIndex(r => r.id === id)
      if (idx < 0) return d
      const newIdx = dir === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= rules.length) return d
      const [rule] = rules.splice(idx, 1)
      rules.splice(newIdx, 0, rule)
      return { ...d, gerencialRules: rules.map((r, i) => ({ ...r, order: i })) }
    })
  }, [update])

  const classifyGerencialByRules = useCallback((description, amount, isParcelado) => {
    const lower = description.toLowerCase()
    const sorted = [...(data.gerencialRules || [])].sort((a, b) => a.order - b.order)
    for (const rule of sorted) {
      if (!lower.includes(rule.contains.toLowerCase())) continue
      if (rule.isParcelado === 'yes' && !isParcelado) continue
      if (rule.isParcelado === 'no' && isParcelado) continue
      if (rule.minAmount != null && amount < rule.minAmount) continue
      if (rule.maxAmount != null && amount > rule.maxAmount) continue
      return rule.grupoGerencialId
    }
    return null
  }, [data.gerencialRules])

  // ── Payees ──────────────────────────────────────────────────────────────────
  const addPayee = useCallback((name) => {
    update(d => {
      if (d.payees.includes(name)) return d
      return { ...d, payees: [...d.payees, name] }
    })
  }, [update])

  // ── Cost Centers ─────────────────────────────────────────────────────────────
  const addCostCenter = useCallback((name) => {
    update(d => {
      if (d.costCenters.includes(name)) return d
      return { ...d, costCenters: [...d.costCenters, name] }
    })
  }, [update])

  // ── Profiles ─────────────────────────────────────────────────────────────────
  const addProfile = useCallback((profile) => {
    const id = 'prf_' + Date.now()
    update(d => {
      const profiles = d.profiles || []
      // If marked default, unmark all others
      const updated = profile.isDefault
        ? profiles.map(p => ({ ...p, isDefault: false }))
        : profiles
      return { ...d, profiles: [...updated, { ...profile, id }] }
    })
  }, [update])

  const updateProfile = useCallback((id, changes) => {
    update(d => {
      let profiles = d.profiles || []
      if (changes.isDefault) profiles = profiles.map(p => ({ ...p, isDefault: false }))
      return { ...d, profiles: profiles.map(p => p.id === id ? { ...p, ...changes } : p) }
    })
  }, [update])

  const deleteProfile = useCallback((id) => {
    update(d => ({
      ...d,
      profiles: (d.profiles || []).filter(p => p.id !== id),
      accounts: d.accounts.map(a => a.profileId === id ? { ...a, profileId: null } : a),
    }))
  }, [update])

  // ── Financial Month ──────────────────────────────────────────────────────────
  const getFinancialPeriod = useCallback((referenceDate = new Date()) => {
    const ref = new Date(referenceDate)
    // Modo "calendar": período sempre do dia 1 ao último dia do mês calendário,
    // ignorando o dia de início. "custom" (padrão): janela a partir do dia de início.
    if ((data.settings.financialMonthMode || 'custom') === 'calendar') {
      const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
      const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0) // último dia do mês
      return { start, end }
    }
    const startDay = data.settings.financialMonthStartDay || 1
    const day = ref.getDate()
    let start, end
    if (day >= startDay) {
      start = new Date(ref.getFullYear(), ref.getMonth(), startDay)
      end = new Date(ref.getFullYear(), ref.getMonth() + 1, startDay - 1)
    } else {
      start = new Date(ref.getFullYear(), ref.getMonth() - 1, startDay)
      end = new Date(ref.getFullYear(), ref.getMonth(), startDay - 1)
    }
    return { start, end }
  }, [data.settings.financialMonthStartDay, data.settings.financialMonthMode])

  // ── Schedule Occurrences ─────────────────────────────────────────────────────
  const getNextOccurrences = useCallback((schedule, count = 12) => {
    const occurrences = []
    const registered = schedule.registered || []
    const skipped = schedule.skipped || []
    // next_occurrence re-ancora a série (dia de vencimento atual); null → desde start_date.
    let current = parseISO(schedule.nextOccurrence || schedule.startDate)
    const maxInstallments = schedule.occurrenceType === 'installment' ? schedule.installments : Infinity
    let totalOccurrences = 0
    const allDone = [...registered, ...skipped]

    while (occurrences.length < count && totalOccurrences < maxInstallments) {
      const dateStr = format(current, 'yyyy-MM-dd')
      totalOccurrences++
      if (!allDone.includes(dateStr)) occurrences.push(dateStr)
      if (occurrences.length >= count) break
      switch (schedule.frequency) {
        case 'daily': current = addDays(current, 1); break
        case 'weekly': current = addWeeks(current, 1); break
        case 'biweekly': current = addWeeks(current, 2); break
        case 'monthly': current = addMonths(current, 1); break
        case 'bimonthly': current = addMonths(current, 2); break
        case 'quarterly': current = addMonths(current, 3); break
        case 'quadrimestral': current = addMonths(current, 4); break
        case 'semiannual': current = addMonths(current, 6); break
        case 'annual': current = addYears(current, 1); break
        default: break
      }
      if (schedule.frequency === 'once') break
    }
    return occurrences
  }, [])

  // Próxima ocorrência de uma provisão recorrente ainda NÃO efetivada: a primeira ocorrência
  // com data > provisao_efetivada_until (ou a próxima ocorrência se until for null). Para
  // provisão "Uma vez" devolve a própria startDate (a única ocorrência). Devolve null quando
  // não há mais ocorrências a efetivar (ex.: parcelada já totalmente efetivada).
  const getProximaProvisaoOccurrence = useCallback((schedule) => {
    if (!schedule) return null
    const occs = getNextOccurrences(schedule, 24)
    const until = schedule.provisaoEfetivadaUntil || null
    if (!until) return occs[0] || null
    return occs.find(d => d > until) || null
  }, [getNextOccurrences])

  // ── Saldos por conta (ciclo financeiro) ───────────────────────────────────────
  // Calcula os 5 saldos do ciclo a partir de initialBalance + transações/agendamentos,
  // evitando a distorção de `account.balance` (que acumula até lançamentos fora do ciclo).
  //   1. saldoAtual            : abertura + transações efetivadas com date <= fim do ciclo.
  //   2. saldoFinalCiclo       : + agendamentos pendentes (ocorrências não registradas) até o fim do ciclo.
  //   3. saldoProjetado        : − restante dos envelopes ativos do ciclo (limite − gasto) vinculados à conta.
  //   4. saldoAtualCalendario  : abertura + transações até o último dia do mês calendário (só modo 'custom').
  //   5. saldoFinalCalendario  : + agendamentos pendentes até o último dia do mês calendário (só modo 'custom').
  const getAccountSaldos = useCallback((account, referenceDate = new Date()) => {
    if (!account || ['credit', 'asset', 'liability'].includes(account.type)) return { applicable: false }

    const toStr = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    const period = getFinancialPeriod(referenceDate)
    const cycleStartStr = toStr(period.start)
    const cycleEndStr = toStr(period.end)
    const calEnd = new Date(period.end.getFullYear(), period.end.getMonth() + 1, 0) // último dia do mês do fim do ciclo
    const calendarEndStr = toStr(calEnd)
    const mode = data.settings.financialMonthMode || 'custom'
    const startDay = data.settings.financialMonthStartDay || 1
    const base = rb(account.initialBalance ?? 0)

    // Transações efetivadas com date <= dateStr (mesma convenção de sinais de recalcularSaldo).
    const txDeltaUpTo = (dateStr) => {
      let acc = 0
      for (const tx of data.transactions) {
        if (!tx.date || tx.date > dateStr) continue
        if (tx.type === 'income' && tx.accountId === account.id) acc += tx.amount
        else if (tx.type === 'expense' && tx.accountId === account.id && tx.accountType !== 'credit') acc -= tx.amount
        else if (tx.type === 'transfer') {
          if (tx.accountId === account.id) acc -= tx.amount
          else if (tx.toAccountId === account.id) acc += tx.amount
        } else if (tx.type === 'credit_payment' && tx.fromAccountId === account.id) acc -= tx.amount
      }
      return acc
    }

    // Agendamentos pendentes (ocorrências não registradas/puladas) DENTRO do ciclo, no
    // intervalo [início do ciclo, dateStr] — inclui os pendentes EM ATRASO (data <= hoje),
    // alinhando com o relatório Fluxo de Caixa por Conta (que projeta todas as ocorrências do
    // período). Antes usava (hoje, dateStr], omitindo os vencidos não registrados do ciclo.
    const schedDeltaUpTo = (dateStr) => {
      let acc = 0
      for (const s of data.schedules) {
        const fromAcc = s.accountId === account.id
        const toAcc = s.toAccountId === account.id
        if (!fromAcc && !toAcc) continue
        const occs = getNextOccurrences(s, 120).filter(dt => dt >= cycleStartStr && dt <= dateStr)
        for (const dt of occs) {
          // Valor EFETIVO da ocorrência: respeita overrides[dataOriginal].amount (mesmo
          // critério do relatório). Sem override → schedule.amount.
          const amount = occEfetiva(s, dt).amount
          if (s.transactionType === 'income' && fromAcc) acc += amount
          else if (s.transactionType === 'expense' && fromAcc) acc -= amount
          else if (s.transactionType === 'transfer') {
            if (fromAcc && !toAcc) acc -= amount
            else if (!fromAcc && toAcc) acc += amount
          }
        }
      }
      return acc
    }

    // Restante dos envelopes do ciclo vinculados à conta: max(0, limite − gasto na competência atual).
    const competenciaKeyOf = (ds) => {
      const [y, m, dd] = ds.split('-').map(Number)
      let year = y, month0 = m - 1
      if (dd < startDay) { const p = new Date(y, m - 2, 1); year = p.getFullYear(); month0 = p.getMonth() }
      return year * 12 + month0
    }
    const currentComp = referenceDate.getDate() >= startDay
      ? referenceDate.getFullYear() * 12 + referenceDate.getMonth()
      : (() => { const p = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1); return p.getFullYear() * 12 + p.getMonth() })()
    let envelopesRestante = 0
    for (const env of (data.envelopes || [])) {
      if (env.accountId !== account.id) continue
      let spent = 0
      for (const tx of data.transactions) {
        if (tx.type !== 'expense' || tx.reservaAuto || tx.origin === 'reservaAuto' || tx.origin === 'patrimonioAuto' || tx.origin === 'investAuto') continue
        if (!env.categoryIds?.includes(tx.categoryId)) continue
        if (!tx.date || competenciaKeyOf(tx.date) !== currentComp) continue
        spent += tx.amount
      }
      envelopesRestante = rb(envelopesRestante + Math.max(0, rb((env.limitAmount || 0) - spent)))
    }

    const saldoAtual = rb(base + txDeltaUpTo(cycleEndStr))
    const saldoFinalCiclo = rb(saldoAtual + schedDeltaUpTo(cycleEndStr))
    const saldoProjetado = rb(saldoFinalCiclo - envelopesRestante)
    const isCustom = mode === 'custom'
    const saldoAtualCalendario = isCustom ? rb(base + txDeltaUpTo(calendarEndStr)) : null
    const saldoFinalCalendario = isCustom ? rb(saldoAtualCalendario + schedDeltaUpTo(calendarEndStr)) : null

    return {
      applicable: true, mode,
      saldoAtual, saldoFinalCiclo, saldoProjetado,
      saldoAtualCalendario, saldoFinalCalendario,
      cycleEnd: cycleEndStr, calendarEnd: calendarEndStr,
    }
  }, [data.transactions, data.schedules, data.envelopes, data.settings, getNextOccurrences, getFinancialPeriod])

  // FINAL CICLO / PROJETADO do Saldo Principal usando EXATAMENTE a engine do relatório
  // Fluxo de Caixa por Conta (computeFluxoCaixa) — ancorada no saldo REAL das contas. Pool:
  // perfil ativo → contas do perfil; senão → contas FC (fluxoCaixaPrincipal), sempre não-cartão.
  // saldoProjetado = saldoFinal (com envelopes); saldoFinalCiclo = saldoFinal sem envelopes.
  const getFluxoCaixaPrincipal = useCallback((referenceDate = new Date()) => {
    const toStr = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    const period = getFinancialPeriod(referenceDate)
    const start = toStr(period.start)
    const end = toStr(period.end)
    const pool = activeProfileId
      ? data.accounts.filter(a => a.profileId === activeProfileId && a.type !== 'credit')
      : data.accounts.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit')
    const accountIds = new Set(pool.map(a => a.id))
    const currentBalance = pool.reduce((s, a) => s + (a.balance || 0), 0)
    const r = computeFluxoCaixa({
      accountIds, currentBalance, start, end,
      transactions: data.transactions, schedules: data.schedules,
      envelopes: data.envelopes, reserveFunctions: data.reserveFunctions,
      getNextOccurrences, includeSchedules: true,
    })
    return {
      saldoAnterior: r.saldoAnterior,
      saldoProjetado: r.saldoFinal,            // com envelopes restantes subtraídos
      saldoFinalCiclo: r.saldoFinalSemEnvelopes, // sem subtrair envelopes
      envelopesTotal: r.envelopesTotal,
    }
  }, [data.accounts, data.transactions, data.schedules, data.envelopes, data.reserveFunctions, activeProfileId, getNextOccurrences, getFinancialPeriod])

  // Breakdown detalhado ("Como chegamos aqui") do Saldo Principal agregado sobre o pool de
  // contas (perfil ativo → contas do perfil; senão → fluxoCaixaPrincipal). Devolve, por seção,
  // os componentes e itens (agendamentos, envelopes, lançamentos fora do ciclo) que somam cada saldo.
  const getSaldoPrincipalBreakdown = useCallback((referenceDate = new Date()) => {
    const toStr = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    const period = getFinancialPeriod(referenceDate)
    const cycleStartStr = toStr(period.start)
    const cycleEndStr = toStr(period.end)
    const calEnd = new Date(period.end.getFullYear(), period.end.getMonth() + 1, 0)
    const calendarEndStr = toStr(calEnd)
    const mode = data.settings.financialMonthMode || 'custom'
    const isCustom = mode === 'custom'
    const startDay = data.settings.financialMonthStartDay || 1

    const pool = activeProfileId
      ? data.accounts.filter(a => a.profileId === activeProfileId && a.type !== 'credit')
      : data.accounts.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit')
    const poolIds = new Set(pool.map(a => a.id))

    // Contas Ger. (subcontas do grupo G) — para separar transferências gerenciais.
    const grupoG = data.gerencialGroups?.find(g => g.number === 1)
    const gerIds = new Set(
      data.accounts.filter(a => (grupoG && a.grupoGerencial === grupoG.id) || /^Ger\. /.test(a.name || '')).map(a => a.id)
    )

    const signedTx = (tx) => {
      if (tx.type === 'income' && poolIds.has(tx.accountId)) return tx.amount
      if (tx.type === 'expense' && poolIds.has(tx.accountId) && tx.accountType !== 'credit') return -tx.amount
      if (tx.type === 'transfer') {
        return (poolIds.has(tx.toAccountId) ? tx.amount : 0) - (poolIds.has(tx.accountId) ? tx.amount : 0)
      }
      if (tx.type === 'credit_payment' && poolIds.has(tx.fromAccountId)) return -tx.amount
      return 0
    }
    const isGerencialTransfer = (tx) =>
      tx.type === 'transfer' && (tx.grupoGerencial || gerIds.has(tx.accountId) || gerIds.has(tx.toAccountId))

    // Saldo Atual = abertura + transações efetivadas até o fim do ciclo.
    const baseAbertura = pool.reduce((s, a) => s + rb(a.initialBalance ?? 0), 0)
    let txAteCiclo = 0, gerencialAteCiclo = 0, txAlemCiclo = 0
    const itensAlemCiclo = []
    for (const tx of data.transactions) {
      if (!tx.date) continue
      const v = signedTx(tx)
      if (v === 0) continue
      if (tx.date <= cycleEndStr) {
        txAteCiclo += v
        if (isGerencialTransfer(tx)) gerencialAteCiclo += v
      } else if (isCustom && tx.date <= calendarEndStr) {
        txAlemCiclo += v
        itensAlemCiclo.push({ description: tx.description || '(sem descrição)', amount: rb(v) })
      }
    }
    const saldoAtual = rb(baseAbertura + txAteCiclo)
    const saldoBase = rb(saldoAtual - gerencialAteCiclo) // base = atual − transferências gerenciais

    // Decomposição informativa do Saldo base por conta do pool (badge FC). Reparte o
    // saldoBase entre as contas usando as MESMAS regras (abertura + lançamentos
    // efetivados não-gerenciais até o fim do ciclo). Loop separado e aditivo, para não
    // alterar a lógica de cálculo agregada acima — a soma das contas reproduz o saldoBase.
    const contaBaseMap = new Map(pool.map(a => [a.id, rb(a.initialBalance ?? 0)]))
    const addContaLeg = (tx) => {
      if (tx.type === 'income' && poolIds.has(tx.accountId)) contaBaseMap.set(tx.accountId, contaBaseMap.get(tx.accountId) + tx.amount)
      else if (tx.type === 'expense' && poolIds.has(tx.accountId) && tx.accountType !== 'credit') contaBaseMap.set(tx.accountId, contaBaseMap.get(tx.accountId) - tx.amount)
      else if (tx.type === 'transfer') {
        if (poolIds.has(tx.toAccountId)) contaBaseMap.set(tx.toAccountId, contaBaseMap.get(tx.toAccountId) + tx.amount)
        if (poolIds.has(tx.accountId)) contaBaseMap.set(tx.accountId, contaBaseMap.get(tx.accountId) - tx.amount)
      }
      else if (tx.type === 'credit_payment' && poolIds.has(tx.fromAccountId)) contaBaseMap.set(tx.fromAccountId, contaBaseMap.get(tx.fromAccountId) - tx.amount)
    }
    for (const tx of data.transactions) {
      if (!tx.date || tx.date > cycleEndStr) continue
      if (isGerencialTransfer(tx)) continue
      addContaLeg(tx)
    }
    const contasBase = pool.map(a => ({ id: a.id, name: a.apelido || a.name, saldo: rb(contaBaseMap.get(a.id) ?? 0) }))

    // Agendamentos pendentes (ocorrências não registradas) no intervalo [início do ciclo,
    // dateStr] — inclui os vencidos não registrados do ciclo (alinha com getAccountSaldos e
    // com o relatório Fluxo de Caixa por Conta).
    const collectSched = (endStr) => {
      const items = []
      let total = 0
      for (const s of data.schedules) {
        const fromAcc = poolIds.has(s.accountId)
        const toAcc = poolIds.has(s.toAccountId)
        if (!fromAcc && !toAcc) continue
        const occs = getNextOccurrences(s, 120).filter(dt => dt >= cycleStartStr && dt <= endStr)
        if (occs.length === 0) continue
        // Soma o valor EFETIVO de cada ocorrência (respeita overrides[dataOriginal].amount) —
        // antes multiplicava um valor único por contagem, ignorando overrides por ocorrência.
        let amount = 0
        for (const dt of occs) {
          const val = occEfetiva(s, dt).amount
          if (s.transactionType === 'income' && fromAcc) amount += val
          else if (s.transactionType === 'expense' && fromAcc) amount -= val
          else if (s.transactionType === 'transfer') amount += (toAcc ? val : 0) - (fromAcc ? val : 0)
        }
        amount = rb(amount)
        if (amount === 0) continue
        items.push({ description: s.description || '(agendamento)', amount, count: occs.length })
        total += amount
      }
      return { items, total: rb(total) }
    }
    const schedCiclo = collectSched(cycleEndStr)
    const saldoFinalCiclo = rb(saldoAtual + schedCiclo.total)

    // Envelopes do ciclo vinculados a contas do pool: restante (limite − gasto na competência).
    const competenciaKeyOf = (ds) => {
      const [y, m, dd] = ds.split('-').map(Number)
      let year = y, month0 = m - 1
      if (dd < startDay) { const p = new Date(y, m - 2, 1); year = p.getFullYear(); month0 = p.getMonth() }
      return year * 12 + month0
    }
    const currentComp = referenceDate.getDate() >= startDay
      ? referenceDate.getFullYear() * 12 + referenceDate.getMonth()
      : (() => { const p = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1); return p.getFullYear() * 12 + p.getMonth() })()
    const envItems = []
    let envTotal = 0
    for (const env of (data.envelopes || [])) {
      if (!poolIds.has(env.accountId)) continue
      let spent = 0
      for (const tx of data.transactions) {
        if (tx.type !== 'expense' || tx.reservaAuto || tx.origin === 'reservaAuto' || tx.origin === 'patrimonioAuto' || tx.origin === 'investAuto') continue
        if (!env.categoryIds?.includes(tx.categoryId)) continue
        if (!tx.date || competenciaKeyOf(tx.date) !== currentComp) continue
        spent += tx.amount
      }
      const restante = Math.max(0, rb((env.limitAmount || 0) - spent))
      if (restante <= 0) continue
      envItems.push({ name: env.name || '(envelope)', restante: rb(restante) })
      envTotal += restante
    }
    envTotal = rb(envTotal)
    const saldoProjetado = rb(saldoFinalCiclo - envTotal)

    // Calendário (só modo custom).
    const saldoAtualCalendario = isCustom ? rb(saldoAtual + txAlemCiclo) : null
    const schedCal = isCustom ? collectSched(calendarEndStr) : { items: [], total: 0 }
    const saldoFinalCalendario = isCustom ? rb(saldoAtualCalendario + schedCal.total) : null

    return {
      mode, cycleStart: cycleStartStr, cycleEnd: cycleEndStr, calendarEnd: calendarEndStr,
      saldoAtual: { base: saldoBase, contas: contasBase, gerencialTransfers: rb(gerencialAteCiclo), total: saldoAtual },
      finalCiclo: { saldoAtual, agendamentos: schedCiclo.items, agendamentosTotal: schedCiclo.total, total: saldoFinalCiclo },
      projetado: { finalCiclo: saldoFinalCiclo, envelopes: envItems, envelopesTotal: envTotal, total: saldoProjetado },
      atualCalendario: isCustom ? { saldoAtual, lancamentos: itensAlemCiclo, lancamentosTotal: rb(txAlemCiclo), total: saldoAtualCalendario } : null,
      finalCalendario: isCustom ? { atualCalendario: saldoAtualCalendario, agendamentos: schedCal.items, agendamentosTotal: schedCal.total, total: saldoFinalCalendario } : null,
    }
  }, [data.accounts, data.transactions, data.schedules, data.envelopes, data.settings, data.gerencialGroups, activeProfileId, getNextOccurrences, getFinancialPeriod])

  // ── Classification ───────────────────────────────────────────────────────────
  const classifyByRules = useCallback((description, { dayOfMonth = null, amountApprox = null } = {}) => {
    const lower = description.toLowerCase()
    let best = null, bestScore = -1
    for (const rule of data.classificationRules) {
      if (!lower.includes(rule.contains.toLowerCase())) continue
      if (rule.dayOfMonth != null && (dayOfMonth == null || rule.dayOfMonth !== dayOfMonth)) continue
      if (rule.amountApprox != null && (amountApprox == null || Math.abs(rule.amountApprox - amountApprox) > 0.50)) continue
      const score = 1 + (rule.dayOfMonth != null ? 1 : 0) + (rule.amountApprox != null ? 1 : 0)
      if (score > bestScore) { bestScore = score; best = rule }
    }
    return best ? { categoryId: best.categoryId, payee: best.payee || '', grupoGerencial: best.grupoGerencial || null, reservaFuncaoId: best.reservaFuncaoId || null } : null
  }, [data.classificationRules])

  const learnClassification = useCallback((description, categoryId, payee, { dayOfMonth = null, amountApprox = null, grupoGerencial = null, reservaFuncaoId = null } = {}) => {
    const words = description.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    if (words.length === 0) return
    const keyword = words[0]
    update(d => {
      const exact = d.classificationRules.find(r => {
        if (r.contains.toLowerCase() !== keyword) return false
        if ((r.dayOfMonth ?? null) !== dayOfMonth) return false
        const bothNull = r.amountApprox == null && amountApprox == null
        const bothClose = r.amountApprox != null && amountApprox != null && Math.abs(r.amountApprox - amountApprox) <= 0.50
        return bothNull || bothClose
      })
      if (exact) {
        return { ...d, classificationRules: d.classificationRules.map(r => r.id === exact.id ? { ...r, categoryId, payee: payee || r.payee, grupoGerencial: grupoGerencial || r.grupoGerencial, reservaFuncaoId: reservaFuncaoId || r.reservaFuncaoId } : r) }
      }
      return { ...d, classificationRules: [...d.classificationRules, { id: 'rule_' + Date.now(), contains: keyword, categoryId, payee: payee || '', dayOfMonth, amountApprox, grupoGerencial, reservaFuncaoId }] }
    })
  }, [update])

  // ── Funções de Reserva ───────────────────────────────────────────────────────
  const addReserveFunction = useCallback((fn) => {
    const id = 'res_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    update(d => {
      const maxOrdem = (d.reserveFunctions || []).reduce((m, f) => Math.max(m, f.ordem ?? 0), -1)
      const novo = {
        id, name: fn.name || '', accountId: fn.accountId || null,
        saldoInicial: Number(fn.saldoInicial) || 0, entradas: 0, saidas: 0,
        despesaAnual: Number(fn.despesaAnual) || 0, depositoMensal: Number(fn.depositoMensal) || 0,
        mesVencimento: fn.mesVencimento ?? null, ordem: maxOrdem + 1,
        categoryId: fn.categoryId || null,
      }
      return { ...d, reserveFunctions: [...(d.reserveFunctions || []), novo] }
    })
    return id
  }, [update])

  const updateReserveFunction = useCallback((id, changes) => {
    update(d => ({ ...d, reserveFunctions: (d.reserveFunctions || []).map(f => f.id === id ? { ...f, ...changes } : f) }))
  }, [update])

  const deleteReserveFunction = useCallback((id) => {
    update(d => ({ ...d, reserveFunctions: (d.reserveFunctions || []).filter(f => f.id !== id) }))
  }, [update])

  const reorderReserveFunctions = useCallback((orderedIds) => {
    update(d => ({
      ...d,
      reserveFunctions: (d.reserveFunctions || []).map(f => {
        const idx = orderedIds.indexOf(f.id)
        return idx !== -1 ? { ...f, ordem: idx } : f
      }),
    }))
  }, [update])

  // ── Reservas: períodos de saldo inicial (CRUD direto no banco) ────────────────
  // Grava no banco e atualiza o state local após sucesso. period em snake_case:
  // { id, function_id, data_inicio, saldo_inicial }.
  const addReservePeriod = useCallback(async (period) => {
    await createReservePeriod(period)
    setReservePeriods(prev => {
      const norm = { ...period, saldo_inicial: Number(period.saldo_inicial) || 0 }
      const rest = prev.filter(p => p.id !== period.id) // upsert por id
      return [...rest, norm]
    })
    return period.id
  }, [])

  const deleteReservePeriod = useCallback(async (id) => {
    await deleteReservePeriodApi(id)
    setReservePeriods(prev => prev.filter(p => p.id !== id))
  }, [])

  // ── Reservas: ajustes (CRUD direto no banco) ─────────────────────────────────
  // adj em snake_case: { id, function_id, data, valor, observacao }.
  const addReserveAdjustment = useCallback(async (adj) => {
    await createReserveAdjustment(adj)
    setReserveAdjustments(prev => {
      const norm = { ...adj, valor: Number(adj.valor) || 0, observacao: adj.observacao ?? '' }
      const rest = prev.filter(a => a.id !== adj.id)
      return [...rest, norm]
    })
    return adj.id
  }, [])

  const updateReserveAdjustment = useCallback(async (adj) => {
    await updateReserveAdjustmentApi(adj)
    setReserveAdjustments(prev => prev.map(a =>
      a.id === adj.id ? { ...a, valor: Number(adj.valor) || 0, observacao: adj.observacao ?? '' } : a
    ))
  }, [])

  const deleteReserveAdjustment = useCallback(async (id) => {
    await deleteReserveAdjustmentApi(id)
    setReserveAdjustments(prev => prev.filter(a => a.id !== id))
  }, [])

  // ── Gerencial Groups ─────────────────────────────────────────────────────────
  const addGerencialGroup = useCallback((group) => {
    update(d => {
      const nums = d.gerencialGroups.filter(g => typeof g.number === 'number').map(g => g.number)
      const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 2
      const id = 'grp_' + Date.now()
      return { ...d, gerencialGroups: [...d.gerencialGroups, { ...group, id, number: nextNum, fixed: false }] }
    })
  }, [update])

  const updateGerencialGroup = useCallback((id, changes) => {
    update(d => ({ ...d, gerencialGroups: d.gerencialGroups.map(g => g.id === id ? { ...g, ...changes } : g) }))
  }, [update])

  const deleteGerencialGroup = useCallback((id) => {
    update(d => ({ ...d, gerencialGroups: d.gerencialGroups.filter(g => g.id !== id) }))
  }, [update])

  // ── Envelopes ─────────────────────────────────────────────────────────────────
  const addEnvelope = useCallback((envelope) => {
    const id = 'env_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    update(d => ({ ...d, envelopes: [...(d.envelopes || []), { ...envelope, id, history: [] }] }))
  }, [update])

  const updateEnvelope = useCallback((id, changes) => {
    update(d => ({ ...d, envelopes: (d.envelopes || []).map(e => e.id === id ? { ...e, ...changes } : e) }))
  }, [update])

  const deleteEnvelope = useCallback((id) => {
    update(d => ({ ...d, envelopes: (d.envelopes || []).filter(e => e.id !== id) }))
  }, [update])

  // ── Account Groups ────────────────────────────────────────────────────────────
  const addAccountGroup = useCallback((group) => {
    update(d => {
      const maxOrder = Math.max(-1, ...(d.accountGroups || []).map(g => g.order))
      const id = 'grp_acc_' + Date.now()
      return { ...d, accountGroups: [...(d.accountGroups || []), { ...group, id, order: maxOrder + 1 }] }
    })
  }, [update])

  const updateAccountGroup = useCallback((id, changes) => {
    update(d => ({ ...d, accountGroups: (d.accountGroups || []).map(g => g.id === id ? { ...g, ...changes } : g) }))
  }, [update])

  const deleteAccountGroup = useCallback((id) => {
    update(d => ({
      ...d,
      accountGroups: (d.accountGroups || []).filter(g => g.id !== id),
      accounts: d.accounts.map(a => a.accountGroupId === id ? { ...a, accountGroupId: null } : a),
    }))
  }, [update])

  const moveAccountGroup = useCallback((id, direction) => {
    update(d => {
      const sorted = [...(d.accountGroups || [])].sort((a, b) => a.order - b.order)
      const idx = sorted.findIndex(g => g.id === id)
      if (idx === -1) return d
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= sorted.length) return d
      const reordered = [...sorted]
      const [moved] = reordered.splice(idx, 1)
      reordered.splice(newIdx, 0, moved)
      return { ...d, accountGroups: reordered.map((g, i) => ({ ...g, order: i })) }
    })
  }, [update])

  const reorderAccountGroups = useCallback((orderedIds) => {
    update(d => ({
      ...d,
      accountGroups: (d.accountGroups || []).map(g => {
        const idx = orderedIds.indexOf(g.id)
        return idx !== -1 ? { ...g, order: idx } : { ...g, order: orderedIds.length + (g.order ?? 0) }
      }),
    }))
  }, [update])

  const moveAccount = useCallback((id, direction) => {
    update(d => {
      const account = d.accounts.find(a => a.id === id)
      if (!account) return d
      const peers = [...d.accounts.filter(a => a.accountGroupId === account.accountGroupId)]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      const idx = peers.findIndex(a => a.id === id)
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= peers.length) return d
      const reordered = [...peers]
      const [moved] = reordered.splice(idx, 1)
      reordered.splice(newIdx, 0, moved)
      const updMap = new Map(reordered.map((a, i) => [a.id, { ...a, order: i }]))
      return { ...d, accounts: d.accounts.map(a => updMap.has(a.id) ? updMap.get(a.id) : a) }
    })
  }, [update])

  // ── Recalcular Saldo ──────────────────────────────────────────────────────────
  const recalcularSaldo = useCallback((accountId, overrideInitialBalance) => {
    update(d => {
      const account = d.accounts.find(a => a.id === accountId)
      if (!account) return d
      const today = format(new Date(), 'yyyy-MM-dd')
      const initBal = overrideInitialBalance != null ? rb(overrideInitialBalance) : rb(account.initialBalance ?? 0)
      let balance = initBal    // lançamentos ≤ hoje
      let projected = initBal  // todos os lançamentos
      d.transactions.forEach(tx => {
        if (tx.type === 'income' && tx.accountId === accountId) {
          projected = rb(projected + tx.amount)
          if (tx.date <= today) balance = rb(balance + tx.amount)
        } else if (tx.type === 'expense' && tx.accountId === accountId && tx.accountType !== 'credit') {
          projected = rb(projected - tx.amount)
          if (tx.date <= today) balance = rb(balance - tx.amount)
        } else if (tx.type === 'transfer') {
          if (tx.accountId === accountId) {
            projected = rb(projected - tx.amount)
            if (tx.date <= today) balance = rb(balance - tx.amount)
          } else if (tx.toAccountId === accountId) {
            projected = rb(projected + tx.amount)
            if (tx.date <= today) balance = rb(balance + tx.amount)
          }
        } else if (tx.type === 'credit_payment' && tx.fromAccountId === accountId) {
          projected = rb(projected - tx.amount)
          if (tx.date <= today) balance = rb(balance - tx.amount)
        }
      })
      return {
        ...d,
        accounts: d.accounts.map(a => a.id === accountId
          ? { ...a, balance: rb(balance), projectedBalance: rb(projected), initialBalance: initBal }
          : a
        ),
      }
    })
  }, [update])

  // ── Balance Snapshots (para desfazer ajustes) ────────────────────────────────
  const saveBalanceSnapshot = useCallback((accountIds, reason) => {
    update(d => {
      const affected = accountIds
        ? d.accounts.filter(a => accountIds.includes(a.id))
        : d.accounts
      const snapshot = {
        date: format(new Date(), 'yyyy-MM-dd'),
        reason: reason || '',
        accounts: affected.map(a => ({ id: a.id, initialBalance: a.initialBalance ?? 0 })),
      }
      return { ...d, settings: { ...d.settings, lastBalanceSnapshot: snapshot } }
    })
  }, [update])

  const restoreBalanceSnapshot = useCallback(() => {
    update(d => {
      const snapshot = d.settings?.lastBalanceSnapshot
      if (!snapshot?.accounts?.length) return d
      const today = format(new Date(), 'yyyy-MM-dd')
      let accounts = d.accounts
      for (const { id, initialBalance } of snapshot.accounts) {
        const initBal = rb(initialBalance)
        let balance = initBal
        let projected = initBal
        d.transactions.forEach(tx => {
          if (tx.type === 'income' && tx.accountId === id) {
            projected = rb(projected + tx.amount)
            if (tx.date <= today) balance = rb(balance + tx.amount)
          } else if (tx.type === 'expense' && tx.accountId === id && tx.accountType !== 'credit') {
            projected = rb(projected - tx.amount)
            if (tx.date <= today) balance = rb(balance - tx.amount)
          } else if (tx.type === 'transfer') {
            if (tx.accountId === id) {
              projected = rb(projected - tx.amount)
              if (tx.date <= today) balance = rb(balance - tx.amount)
            } else if (tx.toAccountId === id) {
              projected = rb(projected + tx.amount)
              if (tx.date <= today) balance = rb(balance + tx.amount)
            }
          } else if (tx.type === 'credit_payment' && tx.fromAccountId === id) {
            projected = rb(projected - tx.amount)
            if (tx.date <= today) balance = rb(balance - tx.amount)
          }
        })
        accounts = accounts.map(a => a.id === id
          ? { ...a, initialBalance: initBal, balance: rb(balance), projectedBalance: rb(projected) }
          : a
        )
      }
      return {
        ...d,
        accounts,
        settings: { ...d.settings, lastBalanceSnapshot: null },
      }
    })
  }, [update])

  // ── Asset Value History ───────────────────────────────────────────────────────
  const updateAccountValue = useCallback((accountId, newValue, note) => {
    update(d => ({
      ...d,
      accounts: d.accounts.map(a => {
        if (a.id !== accountId) return a
        const entry = {
          id: 'vh_' + Date.now(),
          date: format(new Date(), 'yyyy-MM-dd'),
          value: Number(newValue),
          note: note || '',
        }
        return {
          ...a,
          balance: Number(newValue),
          valueHistory: [...(a.valueHistory || []), entry],
        }
      }),
    }))
  }, [update])

  // ── Debt Plan ─────────────────────────────────────────────────────────────────
  const setDebtPlan = useCallback((accountId, plan) => {
    update(d => ({
      ...d,
      accounts: d.accounts.map(a => a.id === accountId ? { ...a, debtPlan: plan } : a),
    }))
  }, [update])

  const payDebtInstallment = useCallback(({
    debtAccountId, sourceAccountId, payableId,
    paidAmount, principalAmount, interestAmount,
    interestCategoryId, date, description,
  }) => {
    update(d => {
      const sourceAcc = d.accounts.find(a => a.id === sourceAccountId)
      const now = new Date().toISOString()
      const newTxs = []

      // Update account balances
      const accounts = d.accounts.map(a => {
        if (a.id === sourceAccountId) {
          return { ...a, balance: rb((a.balance || 0) - paidAmount) }
        }
        if (a.id === debtAccountId) {
          const newPlan = a.debtPlan ? {
            ...a.debtPlan,
            paidInstallments: (a.debtPlan.paidInstallments || 0) + 1,
          } : a.debtPlan
          return { ...a, balance: Math.max(0, (a.balance || 0) - principalAmount), debtPlan: newPlan }
        }
        return a
      })

      // Expense transaction for principal
      newTxs.push({
        id: 'tx_dprinc_' + Date.now() + '_' + Math.random().toString(36).slice(2),
        type: 'expense',
        accountId: sourceAccountId,
        accountType: sourceAcc?.type,
        amount: principalAmount,
        date,
        description: description || 'Pagamento de parcela',
        createdAt: now,
      })

      // Expense transaction for interest
      if (interestAmount > 0 && interestCategoryId) {
        newTxs.push({
          id: 'tx_dint_' + (Date.now() + 1) + '_' + Math.random().toString(36).slice(2),
          type: 'expense',
          accountId: sourceAccountId,
          accountType: sourceAcc?.type,
          amount: interestAmount,
          categoryId: interestCategoryId,
          date,
          description: `Juros — ${description || ''}`,
          createdAt: now,
        })
      }

      // Mark installment payable as paid
      const payables = payableId
        ? d.payables.map(p => p.id === payableId ? { ...p, status: 'paid', paidAt: now } : p)
        : d.payables

      return { ...d, accounts, payables, transactions: [...d.transactions, ...newTxs] }
    })
  }, [update])

  // ── Payables ─────────────────────────────────────────────────────────────────
  const addPayable = useCallback((payable) => {
    const id = 'pay_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    update(d => ({ ...d, payables: [...(d.payables || []), { ...payable, id }] }))
  }, [update])

  const updatePayable = useCallback((id, changes) => {
    update(d => ({ ...d, payables: (d.payables || []).map(p => p.id === id ? { ...p, ...changes } : p) }))
  }, [update])

  const deletePayable = useCallback((id) => {
    update(d => ({ ...d, payables: (d.payables || []).filter(p => p.id !== id) }))
  }, [update])

  const gerarContasPagarFatura = useCallback((cartaoId, billStart, billEnd, mesAno, importId = null) => {
    update(d => {
      const card = d.accounts.find(a => a.id === cartaoId)
      if (!card) return d

      const grpDId = d.gerencialGroups.find(g => g.number === 'D')?.id || 'grp_D'
      const existingByKey = new Map(
        (d.payables || []).map(p => [`${p.cartaoId}|${p.mesAno}|${p.grupoGerencialId}`, p])
      )

      const gerencialTxs = d.transactions.filter(tx =>
        tx.accountId === cartaoId &&
        tx.type === 'expense' &&
        tx.grupoGerencial &&
        tx.grupoGerencial !== grpDId &&
        tx.date >= billStart &&
        tx.date <= billEnd
      )

      if (gerencialTxs.length === 0) return d

      const startDay = d.settings.financialMonthStartDay || 1
      const billEndDate = new Date(billEnd + 'T00:00:00')
      const dueDate = new Date(billEndDate.getFullYear(), billEndDate.getMonth() + 1, startDay)
      const dueDateStr = dueDate.toISOString().split('T')[0]

      const groups = {}
      for (const tx of gerencialTxs) {
        groups[tx.grupoGerencial] = (groups[tx.grupoGerencial] || 0) + tx.amount
      }

      // UPSERT: cria as faltantes e ATUALIZA o valor das pendentes existentes (recálculo).
      // Pagas ficam intactas. Mantém/define importId p/ preservar o vínculo de estorno.
      const updatesById = new Map()
      const newPayables = []
      for (const [grupoId, amountRaw] of Object.entries(groups)) {
        const amount = Math.round(amountRaw * 100) / 100
        const key = `${cartaoId}|${mesAno}|${grupoId}`
        const existing = existingByKey.get(key)
        if (existing) {
          if (existing.status !== 'paid') {
            updatesById.set(existing.id, { amount, importId: importId || existing.importId })
          }
        } else {
          const grupo = d.gerencialGroups.find(g => g.id === grupoId)
          const cardName = card.apelido || card.name
          const grupoAlias = grupo?.alias || grupoId
          newPayables.push({
            id: 'pay_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            cartaoId,
            mesAno,
            grupoGerencialId: grupoId,
            origin: grupo?.number === 1 ? 'gerencial' : 'invoice',
            description: `Fatura ${cardName} ${grupoAlias} · ${mesAno}`,
            amount,
            dueDate: dueDateStr,
            status: 'pending',
            paidAt: null,
            billStart,
            billEnd,
            importId,   // vínculo direto com o lote de importação (estorno apaga por aqui)
          })
        }
      }

      if (updatesById.size === 0 && newPayables.length === 0) return d
      let payables = (d.payables || []).map(p => updatesById.has(p.id) ? { ...p, ...updatesById.get(p.id) } : p)
      if (newPayables.length) payables = [...payables, ...newPayables]
      return { ...d, payables }
    })
  }, [update])

  // Recalcula as contas a pagar de uma fatura (cartão + mês YYYY-MM): deriva a janela
  // de datas pelo dia de fechamento e delega para gerarContasPagarFatura (upsert).
  const recalcContasPagarFatura = useCallback((cartaoId, mesAno) => {
    const card = dataRef.current.accounts.find(a => a.id === cartaoId)
    if (!card || !mesAno) return
    const F = card.closingDay || 14
    const [y, m] = mesAno.split('-').map(Number)
    const prev = new Date(y, m - 2, 1) // mês anterior (M-1)
    // billStart = F+1 do mês anterior (comparação string tolera overflow de dia);
    // billEnd = F do mês corrente, mas limitado ao último dia válido (ex.: fechamento
    // 31 em fevereiro) pois gerarContasPagarFatura faz new Date(billEnd).
    const lastDay = new Date(y, m, 0).getDate()
    const billStart = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(F + 1).padStart(2, '0')}`
    const billEnd = `${mesAno}-${String(Math.min(F, lastDay)).padStart(2, '0')}`
    gerarContasPagarFatura(cartaoId, billStart, billEnd, mesAno)
  }, [gerarContasPagarFatura])

  // ── Recálculo acumulativo dos agendamentos de uma fatura de cartão ───────────
  // Fonte ÚNICA dos agendamentos gerados por gastos de cartão. Idempotente:
  // recalcula do zero a partir das transações da fatura (cardId, faturaAno-faturaMs).
  // Mantém UP TO 3 tipos por (card_id, fatura_mes_ano):
  //   'gerencial_devolucao' : soma do Grupo G (number===1) → Ger.{cartão} → Principal, no dia
  //                           de início do mês financeiro do mês da fatura.
  //   'resgate_reserva'     : soma dos grupos numerados (2,3,…), UM por conta-origem
  //                           (grupo.defaultAccountId) → conta-origem → Principal, no vencimento.
  //   'pagamento_fatura'    : soma TOTAL da fatura (G + numerados + D/comuns)
  //                           → Principal → Cartão, no vencimento.
  // INSERT se valor>0 e não existe; UPDATE se já existe; DELETE se valor zerou.
  // Nunca altera/remove um agendamento já registrado (executado) ou pulado.
  // reservaFuncaoByAccount (opcional): { contaOrigemId → reservaFuncaoId } informado na
  // importação para vincular o agendamento de resgate_reserva (um por conta-origem) a uma
  // função de reserva. Sem o parâmetro, preserva o vínculo já existente do slot (se houver).
  // Núcleo PURO do recálculo de agendamentos de fatura: recebe e devolve o estado `d`.
  // Extraído para ser composto pelo reconciliador gerencial (várias faturas + saldos num
  // único update). recalcularAgendamentosFatura (abaixo) é o wrapper que aplica via update().
  const reconcileFaturaState = useCallback((d, cardId, faturaAno, faturaMs, reservaFuncaoByAccount) => {
      const card = d.accounts.find(a => a.id === cardId)
      if (!card) return d

      const mm = String(faturaMs).padStart(2, '0')
      const yyyy = String(faturaAno)
      const faturaMesAno = `${yyyy}-${mm}` // YYYY-MM (igual a lancamentos.faturaMonthYear)
      const faturaRef = `${mm}/${yyyy}`    // MM/YYYY (helpers de fatura.js)

      const financialStartDay = d.settings?.financialMonthStartDay || 1
      const dueDay = String(card.dueDay || 10).padStart(2, '0')
      const devolDate = computeScheduleDate(faturaRef, financialStartDay) // dia financeiro do mês da fatura
      const dueDate = `${yyyy}-${mm}-${dueDay}`                            // vencimento do cartão no mês da fatura

      // Variante A — "ciclo no passado": se o vencimento (dueDate) cai ANTES do início do
      // ciclo financeiro ATUAL (mesma regra de getFinancialPeriod, lida de d.settings), a
      // fatura está num ciclo já encerrado. Nesse caso NÃO materializamos pendência
      // retroativa (preservamos o que já foi registrado/pulado e seguimos com as limpezas).
      // Não afeta faturas do ciclo atual/futuro.
      const _ref = new Date()
      let _cicloStart, _cicloEnd
      if ((d.settings?.financialMonthMode || 'custom') === 'calendar') {
        _cicloStart = new Date(_ref.getFullYear(), _ref.getMonth(), 1)
        _cicloEnd = new Date(_ref.getFullYear(), _ref.getMonth() + 1, 0)
      } else {
        const _startDay = d.settings?.financialMonthStartDay || 1
        if (_ref.getDate() >= _startDay) {
          _cicloStart = new Date(_ref.getFullYear(), _ref.getMonth(), _startDay)
          _cicloEnd = new Date(_ref.getFullYear(), _ref.getMonth() + 1, _startDay - 1)
        } else {
          _cicloStart = new Date(_ref.getFullYear(), _ref.getMonth() - 1, _startDay)
          _cicloEnd = new Date(_ref.getFullYear(), _ref.getMonth(), _startDay - 1)
        }
      }
      const _dueDateObj = new Date(`${dueDate}T00:00:00`)
      const faturaCicloNoPassado = _dueDateObj < _cicloStart
      // Item 8 (D2/Q4): fatura do ciclo ATUAL = vencimento dentro do ciclo financeiro
      // corrente. Passado/futuro espelhados pela mesma janela. Só o ciclo atual materializa
      // a etapa A; futuro fica só com o agendamento projetado; passado, nada retroativo.
      const faturaCicloAtual = _dueDateObj >= _cicloStart && _dueDateObj <= _cicloEnd

      const contaPrincipal = d.accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal)
        || d.accounts.find(a => a.isMain && a.type !== 'credit')
        || d.accounts.find(a => a.type === 'checking')
      if (!contaPrincipal) return d

      const apelido = card.apelido || card.name?.slice(0, 6) || 'CC'
      const subcontaName = `Ger. ${apelido}`

      // 1. Gastos reais desta fatura (ignora automações: reservaAuto / auto-provisao / investAuto)
      const isAutomacao = (tx) => tx.reservaAuto || tx.origin === 'auto-provisao' || tx.origin === 'investAuto' || tx.origin === 'patrimonioAuto'
      const belongs = (tx) =>
        tx.type === 'expense' && tx.accountType === 'credit' && tx.accountId === cardId &&
        !isAutomacao(tx) &&
        faturaMesAnoOf(card, tx.date, tx.faturaMonthYear) === faturaMesAno
      const expenses = d.transactions.filter(belongs)

      // 2. Totais por classe de grupo
      let totalG = 0
      let totalGeral = 0
      const numberedByAccount = new Map() // contaOrigemId → soma dos grupos numerados
      // Detalhamento por função: contaOrigemId → Map(reservaFuncaoId → soma). Lançamentos
      // sem reserva_funcao_id somam em numberedByAccount mas não entram aqui.
      const numberedByAccountByFunc = new Map()
      // Rastreabilidade (schedule_reserva_funcoes.source_ids): contaOrigemId → Map(reservaFuncaoId
      // → [{id,valor,descricao,data,grupo}]) — os lançamentos que compõem cada detalhamento.
      const numberedByAccountByFuncSources = new Map()
      // Chain ID: IDs dos lançamentos que compõem cada slot (recomputado a cada recálculo,
      // pois o motor recria os slots pendentes do zero). Persistidos em overrides._sourceTxIds.
      const sourceTxIdsG = []                // slot gerencial_devolucao (grupo G)
      const sourceTxIdsByOrigem = new Map()  // contaOrigemId → IDs (slots resgate_reserva)
      const sourceTxIdsAll = []              // slot pagamento_fatura (todos os gastos da fatura)
      for (const tx of expenses) {
        const amt = Number(tx.amount) || 0
        totalGeral = rb(totalGeral + amt)
        sourceTxIdsAll.push(tx.id)
        const grupo = d.gerencialGroups?.find(g => g.id === tx.grupoGerencial)
        if (grupo && grupo.number === 1) {
          totalG = rb(totalG + amt)
          sourceTxIdsG.push(tx.id)
        } else if (grupo && typeof grupo.number === 'number' && grupo.number !== 1 && grupo.defaultAccountId) {
          const origem = grupo.defaultAccountId
          numberedByAccount.set(origem, rb((numberedByAccount.get(origem) || 0) + amt))
          if (!sourceTxIdsByOrigem.has(origem)) sourceTxIdsByOrigem.set(origem, [])
          sourceTxIdsByOrigem.get(origem).push(tx.id)
          if (tx.reservaFuncaoId) {
            if (!numberedByAccountByFunc.has(origem)) numberedByAccountByFunc.set(origem, new Map())
            const fm = numberedByAccountByFunc.get(origem)
            fm.set(tx.reservaFuncaoId, rb((fm.get(tx.reservaFuncaoId) || 0) + amt))
            if (!numberedByAccountByFuncSources.has(origem)) numberedByAccountByFuncSources.set(origem, new Map())
            const fs = numberedByAccountByFuncSources.get(origem)
            if (!fs.has(tx.reservaFuncaoId)) fs.set(tx.reservaFuncaoId, [])
            fs.get(tx.reservaFuncaoId).push({
              id: tx.id, valor: amt, descricao: tx.description || '', data: tx.date, grupo: tx.grupoGerencial || null,
            })
          }
        }
        // Grupo D / sem grupo → entra apenas no totalGeral (pagamento da fatura)
      }

      // Estornos da fatura: receitas lançadas no cartão (exceto pagamentos de fatura,
      // que têm type 'credit_payment'). Abatem o valor do pagamento, mantendo a
      // consistência com o totalizador visual (despesas - estornos).
      const totalEstornos = d.transactions
        .filter(tx =>
          tx.type === 'income' && tx.accountType === 'credit' && tx.accountId === cardId &&
          !isAutomacao(tx) &&
          faturaMesAnoOf(card, tx.date, tx.faturaMonthYear) === faturaMesAno
        )
        .reduce((s, tx) => rb(s + (Number(tx.amount) || 0)), 0)
      const totalPagamento = rb(totalGeral - totalEstornos)

      // Garante a subconta gerencial quando há devolução a agendar (origem da transferência)
      let accounts = d.accounts
      let subcontaId = d.accounts.find(a => a.name === subcontaName)?.id
      if (!subcontaId && totalG > 0) {
        subcontaId = 'acc_ger_' + Date.now() + '_' + Math.random().toString(36).slice(2)
        const grupoGId = d.gerencialGroups?.find(g => g.number === 1)?.id || null
        accounts = [...accounts, {
          id: subcontaId, name: subcontaName, type: 'checking', balance: 0,
          bank: contaPrincipal.bank || '', apelido: `G${apelido}`.slice(0, 8),
          fluxoCaixaPrincipal: false, isMain: false, contaCorrentePrincipal: false,
          grupoGerencial: grupoGId,
          accountGroupId: contaPrincipal.accountGroupId || null,
        }]
      }

      // 3. Conjunto desejado de agendamentos (slot = tipo + conta-origem para resgate)
      const meta = { faturaRef, cardId, checkingAccountId: contaPrincipal.id }
      const baseSch = {
        frequency: 'once', occurrenceType: 'installment', installments: 1,
        autoRegister: false, registered: [], skipped: [],
        cardId, faturaMesAno, faturaRef,
      }
      // Vínculo de função de reserva já existente por conta-origem (resgate_reserva desta
      // fatura): preservado quando o recálculo é disparado sem o mapa (ex.: "Atualizar").
      const prevReservaFuncaoByOrigem = {}
      for (const s of d.schedules) {
        if (s.tipo === 'resgate_reserva' && s.cardId === cardId && s.faturaMesAno === faturaMesAno && s.reservaFuncaoId) {
          prevReservaFuncaoByOrigem[s.accountId] = s.reservaFuncaoId
        }
      }

      const desired = []
      if (totalG > 0 && subcontaId) {
        desired.push({
          slot: 'gerencial_devolucao',
          id: `fsch_${cardId}_${yyyy}${mm}_gerencial_devolucao`,
          tipo: 'gerencial_devolucao',
          transactionType: 'transfer', accountId: subcontaId, toAccountId: contaPrincipal.id,
          startDate: devolDate, amount: totalG,
          description: `Devolução Gerencial ${apelido} - Fatura ${faturaRef}`,
          overrides: { _gerencialKey: `${gerencialKey(cardId, faturaRef)}_resgate`, _gerencial: { ...meta, gerencialContaId: subcontaId }, _sourceTxIds: sourceTxIdsG },
        })
      }
      for (const [origem, soma] of numberedByAccount) {
        if (soma <= 0) continue
        const reservaFuncaoId =
          (reservaFuncaoByAccount && reservaFuncaoByAccount[origem]) ||
          prevReservaFuncaoByOrigem[origem] || null
        desired.push({
          slot: `resgate_reserva_${origem}`,
          id: `fsch_${cardId}_${yyyy}${mm}_resgate_reserva_${origem}`,
          tipo: 'resgate_reserva',
          transactionType: 'transfer', accountId: origem, toAccountId: contaPrincipal.id,
          startDate: dueDate, amount: soma,
          description: `Resgate Reserva ${apelido} - Fatura ${faturaRef}`,
          reservaFuncaoId,
          overrides: { _gerencial: meta, _sourceTxIds: sourceTxIdsByOrigem.get(origem) || [] },
        })
      }
      if (totalPagamento > 0) {
        desired.push({
          slot: 'pagamento_fatura',
          id: `fsch_${cardId}_${yyyy}${mm}_pagamento_fatura`,
          tipo: 'pagamento_fatura',
          transactionType: 'transfer', accountId: contaPrincipal.id, toAccountId: cardId,
          startDate: dueDate, amount: totalPagamento,
          description: `Pagamento Fatura ${apelido} ${faturaRef}`,
          overrides: { _gerencialKey: `${gerencialKey(cardId, faturaRef)}_payment`, _gerencial: meta, _sourceTxIds: sourceTxIdsAll },
        })
      }

      // 4. Reconciliação. Identifica os agendamentos desta fatura (novos + legados),
      //    preserva os já registrados/pulados e descarta os pendentes (serão recriados).
      const gerKey = gerencialKey(cardId, faturaRef)
      const legacyKeys = new Set([
        `${gerKey}_resgate`, `${gerKey}_payment`, `${gerKey}_provision`, `${gerKey}_resgate_parc`,
      ])
      const isManaged = (s) => {
        if (s.tipo && s.cardId === cardId && s.faturaMesAno === faturaMesAno) return true
        const k = s.overrides?._gerencialKey
        if (!k) return false
        if (legacyKeys.has(k)) return true
        // legado de grupo numerado: ger_num_{grupoId}_{cardId}_{dueDate}
        if (k.startsWith('ger_num_') && k.includes(`_${cardId}_`) && s.startDate === dueDate) return true
        return false
      }
      const slotOf = (s) => {
        if (s.tipo === 'resgate_reserva') return `resgate_reserva_${s.accountId}`
        if (s.tipo) return s.tipo
        const k = s.overrides?._gerencialKey || ''
        if (k === `${gerKey}_payment`) return 'pagamento_fatura'
        if (k === `${gerKey}_resgate` || k === `${gerKey}_provision` || k === `${gerKey}_resgate_parc`) return 'gerencial_devolucao'
        if (k.startsWith('ger_num_')) return `resgate_reserva_${s.accountId}`
        return null
      }

      const registeredSlots = new Set()
      const schedules = []
      for (const s of d.schedules) {
        if (!isManaged(s)) { schedules.push(s); continue }
        // Agendamentos gerenciados são frequency:'once' — uma ÚNICA ocorrência possível. Logo,
        // QUALQUER registro/pulo já significa executado, sem exigir match exato com startDate.
        // (O pagamento de resgate_reserva detalhado grava em `registered` a data editável trfDate,
        // que pode divergir do startDate; o guard antigo por data exata então marcava done=false,
        // descartava o agendamento pago e recriava o slot como pendente — resgate fantasma.)
        // NB: este ramo só roda para isManaged; agendamentos comuns saíram no `continue` acima e
        // seguem com o guard por data exata em getNextOccurrences.
        const done = (s.registered || []).length > 0 || (s.skipped || []).length > 0
        if (done) {
          schedules.push(s)
          const sl = slotOf(s)
          if (sl) registeredSlots.add(sl)
        }
        // pendente → descartado; será recriado a partir de `desired`
      }
      for (const dsh of desired) {
        if (registeredSlots.has(dsh.slot)) continue // já há um executado nesse slot
        if (faturaCicloNoPassado) continue // ciclo encerrado: não materializa pendência retroativa
        const { slot, ...rest } = dsh
        schedules.push({ ...baseSch, ...rest })
      }

      // 5. Limpeza dos contas_a_pagar (payables) LEGADOS de fatura deste cartão/mês — gerados
      //    pelo modelo antigo (origin 'invoice'/'gerencial') e agora substituídos pelos
      //    agendamentos tipo='pagamento_fatura'. Remove apenas os pendentes; preserva os já
      //    pagos (histórico) e quaisquer outros (ex.: dívidas 'debt_installment').
      const payables = (d.payables || []).filter(p => {
        const isFaturaLegacy = (p.origin === 'invoice' || p.origin === 'gerencial')
          && p.cartaoId === cardId && p.mesAno === faturaMesAno
        if (!isFaturaLegacy) return true
        return p.status === 'paid'
      })

      // 6. Detalhamento por função (schedule_reserva_funcoes) dos resgates desta fatura.
      //    Idempotente: para cada resgate_reserva (pendente) recriado, apaga o detalhamento
      //    antigo do seu schedule_id e reinsere uma linha por função somada. Resgates já
      //    registrados (executados) preservam seu detalhamento.
      const pendingResgateIds = new Set(
        desired
          .filter(dsh => dsh.tipo === 'resgate_reserva' && !registeredSlots.has(dsh.slot))
          .map(dsh => dsh.id)
      )
      // Limpa o SRF antigo dos resgates pendentes (recriados) — vale também p/ ciclo passado,
      // removendo órfãos dos resgates que NÃO serão re-materializados pela guarda acima.
      let scheduleReservaFuncoes = (d.scheduleReservaFuncoes || [])
        .filter(srf => !pendingResgateIds.has(srf.scheduleId))
      // Só reinsere o detalhamento quando a fatura NÃO é de ciclo passado (senão não há
      // schedule de resgate correspondente — evita SRF órfão).
      if (!faturaCicloNoPassado) for (const [origem, soma] of numberedByAccount) {
        if (soma <= 0) continue
        const schedId = `fsch_${cardId}_${yyyy}${mm}_resgate_reserva_${origem}`
        if (!pendingResgateIds.has(schedId)) continue
        const byFunc = numberedByAccountByFunc.get(origem)
        if (!byFunc) continue
        const byFuncSources = numberedByAccountByFuncSources.get(origem)
        for (const [funcId, valor] of byFunc) {
          if (!(valor > 0)) continue
          scheduleReservaFuncoes.push({
            id: `srf_${schedId}_${funcId}`,
            scheduleId: schedId,
            reservaFuncaoId: funcId,
            valor: rb(valor),
            sourceIds: byFuncSources?.get(funcId) || [],
            faturaRef,
          })
        }
      }

      // 7. Item 8 — etapa A (transferência imediata Conta Principal → Ger. subconta) do
      //    Grupo G, DERIVADA das despesas G da fatura e com id determinístico (tx_gerA_<expenseId>).
      //    Regra de negócio:
      //      • À vista / parcela 1 (installment_num <= 1): materializa na DATA DA COMPRA tanto na
      //        fatura do ciclo ATUAL quanto em FATURAS FUTURAS (provisão imediata).
      //      • Parcelas 2..N (installment_num > 1): só no ciclo atual — as futuras ficam para o
      //        Executar Gerenciais (provisão no início do ciclo anterior à fatura).
      //    Passado fica intocado (nada retroativo). Reconcilia create/update por id determinístico;
      //    remoção de órfãos é feita por id em delete/edição/reversão.
      let transactions = d.transactions
      if (subcontaId && !faturaCicloNoPassado) {
        const gExpenses = expenses.filter(tx => {
          const g = d.gerencialGroups?.find(gg => gg.id === tx.grupoGerencial)
          if (!g || g.number !== 1) return false
          // Parcela 2..N de uma série NÃO recebe etapa A imediata em faturas futuras (vai para o
          // Executar Gerenciais). Identificada por QUALQUER um: installment_num > 1 (explícito),
          // parent_tx_id preenchido (filha de criarParcelasGerencial) OU origin 'parcela'. Cobre
          // parcelas importadas via conciliação que têm installment_num = null mas parent_tx_id/
          // origin definidos. À vista / parcela 1 (nenhum desses) recebe etapa A sempre (atual +
          // futuro); parcela 2..N só no ciclo atual.
          const ehParcela2aN = Number(tx.installmentNum) > 1 || tx.parentTxId != null || tx.origin === 'parcela'
          return !ehParcela2aN || faturaCicloAtual
        })
        if (gExpenses.length) {
          const arr = [...transactions]
          let principalDelta = 0, subcontaDelta = 0, changed = false
          for (const e of gExpenses) {
            const id = etapaAId(e.id)
            const amount = Number(e.amount) || 0
            const instNum = Number(e.installmentNum) || 1
            const aDate = (instNum >= 2 && faturaRef) ? prevMonthScheduleDate(faturaRef, financialStartDay) : e.date
            const desc = `Reserva Gerencial - ${e.description || ''}`.trim()
            const idx = arr.findIndex(t => t.id === id)
            if (idx === -1) {
              // CREATE: debita principal, credita subconta.
              arr.push({
                id, type: 'transfer', accountId: contaPrincipal.id, toAccountId: subcontaId,
                amount, date: aDate, description: desc, grupoGerencial: e.grupoGerencial,
                cardId, faturaRef, sourceExpenseId: e.id,
                createdAt: new Date().toISOString(),
              })
              principalDelta -= amount
              subcontaDelta += amount
              changed = true
            } else {
              // UPDATE só quando algo difere (idempotente: re-run = no-op). Saldo ajusta
              // pelo delta do valor.
              const cur = arr[idx]
              const curAmt = Number(cur.amount) || 0
              const diff = curAmt !== amount || cur.date !== aDate ||
                cur.description !== desc || cur.accountId !== contaPrincipal.id ||
                cur.toAccountId !== subcontaId || cur.grupoGerencial !== e.grupoGerencial ||
                cur.cardId !== cardId || cur.faturaRef !== faturaRef || cur.sourceExpenseId !== e.id
              if (diff) {
                principalDelta += curAmt - amount
                subcontaDelta += amount - curAmt
                arr[idx] = {
                  ...cur, id, type: 'transfer', accountId: contaPrincipal.id, toAccountId: subcontaId,
                  amount, date: aDate, description: desc, grupoGerencial: e.grupoGerencial,
                  cardId, faturaRef, sourceExpenseId: e.id,
                }
                changed = true
              }
            }
          }
          if (changed) {
            transactions = arr
            if (principalDelta !== 0 || subcontaDelta !== 0) {
              accounts = accounts.map(a => {
                if (a.id === contaPrincipal.id) return { ...a, balance: rb((a.balance || 0) + principalDelta) }
                if (a.id === subcontaId) return { ...a, balance: rb((a.balance || 0) + subcontaDelta) }
                return a
              })
            }
          }
        }
      }

      return { ...d, accounts, schedules, payables, scheduleReservaFuncoes, transactions }
  }, [])

  const recalcularAgendamentosFatura = useCallback(
    (cardId, faturaAno, faturaMs, reservaFuncaoByAccount) =>
      update(d => reconcileFaturaState(d, cardId, faturaAno, faturaMs, reservaFuncaoByAccount)),
    [update, reconcileFaturaState]
  )

  // ── Reconciliador gerencial ───────────────────────────────────────────────────
  // Garante consistência entre as despesas de cartão, os agendamentos de fatura geridos
  // (gerencial_devolucao / resgate_reserva / pagamento_fatura) e o balance das contas Ger.
  // Tudo num ÚNICO update atômico, reusando reconcileFaturaState (a MESMA lógica da engine):
  //   A) Para cada fatura afetada do(s) cartão(ões)-alvo, roda reconcileFaturaState — idempotente,
  //      cria/atualiza/remove agendamentos pendentes e NUNCA toca em ocorrências registradas.
  //   B) Recalcula o balance de cada conta Ger. (subconta do grupo G, number===1) como
  //      Σ(transferências de entrada) − Σ(transferências de saída).
  // Não cria lançamentos de estorno. Idempotente: sem mudanças, devolve o estado original (no-op).
  // Retorna um Promise com o resumo { agendasCriadas, agendasAtualizadas, agendasRemovidas,
  // saldosCorrigidos, detalhes }. (cardId omitido → todos os cartões de crédito.)
  // faturasFilter (opcional, só faz sentido com cardId): lista de 'YYYY-MM' a reconciliar.
  // Quando informado, restringe o passo (A) EXATAMENTE a essas faturas — não varre as demais
  // faturas do cartão (evita re-asserir agendamentos de meses não afetados pela edição). O
  // recálculo dos saldos Ger. (passo B) permanece global e idempotente.
  const reconciliarGerencial = useCallback((cardId = null, faturasFilter = null) => {
    return new Promise(resolve => {
      let resolved = false
      const managedTipos = new Set(['gerencial_devolucao', 'resgate_reserva', 'pagamento_fatura'])
      const faturasFiltro = faturasFilter && faturasFilter.length ? new Set(faturasFilter) : null
      update(d => {
        const targetCards = cardId
          ? d.accounts.filter(a => a.id === cardId && a.type === 'credit')
          : d.accounts.filter(a => a.type === 'credit')
        const cardIdSet = new Set(targetCards.map(c => c.id))

        // Snapshot ANTES dos agendamentos geridos (para contagem de mudanças).
        const before = new Map()
        for (const s of d.schedules) {
          if (managedTipos.has(s.tipo) && cardIdSet.has(s.cardId)) before.set(s.id, Number(s.amount) || 0)
        }

        // A) Recalcula cada fatura afetada de cada cartão-alvo (mesma lógica da engine).
        let nd = d
        for (const card of targetCards) {
          const faturas = new Set()
          for (const tx of nd.transactions) {
            if (tx.type === 'expense' && tx.accountType === 'credit' && tx.accountId === card.id) {
              if (tx.reservaAuto || tx.origin === 'auto-provisao' || tx.origin === 'investAuto' || tx.origin === 'patrimonioAuto') continue
              const fmy = faturaMesAnoOf(card, tx.date, tx.faturaMonthYear)
              if (fmy) faturas.add(fmy)
            }
          }
          // Inclui faturas que já têm agendamento gerido, p/ detectar fatura zerada → remoção.
          for (const s of nd.schedules) {
            if (managedTipos.has(s.tipo) && s.cardId === card.id && s.faturaMesAno) faturas.add(s.faturaMesAno)
          }
          // Quando há filtro de faturas (gatilho de add/update por lançamento), reconcilia
          // SOMENTE essas faturas — não as demais do cartão (não toca meses não afetados).
          const faturasAlvo = faturasFiltro
            ? new Set([...faturas].filter(f => faturasFiltro.has(f)))
            : faturas
          for (const fmy of faturasAlvo) {
            const [y, m] = fmy.split('-')
            nd = reconcileFaturaState(nd, card.id, y, m)
          }
        }

        // Contagem de mudanças nos agendamentos geridos.
        const after = new Map()
        for (const s of nd.schedules) {
          if (managedTipos.has(s.tipo) && cardIdSet.has(s.cardId)) after.set(s.id, Number(s.amount) || 0)
        }
        let agendasCriadas = 0, agendasAtualizadas = 0, agendasRemovidas = 0
        const detalhes = []
        for (const [id, amt] of after) {
          if (!before.has(id)) { agendasCriadas++; detalhes.push({ tipo: 'agenda_criada', id, amount: amt }) }
          else if (Math.abs(before.get(id) - amt) > 0.005) { agendasAtualizadas++; detalhes.push({ tipo: 'agenda_atualizada', id, de: before.get(id), para: amt }) }
        }
        for (const [id, amt] of before) {
          if (!after.has(id)) { agendasRemovidas++; detalhes.push({ tipo: 'agenda_removida', id, amount: amt }) }
        }

        // B) Saldo das contas Ger. (subcontas do grupo G = number 1) = Σ entradas − Σ saídas (transferências).
        const grupoG = nd.gerencialGroups?.find(g => g.number === 1)
        const gerIds = new Set(
          nd.accounts
            .filter(a => (grupoG && a.grupoGerencial === grupoG.id) || /^Ger\. /.test(a.name || ''))
            .map(a => a.id)
        )
        let saldosCorrigidos = 0
        if (gerIds.size > 0) {
          const inSum = new Map(), outSum = new Map()
          for (const tx of nd.transactions) {
            if (tx.type !== 'transfer') continue
            const amt = Number(tx.amount) || 0
            if (gerIds.has(tx.toAccountId)) inSum.set(tx.toAccountId, rb((inSum.get(tx.toAccountId) || 0) + amt))
            if (gerIds.has(tx.accountId)) outSum.set(tx.accountId, rb((outSum.get(tx.accountId) || 0) + amt))
          }
          let mutated = false
          const accounts = nd.accounts.map(a => {
            if (!gerIds.has(a.id)) return a
            const real = rb((inSum.get(a.id) || 0) - (outSum.get(a.id) || 0))
            if (Math.abs((Number(a.balance) || 0) - real) > 0.005) {
              saldosCorrigidos++; mutated = true
              detalhes.push({ tipo: 'saldo_corrigido', id: a.id, name: a.name, de: Number(a.balance) || 0, para: real })
              return { ...a, balance: real }
            }
            return a
          })
          if (mutated) nd = { ...nd, accounts }
        }

        const summary = { agendasCriadas, agendasAtualizadas, agendasRemovidas, saldosCorrigidos, detalhes }
        if (!resolved) { resolved = true; resolve(summary) }
        // Idempotente: sem nenhuma mudança, devolve o estado original (evita re-render/sync desnecessários).
        const changed = agendasCriadas || agendasAtualizadas || agendasRemovidas || saldosCorrigidos
        return changed ? nd : d
      })
    })
  }, [update, reconcileFaturaState])

  // ── Revisar Movimentos Automáticos ────────────────────────────────────────────
  // Núcleo PURO: reconcilia TODA a fatura (etapa A por lançamento + agendamentos geridos)
  // aplicando a MESMA engine usada nos salvamentos (applyEnsureGerencial em cadeia sobre os
  // lançamentos + reconcileFaturaState). Devolve o novo estado `nd` e o diff de ações entre o
  // estado atual e o esperado. Dry-run e execução usam ESTE núcleo → o preview bate 1:1 com o
  // que a execução fará. Não recalcula saldos globais (isso é papel do "Reconciliar Gerenciais").
  const computeRevisaoFatura = useCallback((d, cardId, faturaMesAno) => {
    const emptyResumo = {
      remover_gerencial: 0, criar_gerencial: 0, atualizar_gerencial: 0,
      criar_resgate: 0, atualizar_resgate: 0, remover_resgate: 0,
      atualizar_devolucao: 0, atualizar_pagamento: 0, total: 0,
    }
    const card = d.accounts.find(a => a.id === cardId)
    if (!card) return { nd: d, acoes: [], resumo: emptyResumo }
    const [yyyy, mm] = faturaMesAno.split('-')
    const faturaRef = `${mm}/${yyyy}`

    const isAutomacao = (tx) => tx.reservaAuto || tx.origin === 'auto-provisao' || tx.origin === 'investAuto' || tx.origin === 'patrimonioAuto'
    const faturaExpenses = d.transactions.filter(tx =>
      tx.type === 'expense' && tx.accountType === 'credit' && tx.accountId === cardId &&
      !isAutomacao(tx) && faturaMesAnoOf(card, tx.date, tx.faturaMonthYear) === faturaMesAno)
    const faturaExpenseIds = new Set(faturaExpenses.map(t => t.id))

    // Estado esperado, sem mutar `d`: engine em cadeia sobre a fatura.
    let nd = d
    for (const tx of faturaExpenses) nd = applyEnsureGerencial(nd, tx.id)
    nd = reconcileFaturaState(nd, cardId, yyyy, mm)

    const grupoAlias = (gid) => {
      const g = d.gerencialGroups?.find(x => x.id === gid)
      if (!g) return '—'
      return g.alias || (g.number === 1 ? 'G' : g.name) || String(g.number)
    }
    const accName = (aid) => d.accounts.find(a => a.id === aid)?.name || aid
    const lancInfo = (id) => {
      const l = d.transactions.find(t => t.id === id)
      return l ? { descricao: l.description || '', valor: Number(l.amount) || 0, data: l.date, grupo: grupoAlias(l.grupoGerencial) } : null
    }

    const acoes = []
    const resumo = { ...emptyResumo }

    // ── Etapa A (transferências gerenciais tx_gerA_) desta fatura ──
    const isEtapaAFatura = (t) =>
      t.type === 'transfer' && typeof t.id === 'string' && t.id.startsWith('tx_gerA_') &&
      ((t.cardId === cardId && t.faturaRef === faturaRef) || faturaExpenseIds.has(t.sourceExpenseId))
    const beforeEt = new Map(d.transactions.filter(isEtapaAFatura).map(t => [t.id, t]))
    const afterEt = new Map(nd.transactions.filter(isEtapaAFatura).map(t => [t.id, t]))
    for (const id of new Set([...beforeEt.keys(), ...afterEt.keys()])) {
      const b = beforeEt.get(id), a = afterEt.get(id)
      const srcId = (a || b).sourceExpenseId
      const info = lancInfo(srcId) || { descricao: (a || b).description || '', valor: Number((a || b).amount) || 0, data: (a || b).date, grupo: '—' }
      if (a && !b) {
        acoes.push({ tipo: 'CRIAR_GERENCIAL', lancamento_id: srcId, descricao: info.descricao, valor: Number(a.amount) || 0, data: a.date, de: info.grupo, para: 'G' })
        resumo.criar_gerencial++
      } else if (b && !a) {
        acoes.push({ tipo: 'REMOVER_GERENCIAL', lancamento_id: srcId, descricao: info.descricao, valor: Number(b.amount) || 0, data: b.date, de: 'G', para: info.grupo })
        resumo.remover_gerencial++
      } else if (a && b && Math.abs((Number(a.amount) || 0) - (Number(b.amount) || 0)) > 0.005) {
        acoes.push({ tipo: 'ATUALIZAR_GERENCIAL', lancamento_id: srcId, descricao: info.descricao, valor_anterior: Number(b.amount) || 0, valor_novo: Number(a.amount) || 0, data: a.date })
        resumo.atualizar_gerencial++
      }
    }

    // ── Agendamentos geridos (resgate_reserva / gerencial_devolucao / pagamento_fatura) ──
    const managedTipos = new Set(['gerencial_devolucao', 'resgate_reserva', 'pagamento_fatura'])
    const isManagedFatura = (s) => managedTipos.has(s.tipo) && s.cardId === cardId && s.faturaMesAno === faturaMesAno
    const beforeSch = new Map(d.schedules.filter(isManagedFatura).map(s => [s.id, s]))
    const afterSch = new Map(nd.schedules.filter(isManagedFatura).map(s => [s.id, s]))
    for (const id of new Set([...beforeSch.keys(), ...afterSch.keys()])) {
      const b = beforeSch.get(id), a = afterSch.get(id)
      const tipo = (a || b).tipo
      const vAnt = b ? Number(b.amount) || 0 : 0
      const vNovo = a ? Number(a.amount) || 0 : 0
      if (a && b && Math.abs(vNovo - vAnt) <= 0.005) continue
      if (tipo === 'resgate_reserva') {
        const beforeSrc = new Set((b?.overrides?._sourceTxIds) || [])
        const afterSrc = new Set((a?.overrides?._sourceTxIds) || [])
        const adicionados = [...afterSrc].filter(x => !beforeSrc.has(x))
        const removidos = [...beforeSrc].filter(x => !afterSrc.has(x))
        if (a && !b) { acoes.push({ tipo: 'CRIAR_RESGATE', grupo: accName((a).accountId), valor_anterior: 0, valor_novo: vNovo, source_ids_adicionados: adicionados, source_ids_removidos: [] }); resumo.criar_resgate++ }
        else if (b && !a) { acoes.push({ tipo: 'REMOVER_RESGATE', grupo: accName((b).accountId), valor_anterior: vAnt, valor_novo: 0, source_ids_adicionados: [], source_ids_removidos: [...beforeSrc] }); resumo.remover_resgate++ }
        else { acoes.push({ tipo: 'ATUALIZAR_RESGATE', grupo: accName((a).accountId), valor_anterior: vAnt, valor_novo: vNovo, source_ids_adicionados: adicionados, source_ids_removidos: removidos }); resumo.atualizar_resgate++ }
      } else if (tipo === 'gerencial_devolucao') {
        acoes.push({ tipo: 'ATUALIZAR_DEVOLUCAO', criar: !b, remover: !a, valor_anterior: vAnt, valor_novo: vNovo })
        resumo.atualizar_devolucao++
      } else if (tipo === 'pagamento_fatura') {
        acoes.push({ tipo: 'ATUALIZAR_PAGAMENTO', criar: !b, remover: !a, valor_anterior: vAnt, valor_novo: vNovo })
        resumo.atualizar_pagamento++
      }
    }

    resumo.total = acoes.length
    return { nd, acoes, resumo }
  }, [applyEnsureGerencial, reconcileFaturaState])

  // API pública. faturaRef no formato 'MM/YYYY'. dryRun=true → só preview (não muta).
  // dryRun=false → aplica em UM update atômico e devolve o mesmo resumo do preview.
  const revisarMovimentosFatura = useCallback(({ cardId, faturaRef, dryRun = true }) => {
    const [mm, yyyy] = String(faturaRef).split('/')
    const faturaMesAno = `${yyyy}-${mm}`
    if (dryRun) {
      const { acoes, resumo } = computeRevisaoFatura(dataRef.current, cardId, faturaMesAno)
      return Promise.resolve({ acoes, resumo })
    }
    // Resolve DENTRO do updater (como reconciliarGerencial): o updater do setData não roda
    // sincronamente, então `resumo` só existe ali. `resolved` protege contra dupla invocação.
    return new Promise(resolve => {
      let resolved = false
      update(d => {
        const { nd, acoes, resumo } = computeRevisaoFatura(d, cardId, faturaMesAno)
        if (!resolved) { resolved = true; resolve({ acoes, resumo }) }
        return nd
      })
    })
  }, [update, computeRevisaoFatura])

  // Mantém dataRef e o recalc-por-tx atualizados (lidos por addTransaction/
  // updateTransaction em event handlers, após o commit).
  useEffect(() => {
    dataRef.current = data
    recalcAgendamentosRef.current = recalcularAgendamentosFatura
    reconcileGerencialRef.current = reconciliarGerencial
    recalcFaturaRef.current = (cartaoId, date, faturaMonthYear) => {
      const card = dataRef.current.accounts.find(a => a.id === cartaoId)
      const mesAno = faturaMesAnoOf(card, date, faturaMonthYear)
      // O modelo de fatura agora é totalmente baseado em agendamentos (tipo='pagamento_fatura');
      // não geramos mais contas_a_pagar legadas (gerarContasPagarFatura/recalcContasPagarFatura).
      if (mesAno) {
        const [y, m] = mesAno.split('-')
        recalcularAgendamentosFatura(cartaoId, y, m)
      }
    }
  })

  // ── Recurring Schedule Match ──────────────────────────────────────────────────

  const findMatchingSchedule = useCallback((tx) => {
    if (tx.type !== 'expense' || tx.accountType !== 'credit') return null
    const exceptions = data.settings.recurringMatchExceptions || []
    const txPayee = (tx.payee || '').toLowerCase().trim()
    if (txPayee && exceptions.includes(txPayee)) return null

    return data.schedules.find(schedule => {
      if (schedule.transactionType !== 'expense') return false
      if (Math.abs(schedule.amount - Number(tx.amount)) > 0.50) return false
      const sPayee = (schedule.payee || '').toLowerCase().trim()
      const txDesc = (tx.description || '').toLowerCase()
      const sDesc = (schedule.description || '').toLowerCase()
      // Payee match takes priority
      if (txPayee && sPayee) {
        return txPayee === sPayee || txPayee.includes(sPayee) || sPayee.includes(txPayee)
      }
      // Fallback: first significant word of schedule description in tx description
      if (txDesc && sDesc) {
        const keyword = sDesc.split(/\s+/).find(w => w.length > 3)
        return keyword ? txDesc.includes(keyword) : false
      }
      return false
    }) || null
  }, [data.schedules, data.settings.recurringMatchExceptions])

  const addRecurringMatchException = useCallback((payee) => {
    const norm = (payee || '').toLowerCase().trim()
    if (!norm) return
    update(d => ({
      ...d,
      settings: {
        ...d.settings,
        recurringMatchExceptions: [
          ...(d.settings.recurringMatchExceptions || []).filter(p => p !== norm),
          norm,
        ],
      },
    }))
  }, [update])

  // Marca a ocorrência do agendamento como cumprida SEM criar nova transação
  const markScheduleRegistered = useCallback((scheduleId, date) => {
    update(d => ({
      ...d,
      schedules: d.schedules.map(s =>
        s.id === scheduleId
          ? { ...s, registered: [...(s.registered || []).filter(d => d !== date), date], confirmado: false }
          : s
      ),
    }))
  }, [update])

  // ── Gerencial Processing ──────────────────────────────────────────────────────
  // Item 8: a etapa A (transferência imediata do Grupo G) deixou de ser criada aqui — agora
  // é derivada pelo motor (reconcileFaturaState). Os antigos parâmetros contaDestinoId/options
  // (immediate) foram removidos da assinatura; chamadas que ainda os passam posicionalmente são
  // inofensivas (argumentos extras são ignorados). A conta-origem do gerencial passa a ser a
  // contaPrincipal do motor (mesma usada por devolução/pagamento), garantindo consistência.
  const processarLancamentoGerencial = useCallback((lancamento, grupoId) => {
    const grupo = data.gerencialGroups?.find(g => g.id === grupoId)
    if (!grupo) return { needsResgate: false }
    if (grupo.number === 'D') return { needsResgate: false }

    if (grupo.number === 1) {
      // Item 8 (Opção Y): a etapa A — transferência imediata Conta Principal → Ger. subconta —
      // NÃO é mais criada aqui. Ela passa a ser DERIVADA das despesas G da fatura e
      // materializada pelo motor (reconcileFaturaState), que roda logo após via recalc.
      // O crédito na subconta também é responsabilidade do motor. Aqui só devolvemos a
      // fatura_ref para os agendamentos.
      const cardAccount = data.accounts.find(a => a.id === lancamento.accountId)
      const closingDay = cardAccount?.closingDay || 14
      let faturaRef
      if (lancamento.faturaMonthYear) {
        const [y, m] = lancamento.faturaMonthYear.split('-')
        faturaRef = `${m}/${y}`
      } else {
        faturaRef = computeFaturaRef(new Date(lancamento.date + 'T00:00:00'), closingDay)
      }
      return { needsResgate: false, faturaRef, etapaATxId: null }
    }

    // Grupos numerados (2,3,…) e Grupo D: sem transferência imediata. Os agendamentos
    // (resgate de reserva e pagamento da fatura) são gerados por recalcularAgendamentosFatura.
    return { needsResgate: false }
  }, [data.gerencialGroups, data.accounts])

  // ── Parcelado gerencial: cria agendamentos futuros para parcelas startFromInstallment..N ──
  // Parcelado: cria as transações das parcelas FUTURAS (startFromInstallment..N), cada uma na
  // sua fatura, e recalcula os agendamentos de cada fatura afetada. Cada parcela vira um gasto
  // normal da fatura em que cai (recalcularAgendamentosFatura faz o resto). Sem provisões/resgates
  // parcelados separados — o modelo mantém UP TO 3 agendamentos por fatura.
  const criarParcelasGerencial = useCallback((rootTxId, {
    accountId, amount, date, grupoGerencialId, installments, description = '',
    startFromInstallment = 2,   // default 2 (TransactionForm); import X>1 passa X+1
    baseFaturaMonthYear = null, // fatura da parcela base (formato "YYYY-MM")
    baseInstallmentNum = 1,     // número da parcela base (1 = normal)
    reservaFuncaoId = null,     // função de reserva herdada da parcela base (grupo numerado)
    categoryId = null,          // categoria herdada da parcela base
    payee = null,               // favorecido herdado da parcela base
    costCenter = null,          // centro de custo herdado da parcela base
    notes = null,               // observações herdadas da parcela base
    serieId = null,             // elo da série (gerado na base) — propagado às filhas
  }) => {
    if (!installments || installments <= 1) return []
    if (startFromInstallment > installments) return []
    const cardAccount = dataRef.current.accounts.find(a => a.id === accountId)
    if (!cardAccount) return []
    const closingDay = cardAccount.closingDay || 14

    // Determina baseYear/baseMonth0 = mês da fatura da parcela 1.
    // Com baseFaturaMonthYear: regride (baseInstallmentNum-1) meses até a fatura da parcela 1
    // (honra a fatura explícita da base, ex.: "Fatura de referência" escolhida no formulário).
    // Sem ela: calcula pela data + dia de fechamento do cartão.
    let baseYear, baseMonth0
    if (baseFaturaMonthYear) {
      const [fyRaw, fmRaw] = baseFaturaMonthYear.split('-').map(Number)
      const d1 = new Date(fyRaw, fmRaw - 1 - (baseInstallmentNum - 1), 1)
      baseYear = d1.getFullYear()
      baseMonth0 = d1.getMonth()
    } else {
      const faturaRef1 = computeFaturaRef(new Date(date + 'T00:00:00'), closingDay)
      const [fmm1, fyyyy1] = faturaRef1.split('/')
      baseYear = Number(fyyyy1)
      baseMonth0 = Number(fmm1) - 1
    }

    const origDay = parseInt((date || '').split('-')[2] || '1', 10)
    // Mesma descrição da parcela base para TODAS as parcelas (o número da parcela vive nas
    // colunas installment_num/installment_total). Mantém a base da installment_key consistente
    // e permite que buildSeries agrupe as irmãs corretamente.
    const baseDesc = (description || '').trim()
    const financialStartDay = dataRef.current.settings?.financialMonthStartDay || 1
    // Índice das installment_keys já existentes no cartão — evita inserir parcela duplicada
    // (o índice único uq_lancamentos_installment é a guarda final no banco).
    const existingKeys = new Set(
      dataRef.current.transactions
        .map(t => installmentKey({
          accountId: t.accountId, description: t.description,
          installmentNum: t.installmentNum, installmentTotal: t.installmentTotal,
          amount: t.amount, faturaMonthYear: t.faturaMonthYear, date: t.date,
        }))
        .filter(Boolean)
    )
    const createdIds = []
    const faturasAfetadas = new Set()
    for (let i = startFromInstallment; i <= installments; i++) {
      const fd = new Date(baseYear, baseMonth0 + (i - 1), 1)
      const fy = fd.getFullYear()
      const fm0 = fd.getMonth()
      const futureFatura = `${fy}-${String(fm0 + 1).padStart(2, '0')}`
      const maxDay = new Date(fy, fm0 + 1, 0).getDate()
      // Parcelas 2..N (i sempre > 1 aqui) → dia financialMonthStartDay do mês ANTERIOR à fatura
      // da parcela (regra do Finup). date_cartao não se aplica (parcela projetada).
      const futureDate = installmentSystemDate(
        futureFatura, i, `${futureFatura}-${String(Math.min(origDay, maxDay)).padStart(2, '0')}`, financialStartDay
      )
      // Pula se a parcela já existe (mesma installment_key).
      const key = installmentKey({
        accountId, description: baseDesc, installmentNum: i, installmentTotal: installments,
        amount, faturaMonthYear: futureFatura, date: futureDate,
      })
      if (key && existingKeys.has(key)) continue
      if (key) existingKeys.add(key)
      const id = addTransaction({
        type: 'expense', accountId, accountType: 'credit', amount, date: futureDate,
        description: baseDesc,
        categoryId: categoryId || null, payee: payee || null,
        costCenter: costCenter || null, notes: notes || null,
        grupoGerencial: grupoGerencialId, faturaMonthYear: futureFatura,
        faturaRef: resolveFaturaRef({ faturaMonthYear: futureFatura }),
        reservaFuncaoId: reservaFuncaoId || null,
        installmentNum: i, installmentTotal: installments,
        serieId: serieId || null,
        origin: 'parcela', parentTxId: rootTxId,
        _fromImport: true, // pula o recálculo por-tx; recalculamos a fatura abaixo, uma vez
      })
      if (id) createdIds.push(id)
      faturasAfetadas.add(futureFatura)
    }
    for (const f of faturasAfetadas) {
      const [y, m] = f.split('-')
      recalcularAgendamentosFatura(accountId, y, m)
    }
    return createdIds
  }, [addTransaction, recalcularAgendamentosFatura])

  // ── Ajusta parcelas 2..N quando o grupo gerencial muda em uma edição ──────────
  const ajustarParcelasGrupoGerencial = useCallback((txId, { prevGrupoId, newGrupoId, amount, accountId }) => {
    const prevGrupo = data.gerencialGroups?.find(g => g.id === prevGrupoId)
    const newGrupo  = newGrupoId ? data.gerencialGroups?.find(g => g.id === newGrupoId) : null

    const prevIsNumbered = typeof prevGrupo?.number === 'number' && prevGrupo.number !== 1
    const prevIsG1       = prevGrupo?.number === 1
    const newIsNumbered  = typeof newGrupo?.number === 'number' && newGrupo.number !== 1
    const newIsG1        = newGrupo?.number === 1

    if (!prevIsNumbered && !prevIsG1) return

    const cardAccount      = data.accounts.find(a => a.id === accountId)
    const dueDay           = cardAccount?.dueDay || 10
    const financialStartDay = data.settings?.financialMonthStartDay || 1

    update(d => {
      const parcelaSchedules = d.schedules.filter(s =>
        s.overrides?._originTxId === txId &&
        !(s.registered || []).includes(s.startDate) &&
        !(s.skipped || []).includes(s.startDate)
      )
      if (parcelaSchedules.length === 0) return d

      const contaPrincipal = d.accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal)
        || d.accounts.find(a => a.isMain && a.type !== 'credit')
        || d.accounts.find(a => a.type === 'checking')
      if (!contaPrincipal) return d

      let schedules = [...d.schedules]

      for (const oldSch of parcelaSchedules) {
        const originAmt = oldSch.overrides?._originAmount || oldSch.amount

        // 1. Remove contribution from old schedule
        if (prevIsNumbered && oldSch.overrides?._gerencialKey) {
          const newAmt = Math.max(0, Math.round(((oldSch.amount || 0) - originAmt) * 100) / 100)
          schedules = newAmt <= 0
            ? schedules.filter(s => s.id !== oldSch.id)
            : schedules.map(s => s.id === oldSch.id ? { ...s, amount: newAmt } : s)
        } else if (prevIsG1 && !oldSch.overrides?._gerencialKey) {
          schedules = schedules.filter(s => s.id !== oldSch.id)
        }

        if (!newIsNumbered && !newIsG1) continue

        // Derive fatura ref from old schedule's month (both numbered and G1 dates live in fatura month)
        const [yyyy, mm] = oldSch.startDate.split('-')
        const faturaRefI = `${mm}/${yyyy}`

        // 2. Create new schedule for new group
        if (newIsNumbered) {
          if (!newGrupo?.defaultAccountId) continue
          const dueDateStr = `${yyyy}-${mm}-${String(dueDay).padStart(2, '0')}`
          const gerKeyI = `ger_num_${newGrupoId}_${accountId}_${dueDateStr}`
          const existingIdx = schedules.findIndex(s => s.overrides?._gerencialKey === gerKeyI)
          if (existingIdx >= 0) {
            schedules = schedules.map((s, idx) => idx === existingIdx
              ? { ...s, amount: Math.round(((s.amount || 0) + amount) * 100) / 100 }
              : s
            )
          } else {
            schedules = [...schedules, {
              id: 'sch_ger_num_' + Date.now() + '_' + Math.random().toString(36).slice(2),
              transactionType: 'transfer',
              accountId: newGrupo.defaultAccountId,
              toAccountId: contaPrincipal.id,
              frequency: 'once',
              occurrenceType: 'installment',
              installments: 1,
              autoRegister: false,
              startDate: dueDateStr,
              amount,
              description: `Resgate ${newGrupo.name} - Fatura ${faturaRefI}`,
              faturaRef: faturaRefI,
              overrides: { _gerencialKey: gerKeyI, _originTxId: txId, _originAmount: amount },
              registered: [],
              skipped: [],
            }]
          }
        } else if (newIsG1) {
          const cartao = d.accounts.find(a => a.id === accountId)
          const apelido = cartao?.apelido || cartao?.name?.slice(0, 6) || 'CC'
          const subconta = d.accounts.find(a => a.name === `Ger. ${apelido}`)
          if (!subconta) continue
          const startDateStr = computeScheduleDate(faturaRefI, financialStartDay)
          schedules = [...schedules, {
            id: 'sch_ger_p_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            transactionType: 'transfer',
            accountId: contaPrincipal.id,
            toAccountId: subconta.id,
            frequency: 'once',
            occurrenceType: 'installment',
            installments: 1,
            autoRegister: false,
            startDate: startDateStr,
            amount,
            description: `Provisão ${subconta.name} - Fatura ${faturaRefI}`,
            faturaRef: faturaRefI,
            cardId: accountId,
            overrides: { _originTxId: txId },
            registered: [],
            skipped: [],
          }]
        }
      }

      return { ...d, schedules }
    })
  }, [data.gerencialGroups, data.accounts, data.settings, update])

  // ── Propaga um novo valor para as parcelas seguintes (X+1..N) de uma cadeia X/N ──
  // Atualiza cada lançamento da cadeia e ajusta os reflexos gerenciais:
  //   • Grupo G (1): parcelas futuras → ajusta os agendamentos (provisão/resgate/pagamento);
  //                  parcelas já pagas → ajusta o lançamento vinculado + saldos das contas.
  //   • Grupos numerados (2,3..): ajusta o agendamento de resgate; se já liquidado, ajusta o
  //                  lançamento de transferência vinculado + saldo da conta de resgate.
  const propagarValorParcelas = useCallback((txId, novoValor) => {
    const valor = Number(novoValor)
    if (isNaN(valor)) return
    update(d => {
      const parseInst = (desc) => {
        const m = (desc || '').match(/(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/)
        if (!m) return null
        const num = parseInt(m[1], 10), total = parseInt(m[2], 10)
        if (num < 1 || total < 2 || num > total) return null
        return { num, total, base: desc.replace(m[0], '').trim().replace(/\s+/g, ' ').toLowerCase() }
      }

      const baseTx = d.transactions.find(t => t.id === txId)
      if (!baseTx) return d
      const baseInst = parseInst(baseTx.description)
      if (!baseInst) return d

      const chain = d.transactions.filter(t => {
        if (t.id === txId) return false
        if (t.accountId !== baseTx.accountId || t.type !== 'expense' || t.accountType !== 'credit') return false
        const pi = parseInst(t.description)
        return pi && pi.total === baseInst.total && pi.num > baseInst.num && pi.base === baseInst.base
      })
      if (chain.length === 0) return d

      const card = d.accounts.find(a => a.id === baseTx.accountId)
      const closingDay = card?.closingDay || 14
      const dueDay = card?.dueDay || 10

      let accounts = [...d.accounts]
      let transactions = [...d.transactions]
      let schedules = [...d.schedules]

      const adjustTransfer = (accId, toAccId, delta) => {
        accounts = accounts.map(a => {
          if (a.id === accId) return { ...a, balance: rb((a.balance || 0) - delta) }
          if (a.id === toAccId) return { ...a, balance: rb((a.balance || 0) + delta) }
          return a
        })
      }

      for (const parcela of chain) {
        const delta = rb(valor - parcela.amount)
        if (Math.abs(delta) < 0.005) continue

        // Lançamento da parcela (despesa de cartão): novo valor + ajuste da dívida do cartão
        accounts = accounts.map(a => a.id === parcela.accountId ? {
          ...a,
          creditDebt: Math.max(0, rb((a.creditDebt || 0) + delta)),
          creditMonthBill: Math.max(0, rb((a.creditMonthBill || 0) + delta)),
        } : a)
        transactions = transactions.map(t => t.id === parcela.id ? { ...t, amount: valor } : t)

        const grupo = d.gerencialGroups?.find(g => g.id === parcela.grupoGerencial)
        if (!grupo || grupo.number === 'D') continue

        let faturaRef
        if (parcela.faturaMonthYear) {
          const [y, m] = parcela.faturaMonthYear.split('-')
          faturaRef = `${m}/${y}`
        } else {
          faturaRef = computeFaturaRef(new Date(parcela.date + 'T00:00:00'), closingDay)
        }

        // Já registrado (pago/liquidado): congela o agendamento e ajusta o lançamento + saldos.
        // Futuro: ajusta apenas o valor agendado.
        const applyToSchedule = (sch) => {
          if (!sch) return
          if ((sch.registered || []).includes(sch.startDate)) {
            const linked = transactions.find(t => t.scheduleId === sch.id && t.date === sch.startDate)
            if (linked) {
              transactions = transactions.map(t => t.id === linked.id ? { ...t, amount: rb(t.amount + delta) } : t)
              if (linked.type === 'transfer') adjustTransfer(linked.accountId, linked.toAccountId, delta)
            }
          } else {
            schedules = schedules.map(s => s.id === sch.id
              ? { ...s, amount: Math.max(0, rb((s.amount || 0) + delta)) } : s)
          }
        }

        if (grupo.number === 1) {
          const gerKey = gerencialKey(parcela.accountId, faturaRef)
          for (const key of [`${gerKey}_provision`, `${gerKey}_resgate_parc`, `${gerKey}_payment`]) {
            applyToSchedule(schedules.find(s => s.overrides?._gerencialKey === key))
          }
        } else if (typeof grupo.number === 'number') {
          const [fmm, fyyyy] = faturaRef.split('/')
          const dueDate = `${fyyyy}-${fmm}-${String(dueDay).padStart(2, '0')}`
          const gerKey = `ger_num_${parcela.grupoGerencial}_${parcela.accountId}_${dueDate}`
          applyToSchedule(schedules.find(s => s.overrides?._gerencialKey === gerKey))
        }
      }

      return { ...d, accounts, transactions, schedules }
    })
  }, [update])

  // ── Provisões gerenciais pendentes (parcelas futuras do Grupo G ainda não provisionadas) ──
  // Parcela elegível: despesa de cartão no Grupo G, com padrão X/N, faturaMonthYear <= mês atual,
  // e sem a transferência imediata correspondente (Conta → Ger.) já registrada.
  const getProvisoesPendentes = useCallback(() => {
    const g1 = data.gerencialGroups?.find(g => g.number === 1)
    if (!g1) return []
    const contaPrincipal =
      data.accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal) ||
      data.accounts.find(a => a.isMain && a.type !== 'credit') ||
      data.accounts.find(a => a.type === 'checking')
    return data.transactions
      .filter(tx => {
        if (tx.type !== 'expense' || tx.accountType !== 'credit') return false
        if (tx.grupoGerencial !== g1.id || !tx.faturaMonthYear) return false
        if (!isParcelada(tx)) return false
        // Provisão já existente da parcela: transferência executada (parentTxId) OU a etapa A
        // derivada (id determinístico). NÃO casa por descrição — parcelas irmãs compartilham a
        // mesma descrição (o número vive em installment_num), o que geraria falso positivo.
        const jaProvisionada = data.transactions.some(t =>
          t.type === 'transfer' && t.grupoGerencial === g1.id &&
          (t.parentTxId === tx.id || t.id === etapaAId(tx.id))
        )
        return !jaProvisionada
      })
      .sort((a, b) => (a.faturaMonthYear || '').localeCompare(b.faturaMonthYear || '') || (a.date || '').localeCompare(b.date || ''))
      .map(tx => {
        const card = data.accounts.find(a => a.id === tx.accountId)
        const apelido = card?.apelido || card?.name?.slice(0, 6) || 'CC'
        const subconta = data.accounts.find(a => a.name === `Ger. ${apelido}`)
        return {
          id: tx.id,
          description: tx.description,
          installmentNum: tx.installmentNum ?? null,
          installmentTotal: tx.installmentTotal ?? null,
          faturaMonthYear: tx.faturaMonthYear,
          amount: tx.amount,
          date: tx.date,
          cardId: tx.accountId || null,
          contaOrigemId: contaPrincipal?.id || null,
          contaDestinoId: subconta?.id || null,
        }
      })
  }, [data.gerencialGroups, data.accounts, data.transactions])

  // Executa as provisões selecionadas: transferência imediata Conta Principal → Ger. (igual ao
  // fluxo à vista) na data calculada de cada parcela.
  const executarProvisoesGerenciais = useCallback((parcelaIds) => {
    const ids = new Set(parcelaIds)
    if (ids.size === 0) return
    // Cartões afetados pelas parcelas executadas — para reconciliar saldos/agendamentos depois.
    const affectedCardIds = new Set()
    for (const id of ids) {
      const tx = dataRef.current.transactions.find(t => t.id === id)
      if (tx?.accountId) affectedCardIds.add(tx.accountId)
    }
    update(d => {
      const g1 = d.gerencialGroups?.find(g => g.number === 1)
      if (!g1) return d
      const contaPrincipal =
        d.accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal) ||
        d.accounts.find(a => a.isMain && a.type !== 'credit') ||
        d.accounts.find(a => a.type === 'checking')
      if (!contaPrincipal) return d

      // Dia de início do ciclo financeiro: base das datas das transferências das parcelas 2..N.
      const financialStartDay = d.settings?.financialMonthStartDay || 1

      let accounts = [...d.accounts]
      const newTxs = []
      for (const parcela of d.transactions) {
        if (!ids.has(parcela.id) || parcela.grupoGerencial !== g1.id) continue
        // (ver getProvisoesPendentes) casa por parentTxId / id determinístico, nunca por descrição.
        const jaProvisionada = d.transactions.some(t =>
          t.type === 'transfer' && t.grupoGerencial === g1.id &&
          (t.parentTxId === parcela.id || t.id === etapaAId(parcela.id))
        )
        if (jaProvisionada) continue

        // Data da transferência gerencial (Conta Principal → Ger.):
        //  • Parcela 1 (ou sem padrão X/N): data original do lançamento (comportamento atual).
        //  • Parcelas 2..N: dia financeiro do mês ANTERIOR ao mês da fatura_ref da parcela
        //    (provisão no início do ciclo anterior ao da fatura).
        // Número da parcela: usa a coluna installment_num quando disponível; cai para o último
        // "X/N" da descrição (parcelas legadas com sufixo "(i/N)"), pegando a última ocorrência
        // para não confundir com uma data "5/6" no início da descrição.
        let instNum = Number(parcela.installmentNum) || null
        if (!instNum) {
          const instMatches = [...(parcela.description || '').matchAll(/(\d{1,2})\s*\/\s*\d{1,2}/g)]
          instNum = instMatches.length ? Number(instMatches[instMatches.length - 1][1]) : 1
        }
        let transferDate = parcela.date
        if (instNum >= 2 && parcela.faturaMonthYear) {
          const [fy, fm] = parcela.faturaMonthYear.split('-')
          transferDate = prevMonthScheduleDate(`${fm}/${fy}`, financialStartDay)
        }

        const card = d.accounts.find(a => a.id === parcela.accountId)
        const apelido = card?.apelido || card?.name?.slice(0, 6) || 'CC'
        let subconta = accounts.find(a => a.name === `Ger. ${apelido}`)
        if (!subconta) {
          subconta = {
            id: 'acc_ger_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            name: `Ger. ${apelido}`, type: 'checking', balance: 0,
            bank: contaPrincipal.bank || '', apelido: `G${apelido}`.slice(0, 8),
            fluxoCaixaPrincipal: false, isMain: false, contaCorrentePrincipal: false,
            grupoGerencial: g1.id, accountGroupId: contaPrincipal.accountGroupId || null,
          }
          accounts = [...accounts, subconta]
        }
        accounts = accounts.map(a => {
          if (a.id === contaPrincipal.id) return { ...a, balance: rb((a.balance || 0) - parcela.amount) }
          if (a.id === subconta.id) return { ...a, balance: rb((a.balance || 0) + parcela.amount) }
          return a
        })
        newTxs.push({
          id: 'tx_ger_' + Date.now() + '_' + Math.random().toString(36).slice(2),
          type: 'transfer',
          accountId: contaPrincipal.id,
          toAccountId: subconta.id,
          amount: parcela.amount,
          date: transferDate,
          description: `Reserva Gerencial - ${parcela.description}`,
          grupoGerencial: g1.id,
          origin: 'auto-provisao',
          parentTxId: parcela.id,
          // Rastreabilidade: herda cartão/fatura/despesa-origem da parcela que gerou a provisão.
          cardId: parcela.accountId,
          faturaRef: resolveFaturaRef(parcela),
          sourceExpenseId: parcela.id,
          createdAt: new Date().toISOString(),
        })
      }
      if (newTxs.length === 0) return d
      return { ...d, accounts, transactions: [...d.transactions, ...newTxs] }
    })
    // Reconcilia os saldos das contas Ger. (recálculo absoluto = Σ transferências) e os
    // agendamentos geridos dos cartões afetados — garante o valor correto imediatamente,
    // sem reconciliação manual, e evita que o sync sobrescreva com saldo incremental defasado.
    for (const cardId of affectedCardIds) reconcileGerencialRef.current?.(cardId)
  }, [update])

  // ── Corrigir dados gerenciais: elimina provisões erradas de parcelados e reconstrói agendamentos ──
  const corrigirDadosGerencial = useCallback(() => {
    update(d => {
      const grupo1 = d.gerencialGroups?.find(g => g.number === 1)
      if (!grupo1) return d

      const financialStartDay = d.settings?.financialMonthStartDay || 1

      const contaPrincipal = d.accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal)
        || d.accounts.find(a => a.isMain && a.type !== 'credit')
        || d.accounts.find(a => a.type === 'checking')
      if (!contaPrincipal) return d

      // Todos os lançamentos do grupo G em cartões de crédito
      const grupoGExpenses = d.transactions.filter(tx =>
        tx.type === 'expense' && tx.accountType === 'credit' && tx.grupoGerencial === grupo1.id
      )
      if (grupoGExpenses.length === 0) return d

      // Agrupa por (cardId, faturaRef) separando à vista e parcelados
      const byFatura = new Map()
      grupoGExpenses.forEach(expense => {
        const cardAcc = d.accounts.find(a => a.id === expense.accountId)
        const closingDay = cardAcc?.closingDay || 14
        let faturaRef
        if (expense.faturaMonthYear) {
          const [y, m] = expense.faturaMonthYear.split('-')
          faturaRef = `${m}/${y}`
        } else {
          faturaRef = computeFaturaRef(new Date(expense.date + 'T00:00:00'), closingDay)
        }
        const key = `${expense.accountId}|${faturaRef}`
        if (!byFatura.has(key)) {
          byFatura.set(key, { cardId: expense.accountId, faturaRef, cardAcc, avista: 0, parcelado: 0 })
        }
        const entry = byFatura.get(key)
        if (isParcelada(expense)) {
          entry.parcelado = rb(entry.parcelado + expense.amount)
        } else {
          entry.avista = rb(entry.avista + expense.amount)
        }
      })

      let transactions = [...d.transactions]
      let schedules = [...d.schedules]
      let accounts = [...d.accounts]
      let seq = 0
      const uid = (p) => `${p}_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2)}`

      byFatura.forEach(({ cardId, faturaRef, cardAcc, avista, parcelado }) => {
        if (parcelado === 0) return // só corrige faturas com parcelados

        const [mm, yyyy] = faturaRef.split('/')
        const dueDay = String(cardAcc?.dueDay || 10).padStart(2, '0')
        const scheduleDate = `${yyyy}-${mm}-${dueDay}`
        const resgateDate = computeScheduleDate(faturaRef, financialStartDay)
        const resgateParceladoDate = nextMonthScheduleDate(faturaRef, financialStartDay)

        const gerKey = gerencialKey(cardId, faturaRef)
        const provisionKey = `${gerKey}_provision`
        const resgateKey = `${gerKey}_resgate`
        const resgateParceladoKey = `${gerKey}_resgate_parc`
        const paymentKey = `${gerKey}_payment`

        const cartao = d.accounts.find(a => a.id === cardId)
        const apelido = cartao?.apelido || cartao?.name?.slice(0, 6) || 'CC'
        const subconta = d.accounts.find(a => a.name === `Ger. ${apelido}`)
        if (!subconta) return

        // 1. Apaga transferências imediatas erradas de parcelados
        const parceladoTxs = grupoGExpenses.filter(tx => {
          if (tx.accountId !== cardId) return false
          if (!isParcelada(tx)) return false
          const cl = d.accounts.find(a => a.id === tx.accountId)?.closingDay || 14
          let fRef
          if (tx.faturaMonthYear) {
            const [y, m] = tx.faturaMonthYear.split('-')
            fRef = `${m}/${y}`
          } else {
            fRef = computeFaturaRef(new Date(tx.date + 'T00:00:00'), cl)
          }
          return fRef === faturaRef
        })

        const etapaAToDelete = new Set()
        parceladoTxs.forEach(expense => {
          const etapaATx = transactions.find(t =>
            t.type === 'transfer' &&
            t.grupoGerencial === expense.grupoGerencial &&
            Math.abs(t.amount - expense.amount) < 0.01 &&
            t.date === expense.date &&
            t.accountId === contaPrincipal.id &&
            t.toAccountId === subconta.id
          )
          if (etapaATx) etapaAToDelete.add(etapaATx.id)
        })

        etapaAToDelete.forEach(txId => {
          const t = d.transactions.find(tx => tx.id === txId)
          if (t) {
            accounts = accounts.map(a => {
              if (a.id === t.accountId) return { ...a, balance: rb((a.balance || 0) + t.amount) }
              if (a.id === t.toAccountId) return { ...a, balance: rb((a.balance || 0) - t.amount) }
              return a
            })
          }
        })
        transactions = transactions.filter(t => !etapaAToDelete.has(t.id))

        // 2. Remove agendamentos gerenciais não executados desta fatura
        const gerKeys = new Set([provisionKey, resgateKey, resgateParceladoKey, paymentKey])
        schedules = schedules.filter(s => {
          const sKey = s.overrides?._gerencialKey
          if (!gerKeys.has(sKey)) return true
          return (s.registered || []).includes(s.startDate) || (s.skipped || []).includes(s.startDate)
        })

        // 3. Reconstrói agendamentos corretos
        if (avista > 0) {
          schedules = [...schedules, {
            id: uid('sch_ger_r'),
            transactionType: 'transfer',
            accountId: subconta.id,
            toAccountId: contaPrincipal.id,
            frequency: 'once',
            occurrenceType: 'installment',
            installments: 1,
            autoRegister: false,
            startDate: resgateDate,
            amount: avista,
            description: `Resgate Gerencial - Fatura ${faturaRef}`,
            overrides: { _gerencialKey: resgateKey, _gerencial: { faturaRef, cardId, checkingAccountId: contaPrincipal.id, gerencialContaId: subconta.id } },
            registered: [],
            skipped: [],
          }]
        }

        if (parcelado > 0) {
          schedules = [...schedules,
            {
              id: uid('sch_ger_prov'),
              transactionType: 'transfer',
              accountId: contaPrincipal.id,
              toAccountId: subconta.id,
              frequency: 'once',
              occurrenceType: 'installment',
              installments: 1,
              autoRegister: false,
              startDate: scheduleDate,
              amount: parcelado,
              description: `Provisão Gerencial - Fatura ${faturaRef}`,
              overrides: { _gerencialKey: provisionKey, _gerencial: { faturaRef, cardId, checkingAccountId: contaPrincipal.id, gerencialContaId: subconta.id } },
              registered: [],
              skipped: [],
            },
            {
              id: uid('sch_ger_rp'),
              transactionType: 'transfer',
              accountId: subconta.id,
              toAccountId: contaPrincipal.id,
              frequency: 'once',
              occurrenceType: 'installment',
              installments: 1,
              autoRegister: false,
              startDate: resgateParceladoDate,
              amount: parcelado,
              description: `Resgate Gerencial Parc. - Fatura ${faturaRef}`,
              overrides: { _gerencialKey: resgateParceladoKey, _gerencial: { faturaRef, cardId, checkingAccountId: contaPrincipal.id, gerencialContaId: subconta.id } },
              registered: [],
              skipped: [],
            },
          ]
        }

        const totalPayment = rb(avista + parcelado)
        schedules = [...schedules, {
          id: uid('sch_ger_p'),
          transactionType: 'transfer',
          accountId: contaPrincipal.id,
          toAccountId: cardId,
          frequency: 'once',
          occurrenceType: 'installment',
          installments: 1,
          autoRegister: false,
          startDate: scheduleDate,
          amount: totalPayment,
          description: `Pagamento Fatura ${faturaRef}`,
          faturaRef,
          overrides: { _gerencialKey: paymentKey, _gerencial: { faturaRef, cardId, checkingAccountId: contaPrincipal.id, gerencialContaId: subconta.id } },
          registered: [],
          skipped: [],
        }]
      })

      return { ...d, transactions, schedules, accounts }
    })
  }, [update])

  // Lista unificada de grupos de categoria: rótulos persistidos (settings.categoryGroups,
  // inclui grupos vazios) ∪ grupos efetivamente usados nas categorias (compat. com dados
  // legados/importados). Ordenada alfabeticamente (pt-BR).
  const categoryGroups = useMemo(() => {
    const set = new Set((data.settings?.categoryGroups || []).filter(Boolean))
    for (const c of data.categories) if (c.group) set.add(c.group)
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [data.settings?.categoryGroups, data.categories])

  // ── Loading screen (só aparece se localStorage também estiver vazio) ─────────
  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-center">
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-3"
            style={{ borderColor: '#0F6E56', borderTopColor: 'transparent' }}
          />
          <p className="text-gray-500 text-xs">Iniciando...</p>
        </div>
      </div>
    )
  }

  return (
    <AppContext.Provider value={{
      data,
      settings: data.settings,
      accounts: data.accounts,
      transactions: data.transactions,
      schedules: data.schedules,
      budgets: data.budgets,
      categories: data.categories,
      classificationRules: data.classificationRules,
      gerencialRules: data.gerencialRules || [],
      envelopes: data.envelopes || [],
      accountGroups: data.accountGroups || [],
      activeAccountGroups: (data.accountGroups || []).filter(g => !g.inibido),
      costCenters: data.costCenters,
      payees: data.payees,
      gerencialGroups: data.gerencialGroups,
      payables: data.payables || [],
      profiles: data.profiles || [],
      cardImports: data.cardImports || [],
      reserveFunctions: data.reserveFunctions || [],
      scheduleReservaFuncoes: data.scheduleReservaFuncoes || [],
      addReserveFunction, updateReserveFunction, deleteReserveFunction, reorderReserveFunctions,
      reservePeriods, reserveAdjustments,
      addReservePeriod, deleteReservePeriod,
      addReserveAdjustment, updateReserveAdjustment, deleteReserveAdjustment,
      addCardImport, updateCardImport, revertCardImport,
      activeProfileId, setActiveProfileId, activeProfile,
      profileAccounts, profileTransactions, profileReportTransactions, profileSchedules,
      addProfile, updateProfile, deleteProfile,
      updateSettings,
      addAccount, updateAccount, deleteAccount, setMainAccount, updateAccountValue, recalcularSaldo, saveBalanceSnapshot, restoreBalanceSnapshot,
      addTransaction, updateTransaction, deleteTransaction, reverseTransaction, reverseGerencialCascadeOnly, setReconciled, bulkUpdateTransactions, ensureGerencialState,
      rateios: data.rateios, rateiosByLancamento, saveRateiosFor, deleteRateiosFor,
      addCategory, updateCategory, deleteCategory,
      categoryGroups,
      addCategoryGroup, renameCategoryGroup, deleteCategoryGroup,
      addSchedule, updateSchedule, deleteSchedule, toggleScheduleConfirmado, findLinkedResgate,
      efetivarProvisao, getProximaProvisaoOccurrence,
      registerScheduleOccurrence, skipScheduleOccurrence,
      addBudget, updateBudget, deleteBudget,
      addRule, updateRule, deleteRule,
      addGerencialRule, updateGerencialRule, deleteGerencialRule, moveGerencialRule, classifyGerencialByRules,
      addPayee, addCostCenter,
      addGerencialGroup, updateGerencialGroup, deleteGerencialGroup,
      processarLancamentoGerencial,
      criarParcelasGerencial,
      recalcularAgendamentosFatura,
      reconciliarGerencial,
      revisarMovimentosFatura,
      ajustarParcelasGrupoGerencial,
      propagarValorParcelas,
      getProvisoesPendentes,
      executarProvisoesGerenciais,
      corrigirDadosGerencial,
      addEnvelope, updateEnvelope, deleteEnvelope,
      addAccountGroup, updateAccountGroup, deleteAccountGroup, moveAccountGroup, reorderAccountGroups, moveAccount,
      setDebtPlan, payDebtInstallment,
      addPayable, updatePayable, deletePayable, gerarContasPagarFatura, recalcContasPagarFatura,
      findMatchingSchedule, addRecurringMatchException, markScheduleRegistered,
      dbStatus,
      syncError,
      dismissSyncError: () => setSyncError(null),
      getFinancialPeriod,
      getAccountSaldos,
      getFluxoCaixaPrincipal,
      getSaldoPrincipalBreakdown,
      getNextOccurrences,
      classifyByRules,
      learnClassification,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
