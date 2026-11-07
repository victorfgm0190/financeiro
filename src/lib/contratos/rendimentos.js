// RELATÓRIO DE RENDIMENTOS DE ALUGUEL (Etapa 5) — funções puras.
// Por contrato a receber e por ano, mês a mês:
//   Aluguel bruto | Deduções dedutíveis (por tipo) | Base tributável | Deduções não dedutíveis |
//   Repasse recebido | Saldo com a administradora no fim do mês.
// A composição vem só de contrato_competencias (via competenciasDoRepasse), nunca do agendamento.
//
// Mês de referência (do aluguel e das deduções da competência):
//   pagamento  (padrão) mês em que o inquilino pagou à administradora: a data informada na
//              competência (data_pagamento_inquilino) ou competência + dia_vencimento. Competência
//              sem repasse (saldo ≤ 0) ENTRA: a administradora recebeu o aluguel mesmo sem repassar.
//   competencia o mês do aluguel.
//   repasse    o mês em que caiu na conta o repasse que quitou a competência (conferência).
// "Repasse recebido" é sempre do mês em que o dinheiro caiu na conta (o registrado; sem registro, o
// previsto, marcado). Saldo no fim do mês = saldo do fim do mês anterior + resultado das competências
// do mês − repasses do mês (com o saldo inicial do contrato).
// Contrato a receber SEM administradora: o aluguel recebido direto do inquilino (sem deduções).
import { ymDe } from './datas.js'
import { ehModoRepasse } from './repasse.js'
import { competenciasDoRepasse, confirmadosDe, ehParcelaGerada, competenciaDaParcela } from './parcelas.js'
import { repassesRegistrados, repassesComData } from './saldoRepasse.js'

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100

export const REFERENCIAS_RENDIMENTO = [
  { value: 'pagamento', label: 'Pagamento do inquilino', title: 'O aluguel entra no mês em que o inquilino pagou à administradora' },
  { value: 'competencia', label: 'Competência', title: 'O aluguel entra no mês a que ele se refere' },
  { value: 'repasse', label: 'Repasse', title: 'O aluguel entra no mês em que o repasse caiu na conta (conferência)' },
]
export const REFERENCIA_PADRAO = 'pagamento'
export const AVISO_CONTADOR = 'Confira com seu contador o mês de reconhecimento e as deduções aceitas.'

// Tipo da dedução (para o totalizador): os automáticos pelo tipo; despesa pela natureza.
export const TIPOS_DEDUCAO = {
  taxa_adm: 'Taxa de administração',
  tarifa: 'Tarifas',
  taxa_unica: 'Taxa única',
  iptu: 'IPTU',
  condominio: 'Condomínio',
  consumo: 'Consumo',
  manutencao: 'Manutenção',
  benfeitoria: 'Benfeitoria',
  ajuste: 'Ajustes',
  outra: 'Outras despesas',
}
// Colunas das deduções dedutíveis; o resto cai em "outras".
export const COLUNAS_DEDUTIVEIS = [
  { chave: 'taxa_adm', titulo: 'Adm.' },
  { chave: 'tarifa', titulo: 'Tarifa' },
  { chave: 'taxa_unica', titulo: 'Taxa única' },
  { chave: 'iptu', titulo: 'IPTU' },
  { chave: 'condominio', titulo: 'Condomínio' },
  { chave: 'outras', titulo: 'Outras' },
]

export function tipoDeducao(item) {
  if (item.tipo === 'despesa') return TIPOS_DEDUCAO[item.natureza] ? item.natureza : 'outra'
  return TIPOS_DEDUCAO[item.tipo] ? item.tipo : 'outra'
}
const colunaDedutivel = (tipo) => (COLUNAS_DEDUTIVEIS.some(c => c.chave === tipo) ? tipo : 'outras')

