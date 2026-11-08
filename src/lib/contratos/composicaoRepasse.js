// COMPOSIÇÃO DO REPASSE (contrato a receber por administradora) — funções puras.
// Cada competência tem uma composição com itens tipados (valor COM SINAL: + entra, − sai):
//   aluguel     + aluguel bruto da competência (do plano: reajuste, 1º mês proporcional, bonificação)
//   taxa_adm    − taxa de administração (% do contrato sobre a base escolhida; valor editável no mês)
//   tarifa      − tarifa/taxa fixa (contrato_itens tipo_repasse 'tarifa_fixa', de/até uma competência)
//   taxa_unica  − parcela de uma taxa única (contrato_itens tipo_repasse 'taxa_unica', valores livres)
//   despesa     − despesa do proprietário paga pela administradora (IPTU, condomínio, consumo…)
//   benfeitoria − benfeitoria/reparo feito pelo inquilino e abatido do aluguel
//   ajuste      ± outro ajuste (texto livre)
// Os quatro primeiros são AUTOMÁTICOS (origem 'auto', vêm do contrato); os demais são do mês
// (origem 'manual'). A tabela contrato_competencias guarda a composição (fonte da verdade): numa
// competência ABERTA os automáticos seguem o contrato (salvo os informados à mão, que guardam
// valor_calculado e valor informado); FECHADA, a composição gravada vale como está.
import { mesesEntre } from './datas.js'
import { descricaoTaxaUnica, linhaCongelada, taxaUnicaDoItem } from './taxaUnica.js'

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100

export const TIPOS_ITEM_REPASSE = {
  aluguel: 'Aluguel (bruto)',
  taxa_adm: 'Taxa de administração',
  tarifa: 'Tarifa / taxa fixa',
  taxa_unica: 'Taxa única (parcela)',
  despesa: 'Despesa do proprietário',
  benfeitoria: 'Benfeitoria / reparo do inquilino',
  ajuste: 'Outro ajuste',
}
// Tipos que o usuário inclui no mês.
export const TIPOS_MANUAIS = ['despesa', 'benfeitoria', 'ajuste']

export const NATUREZAS_DESPESA = {
  iptu: 'IPTU',
  condominio: 'Condomínio',
  consumo: 'Consumo (água, luz, gás)',
  manutencao: 'Manutenção',
  outra: 'Outra',
}

export const BASES_TAXA_ADM = {
  bruto: 'Aluguel bruto',
  bruto_menos_taxas: 'Aluguel bruto menos tarifas e taxa única do mês',
}

// Dedutível para o IR (padrão sugerido; o usuário muda item a item): taxa de administração, tarifas
// de cobrança, intermediação, IPTU e condomínio pagos pelo proprietário.
export function dedutivelPadrao(tipo, natureza = null) {
  if (tipo === 'taxa_adm' || tipo === 'tarifa' || tipo === 'taxa_unica') return true
  if (tipo === 'despesa') return natureza === 'iptu' || natureza === 'condominio'
  return false
}

// Sinal padrão por tipo (ajuste escolhe).
export const sinalPadrao = (tipo) => (tipo === 'aluguel' ? 1 : -1)

export const somaItens = (itens) => r2((itens || []).reduce((a, i) => a + (Number(i.valor) || 0), 0))

// Parcela k (0 = a 1ª) de uma taxa única na competência, ou null.
export function parcelaTaxaUnica(item, competencia) {
  const valores = Array.isArray(item?.valores_parcelas) ? item.valores_parcelas : []
  if (!item?.vigencia_inicio || !valores.length) return null
  const k = mesesEntre(item.vigencia_inicio, competencia)
  if (k < 0 || k >= valores.length) return null
  return { k, n: valores.length, valor: r2(valores[k]) }
}

// Taxa única: a soma das parcelas bate com o total? → null (bate) ou { soma, total, diferenca }.
// Só aviso: nunca bloqueia (decisão de 07/11/2026).
export function conferirTaxaUnica(item) {
  const valores = Array.isArray(item?.valores_parcelas) ? item.valores_parcelas : []
  const soma = r2(valores.reduce((a, v) => a + (Number(v) || 0), 0))
  const total = r2(item?.valor ?? item?.valor_previsto)
  return Math.abs(soma - total) > 0.005 ? { soma, total, diferenca: r2(total - soma) } : null
}

const vigente = (it, competencia) => (!it.vigencia_inicio || it.vigencia_inicio <= competencia)
  && (!it.vigencia_fim || competencia <= it.vigencia_fim)

