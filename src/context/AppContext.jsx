import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { addMonths, addWeeks, addDays, addYears, format, parseISO } from 'date-fns'
import {
  loadFromDb, seedDefaults, pingDb,
  syncSection, syncAccounts, syncPayees, syncSettings,
  accountToRow, txToRow, scheduleToRow, categoryToRow,
  budgetToRow, ruleToRow, gerencialGroupToRow, payableToRow, envelopeToRow, accountGroupToRow, perfilToRow,
  importToRow, gerencialRuleToRow,
} from '../lib/db'
import { saveLocal, loadLocal } from '../lib/storage'
import { computeFaturaRef, computeScheduleDate, gerencialKey, nextMonthScheduleDate } from '../lib/fatura'

const rb = v => Math.round(v * 100) / 100
const INSTALL_RE = /(?<!\d)\d{1,2}\/\d{1,2}(?!\d)/

// Prev vazio para forçar full-sync ao reconectar
const EMPTY_PREV = {
  accounts: [], transactions: [], schedules: [], categories: [],
  budgets: [], classificationRules: [], gerencialGroups: [], gerencialRules: [],
  payables: [], payees: [], envelopes: [], accountGroups: [],
  profiles: [], cardImports: [],
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
  let current = parseISO(schedule.startDate)
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

const defaultData = {
  settings: {
    financialMonthStartDay: 1,
    currency: 'BRL',
    recurringMatchExceptions: [],
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
}

// Gera lançamentos automáticos de reserva (accountId: null, reservaAuto: true)
function buildReservaAutoTxs(tx, accounts, parentTxId = null) {
  if (tx.type !== 'transfer') return []
  const extraTxs = []
  const toAcc = accounts.find(a => a.id === tx.toAccountId)
  const fromAcc = accounts.find(a => a.id === tx.accountId)
  const now = new Date().toISOString()
  const base = Date.now()

  if (toAcc?.isReserva) {
    const catId = tx.reservaExpenseCategoryId ||
      (toAcc.reservaType === 'especifica' ? (toAcc.reservaCategoryId || 'cat_res_ger') : 'cat_res_ger')
    extraTxs.push({
      id: 'tx_res_' + base + '_' + Math.random().toString(36).slice(2),
      type: 'expense', accountId: null, amount: Number(tx.amount),
      categoryId: catId,
      description: `Reserva: ${toAcc.apelido || toAcc.name}`,
      date: tx.date, createdAt: now, reservaAuto: true,
      ...(parentTxId ? { parentTxId } : {}),
    })
  }

  if (fromAcc?.isReserva) {
    const catId = tx.reservaExpenseCategoryId ||
      (fromAcc.reservaType === 'especifica' ? (fromAcc.reservaCategoryId || 'cat_res_ger') : 'cat_res_ger')
    const baseId = 'tx_rsg_' + base + '_' + Math.random().toString(36).slice(2)
    extraTxs.push({
      id: baseId + '_r',
      type: 'income', accountId: null, amount: Number(tx.amount),
      categoryId: catId,
      description: `Resgate Reserva: ${fromAcc.apelido || fromAcc.name}`,
      date: tx.date, createdAt: now, reservaAuto: true,
      ...(parentTxId ? { parentTxId } : {}),
    })
    extraTxs.push({
      id: baseId + '_d',
      type: 'expense', accountId: null, amount: Number(tx.amount),
      categoryId: catId,
      description: `Resgate Reserva: ${fromAcc.apelido || fromAcc.name}`,
      date: tx.date, createdAt: now, reservaAuto: true,
      ...(parentTxId ? { parentTxId } : {}),
    })
  }

  return extraTxs
}

export function AppProvider({ children }) {
  const [data, setData] = useState(defaultData)
  const [initialized, setInitialized] = useState(false)
  const [dbStatus, setDbStatus] = useState('connecting')
  const [activeProfileId, setActiveProfileId] = useState(null) // session-only, not persisted
  const prevDataRef = useRef(null)
  const syncTimerRef = useRef(null)
  const retryTimerRef = useRef(null)
  const fullSyncRef = useRef(false)
  const autoRegisterDoneRef = useRef(false)

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
        }
        setData(() => {
          prevDataRef.current = merged  // evita sync de volta imediato
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
      if (prev.settings !== data.settings || prev.costCenters !== data.costCenters)
        tasks.push(syncSettings(data.settings, data.costCenters))

      if (tasks.length > 0) await Promise.all(tasks)
      prevDataRef.current = data
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
      profileAccountIds.has(t.accountId) || profileAccountIds.has(t.toAccountId)
    )
  }, [data.transactions, profileAccountIds, activeProfileId])

  const profileSchedules = useMemo(() => {
    if (!activeProfileId) return data.schedules
    return data.schedules.filter(s => !s.accountId || profileAccountIds.has(s.accountId))
  }, [data.schedules, profileAccountIds, activeProfileId])

  // ── Registrar automático na inicialização ───────────────────────────────────
  useEffect(() => {
    if (!initialized || autoRegisterDoneRef.current) return
    autoRegisterDoneRef.current = true
    const todayStr = format(new Date(), 'yyyy-MM-dd')

    setData(prev => {
      let schedules = prev.schedules
      let accounts = prev.accounts
      let transactions = prev.transactions
      let changed = false

      for (const schedule of prev.schedules) {
        if (!schedule.autoRegister) continue
        const pending = computePendingUpTo(schedule, todayStr)
        if (pending.length === 0) continue

        for (const date of pending) {
          changed = true
          const txId = 'tx_auto_' + Date.now() + '_' + Math.random().toString(36).slice(2)
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
            { type: schedule.transactionType, accountId: schedule.accountId, toAccountId: schedule.toAccountId, amount: schedule.amount, date, reservaExpenseCategoryId: schedule.reservaExpenseCategoryId },
            accounts,
            txId
          )
          transactions = [...transactions, newTx, ...autoTxs]
          schedules = schedules.map(s => s.id === schedule.id
            ? { ...s, registered: [...(s.registered || []), date] } : s)
        }
      }

      if (!changed) return prev
      return { ...prev, schedules, accounts, transactions }
    })
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
    const id = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    const newTx = { ...tx, id, amount: Number(tx.amount), createdAt: new Date().toISOString() }
    update(d => {
      let accounts = [...d.accounts]
      if (tx.type === 'income') {
        accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: rb(a.balance + Number(tx.amount)) } : a)
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
        accounts = accounts.map(a => {
          if (a.id === tx.accountId) return { ...a, balance: rb(a.balance - Number(tx.amount)) }
          if (a.id === tx.toAccountId) return { ...a, balance: rb(a.balance + Number(tx.amount)) }
          return a
        })
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

      const extraTxs = buildReservaAutoTxs(tx, d.accounts, id)
      return { ...d, accounts, transactions: [...d.transactions, newTx, ...extraTxs] }
    })
    return id
  }, [update])

  const addCardImport = useCallback((imp) => {
    update(d => ({ ...d, cardImports: [imp, ...(d.cardImports || [])] }))
  }, [update])

  const updateCardImport = useCallback((id, changes) => {
    update(d => ({ ...d, cardImports: (d.cardImports || []).map(i => i.id === id ? { ...i, ...changes } : i) }))
  }, [update])

  const revertCardImport = useCallback((importId) => {
    update(d => {
      const imp = (d.cardImports || []).find(i => i.id === importId)
      if (!imp) return d
      const txIds = new Set(imp.txIds || [])
      const txs = d.transactions.filter(t => txIds.has(t.id))
      let accounts = [...d.accounts]
      let schedules = d.schedules
      let transactions = d.transactions

      for (const tx of txs) {
        // Revert balance impact
        if (tx.type === 'expense' && tx.accountType === 'credit') {
          accounts = accounts.map(a => a.id === tx.accountId ? {
            ...a,
            creditDebt: Math.max(0, (a.creditDebt || 0) - tx.amount),
            creditMonthBill: Math.max(0, (a.creditMonthBill || 0) - tx.amount),
          } : a)
        } else if (tx.type === 'income') {
          accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: rb(a.balance - tx.amount) } : a)
        } else if (tx.type === 'expense') {
          accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: rb(a.balance + tx.amount) } : a)
        } else if (tx.type === 'transfer') {
          accounts = accounts.map(a => {
            if (a.id === tx.accountId) return { ...a, balance: rb(a.balance + tx.amount) }
            if (a.id === tx.toAccountId) return { ...a, balance: rb(a.balance - tx.amount) }
            return a
          })
        }

        // Grupo G cascade: decrement/delete schedules created by processarLancamentoGerencial
        if (tx.grupoGerencial && tx.type === 'expense' && tx.accountType === 'credit') {
          const grupo = d.gerencialGroups?.find(g => g.id === tx.grupoGerencial)
          if (grupo && grupo.number !== 'D') {
            const cardAccount = d.accounts.find(a => a.id === tx.accountId)
            const closingDay = cardAccount?.closingDay || 14
            let faturaRef
            if (tx.faturaMonthYear) {
              const [y, m] = tx.faturaMonthYear.split('-')
              faturaRef = `${m}/${y}`
            } else {
              faturaRef = computeFaturaRef(new Date(tx.date + 'T00:00:00'), closingDay)
            }

            if (grupo.number === 1) {
              // A transferência etapaA é removida via txIds; aqui só decrementa os agendamentos
              // (resgate + pagamento; provision/resgate_parc legadas mantidas por segurança).
              const gerKey = gerencialKey(tx.accountId, faturaRef)
              const keysToDecrement = new Set([
                `${gerKey}_resgate`, `${gerKey}_payment`, `${gerKey}_provision`, `${gerKey}_resgate_parc`,
              ])
              schedules = schedules.map(s => {
                const sKey = s.overrides?._gerencialKey
                if (!keysToDecrement.has(sKey)) return s
                if ((s.registered || []).includes(s.startDate)) return s
                return { ...s, amount: Math.max(0, rb((s.amount || 0) - tx.amount)) }
              })
            } else {
              // Numbered group (2, 3, 4…): resgate + contribuição no pagamento da fatura
              const dueDay = cardAccount?.dueDay || 10
              const [fmm, fyyyy] = faturaRef.split('/')
              const dueDate = `${fyyyy}-${fmm}-${String(dueDay).padStart(2, '0')}`
              const gerKey = `ger_num_${tx.grupoGerencial}_${tx.accountId}_${dueDate}`
              const paymentKey = `${gerencialKey(tx.accountId, faturaRef)}_payment`
              schedules = schedules.map(s => {
                const sKey = s.overrides?._gerencialKey
                if (sKey !== gerKey && sKey !== paymentKey) return s
                if ((s.registered || []).includes(s.startDate)) return s
                return { ...s, amount: Math.max(0, rb((s.amount || 0) - tx.amount)) }
              })
            }
          }
        }
      }

      // Delete schedules created by criarParcelasGerencial (linked via _originTxId to any main tx)
      schedules = schedules.filter(s => !txIds.has(s.overrides?._originTxId))

      // Remove imported txs + reservaAuto linked to them
      transactions = transactions.filter(t =>
        !txIds.has(t.id) &&
        !(t.reservaAuto && txIds.has(t.parentTxId))
      )

      // Delete pending payables generated for this import.
      // Match by mesAno (primary) or by bill date range overlapping with imported tx dates (fallback,
      // handles cases where imp.mesAno diverged from the payable's mesAno in older imports).
      const impExpenseDates = txs
        .filter(t => t.type === 'expense' && t.date)
        .map(t => t.date)
      const payables = (d.payables || []).filter(p => {
        if (p.cartaoId !== imp.accountId) return true   // different card — keep
        if (p.status === 'paid') return true             // already paid — keep
        if (imp.mesAno && p.mesAno === imp.mesAno) return false  // mesAno match — remove
        // Fallback: any imported expense date falls within this payable's bill window
        if (p.billStart && p.billEnd && impExpenseDates.some(dt => dt >= p.billStart && dt <= p.billEnd))
          return false
        return true
      })

      return {
        ...d,
        accounts,
        schedules,
        transactions,
        payables,
        cardImports: (d.cardImports || []).filter(i => i.id !== importId),
      }
    })
  }, [update])

  const updateTransaction = useCallback((id, changes) => {
    update(d => ({ ...d, transactions: d.transactions.map(t => t.id === id ? { ...t, ...changes } : t) }))
  }, [update])

  const deleteTransaction = useCallback((id) => {
    update(d => {
      const tx = d.transactions.find(t => t.id === id)
      if (!tx) return d
      let accounts = [...d.accounts]
      if (tx.type === 'income') {
        accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: rb(a.balance - tx.amount) } : a)
      } else if (tx.type === 'expense') {
        if (tx.accountType === 'credit') {
          accounts = accounts.map(a => a.id === tx.accountId ? {
            ...a,
            creditDebt: Math.max(0, (a.creditDebt || 0) - tx.amount),
            creditMonthBill: Math.max(0, (a.creditMonthBill || 0) - tx.amount),
          } : a)
        } else {
          accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: rb(a.balance + tx.amount) } : a)
        }
      } else if (tx.type === 'transfer') {
        accounts = accounts.map(a => {
          if (a.id === tx.accountId) return { ...a, balance: rb(a.balance + tx.amount) }
          if (a.id === tx.toAccountId) return { ...a, balance: rb(a.balance - tx.amount) }
          return a
        })
      }

      let schedules = d.schedules
      let transactions = d.transactions.filter(t => t.id !== id)

      // Grupo G cascade (à vista: remove etapaA; parcelado: ajusta agendamentos)
      if (tx.grupoGerencial && tx.type === 'expense' && tx.accountType === 'credit') {
        const cardAccount = d.accounts.find(a => a.id === tx.accountId)
        const closingDay = cardAccount?.closingDay || 14
        let faturaRef
        if (tx.faturaMonthYear) {
          const [y, m] = tx.faturaMonthYear.split('-')
          faturaRef = `${m}/${y}`
        } else {
          faturaRef = computeFaturaRef(new Date(tx.date + 'T00:00:00'), closingDay)
        }
        // Grupo G e parcelado seguem o mesmo fluxo (provisão imediata): remove a transferência
        // etapaA e decrementa resgate + pagamento da fatura. (provision/resgate_parc são chaves
        // legadas — mantidas no conjunto por segurança.)
        const gerKey = gerencialKey(tx.accountId, faturaRef)
        const keysToDecrement = new Set([
          `${gerKey}_resgate`, `${gerKey}_payment`, `${gerKey}_provision`, `${gerKey}_resgate_parc`,
        ])
        const etapaATx = d.transactions.find(t =>
          t.id !== id &&
          t.type === 'transfer' &&
          t.grupoGerencial === tx.grupoGerencial &&
          Math.abs(t.amount - tx.amount) < 0.01 &&
          t.date === tx.date
        )
        if (etapaATx) {
          accounts = accounts.map(a => {
            if (a.id === etapaATx.accountId) return { ...a, balance: rb(a.balance + etapaATx.amount) }
            if (a.id === etapaATx.toAccountId) return { ...a, balance: rb(a.balance - etapaATx.amount) }
            return a
          })
          transactions = transactions.filter(t => t.id !== etapaATx.id)
        }
        schedules = schedules.map(s => {
          const sKey = s.overrides?._gerencialKey
          if (!keysToDecrement.has(sKey)) return s
          if ((s.registered || []).includes(s.startDate)) return s
          return { ...s, amount: Math.max(0, rb((s.amount || 0) - tx.amount)) }
        })
      }

      // Agendamento numérico gerencial
      if (tx.gerencialScheduleId) {
        const sch = schedules.find(s => s.id === tx.gerencialScheduleId)
        if (sch) {
          const done = (sch.registered || []).includes(sch.startDate) || (sch.skipped || []).includes(sch.startDate)
          if (!done) {
            const newAmt = Math.max(0, Math.round(((sch.amount || 0) - tx.amount) * 100) / 100)
            schedules = newAmt <= 0
              ? schedules.filter(s => s.id !== tx.gerencialScheduleId)
              : schedules.map(s => s.id === tx.gerencialScheduleId ? { ...s, amount: newAmt } : s)
          }
        }
      }
      // Cascade: parcelas 2..N criadas por criarParcelasGerencial
      schedules = schedules.reduce((acc, s) => {
        if (s.overrides?._originTxId !== id) { acc.push(s); return acc }
        const done = (s.registered || []).includes(s.startDate) || (s.skipped || []).includes(s.startDate)
        if (done) { acc.push(s); return acc }
        if (s.overrides?._gerencialKey) {
          const originAmt = s.overrides._originAmount || s.amount
          const newAmt = Math.max(0, Math.round(((s.amount || 0) - originAmt) * 100) / 100)
          if (newAmt > 0) acc.push({ ...s, amount: newAmt })
        }
        return acc
      }, [])

      // Remove reservaAuto txs linked to this transaction
      transactions = transactions.filter(t => !(t.reservaAuto && t.parentTxId === id))

      return { ...d, accounts, schedules, transactions }
    })
  }, [update])

  const reverseTransaction = useCallback((id) => {
    update(d => {
      const tx = d.transactions.find(t => t.id === id)
      if (!tx) return d
      let accounts = [...d.accounts]
      if (tx.type === 'income') {
        accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: rb(a.balance - tx.amount) } : a)
      } else if (tx.type === 'expense') {
        if (tx.accountType === 'credit') {
          accounts = accounts.map(a => a.id === tx.accountId ? {
            ...a,
            creditDebt: Math.max(0, (a.creditDebt || 0) - tx.amount),
            creditMonthBill: Math.max(0, (a.creditMonthBill || 0) - tx.amount),
          } : a)
        } else {
          accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: rb(a.balance + tx.amount) } : a)
        }
      } else if (tx.type === 'transfer') {
        accounts = accounts.map(a => {
          if (a.id === tx.accountId) return { ...a, balance: rb(a.balance + tx.amount) }
          if (a.id === tx.toAccountId) return { ...a, balance: rb(a.balance - tx.amount) }
          return a
        })
      }
      let schedules = d.schedules
      if (tx.scheduleId) {
        schedules = d.schedules.map(s =>
          s.id === tx.scheduleId
            ? { ...s, registered: (s.registered || []).filter(r => r !== tx.date) }
            : s
        )
      }
      let transactions = d.transactions.filter(t => t.id !== id)

      // Cascata para lançamentos gerenciais (grupo 1 — cartão de crédito)
      if (tx.grupoGerencial && tx.type === 'expense' && tx.accountType === 'credit') {
        const cardAccount = d.accounts.find(a => a.id === tx.accountId)
        const closingDay = cardAccount?.closingDay || 14
        let faturaRef
        if (tx.faturaMonthYear) {
          const [y, m] = tx.faturaMonthYear.split('-')
          faturaRef = `${m}/${y}`
        } else {
          faturaRef = computeFaturaRef(new Date(tx.date + 'T00:00:00'), closingDay)
        }
        // Grupo G e parcelado seguem o mesmo fluxo: remove a transferência etapaA e decrementa
        // resgate + pagamento da fatura (provision/resgate_parc legadas mantidas por segurança).
        const gerKey = gerencialKey(tx.accountId, faturaRef)
        const keysToDecrement = new Set([
          `${gerKey}_resgate`, `${gerKey}_payment`, `${gerKey}_provision`, `${gerKey}_resgate_parc`,
        ])
        const etapaATx = d.transactions.find(t =>
          t.id !== id &&
          t.type === 'transfer' &&
          t.grupoGerencial === tx.grupoGerencial &&
          Math.abs(t.amount - tx.amount) < 0.01 &&
          t.date === tx.date
        )
        if (etapaATx) {
          accounts = accounts.map(a => {
            if (a.id === etapaATx.accountId) return { ...a, balance: rb(a.balance + etapaATx.amount) }
            if (a.id === etapaATx.toAccountId) return { ...a, balance: rb(a.balance - etapaATx.amount) }
            return a
          })
          transactions = transactions.filter(t => t.id !== etapaATx.id)
        }
        schedules = schedules.map(s => {
          const sKey = s.overrides?._gerencialKey
          if (!keysToDecrement.has(sKey)) return s
          if ((s.registered || []).includes(s.startDate)) return s
          return { ...s, amount: Math.max(0, rb((s.amount || 0) - tx.amount)) }
        })
      }

      // Estorno em cadeia: agendamento numérico gerencial
      if (tx.gerencialScheduleId) {
        const sch = schedules.find(s => s.id === tx.gerencialScheduleId)
        if (sch) {
          const done = (sch.registered || []).includes(sch.startDate) || (sch.skipped || []).includes(sch.startDate)
          if (!done) {
            const newAmt = Math.max(0, Math.round(((sch.amount || 0) - tx.amount) * 100) / 100)
            schedules = newAmt <= 0
              ? schedules.filter(s => s.id !== tx.gerencialScheduleId)
              : schedules.map(s => s.id === tx.gerencialScheduleId ? { ...s, amount: newAmt } : s)
          }
        }
      }
      // Cascade: parcelas 2..N criadas por criarParcelasGerencial
      schedules = schedules.reduce((acc, s) => {
        if (s.overrides?._originTxId !== id) { acc.push(s); return acc }
        const done = (s.registered || []).includes(s.startDate) || (s.skipped || []).includes(s.startDate)
        if (done) { acc.push(s); return acc }
        if (s.overrides?._gerencialKey) {
          const originAmt = s.overrides._originAmount || s.amount
          const newAmt = Math.max(0, Math.round(((s.amount || 0) - originAmt) * 100) / 100)
          if (newAmt > 0) acc.push({ ...s, amount: newAmt })
        }
        return acc
      }, [])

      // Remove reservaAuto txs linked to this transaction
      transactions = transactions.filter(t => !(t.reservaAuto && t.parentTxId === id))

      return { ...d, accounts, transactions, schedules }
    })
  }, [update])

  // Reverte apenas as automações gerenciais (ETAPA A + agendamentos) sem tocar na própria tx
  const reverseGerencialCascadeOnly = useCallback((tx) => {
    if (!tx?.grupoGerencial || tx.type !== 'expense' || tx.accountType !== 'credit') return
    update(d => {
      const cardAccount = d.accounts.find(a => a.id === tx.accountId)
      const closingDay = cardAccount?.closingDay || 14
      let faturaRef
      if (tx.faturaMonthYear) {
        const [y, m] = tx.faturaMonthYear.split('-')
        faturaRef = `${m}/${y}`
      } else {
        faturaRef = computeFaturaRef(new Date(tx.date + 'T00:00:00'), closingDay)
      }
      const gerKey = gerencialKey(tx.accountId, faturaRef)
      const keysToDecrement = new Set([
        `${gerKey}_resgate`, `${gerKey}_payment`, `${gerKey}_provision`, `${gerKey}_resgate_parc`,
      ])

      let accounts = [...d.accounts]
      let transactions = d.transactions

      // Grupo G (provisão imediata): remove a transferência etapaA e decrementa resgate + pagamento
      const etapaATx = d.transactions.find(t =>
        t.type === 'transfer' &&
        t.grupoGerencial === tx.grupoGerencial &&
        Math.abs(t.amount - tx.amount) < 0.01 &&
        t.date === tx.date
      )
      if (etapaATx) {
        accounts = accounts.map(a => {
          if (a.id === etapaATx.accountId) return { ...a, balance: rb(a.balance + etapaATx.amount) }
          if (a.id === etapaATx.toAccountId) return { ...a, balance: rb(a.balance - etapaATx.amount) }
          return a
        })
        transactions = transactions.filter(t => t.id !== etapaATx.id)
      }
      let schedules = d.schedules.map(s => {
        const sKey = s.overrides?._gerencialKey
        if (!keysToDecrement.has(sKey)) return s
        if ((s.registered || []).includes(s.startDate)) return s
        return { ...s, amount: Math.max(0, rb((s.amount || 0) - tx.amount)) }
      })

      // Limpa placeholders de parcelas 2..N (G1 — sem _gerencialKey) não registrados
      schedules = schedules.filter(s => {
        if (s.overrides?._originTxId !== tx.id) return true
        const done = (s.registered || []).includes(s.startDate) || (s.skipped || []).includes(s.startDate)
        return done
      })

      return { ...d, accounts, transactions, schedules }
    })
  }, [update])

  // ── Categories ──────────────────────────────────────────────────────────────
  const addCategory = useCallback((category) => {
    const id = 'cat_' + Date.now()
    update(d => ({ ...d, categories: [...d.categories, { ...category, id }] }))
  }, [update])

  const deleteCategory = useCallback((id) => {
    update(d => ({ ...d, categories: d.categories.filter(c => c.id !== id) }))
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

  const deleteSchedule = useCallback((id) => {
    update(d => ({ ...d, schedules: d.schedules.filter(s => s.id !== id) }))
  }, [update])

  const registerScheduleOccurrence = useCallback((scheduleId, date) => {
    update(d => {
      const schedule = d.schedules.find(s => s.id === scheduleId)
      if (!schedule) return d
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
        origin: 'agendamento',
      }
      const newTxId = 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2)
      const newTx = { ...tx, id: newTxId, createdAt: new Date().toISOString() }
      let accounts = [...d.accounts]
      if (tx.type === 'income') {
        accounts = accounts.map(a => a.id === tx.accountId ? { ...a, balance: rb(a.balance + Number(tx.amount)) } : a)
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
        accounts = accounts.map(a => {
          if (a.id === tx.accountId) return { ...a, balance: rb(a.balance - Number(tx.amount)) }
          if (a.id === tx.toAccountId) return { ...a, balance: rb(a.balance + Number(tx.amount)) }
          return a
        })
      }
      const autoTxs = buildReservaAutoTxs(
        { type: tx.type, accountId: tx.accountId, toAccountId: tx.toAccountId, amount: tx.amount, date, reservaExpenseCategoryId: schedule.reservaExpenseCategoryId },
        accounts,
        newTxId
      )
      return {
        ...d, accounts,
        transactions: [...d.transactions, newTx, ...autoTxs],
        schedules: d.schedules.map(s =>
          s.id === scheduleId ? { ...s, registered: [...(s.registered || []), date] } : s
        ),
      }
    })
  }, [update])

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
    const id = 'rule_' + Date.now()
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
    const startDay = data.settings.financialMonthStartDay || 1
    const ref = new Date(referenceDate)
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
  }, [data.settings.financialMonthStartDay])

  // ── Schedule Occurrences ─────────────────────────────────────────────────────
  const getNextOccurrences = useCallback((schedule, count = 12) => {
    const occurrences = []
    const registered = schedule.registered || []
    const skipped = schedule.skipped || []
    let current = parseISO(schedule.startDate)
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
    return best ? { categoryId: best.categoryId, payee: best.payee || '', grupoGerencial: best.grupoGerencial || null } : null
  }, [data.classificationRules])

  const learnClassification = useCallback((description, categoryId, payee, { dayOfMonth = null, amountApprox = null, grupoGerencial = null } = {}) => {
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
        return { ...d, classificationRules: d.classificationRules.map(r => r.id === exact.id ? { ...r, categoryId, payee: payee || r.payee, grupoGerencial: grupoGerencial || r.grupoGerencial } : r) }
      }
      return { ...d, classificationRules: [...d.classificationRules, { id: 'rule_' + Date.now(), contains: keyword, categoryId, payee: payee || '', dayOfMonth, amountApprox, grupoGerencial }] }
    })
  }, [update])

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

  const gerarContasPagarFatura = useCallback((cartaoId, billStart, billEnd, mesAno) => {
    update(d => {
      const card = d.accounts.find(a => a.id === cartaoId)
      if (!card) return d

      const grpDId = d.gerencialGroups.find(g => g.number === 'D')?.id || 'grp_D'
      const existingKeys = new Set(
        (d.payables || []).map(p => `${p.cartaoId}|${p.mesAno}|${p.grupoGerencialId}`)
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

      const newPayables = []
      for (const [grupoId, amount] of Object.entries(groups)) {
        const key = `${cartaoId}|${mesAno}|${grupoId}`
        if (existingKeys.has(key)) continue
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
        })
      }

      if (newPayables.length === 0) return d
      return { ...d, payables: [...(d.payables || []), ...newPayables] }
    })
  }, [update])

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
          ? { ...s, registered: [...(s.registered || []).filter(d => d !== date), date] }
          : s
      ),
    }))
  }, [update])

  // ── Gerencial Processing ──────────────────────────────────────────────────────
  const processarLancamentoGerencial = useCallback((lancamento, grupoId, contaDestinoId = null, options = {}) => {
    // immediate=false: parcela futura (gerada na importação) — cria apenas os agendamentos
    // (resgate + pagamento); a transferência imediata Conta → Ger. só ocorre na parcela da
    // fatura corrente (quando ela for de fato importada/lançada no mês dela).
    const { immediate = true } = options
    const grupo = data.gerencialGroups?.find(g => g.id === grupoId)
    if (!grupo) return { needsResgate: false }
    if (grupo.number === 'D') return { needsResgate: false }

    if (grupo.number === 1) {
      // Pre-compute fatura data using current data snapshot (outside update)
      const cardAccount = data.accounts.find(a => a.id === lancamento.accountId)
      const closingDay = cardAccount?.closingDay || 14
      const txDate = new Date(lancamento.date + 'T00:00:00')

      // Use faturaMonthYear when provided (parcelados 2..N have dueDay dates that shift fatura)
      let faturaRef
      if (lancamento.faturaMonthYear) {
        const [y, m] = lancamento.faturaMonthYear.split('-')
        faturaRef = `${m}/${y}`
      } else {
        faturaRef = computeFaturaRef(txDate, closingDay)
      }

      const [mm, yyyy] = faturaRef.split('/')
      const dueDay = String(cardAccount?.dueDay || 10).padStart(2, '0')
      const scheduleDate = `${yyyy}-${mm}-${dueDay}` // vencimento: Conta → Cartão

      const financialStartDay = data.settings?.financialMonthStartDay || 1
      const resgateDate = computeScheduleDate(faturaRef, financialStartDay) // resgate: Ger. → Conta no dia financeiro

      const gerKey = gerencialKey(lancamento.accountId, faturaRef)
      const resgateKey = `${gerKey}_resgate`
      const paymentKey = `${gerKey}_payment`
      const txDescription = lancamento.description || ''
      // Parcela da fatura corrente: provisão imediata Conta → Ger. + resgate no dia financeiro
      // + pagamento no vencimento. Parcela futura (immediate=false): só os agendamentos.
      const etapaATxId = immediate ? ('tx_ger_' + Date.now() + '_' + Math.random().toString(36).slice(2)) : null

      update(d => {
        const cartao = d.accounts.find(a => a.id === lancamento.accountId)
        const apelido = cartao?.apelido || cartao?.name?.slice(0, 6) || 'CC'
        const subcontaName = `Ger. ${apelido}`

        // Usa a conta explicitamente selecionada pelo usuário; fallback p/ legado/importação
        const contaPrincipal = contaDestinoId
          ? d.accounts.find(a => a.id === contaDestinoId)
          : d.accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal) ||
            d.accounts.find(a => a.isMain && a.type !== 'credit') ||
            d.accounts.find(a => a.type === 'checking')

        if (!contaPrincipal) return d

        let accounts = [...d.accounts]
        let subcontaId = d.accounts.find(a => a.name === subcontaName)?.id

        if (!subcontaId) {
          subcontaId = 'acc_ger_' + Date.now()
          accounts = [...accounts, {
            id: subcontaId,
            name: subcontaName,
            type: 'checking',
            balance: immediate ? lancamento.amount : 0,
            bank: contaPrincipal.bank || '',
            apelido: `G${apelido}`.slice(0, 8),
            fluxoCaixaPrincipal: false,
            isMain: false,
            contaCorrentePrincipal: false,
            grupoGerencial: grupoId,
            accountGroupId: contaPrincipal.accountGroupId || null,
          }]
        } else if (immediate) {
          accounts = accounts.map(a =>
            a.id === subcontaId
              ? {
                  ...a,
                  balance: rb((a.balance || 0) + lancamento.amount),
                  accountGroupId: contaPrincipal.accountGroupId || a.accountGroupId || null,
                  bank: a.bank || contaPrincipal.bank || '',
                }
              : a
          )
        }

        // ETAPA A: transferência imediata Conta Principal → Ger. subconta (só na parcela corrente)
        let newTxs = []
        if (immediate) {
          accounts = accounts.map(a =>
            a.id === contaPrincipal.id ? { ...a, balance: rb((a.balance || 0) - lancamento.amount) } : a
          )
          newTxs = [{
            id: etapaATxId,
            type: 'transfer',
            accountId: contaPrincipal.id,
            toAccountId: subcontaId,
            amount: lancamento.amount,
            date: lancamento.date,
            description: txDescription ? `Reserva Gerencial - ${txDescription}` : `Provisão ${subcontaName}`,
            grupoGerencial: grupoId,
            createdAt: new Date().toISOString(),
          }]
        }

        let schedules = [...d.schedules]

        // ETAPA B: Resgate Ger. → Conta Principal no dia financeiro do mês da fatura (acumulativo)
        const resgateIdx = schedules.findIndex(s => s.overrides?._gerencialKey === resgateKey)
        if (resgateIdx >= 0) {
          schedules = schedules.map((s, i) => i === resgateIdx
            ? { ...s, amount: rb((s.amount || 0) + lancamento.amount) }
            : s
          )
        } else {
          schedules = [...schedules, {
            id: 'sch_ger_r_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            transactionType: 'transfer',
            accountId: subcontaId,
            toAccountId: contaPrincipal.id,
            frequency: 'once',
            occurrenceType: 'installment',
            installments: 1,
            autoRegister: false,
            startDate: resgateDate,
            amount: lancamento.amount,
            description: `Resgate Ger. ${apelido} - Fatura ${faturaRef}`,
            overrides: {
              _gerencialKey: resgateKey,
              _gerencial: { faturaRef, cardId: lancamento.accountId, checkingAccountId: contaPrincipal.id, gerencialContaId: subcontaId },
            },
            registered: [],
            skipped: [],
          }]
        }

        // ETAPA C: Pagamento fatura (Conta Principal → Cartão) — acumulativo para à vista e parcelados
        const paymentIdx = schedules.findIndex(s => s.overrides?._gerencialKey === paymentKey)
        if (paymentIdx >= 0) {
          schedules = schedules.map((s, i) => i === paymentIdx
            ? { ...s, amount: rb((s.amount || 0) + lancamento.amount) }
            : s
          )
        } else {
          schedules = [...schedules, {
            id: 'sch_ger_p_' + Date.now() + '_' + Math.random().toString(36).slice(2),
            transactionType: 'transfer',
            accountId: contaPrincipal.id,
            toAccountId: lancamento.accountId,
            frequency: 'once',
            occurrenceType: 'installment',
            installments: 1,
            autoRegister: false,
            startDate: scheduleDate,
            amount: lancamento.amount,
            description: `Pagamento Fatura ${apelido} ${faturaRef}`,
            overrides: {
              _gerencialKey: paymentKey,
              _gerencial: { faturaRef, cardId: lancamento.accountId, checkingAccountId: contaPrincipal.id, gerencialContaId: subcontaId },
            },
            registered: [],
            skipped: [],
          }]
        }

        return { ...d, accounts, transactions: [...d.transactions, ...newTxs], schedules }
      })
      return { needsResgate: false, faturaRef, scheduleDate, etapaATxId }
    }

    // Grupos numerados (2, 3, 4…): resgate (conta do grupo → Conta Principal) no início do mês
    // financeiro + contribuição no pagamento da fatura (Conta Principal → Cartão no vencimento),
    // compartilhado com o Grupo G para fechar o total real da fatura.
    if (!grupo.defaultAccountId) return { needsResgate: false }

    const cardAccount = data.accounts.find(a => a.id === lancamento.accountId)
    const closingDay = cardAccount?.closingDay || 14
    const dueDay = cardAccount?.dueDay || 10
    const apelido = cardAccount?.apelido || cardAccount?.name?.slice(0, 6) || 'CC'

    // Usa faturaMonthYear quando disponível (mesma convenção do Grupo G e dos estornos)
    let faturaRef
    if (lancamento.faturaMonthYear) {
      const [y, m] = lancamento.faturaMonthYear.split('-')
      faturaRef = `${m}/${y}`
    } else {
      faturaRef = computeFaturaRef(new Date(lancamento.date + 'T00:00:00'), closingDay)
    }
    const [fmm, fyyyy] = faturaRef.split('/')
    const dueDate = `${fyyyy}-${fmm}-${String(dueDay).padStart(2, '0')}` // resgate e pagamento no vencimento
    const gerKey = `ger_num_${grupoId}_${lancamento.accountId}_${dueDate}`
    const paymentKey = `${gerencialKey(lancamento.accountId, faturaRef)}_payment`

    // Resolve schedule ID before update() — check current snapshot
    const existingSch = data.schedules.find(s => s.overrides?._gerencialKey === gerKey)
    const scheduleId = existingSch
      ? existingSch.id
      : 'sch_ger_num_' + Date.now() + '_' + Math.random().toString(36).slice(2)

    update(d => {
      const contaPrincipal = d.accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal)
        || d.accounts.find(a => a.isMain && a.type !== 'credit')
        || d.accounts.find(a => a.type === 'checking')
      if (!contaPrincipal) return d

      let schedules = [...d.schedules]

      // Resgate: conta do grupo → Conta Principal, no vencimento da fatura (acumulativo)
      const idx = schedules.findIndex(s => s.overrides?._gerencialKey === gerKey)
      if (idx >= 0) {
        schedules = schedules.map((s, i) => i === idx
          ? { ...s, amount: rb((s.amount || 0) + lancamento.amount) }
          : s
        )
      } else {
        schedules = [...schedules, {
          id: scheduleId,
          transactionType: 'transfer',
          accountId: grupo.defaultAccountId,
          toAccountId: contaPrincipal.id,
          frequency: 'once',
          occurrenceType: 'installment',
          installments: 1,
          autoRegister: false,
          startDate: dueDate,
          amount: lancamento.amount,
          description: `Resgate ${grupo.name} - ${apelido} - Fatura ${faturaRef}`,
          overrides: { _gerencialKey: gerKey },
          registered: [],
          skipped: [],
        }]
      }

      // Pagamento da fatura: Conta Principal → Cartão no vencimento (compartilhado com o Grupo G)
      const payIdx = schedules.findIndex(s => s.overrides?._gerencialKey === paymentKey)
      if (payIdx >= 0) {
        schedules = schedules.map((s, i) => i === payIdx
          ? { ...s, amount: rb((s.amount || 0) + lancamento.amount) }
          : s
        )
      } else {
        schedules = [...schedules, {
          id: 'sch_ger_p_' + Date.now() + '_' + Math.random().toString(36).slice(2),
          transactionType: 'transfer',
          accountId: contaPrincipal.id,
          toAccountId: lancamento.accountId,
          frequency: 'once',
          occurrenceType: 'installment',
          installments: 1,
          autoRegister: false,
          startDate: dueDate,
          amount: lancamento.amount,
          description: `Pagamento Fatura ${apelido} ${faturaRef}`,
          overrides: {
            _gerencialKey: paymentKey,
            _gerencial: { faturaRef, cardId: lancamento.accountId, checkingAccountId: contaPrincipal.id },
          },
          registered: [],
          skipped: [],
        }]
      }

      return { ...d, schedules }
    })

    return { needsResgate: false, gerencialScheduleId: scheduleId, scheduleDate: dueDate }
  }, [data.gerencialGroups, data.accounts, data.schedules, data.settings, update])

  // ── Parcelado gerencial: cria agendamentos futuros para parcelas startFromInstallment..N ──
  const criarParcelasGerencial = useCallback((rootTxId, {
    accountId, amount, date, grupoGerencialId, installments,
    startFromInstallment = 2,   // default 2 (TransactionForm); import X>1 passa X+1
    baseFaturaMonthYear = null, // fatura da parcela importada (formato "YYYY-MM")
    baseInstallmentNum = 1,     // número da parcela importada (1 = normal)
  }) => {
    if (!installments || installments <= 1) return
    if (startFromInstallment > installments) return
    const grupo = data.gerencialGroups?.find(g => g.id === grupoGerencialId)
    if (!grupo || grupo.number === 'D') return

    const cardAccount = data.accounts.find(a => a.id === accountId)
    const closingDay = cardAccount?.closingDay || 14
    const dueDay = cardAccount?.dueDay || 10
    const apelido = cardAccount?.apelido || cardAccount?.name?.slice(0, 6) || 'CC'

    // Determina baseYear/baseMonth0 = mês da fatura da parcela 1
    let baseYear, baseMonth0
    if (baseFaturaMonthYear && baseInstallmentNum > 1) {
      // Import de parcela X>1: regride (X-1) meses para chegar na fatura da parcela 1
      const [fyRaw, fmRaw] = baseFaturaMonthYear.split('-').map(Number)
      const d1 = new Date(fyRaw, fmRaw - 1 - (baseInstallmentNum - 1), 1)
      baseYear = d1.getFullYear()
      baseMonth0 = d1.getMonth()
    } else {
      const txDate = new Date(date + 'T00:00:00')
      const faturaRef1 = computeFaturaRef(txDate, closingDay)
      const [fmm1, fyyyy1] = faturaRef1.split('/')
      baseYear = Number(fyyyy1)
      baseMonth0 = Number(fmm1) - 1
    }

    if (typeof grupo.number === 'number' && grupo.number !== 1) {
      if (!grupo.defaultAccountId) return
      update(d => {
        const contaPrincipal = d.accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal)
          || d.accounts.find(a => a.isMain && a.type !== 'credit')
          || d.accounts.find(a => a.type === 'checking')
        if (!contaPrincipal) return d
        let schedules = [...d.schedules]
        for (let i = startFromInstallment; i <= installments; i++) {
          const dI = new Date(baseYear, baseMonth0 + (i - 1), dueDay)
          const fmI = String(dI.getMonth() + 1).padStart(2, '0')
          const fyI = dI.getFullYear()
          const faturaRefI = `${fmI}/${fyI}`
          const dueDateStr = `${fyI}-${fmI}-${String(dueDay).padStart(2, '0')}`
          const gerKeyI = `ger_num_${grupoGerencialId}_${accountId}_${dueDateStr}`
          const payKeyI = `${gerencialKey(accountId, faturaRefI)}_payment`

          // Resgate: conta do grupo → Conta Principal, no vencimento da fatura
          const existingIdx = schedules.findIndex(s => s.overrides?._gerencialKey === gerKeyI)
          if (existingIdx >= 0) {
            schedules = schedules.map((s, idx) => idx === existingIdx
              ? { ...s, amount: rb((s.amount || 0) + amount) }
              : s
            )
          } else {
            schedules = [...schedules, {
              id: 'sch_ger_num_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2),
              transactionType: 'transfer',
              accountId: grupo.defaultAccountId,
              toAccountId: contaPrincipal.id,
              frequency: 'once',
              occurrenceType: 'installment',
              installments: 1,
              autoRegister: false,
              startDate: dueDateStr,
              amount,
              description: `Resgate ${grupo.name} - ${apelido} - Fatura ${faturaRefI} (${i}/${installments}x)`,
              overrides: { _gerencialKey: gerKeyI, _originTxId: rootTxId, _originAmount: amount },
              registered: [],
              skipped: [],
            }]
          }

          // Pagamento da fatura: Conta Principal → Cartão no vencimento (compartilhado)
          const payIdx = schedules.findIndex(s => s.overrides?._gerencialKey === payKeyI)
          if (payIdx >= 0) {
            schedules = schedules.map((s, idx) => idx === payIdx
              ? { ...s, amount: rb((s.amount || 0) + amount) }
              : s
            )
          } else {
            schedules = [...schedules, {
              id: 'sch_ger_pay_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2),
              transactionType: 'transfer',
              accountId: contaPrincipal.id,
              toAccountId: accountId,
              frequency: 'once',
              occurrenceType: 'installment',
              installments: 1,
              autoRegister: false,
              startDate: dueDateStr,
              amount,
              description: `Pagamento Fatura ${apelido} ${faturaRefI}`,
              overrides: {
                _gerencialKey: payKeyI, _originTxId: rootTxId, _originAmount: amount,
                _gerencial: { faturaRef: faturaRefI, cardId: accountId, checkingAccountId: contaPrincipal.id },
              },
              registered: [],
              skipped: [],
            }]
          }
        }
        return { ...d, schedules }
      })
    } else if (grupo.number === 1) {
      const financialStartDay = data.settings?.financialMonthStartDay || 1
      update(d => {
        const contaPrincipal = d.accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal)
          || d.accounts.find(a => a.isMain && a.type !== 'credit')
          || d.accounts.find(a => a.type === 'checking')
        if (!contaPrincipal) return d
        const subconta = d.accounts.find(a => a.name === `Ger. ${apelido}`)
        if (!subconta) return d
        let schedules = [...d.schedules]
        for (let i = startFromInstallment; i <= installments; i++) {
          const futureDate = new Date(baseYear, baseMonth0 + (i - 1), 1)
          const fmI = String(futureDate.getMonth() + 1).padStart(2, '0')
          const fyI = futureDate.getFullYear()
          const faturaRefI = `${fmI}/${fyI}`
          const dueDayStr = String(dueDay).padStart(2, '0')
          const startDateStr = `${fyI}-${fmI}-${dueDayStr}`
          const resgateParceladoDateI = nextMonthScheduleDate(faturaRefI, financialStartDay)
          const gerKeyBase = gerencialKey(accountId, faturaRefI)
          const provKeyI = `${gerKeyBase}_provision`
          const rpKeyI = `${gerKeyBase}_resgate_parc`
          const payKeyI = `${gerKeyBase}_payment`
          const gerencialMeta = { faturaRef: faturaRefI, cardId: accountId, checkingAccountId: contaPrincipal.id, gerencialContaId: subconta.id }

          // _provision: Principal → Ger. no vencimento (acumulativo)
          const provIdx = schedules.findIndex(s => s.overrides?._gerencialKey === provKeyI)
          if (provIdx >= 0) {
            schedules = schedules.map((s, idx) => idx === provIdx ? { ...s, amount: rb((s.amount || 0) + amount) } : s)
          } else {
            schedules = [...schedules, {
              id: 'sch_ger_prov_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2),
              transactionType: 'transfer',
              accountId: contaPrincipal.id,
              toAccountId: subconta.id,
              frequency: 'once',
              occurrenceType: 'installment',
              installments: 1,
              autoRegister: false,
              startDate: startDateStr,
              amount,
              description: `Provisão Ger. ${apelido} - Fatura ${faturaRefI} (${i}/${installments}x)`,
              overrides: { _gerencialKey: provKeyI, _originTxId: rootTxId, _gerencial: gerencialMeta },
              registered: [],
              skipped: [],
            }]
          }

          // _resgate_parc: Ger. → Principal no início do mês seguinte (acumulativo)
          const rpIdx = schedules.findIndex(s => s.overrides?._gerencialKey === rpKeyI)
          if (rpIdx >= 0) {
            schedules = schedules.map((s, idx) => idx === rpIdx ? { ...s, amount: rb((s.amount || 0) + amount) } : s)
          } else {
            schedules = [...schedules, {
              id: 'sch_ger_rp_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2),
              transactionType: 'transfer',
              accountId: subconta.id,
              toAccountId: contaPrincipal.id,
              frequency: 'once',
              occurrenceType: 'installment',
              installments: 1,
              autoRegister: false,
              startDate: resgateParceladoDateI,
              amount,
              description: `Resgate Ger. ${apelido} - Fatura ${faturaRefI} (${i}/${installments}x)`,
              overrides: { _gerencialKey: rpKeyI, _originTxId: rootTxId, _gerencial: gerencialMeta },
              registered: [],
              skipped: [],
            }]
          }

          // _payment: Principal → Cartão no vencimento (acumulativo)
          const payIdx = schedules.findIndex(s => s.overrides?._gerencialKey === payKeyI)
          if (payIdx >= 0) {
            schedules = schedules.map((s, idx) => idx === payIdx ? { ...s, amount: rb((s.amount || 0) + amount) } : s)
          } else {
            schedules = [...schedules, {
              id: 'sch_ger_pay_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2),
              transactionType: 'transfer',
              accountId: contaPrincipal.id,
              toAccountId: accountId,
              frequency: 'once',
              occurrenceType: 'installment',
              installments: 1,
              autoRegister: false,
              startDate: startDateStr,
              amount,
              description: `Pagamento Fatura ${apelido} ${faturaRefI}`,
              overrides: { _gerencialKey: payKeyI, _originTxId: rootTxId, _gerencial: gerencialMeta },
              registered: [],
              skipped: [],
            }]
          }
        }
        return { ...d, schedules }
      })
    }
  }, [data.gerencialGroups, data.accounts, data.settings, update])

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
        if (INSTALL_RE.test(expense.description || '')) {
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
          if (!INSTALL_RE.test(tx.description || '')) return false
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
          overrides: { _gerencialKey: paymentKey, _gerencial: { faturaRef, cardId, checkingAccountId: contaPrincipal.id, gerencialContaId: subconta.id } },
          registered: [],
          skipped: [],
        }]
      })

      return { ...d, transactions, schedules, accounts }
    })
  }, [update])

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
      addCardImport, updateCardImport, revertCardImport,
      activeProfileId, setActiveProfileId,
      profileAccounts, profileTransactions, profileSchedules,
      addProfile, updateProfile, deleteProfile,
      updateSettings,
      addAccount, updateAccount, deleteAccount, setMainAccount, updateAccountValue, recalcularSaldo, saveBalanceSnapshot, restoreBalanceSnapshot,
      addTransaction, updateTransaction, deleteTransaction, reverseTransaction, reverseGerencialCascadeOnly,
      addCategory, deleteCategory,
      addSchedule, updateSchedule, deleteSchedule,
      registerScheduleOccurrence, skipScheduleOccurrence,
      addBudget, updateBudget, deleteBudget,
      addRule, updateRule, deleteRule,
      addGerencialRule, updateGerencialRule, deleteGerencialRule, moveGerencialRule, classifyGerencialByRules,
      addPayee, addCostCenter,
      addGerencialGroup, updateGerencialGroup, deleteGerencialGroup,
      processarLancamentoGerencial,
      criarParcelasGerencial,
      ajustarParcelasGrupoGerencial,
      propagarValorParcelas,
      corrigirDadosGerencial,
      addEnvelope, updateEnvelope, deleteEnvelope,
      addAccountGroup, updateAccountGroup, deleteAccountGroup, moveAccountGroup, reorderAccountGroups, moveAccount,
      setDebtPlan, payDebtInstallment,
      addPayable, updatePayable, deletePayable, gerarContasPagarFatura,
      findMatchingSchedule, addRecurringMatchException, markScheduleRegistered,
      dbStatus,
      getFinancialPeriod,
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