const mesVazio = (mes) => ({
  mes, bruto: 0, dedutiveis: Object.fromEntries(COLUNAS_DEDUTIVEIS.map(c => [c.chave, 0])), totalDedutiveis: 0,
  base: 0, naoDedutiveis: 0, resultado: 0, repasse: 0, repassePrevisto: 0, saldoFim: null, competencias: [],
})

// Mês de referência de cada competência ('AAAA-MM').
//   linhas: competenciasDoRepasse; datasRepasse: { 'AAAA-MM': { data } } (repassesComData).
export function mesesDeReferencia(linhas, referencia, datasRepasse = {}) {
  const dataDoRepasse = (l) => datasRepasse[l.competencia]?.data || l.vencimento
  const temRepasse = (l) => l.repasse > 0 || l.repasseReal != null
  return linhas.map((l, i) => {
    if (referencia === 'competencia') return l.competencia
    if (referencia === 'repasse') {
      // O repasse que quitou a competência: o dela ou o da 1ª seguinte com repasse.
      if (!l.foraDoSaldo) {
        for (let j = i; j < linhas.length && !linhas[j].foraDoSaldo; j++) if (temRepasse(linhas[j])) return ymDe(dataDoRepasse(linhas[j]))
      }
      return ymDe(dataDoRepasse(l))
    }
    return ymDe(l.linha?.data_pagamento_inquilino || l.vencimentoInquilino || l.competencia)
  })
}

// Relatório de UM contrato a receber por administradora no ano.
//   linhas: competenciasDoRepasse(contrato, …); datasRepasse: repassesComData(…).
// → { meses: [12 × mês], totais, porTipo: { [tipo]: { dedutivel, naoDedutivel } }, saldoInicioAno }
export function rendimentosRepasse(contrato, linhas, { ano, referencia = REFERENCIA_PADRAO, datasRepasse = {} } = {}) {
  const a = String(ano)
  const refs = mesesDeReferencia(linhas, referencia, datasRepasse)
  const meses = Array.from({ length: 12 }, (_, k) => mesVazio(`${a}-${String(k + 1).padStart(2, '0')}`))
  const porMes = new Map(meses.map(m => [m.mes, m]))
  const porTipo = {}
  // Movimentos do saldo por mês (todas as datas, para o saldo do fim de cada mês).
  const mov = new Map()
  const somar = (mes, v) => mov.set(mes, r2((mov.get(mes) || 0) + v))
  let inicioSaldo = null

  linhas.forEach((l, i) => {
    const ref = refs[i]
    if (!l.foraDoSaldo) {
      if (inicioSaldo == null || ref < inicioSaldo) inicioSaldo = ref
      somar(ref, l.resultado)
    }
    // Repasse: no mês em que caiu (ou cairá) na conta.
    const valorRep = l.repasseReal != null ? r2(l.repasseReal) : (l.repasse > 0 ? r2(l.repasse) : 0)
    if (valorRep && !l.foraDoSaldo) {
      const dataRep = datasRepasse[l.competencia]?.data || l.vencimento
      const mesRep = ymDe(dataRep)
      somar(mesRep, -valorRep)
      const m = porMes.get(mesRep)
      if (m) {
        m.repasse = r2(m.repasse + valorRep)
        if (l.repasseReal == null) m.repassePrevisto = r2(m.repassePrevisto + valorRep)
      }
    }
    const m = porMes.get(ref)
    if (!m) return
    m.competencias.push(l.competencia)
    for (const it of l.itens || []) {
      const v = r2(it.valor)
      if (it.tipo === 'aluguel') { m.bruto = r2(m.bruto + v); continue }
      const deducao = r2(-v)
      const tipo = tipoDeducao(it)
      porTipo[tipo] = porTipo[tipo] || { dedutivel: 0, naoDedutivel: 0 }
      if (it.dedutivel_ir) {
        const col = colunaDedutivel(tipo)
        m.dedutiveis[col] = r2(m.dedutiveis[col] + deducao)
        m.totalDedutiveis = r2(m.totalDedutiveis + deducao)
        porTipo[tipo].dedutivel = r2(porTipo[tipo].dedutivel + deducao)
      } else {
        m.naoDedutiveis = r2(m.naoDedutiveis + deducao)
        porTipo[tipo].naoDedutivel = r2(porTipo[tipo].naoDedutivel + deducao)
      }
    }
    m.resultado = r2(m.resultado + Number(l.resultado || 0))
  })
  for (const m of meses) m.base = r2(m.bruto - m.totalDedutiveis)

  // Saldo com a administradora no fim de cada mês do ano (a partir da 1ª competência na conta).
  const saldoIni = r2(contrato?.saldo_inicial_adm)
  const saldoAte = (mes) => r2(saldoIni + [...mov].filter(([k]) => k <= mes).reduce((s, [, v]) => s + v, 0))
  let saldoInicioAno = null
  if (inicioSaldo != null) {
    const antes = `${Number(a) - 1}-12`
    saldoInicioAno = inicioSaldo <= antes || [...mov.keys()].some(k => k <= antes) ? saldoAte(antes) : null
    for (const m of meses) if (m.mes >= inicioSaldo || [...mov.keys()].some(k => k <= m.mes)) m.saldoFim = saldoAte(m.mes)
  }
  return { meses, totais: totalizar(meses), porTipo, saldoInicioAno }
}

