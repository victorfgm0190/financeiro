// Regras do cadastro de CLIENTES da plataforma (pedido público + Controle de Clientes), usadas pelo
// formulário e pela API. Sem React e sem dependências: roda nos dois lados.

export const STATUS_CLIENTE = ['pedido', 'aprovado', 'ativo', 'suspenso', 'cancelado', 'recusado']
export const ROTULO_STATUS = {
  pedido: 'Pedido', aprovado: 'Aprovado', ativo: 'Ativo', suspenso: 'Suspenso', cancelado: 'Cancelado', recusado: 'Recusado',
}
export const DOMINIO_CLIENTES = 'finup.app.br'

export const soDigitos = (v) => String(v ?? '').replace(/\D/g, '')

// ─── CPF / CNPJ ─────────────────────────────────────────────────────────────────────────────────
// CPF só dígitos. CNPJ numérico ou ALFANUMÉRICO (Receita, 2026): 12 primeiras posições [0-9A-Z] e
// 2 DVs numéricos; guardado em maiúsculas, sem máscara.

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

export const normalizarCnpj = (v) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
export const normalizarDocumento = (tipo, v) => (tipo === 'PJ' ? normalizarCnpj(v) : soDigitos(v))

export function cnpjValido(v) {
  const d = normalizarCnpj(v)
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || /^(.)\1{13}$/.test(d)) return false
  // Módulo 11 com valor = código ASCII − 48 (num dígito, o próprio número).
  const dv = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = pesos.reduce((s, p, i) => s + (d.charCodeAt(i) - 48) * p, 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}

export const documentoValido = (tipo, v) => (tipo === 'PJ' ? cnpjValido(v) : cpfValido(v))

export function formatarDocumento(v) {
  const d = normalizarCnpj(v)
  if (/^\d{11}$/.test(d)) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5')
  return d
}

// ─── Telefone ───────────────────────────────────────────────────────────────────────────────────
// Guardado só com dígitos (DDD + número, sem o 55). Celular = 11 dígitos com 9 depois do DDD; fixo
// (10 dígitos) só vale marcado "não é WhatsApp".

export function normalizarTelefone(v) {
  const d = soDigitos(v)
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d
}
export const celularValido = (v) => /^[1-9]{2}9\d{8}$/.test(normalizarTelefone(v))
export const fixoValido = (v) => /^[1-9]{2}[2-8]\d{7}$/.test(normalizarTelefone(v))

// Motivo de recusa do telefone, ou null.
export function problemaTelefone(v, { naoWhatsApp = false } = {}) {
  if (celularValido(v)) return null
  if (fixoValido(v)) return naoWhatsApp ? null : 'Telefone fixo só é aceito marcando "não é WhatsApp"'
  return 'Telefone inválido: informe DDD + celular com 9 dígitos, ex.: (43) 99999-9999'
}

// Máscara enquanto digita: (43) 99999-9999 ou, com 10 dígitos, (43) 9999-9999.
export function mascararTelefone(v) {
  const d = normalizarTelefone(v).slice(0, 11)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  const resto = d.slice(2)
  const corte = d.length === 11 ? 5 : 4
  return `(${d.slice(0, 2)}) ${resto.slice(0, corte)}${resto.length > corte ? `-${resto.slice(corte)}` : ''}`
}

// Número para o wa.me (55 + dígitos), ou '' quando não é celular.
export const telefoneWhatsApp = (v) => (celularValido(v) ? `55${normalizarTelefone(v)}` : '')

// Link do botão "Abrir no WhatsApp", ou null (botão desabilitado) quando o número não é celular.
export function linkWhatsApp(telefone, mensagem = '') {
  const n = telefoneWhatsApp(telefone)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(mensagem)}` : null
}

// ─── SIGLA (subdomínio sigla.finup.app.br) ──────────────────────────────────────────────────────

export const SIGLA_MIN = 2
export const SIGLA_MAX = 20
export const SIGLAS_RESERVADAS = ['www', 'app', 'api', 'admin', 'mail', 'suporte', 'login', 'finup', 'vm']
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
