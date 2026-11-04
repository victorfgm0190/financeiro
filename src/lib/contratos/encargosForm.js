// Encargos e descontos na parcela — linhas do formulário do contrato (EncargosNaParcela) ↔ encargo.
import { parseValorBR, valorBRFormatado } from '../valorBR.js'
import { inicioPelaParcelaAtual } from './encargos.js'

const int = (v) => (v === '' || v == null ? null : Number.parseInt(v, 10))

// Encargo do contrato → linha do formulário (valor em texto BR; começa pela parcela do contrato).
export const encargoParaForm = (e) => ({
  id: e.id ?? null, descricao: e.descricao || '', sinal: e.sinal === 'desconto' ? 'desconto' : 'encargo',
  valor: e.valor != null ? valorBRFormatado(e.valor) : '', parcelas_total: e.parcelas_total != null ? String(e.parcelas_total) : '',
  modo: 'inicio', parcela_inicio: e.parcela_inicio != null ? String(e.parcela_inicio) : '1', parcela_atual: '',
})
// Linha do formulário → encargo do contrato (null se incompleta). `proxima` = nº da próxima parcela
// pendente do contrato (contrato em andamento: "hoje está na parcela k de N").
export function formParaEncargo(l, proxima) {
  const valor = parseValorBR(l.valor)
  const total = int(l.parcelas_total)
  const inicio = l.modo === 'atual' ? (int(l.parcela_atual) ? inicioPelaParcelaAtual(proxima, int(l.parcela_atual)) : null) : int(l.parcela_inicio)
  if (!String(l.descricao).trim() || !(valor > 0) || !(total >= 1) || !Number.isInteger(inicio)) return null
  return { id: l.id ?? null, descricao: String(l.descricao).trim(), sinal: l.sinal, valor: Math.round(valor * 100) / 100, parcelas_total: total, parcela_inicio: inicio, ativo: true }
}
export const encargosIncompletos = (linhas, proxima) => (linhas || []).filter(l => !formParaEncargo(l, proxima))

