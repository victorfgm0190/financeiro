// Validação do cadastro de contrato, etapa por etapa (o formulário guarda texto; valores no padrão BR).
// Etapas (índice fixo, mesmo quando a de imóvel não aparece): 0 dados, 1 valores, 2 reajuste,
// 3 imóvel e condomínio (só Aluguel).
import { parseValorBR } from '../valorBR.js'
import { ehAluguel, rotulosContrato } from './rotulos.js'

const num = (v) => { const n = parseValorBR(v); return Number.isFinite(n) ? n : null }
const int = (v) => (v === '' || v == null ? null : Number.parseInt(v, 10))
const txt = (v) => (v == null ? '' : String(v))
const YM = /^\d{4}-\d{2}$/
const E = (campo, erro) => ({ erro, campo })

// Erro da etapa com o campo responsável ({ erro, campo }; erro '' quando a etapa está ok). `campo` é a
// chave do formulário (a tela rola até ele e o destaca).
export function validarEtapaCampo(i, f) {
  const aluguel = ehAluguel(f)
  const rot = rotulosContrato(f)
  const repasse = aluguel && f.tipo === 'receber' && !!f.modo_repasse
  if (i === 0) {
    if (!f.modalidade) return E('modalidade', 'Escolha a modalidade do contrato.')
    if (!f.perfil_id) return E('perfil_id', 'Escolha o perfil.')
    if (repasse && !txt(f.favorecido).trim()) return E('favorecido', 'Informe a administradora (quem faz o repasse).')
    if (!txt(f.favorecido).trim()) return E('favorecido', aluguel ? 'Informe o favorecido (imobiliária ou proprietário).' : 'Informe o favorecido.')
    if (!f.data_inicio) return E('data_inicio', 'Informe o início da vigência.')
    if (!f.sem_fim && !f.data_fim) return E('data_fim', 'Informe o fim da vigência ou marque "Sem data de fim".')
    if (!f.sem_fim && f.data_fim < f.data_inicio) return E('data_fim', 'O fim da vigência é antes do início.')
    if (f.link_anexo && !/^https?:\/\//i.test(f.link_anexo)) return E('link_anexo', 'O link do anexo deve começar com http:// ou https://.')
  }
  if (i === 1) {
    if (!f.conta_id) return E('conta_id', f.tipo === 'receber' ? 'Escolha a conta de recebimento.' : 'Escolha a conta de pagamento.')
    if (!f.categoria_id) return E('categoria_id', aluguel ? 'Escolha a categoria do aluguel.' : 'Escolha a categoria.')
    if (!(num(f.valor_base) > 0)) return E('valor_base', aluguel ? 'Informe o valor do aluguel.' : 'Informe o valor da parcela.')
    const d = int(f.dia_vencimento)
    if (!(d >= 1 && d <= 31)) return E('dia_vencimento', 'Dia de vencimento entre 1 e 31.')
    const bonif = txt(f.bonificacao_valor).trim() ? num(f.bonificacao_valor) : 0
    if (bonif == null || bonif < 0) return E('bonificacao_valor', `${rot.desconto} inválido(a).`)
    if (bonif > 0 && !(int(f.bonificacao_meses) > 0)) return E('bonificacao_meses', `${rot.desconto} maior que zero: informe por quantos meses vale.`)
    if (bonif >= num(f.valor_base)) return E('bonificacao_valor', `${rot.desconto} não pode ser maior ou igual ao valor ${aluguel ? 'do aluguel' : 'da parcela'}.`)
    if (repasse) {
      const dr = int(f.dia_repasse)
      if (!(dr >= 1 && dr <= 31)) return E('dia_repasse', 'Dia do repasse entre 1 e 31.')
      const pct = txt(f.taxa_adm_pct).trim() ? num(f.taxa_adm_pct) : 0
      if (pct == null || pct < 0 || pct > 100) return E('taxa_adm_pct', 'Taxa de administração entre 0% e 100%.')
      if (txt(f.valor_primeiro_mes).trim() && !(num(f.valor_primeiro_mes) > 0)) return E('valor_primeiro_mes', 'Valor do 1º mês inválido (deixe em branco para usar o proporcional).')
      const saldo = txt(f.saldo_inicial_valor).trim() ? num(f.saldo_inicial_valor) : 0
      if (saldo == null || saldo < 0) return E('saldo_inicial_valor', 'Saldo inicial com a administradora inválido.')
      if (saldo > 0 && !YM.test(txt(f.saldo_inicial_competencia))) return E('saldo_inicial_competencia', 'Informe a competência do saldo inicial.')
    }
    const meses = Array.isArray(f.meses_sem_cobranca) ? f.meses_sem_cobranca : []
    if (meses.some(m => !YM.test(String(m)))) return E('meses_sem_cobranca', 'Mês sem cobrança inválido.')
  }
  if (i === 2 && f.indice_reajuste === 'FIXO' && num(f.percentual_fixo) == null) return E('percentual_fixo', 'Informe o percentual fixo.')
  if (i === 3 && aluguel && f.tem_condominio) {
    if (!(num(f.valor_condominio_previsto) > 0)) return E('valor_condominio_previsto', 'Informe o valor previsto do condomínio.')
    const d = int(f.dia_vencimento_condominio)
    if (f.dia_vencimento_condominio && !(d >= 1 && d <= 31)) return E('dia_vencimento_condominio', 'Dia de vencimento do condomínio entre 1 e 31.')
    if (!f.categoria_condominio_id) return E('categoria_condominio_id', 'Escolha a categoria do condomínio.')
  }
  return { erro: '', campo: null }
}

export function validarEtapa(i, f) {
  return validarEtapaCampo(i, f).erro
}

const nome = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Categoria sugerida para aluguel e condomínio (só em contrato de Aluguel): "Moradia" do tipo certo
// (ou 'both'), se existir.
export function sugerirCategoria(categories, tipo) {
  const ok = (c) => c.type === tipo || c.type === 'both'
  return (categories || []).find(c => ok(c) && nome(c.name) === 'moradia')?.id || ''
}