// CATEGORIA PADRÃO de um item da composição, tirada do contrato (o item nasce com ela; editável):
//   aluguel → categoria do contrato; taxa_adm → categoria da taxa de adm.; tarifa/taxa única → a do
//   item no contrato ou, vazia ("a da taxa de adm."), a da taxa de adm. Demais tipos: null.
export function categoriaPadraoDoItem(contrato, item) {
  const adm = contrato?.categoria_taxa_adm_id || null
  if (item?.tipo === 'aluguel') return contrato?.categoria_id || null
  if (item?.tipo === 'taxa_adm') return adm
  if (item?.tipo === 'tarifa' || item?.tipo === 'taxa_unica') {
    const id = item.tipo === 'taxa_unica' ? taxaUnicaDoItem(contrato, item) : item.taxa_id || String(item.chave || '').split(':')[1] || null
    return (contrato?.itens_repasse || []).find(t => t.id === id)?.categoria_id || adm
  }
  return null
}
// Lê a composição gravada completando a categoria vazia com a padrão (competências gravadas antes de o
// contrato ter a categoria). Só na leitura: o banco não é alterado.
// A taxa única ligada a um id antigo (contrato regravado) volta a apontar para a taxa atual.
function comCategoria(contrato, item) {
  const taxaId = item.tipo === 'taxa_unica' ? taxaUnicaDoItem(contrato, item) : null
  const i = taxaId && taxaId !== item.taxa_id ? { ...item, taxa_id: taxaId } : item
  return i.categoria_id ? i : { ...i, categoria_id: categoriaPadraoDoItem(contrato, i) }
}

// Contrato sem a categoria que os itens automáticos usariam → o aviso (uma vez, na ficha), ou null.
export function avisoCategoriaContrato(contrato) {
  if (!contrato?.modo_repasse || contrato.categoria_taxa_adm_id) return null
  const usa = Number(contrato.taxa_adm_pct) > 0
    || (contrato.itens_repasse || []).some(t => t.ativo !== false && (t.tipo_repasse === 'tarifa_fixa' || t.tipo_repasse === 'taxa_unica') && !t.categoria_id)
  return usa ? 'Defina a categoria da taxa de administração no contrato' : null
}

// Itens automáticos da competência (sem a taxa de administração, que depende deles):
//   aluguel: { valor, desc } do plano da competência, ou null (mês sem cobrança).
//   taxasUnicas: projeção da competência ({ [taxaId]: { valor, k, n } }, de projetarTaxasUnicas);
//   sem ela, a parcela k do plano (valores_parcelas).
function automaticosSemAdm(contrato, competencia, aluguel, taxasUnicas = null) {
  const out = []
  if (aluguel) {
    out.push({
      chave: 'aluguel', tipo: 'aluguel', descricao: aluguel.desc || TIPOS_ITEM_REPASSE.aluguel, valor: r2(aluguel.valor),
      categoria_id: contrato.categoria_id || null, dedutivel_ir: false,
    })
  }
  if (!aluguel) return out
  const catTaxa = (it) => it.categoria_id || contrato.categoria_taxa_adm_id || null
  for (const it of contrato.itens_repasse || []) {
    if (it.ativo === false) continue
    if (it.tipo_repasse === 'tarifa_fixa' && vigente(it, competencia) && Number(it.valor) > 0) {
      out.push({
        chave: `tarifa:${it.id}`, tipo: 'tarifa', descricao: it.descricao, valor: -r2(it.valor),
        categoria_id: catTaxa(it), dedutivel_ir: it.dedutivel_ir ?? dedutivelPadrao('tarifa'),
      })
    }
    if (it.tipo_repasse === 'taxa_unica') {
      const p = taxasUnicas ? taxasUnicas[it.id] || null : parcelaTaxaUnica(it, competencia)
      if (p && p.valor) {
        out.push({
          chave: `taxa_unica:${it.id}`, tipo: 'taxa_unica', taxa_id: it.id,
          descricao: taxasUnicas ? descricaoTaxaUnica(it, p) : `${it.descricao} ${p.k + 1}/${p.n}`, valor: -p.valor,
          categoria_id: catTaxa(it), dedutivel_ir: it.dedutivel_ir ?? dedutivelPadrao('taxa_unica'),
        })
      }
    }
  }
  return out
}

// Junta o automático com o que está gravado: informado à mão mantém o valor (e guarda o calculado);
// categoria, dedutível e descrição editados ficam.
function juntar(auto, salvo) {
  if (!salvo) return { ...auto, origem: 'auto', valor_calculado: auto.valor, informado: false }
  const informado = !!salvo.informado
  return {
    ...auto,
    origem: 'auto',
    descricao: salvo.descricao || auto.descricao,
    categoria_id: salvo.categoria_id || auto.categoria_id,
    dedutivel_ir: salvo.dedutivel_ir ?? auto.dedutivel_ir,
    valor_calculado: auto.valor,
    valor: informado ? r2(salvo.valor) : auto.valor,
    informado,
  }
}

// Taxa de administração calculada sobre os itens já juntados (valor negativo), ou null sem %.
export function taxaAdmCalculada(contrato, itens) {
  const pct = Number(contrato.taxa_adm_pct)
  if (!(pct > 0)) return null
  const aluguel = itens.filter(i => i.tipo === 'aluguel').reduce((a, i) => a + i.valor, 0)
  const taxas = contrato.taxa_adm_base === 'bruto_menos_taxas'
    ? itens.filter(i => i.tipo === 'tarifa' || i.tipo === 'taxa_unica').reduce((a, i) => a + i.valor, 0) : 0
  return -r2(Math.max(0, aluguel + taxas) * pct / 100)
}

