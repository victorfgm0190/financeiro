// ENCARGOS E DESCONTOS NA PARCELA PRINCIPAL (aluguel) — funções puras.
// Cada item do contrato (contrato.encargos, vindos de contrato_itens com na_parcela) entra no valor da
// parcela de número N enquanto estiver ativo: posição k = N − parcela_inicio + 1, de 1 a parcelas_total.
// Na composição: "Seguro 3/36 +49,06". Ao passar da última, sai sozinho. Não sofre reajuste (o
// reajuste é só do valor contratual). Vale igual para contrato a pagar e a receber: o encargo soma no
// valor da parcela (o que se paga ou o que se recebe), o desconto subtrai.
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export const SINAIS = { encargo: 'Encargo (+)', desconto: 'Desconto (−)' }

export const posicaoDoEncargo = (e, numero) => Number(numero) - Number(e?.parcela_inicio) + 1
export const encargoAtivoNa = (e, numero) => {
  if (!e || e.ativo === false || !(Number(e.valor) > 0)) return false
  const k = posicaoDoEncargo(e, numero)
  return Number.isFinite(k) && k >= 1 && k <= Number(e.parcelas_total)
}

// Itens da composição da parcela de número `numero` (na ordem do cadastro).
export function itensEncargos(contrato, numero) {
  if (!Number.isFinite(Number(numero))) return []
  return (contrato?.encargos || []).filter(e => encargoAtivoNa(e, numero)).map(e => {
    const k = posicaoDoEncargo(e, numero)
    const sinal = e.sinal === 'desconto' ? -1 : 1
    return {
      tipo: e.sinal === 'desconto' ? 'desconto' : 'encargo', desc: `${e.descricao} ${k}/${e.parcelas_total}`,
      valor: r2(sinal * Number(e.valor)), encargo_id: e.id ?? null, parcela_item: k, parcelas_item: Number(e.parcelas_total),
    }
  })
}

// Contrato já em andamento: "na parcela N do contrato, este item está na parcela k dele" → início.
export const inicioPelaParcelaAtual = (numeroDoContrato, parcelaDoItem) => Number(numeroDoContrato) - Number(parcelaDoItem) + 1

// Encargo do formulário (valor em texto) → linha de contrato_itens (api/contrato-itens).
export const encargoParaItem = (e) => ({
  descricao: String(e.descricao || '').trim(), grupo: 'outro', responsavel: 'inquilino', valor_previsto: r2(e.valor),
  categoria_id: null, ativo: e.ativo !== false, na_parcela: true, sinal: e.sinal === 'desconto' ? 'desconto' : 'encargo',
  parcelas_total: Number(e.parcelas_total), parcela_inicio: Number(e.parcela_inicio),
})
// Linha da API (contrato_itens ou o JSON da lista) → encargo do contrato.
export const encargoDoItem = (i) => ({
  id: i.id ?? null, descricao: i.descricao, sinal: i.sinal === 'desconto' ? 'desconto' : 'encargo',
  valor: r2(i.valor ?? i.valor_previsto), parcelas_total: Number(i.parcelas_total), parcela_inicio: Number(i.parcela_inicio), ativo: i.ativo !== false,
})