// Contrato a receber SEM administradora: as parcelas de aluguel (o recebido, ou o previsto).
//   parcelas: [{ competencia, data, valor, recebido (bool) }].
export function rendimentosDiretos(parcelas, { ano, referencia = REFERENCIA_PADRAO } = {}) {
  const a = String(ano)
  const meses = Array.from({ length: 12 }, (_, k) => mesVazio(`${a}-${String(k + 1).padStart(2, '0')}`))
  const porMes = new Map(meses.map(m => [m.mes, m]))
  for (const p of parcelas || []) {
    const ref = referencia === 'competencia' ? p.competencia : ymDe(p.data)
    const m = porMes.get(ref)
    if (m) {
      m.bruto = r2(m.bruto + p.valor)
      m.base = m.bruto
      m.resultado = m.bruto
      m.competencias.push(p.competencia)
    }
    const mr = porMes.get(ymDe(p.data))
    if (mr) {
      mr.repasse = r2(mr.repasse + p.valor)
      if (!p.recebido) mr.repassePrevisto = r2(mr.repassePrevisto + p.valor)
    }
  }
  return { meses, totais: totalizar(meses), porTipo: {}, saldoInicioAno: null }
}

function totalizar(meses) {
  const t = mesVazio('total')
  delete t.competencias
  for (const m of meses) {
    for (const k of ['bruto', 'totalDedutiveis', 'base', 'naoDedutiveis', 'resultado', 'repasse', 'repassePrevisto']) t[k] = r2(t[k] + m[k])
    for (const c of COLUNAS_DEDUTIVEIS) t.dedutiveis[c.chave] = r2(t.dedutiveis[c.chave] + m.dedutiveis[c.chave])
  }
  const comSaldo = meses.filter(m => m.saldoFim != null)
  t.saldoFim = comSaldo.length ? comSaldo.at(-1).saldoFim : null
  return t
}

