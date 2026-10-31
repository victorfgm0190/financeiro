// Nº de contrato: comparação, busca do contrato cadastrado e a migração das descrições antigas.
// Genérico: nada de número/nome fixo — tudo vem dos dados de cada cliente.

// Só letras/dígitos, sem pontuação nem zeros à esquerda: "AB-778/2026" = "ab7782026"; "000123" = "123".
export function chaveNumeroContrato(n) {
  const s = String(n ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  return s.replace(/^0+(?=[0-9a-z])/, '')
}

export const mesmoNumeroContrato = (a, b) => {
  const ka = chaveNumeroContrato(a)
  return ka.length >= 3 && ka === chaveNumeroContrato(b)
}

const ENCERRADOS = ['rescindido', 'encerrado', 'cancelado']

// Contrato cadastrado (módulo Contratos, contratos.numero) com o mesmo número: 'pagar' para despesa,
// 'receber' para receita; rescindido/encerrado fica de fora.
export function contratoPorNumero(numero, contratos = [], { tipoMov = 'expense' } = {}) {
  if (chaveNumeroContrato(numero).length < 3) return null
  const tipo = tipoMov === 'income' ? 'receber' : 'pagar'
  return (contratos || []).find(c =>
    mesmoNumeroContrato(c.numero, numero)
    && (!c.tipo || c.tipo === tipo)
    && !ENCERRADOS.includes(String(c.status || '').toLowerCase())) || null
}

// Sufixo que o Assistente gravava: "Academia X · Contrato nº 12345" (descrição do agendamento) ou
// "… · Contrato nº 12345" / "Contrato nº 12345" (observação do lançamento).
const RE_SUFIXO = /(?:\s*·\s*|^\s*)Contrato\s+n[º°o.]?\s*([A-Za-z0-9][A-Za-z0-9./-]{0,39})\s*$/i

// → { texto, numero } com o texto sem o sufixo, ou null se não há sufixo.
export function separarContratoDoTexto(texto) {
  const s = String(texto ?? '')
  const m = RE_SUFIXO.exec(s)
  if (!m) return null
  return { texto: s.slice(0, m.index).trim(), numero: m[1] }
}

// Plano da migração (scripts/migrar-numero-contrato.mjs): para cada registro com o sufixo, o texto
// limpo e o número no campo próprio. Quem já tem numero_contrato DIFERENTE fica de fora (conflito,
// listado no relatório) — nada é sobrescrito.
//   itens: [{ id, description?, notes?, numero_contrato }]
//   → { mudar: [{ id, campos: { description?, notes?, numero_contrato }, historico: [{ campo, de, para }] }], conflitos }
export function planoMigracaoNumeroContrato(itens = [], { campos = ['description'] } = {}) {
  const mudar = []
  const conflitos = []
  for (const it of itens) {
    const novos = {}
    const historico = []
    let numero = null
    let conflito = false
    for (const campo of campos) {
      const sep = separarContratoDoTexto(it[campo])
      if (!sep) continue
      if (numero && !mesmoNumeroContrato(numero, sep.numero)) { conflito = true; break }
      numero = sep.numero
      novos[campo] = sep.texto || null
      historico.push({ campo, de: it[campo], para: sep.texto || null })
    }
    if (!numero) continue
    if (conflito || (it.numero_contrato && !mesmoNumeroContrato(it.numero_contrato, numero))) {
      conflitos.push({ id: it.id, atual: it.numero_contrato || null, encontrado: numero })
      continue
    }
    if (!it.numero_contrato) historico.push({ campo: 'numeroContrato', de: null, para: numero })
    mudar.push({ id: it.id, campos: { ...novos, numero_contrato: it.numero_contrato || numero }, historico })
  }
  return { mudar, conflitos }
}
