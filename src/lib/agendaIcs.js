// Formato iCalendar (RFC 5545) do feed "Agenda no celular". Sem React e sem Node: o app gera o
// .ics no navegador e o servidor usa o mesmo código (feed vazio, hash). Ver src/lib/agendaFeed.js.
//
// Evento: { uid, data: 'YYYY-MM-DD', titulo, descricao?, url? } → evento de DIA INTEIRO.

export const NOMES_CALENDARIO = { despesa: 'Finup Despesas', receita: 'Finup Receitas' }
export const TIPOS_FEED = ['despesa', 'receita']
const CRLF = '\r\n'

// TEXT (3.3.11): barra invertida, vírgula, ponto e vírgula e quebra de linha.
export function escaparTexto(v) {
  return String(v ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

const bytesUtf8 = (cp) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4)

// Dobra (3.1): no máximo 75 octetos por linha; continuação começa com um espaço (que conta).
// Nunca corta um caractere UTF-8 no meio.
export function dobrarLinha(linha) {
  const partes = []
  let atual = ''
  let tam = 0
  let limite = 75
  for (const ch of linha) {
    const b = bytesUtf8(ch.codePointAt(0))
    if (tam + b > limite) {
      partes.push(atual)
      atual = ''
      tam = 0
      limite = 74 // o espaço da continuação ocupa 1 octeto
    }
    atual += ch
    tam += b
  }
  partes.push(atual)
  return partes.join(`${CRLF} `)
}

const dataIcs = (d) => d.replace(/-/g, '')
function diaSeguinte(d) {
  const [y, m, dd] = d.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, dd + 1))
  return t.toISOString().slice(0, 10)
}
const carimbo = (agora) => agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function gerarIcs({ tipo, eventos = [], agora = new Date() }) {
  const dtstamp = carimbo(agora)
  const l = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Finup//Agenda no celular//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escaparTexto(NOMES_CALENDARIO[tipo] || 'Finup')}`,
    'X-WR-TIMEZONE:America/Sao_Paulo',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  const ordenados = [...eventos].sort((a, b) => a.data.localeCompare(b.data) || a.uid.localeCompare(b.uid))
  for (const e of ordenados) {
    l.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${dataIcs(e.data)}`,
      `DTEND;VALUE=DATE:${dataIcs(diaSeguinte(e.data))}`,
      `SUMMARY:${escaparTexto(e.titulo)}`,
    )
    if (e.descricao) l.push(`DESCRIPTION:${escaparTexto(e.descricao)}`)
    if (e.url) l.push(`URL;VALUE=URI:${e.url}`)
    l.push('TRANSP:TRANSPARENT', 'END:VEVENT')
  }
  l.push('END:VCALENDAR')
  return l.map(dobrarLinha).join(CRLF) + CRLF
}

// Hash do conteúdo SEM as linhas DTSTAMP (mudam a cada geração): mesmo .ics → mesmo hash, no
// navegador e no servidor. cyrb53 (53 bits) em duas passadas → 26 hex; não é segurança, é "mudou?".
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}
export function hashIcs(conteudo) {
  const semCarimbo = String(conteudo || '').split(CRLF).filter(l => !l.startsWith('DTSTAMP:')).join('\n')
  return cyrb53(semCarimbo, 1) + cyrb53(semCarimbo, 2)
}

// Conteúdo aceito pelo servidor: começa e termina como um VCALENDAR e cabe no limite.
export const LIMITE_ICS = 2 * 1024 * 1024
export function pareceIcs(conteudo) {
  const s = String(conteudo || '')
  return s.length > 0 && s.length <= LIMITE_ICS && s.startsWith(`BEGIN:VCALENDAR${CRLF}`) && s.endsWith(`END:VCALENDAR${CRLF}`)
}
