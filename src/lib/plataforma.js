// Regras do cadastro de CLIENTES da plataforma (pedido público + Controle de Clientes), usadas pelo
// formulário e pela API. Sem React e sem dependências: roda nos dois lados.

export const STATUS_CLIENTE = ['pedido', 'aprovado', 'ativo', 'suspenso', 'cancelado', 'recusado']
export const ROTULO_STATUS = {
  pedido: 'Pedido', aprovado: 'Aprovado', ativo: 'Ativo', suspenso: 'Suspenso', cancelado: 'Cancelado', recusado: 'Recusado',
}
export const DOMINIO_CLIENTES = 'finup.app.br'

export const soDigitos = (v) => String(v ?? '').replace(/\D/g, '')

// ─── CPF / CNPJ ─────────────────────────────────────────────────────────────────────────────────
// Só dígitos (o CNPJ alfanumérico da Receita ainda não é aceito nesta fase).

export function cpfValido(v) {
  const d = soDigitos(v)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n) => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

export function cnpjValido(v) {
  const d = soDigitos(v)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const dv = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = pesos.reduce((s, p, i) => s + Number(d[i]) * p, 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}

export const documentoValido = (tipo, v) => (tipo === 'PJ' ? cnpjValido(v) : cpfValido(v))

export function formatarDocumento(v) {
  const d = soDigitos(v)
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  return d
}

// Telefone brasileiro só com dígitos (DDD + número = 10 ou 11; com o 55 na frente, 12 ou 13).
export const telefoneValido = (v) => /^\d{10,13}$/.test(soDigitos(v))

// Número para o wa.me: sem o 55, acrescenta o código do Brasil.
export function telefoneWhatsApp(v) {
  const d = soDigitos(v)
  if (!d) return ''
  return d.length <= 11 ? `55${d}` : d
}

// ─── SIGLA (subdomínio sigla.finup.app.br) ──────────────────────────────────────────────────────

export const SIGLA_MIN = 2
export const SIGLA_MAX = 20
export const SIGLAS_RESERVADAS = ['www', 'app', 'api', 'admin', 'mail', 'suporte', 'login', 'finup']
const PARTICULAS = new Set(['de', 'da', 'do', 'dos', 'das'])

// Sem acento, minúscula, só letras e números.
export const normalizarSigla = (v) =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Motivo pelo qual a sigla não serve (formato/reservada), ou null. Disponibilidade é no banco.
export function problemaSigla(sigla) {
  const s = String(sigla ?? '')
  if (!s) return 'Informe a sigla'
  if (!/^[a-z0-9]+$/.test(s)) return 'Use só letras minúsculas e números'
  if (s.length < SIGLA_MIN || s.length > SIGLA_MAX) return `A sigla precisa ter de ${SIGLA_MIN} a ${SIGLA_MAX} caracteres`
  if (SIGLAS_RESERVADAS.includes(s)) return 'Essa sigla é reservada'
  return null
}

const palavrasDoNome = (nome) =>
  String(nome ?? '').split(/\s+/).map(normalizarSigla).filter(p => p && !PARTICULAS.has(p))

// Candidatas em ordem de preferência: iniciais; iniciais + letras do último sobrenome (uma a mais
// por vez); depois iniciais + número. Só as que passam em problemaSigla.
export function candidatasSigla(nome, limiteNumeros = 99) {
  const palavras = palavrasDoNome(nome)
  if (!palavras.length) return []
  const base = palavras.map(p => p[0]).join('').slice(0, SIGLA_MAX)
  const ultimo = palavras[palavras.length - 1]
  const lista = [base]
  for (let k = 2; k <= ultimo.length; k++) lista.push((base + ultimo.slice(1, k)).slice(0, SIGLA_MAX))
  const raizNumero = problemaSigla(base) ? lista.find(s => !problemaSigla(s)) || base : base
  for (let n = 2; n <= limiteNumeros; n++) lista.push(`${raizNumero.slice(0, SIGLA_MAX - String(n).length)}${n}`)
  return [...new Set(lista)].filter(s => !problemaSigla(s))
}

// Primeira candidata fora de `ocupadas` (Set/array), ou null.
export function sugerirSigla(nome, ocupadas = []) {
  const usadas = new Set(ocupadas)
  return candidatasSigla(nome).find(s => !usadas.has(s)) || null
}