// Composição da competência.
//   aluguel: { valor, desc } do plano (null = mês sem cobrança); linha: contrato_competencias ou null.
// → itens [{ chave, tipo, descricao, valor, valor_calculado?, informado?, categoria_id, dedutivel_ir,
//   natureza?, somar_ao_bem?, origem }]
// Conferida pelo extrato ou fechada: a composição gravada vale como está.
//   opts.taxasUnicas: projeção das taxas únicas nesta competência (saldo a descontar).
export function comporCompetencia(contrato, competencia, aluguel, linha = null, { taxasUnicas = null } = {}) {
  if (linhaCongelada(linha)) return (linha.itens || []).map(i => comCategoria(contrato, { ...i, valor: r2(i.valor) }))
  const gravados = linha?.itens || []
  const salvo = new Map(gravados.filter(i => i.origem === 'auto').map(i => [i.chave, i]))
  const auto = automaticosSemAdm(contrato, competencia, aluguel, taxasUnicas).map(a => juntar(a, salvo.get(a.chave)))
  const calc = aluguel ? taxaAdmCalculada(contrato, auto) : null
  const admSalvo = salvo.get('adm')
  if (calc != null || admSalvo?.informado) {
    const adm = {
      chave: 'adm', tipo: 'taxa_adm',
      descricao: `${TIPOS_ITEM_REPASSE.taxa_adm}${Number(contrato.taxa_adm_pct) > 0 ? ` ${String(Number(contrato.taxa_adm_pct)).replace('.', ',')}%` : ''}`,
      valor: calc ?? 0, categoria_id: contrato.categoria_taxa_adm_id || null, dedutivel_ir: dedutivelPadrao('taxa_adm'),
    }
    const j = juntar(adm, admSalvo)
    if (calc == null) j.valor_calculado = null
    auto.splice(auto.findIndex(i => i.tipo === 'aluguel') + 1, 0, j)
  }
  const manuais = gravados.filter(i => i.origem !== 'auto').map(i => ({ ...i, origem: 'manual', valor: r2(i.valor) }))
  return [...auto, ...manuais]
}

// Totais da composição: bruto (aluguel), deduções (bruto − resultado) e resultado (soma).
export function resumoComposicao(itens) {
  const bruto = somaItens((itens || []).filter(i => i.tipo === 'aluguel'))
  const resultado = somaItens(itens)
  return { bruto, deducoes: r2(bruto - resultado), resultado }
}

// Deduções marcadas como dedutíveis para o IR (valor positivo).
export const dedutiveisIr = (itens) => r2(-somaItens((itens || []).filter(i => i.dedutivel_ir && Number(i.valor) < 0)))

// Itens a gravar na contrato_competencias: os automáticos guardam só o que o usuário mudou de fato
// (informado, categoria, dedutível, descrição) mais o calculado do momento; os manuais vão inteiros.
export function itensParaGravar(itens) {
  return (itens || []).map(i => {
    const base = {
      chave: i.chave, tipo: i.tipo, descricao: String(i.descricao || '').trim(), valor: r2(i.valor),
      categoria_id: i.categoria_id || null, dedutivel_ir: !!i.dedutivel_ir, origem: i.origem === 'auto' ? 'auto' : 'manual',
      ...(i.tipo === 'taxa_unica' && i.taxa_id ? { taxa_id: i.taxa_id } : {}),
    }
    if (i.origem === 'auto') return { ...base, informado: !!i.informado, valor_calculado: i.valor_calculado ?? null }
    return {
      ...base,
      ...(i.tipo === 'despesa' ? { natureza: i.natureza || 'outra' } : {}),
      ...(i.tipo === 'benfeitoria' ? { somar_ao_bem: !!i.somar_ao_bem } : {}),
    }
  })
}

// Item manual novo (despesa, benfeitoria ou ajuste) com o padrão de sinal e dedutível do tipo.
export function novoItemManual(tipo, { natureza = 'outra', categoria_id = null } = {}) {
  return {
    chave: `m:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    tipo, descricao: '', valor: 0, categoria_id, origem: 'manual',
    dedutivel_ir: dedutivelPadrao(tipo, natureza),
    ...(tipo === 'despesa' ? { natureza } : {}),
    ...(tipo === 'benfeitoria' ? { somar_ao_bem: false } : {}),
  }
}

// Linha de contrato_itens (tipo_repasse) → taxa do contrato (como vem na lista: contrato.itens_repasse).
export const taxaDoItem = (row) => ({
  id: row.id, tipo_repasse: row.tipo_repasse, descricao: row.descricao, valor: r2(row.valor_previsto ?? row.valor),
  valores_parcelas: Array.isArray(row.valores_parcelas) ? row.valores_parcelas.map(r2) : null,
  vigencia_inicio: row.vigencia_inicio || null, vigencia_fim: row.vigencia_fim || null,
  categoria_id: row.categoria_id || null, dedutivel_ir: row.dedutivel_ir ?? null, ativo: row.ativo !== false,
})
