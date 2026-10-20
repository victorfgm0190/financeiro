// Validação do cadastro de contrato, etapa por etapa (o formulário guarda texto; valores no padrão BR).
import { parseValorBR } from '../valorBR.js'

const num = (v) => { const n = parseValorBR(v); return Number.isFinite(n) ? n : null }
const int = (v) => (v === '' || v == null ? null : Number.parseInt(v, 10))
const txt = (v) => (v == null ? '' : String(v))

export function validarEtapa(i, f) {
  if (i === 0) {
    if (!f.perfil_id) return 'Escolha o perfil.'
    if (!txt(f.favorecido).trim()) return 'Informe o favorecido (imobiliária ou proprietário).'
    if (!f.data_inicio) return 'Informe o início da vigência.'
    if (!f.sem_fim && !f.data_fim) return 'Informe o fim da vigência ou marque "Sem data de fim".'
    if (!f.sem_fim && f.data_fim < f.data_inicio) return 'O fim da vigência é antes do início.'
    if (f.link_anexo && !/^https?:\/\//i.test(f.link_anexo)) return 'O link do anexo deve começar com http:// ou https://.'
  }
  if (i === 1) {
    if (!f.conta_id) return 'Escolha a conta de pagamento.'
    if (!f.categoria_id) return 'Escolha a categoria do aluguel.'
    if (!(num(f.valor_base) > 0)) return 'Informe o valor do aluguel.'
    const d = int(f.dia_vencimento)
    if (!(d >= 1 && d <= 31)) return 'Dia de vencimento entre 1 e 31.'
    const bonif = txt(f.bonificacao_valor).trim() ? num(f.bonificacao_valor) : 0
    if (bonif == null || bonif < 0) return 'Bonificação inválida.'
    if (bonif > 0 && !(int(f.bonificacao_meses) > 0)) return 'Bonificação maior que zero: informe por quantos meses ela vale.'
    if (bonif >= num(f.valor_base)) return 'A bonificação não pode ser maior ou igual ao aluguel.'
  }
  if (i === 2 && f.indice_reajuste === 'FIXO' && num(f.percentual_fixo) == null) return 'Informe o percentual fixo.'
  if (i === 3 && f.tem_condominio) {
    if (!(num(f.valor_condominio_previsto) > 0)) return 'Informe o valor previsto do condomínio.'
    const d = int(f.dia_vencimento_condominio)
    if (f.dia_vencimento_condominio && !(d >= 1 && d <= 31)) return 'Dia de vencimento do condomínio entre 1 e 31.'
    if (!f.categoria_condominio_id) return 'Escolha a categoria do condomínio.'
  }
  return ''
}

const nome = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Categoria sugerida para aluguel e condomínio: "Moradia" do tipo certo (ou 'both'), se existir.
export function sugerirCategoria(categories, tipo) {
  const ok = (c) => c.type === tipo || c.type === 'both'
  return (categories || []).find(c => ok(c) && nome(c.name) === 'moradia')?.id || ''
}