// Soma de vários relatórios (visão "todos os contratos a receber").
export function somarRelatorios(relatorios) {
  const lista = (relatorios || []).filter(Boolean)
  if (!lista.length) return null
  const meses = lista[0].meses.map((m0, k) => {
    const m = mesVazio(m0.mes)
    for (const r of lista) {
      const x = r.meses[k]
      for (const c of ['bruto', 'totalDedutiveis', 'base', 'naoDedutiveis', 'resultado', 'repasse', 'repassePrevisto']) m[c] = r2(m[c] + x[c])
      for (const c of COLUNAS_DEDUTIVEIS) m.dedutiveis[c.chave] = r2(m.dedutiveis[c.chave] + x.dedutiveis[c.chave])
      if (x.saldoFim != null) m.saldoFim = r2((m.saldoFim || 0) + x.saldoFim)
    }
    return m
  })
  const porTipo = {}
  for (const r of lista) {
    for (const [k, v] of Object.entries(r.porTipo || {})) {
      porTipo[k] = porTipo[k] || { dedutivel: 0, naoDedutivel: 0 }
      porTipo[k].dedutivel = r2(porTipo[k].dedutivel + v.dedutivel)
      porTipo[k].naoDedutivel = r2(porTipo[k].naoDedutivel + v.naoDedutivel)
    }
  }
  const inicios = lista.map(r => r.saldoInicioAno).filter(v => v != null)
  return { meses, totais: totalizar(meses), porTipo, saldoInicioAno: inicios.length ? r2(inicios.reduce((s, v) => s + v, 0)) : null }
}

// Conferência com o informe da administradora (contratos.informes_adm[ano]).
// → { rendimentos: { informado, calculado, diferenca }, deducoes: { … } } (diferenca = informado − calculado).
export function conferenciaInforme(contrato, ano, totais) {
  const inf = contrato?.informes_adm?.[String(ano)] || {}
  const linha = (informado, calculado) => ({
    informado: informado == null ? null : r2(informado), calculado: r2(calculado),
    diferenca: informado == null ? null : r2(Number(informado) - calculado),
  })
  return { rendimentos: linha(inf.rendimentos, totais.bruto), deducoes: linha(inf.deducoes, totais.totalDedutiveis) }
}

// Anos com competência (ou repasse) no contrato, em ordem.
export function anosDoContrato(contrato, linhas) {
  const anos = new Set()
  if (ehModoRepasse(contrato)) for (const l of linhas || []) { anos.add(l.competencia.slice(0, 4)); if (l.vencimento) anos.add(l.vencimento.slice(0, 4)) }
  else for (const p of linhas || []) { anos.add(String(p.competencia).slice(0, 4)); anos.add(String(p.data).slice(0, 4)) }
  return [...anos].filter(Boolean).sort()
}

// Relatório de um contrato a receber a partir do estado do app (agendamentos e lançamentos).
// → { rel, anos } (anos com movimento, para o seletor).
export function relatorioDoContrato(contrato, { ano, referencia = REFERENCIA_PADRAO, schedules = [], transactions = [], indices = {}, hoje }) {
  const doContrato = (schedules || []).filter(s => s.contratoId === contrato.id)
  if (ehModoRepasse(contrato)) {
    const linhas = competenciasDoRepasse(contrato, {
      hoje, indices, confirmados: confirmadosDe(contrato, doContrato),
      repassesReais: repassesRegistrados(contrato, doContrato, transactions),
    })
    const datasRepasse = repassesComData(contrato, doContrato, transactions)
    return { rel: rendimentosRepasse(contrato, linhas, { ano, referencia, datasRepasse }), anos: anosDoContrato(contrato, linhas) }
  }
  // Sem administradora: as parcelas de aluguel geradas pelo contrato (a recebida pelo lançamento).
  const txPorId = new Map((transactions || []).map(t => [t.id, t]))
  const parcelas = doContrato
    .filter(s => ehParcelaGerada(s, contrato.id) && (s.contratoPapel || 'aluguel') === 'aluguel')
    .map(s => {
      const d = (s.registered || [])[0]
      const tx = d ? (txPorId.get(s.registeredMeta?.[d]?.lancamento_id) || (transactions || []).find(t => t.scheduleId === s.id) || null) : null
      return { competencia: competenciaDaParcela(s), data: (tx?.date || d || s.startDate || '').slice(0, 10), valor: r2(tx ? tx.amount : s.amount), recebido: !!d }
    })
  return { rel: rendimentosDiretos(parcelas, { ano, referencia }), anos: anosDoContrato(contrato, parcelas) }
}
