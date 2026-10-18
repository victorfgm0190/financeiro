import { describe, it, expect } from 'vitest'
import { escaparTexto, dobrarLinha, gerarIcs, hashIcs, pareceIcs } from './agendaIcs'

const octetos = (s) => new TextEncoder().encode(s).length
const desdobrar = (ics) => ics.replace(/\r\n /g, '')

describe('escaparTexto (RFC 5545 3.3.11)', () => {
  it('escapa barra invertida, vírgula, ponto e vírgula e quebras de linha', () => {
    expect(escaparTexto('a,b;c\\d\ne\r\nf')).toBe('a\\,b\\;c\\\\d\\ne\\nf')
  })
  it('null/undefined viram vazio', () => {
    expect(escaparTexto(null)).toBe('')
  })
})

describe('dobrarLinha (3.1)', () => {
  it('linha curta fica como está', () => {
    expect(dobrarLinha('SUMMARY:Aluguel')).toBe('SUMMARY:Aluguel')
  })
  it('nenhuma linha passa de 75 octetos e desdobrar devolve o original', () => {
    const linha = `DESCRIPTION:${'x'.repeat(300)}`
    const dobrada = dobrarLinha(linha)
    for (const l of dobrada.split('\r\n')) expect(octetos(l)).toBeLessThanOrEqual(75)
    expect(dobrada.split('\r\n').slice(1).every(l => l.startsWith(' '))).toBe(true)
    expect(desdobrar(dobrada)).toBe(linha)
  })
  it('conta octetos UTF-8 e nunca corta um caractere no meio', () => {
    const linha = `SUMMARY:${'ção—⚠😀'.repeat(30)}`
    const dobrada = dobrarLinha(linha)
    for (const l of dobrada.split('\r\n')) {
      expect(octetos(l)).toBeLessThanOrEqual(75)
      expect(l).not.toMatch(/�/)
    }
    expect(desdobrar(dobrada)).toBe(linha)
  })
})

describe('gerarIcs', () => {
  const agora = new Date('2026-10-18T15:00:00Z')
  const eventos = [
    { uid: 'ag-2@finup.app.br', data: '2026-11-05', titulo: 'Luz, água; gás — R$ 300,00', descricao: 'Conta: Itaú\nCategoria: Casa', url: 'https://www.finup.app.br/' },
    { uid: 'ag-1@finup.app.br', data: '2026-10-31', titulo: 'Aluguel — R$ 1.500,00' },
  ]
  const ics = gerarIcs({ tipo: 'despesa', eventos, agora })

  it('estrutura válida: CRLF, cabeçalho do calendário, eventos de dia inteiro', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(ics).toContain('X-WR-CALNAME:Finup Despesas')
    expect(ics).toContain('X-WR-TIMEZONE:America/Sao_Paulo')
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H')
    expect(ics).toContain('X-PUBLISHED-TTL:PT1H')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261101')
    expect(ics).toContain('DTSTAMP:20261018T150000Z')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics.match(/END:VEVENT/g)).toHaveLength(2)
    for (const l of ics.split('\r\n')) expect(octetos(l)).toBeLessThanOrEqual(75)
    expect(pareceIcs(ics)).toBe(true)
  })
  it('eventos em ordem de data; título e descrição escapados', () => {
    const u = desdobrar(ics)
    expect(u.indexOf('UID:ag-1@')).toBeLessThan(u.indexOf('UID:ag-2@'))
    expect(u).toContain('SUMMARY:Luz\\, água\\; gás — R$ 300\\,00')
    expect(u).toContain('DESCRIPTION:Conta: Itaú\\nCategoria: Casa')
    expect(u).toContain('URL;VALUE=URI:https://www.finup.app.br/')
  })
  it('Receitas: nome do calendário', () => {
    expect(gerarIcs({ tipo: 'receita', eventos: [] })).toContain('X-WR-CALNAME:Finup Receitas')
  })
  it('hash ignora o DTSTAMP (mesmo conteúdo em outra hora → mesmo hash) e muda com o conteúdo', () => {
    const depois = gerarIcs({ tipo: 'despesa', eventos, agora: new Date('2026-10-19T09:00:00Z') })
    expect(depois).not.toBe(ics)
    expect(hashIcs(depois)).toBe(hashIcs(ics))
    const outro = gerarIcs({ tipo: 'despesa', eventos: [{ ...eventos[1], titulo: 'Aluguel — R$ 1.600,00' }, eventos[0]], agora })
    expect(hashIcs(outro)).not.toBe(hashIcs(ics))
  })
  it('pareceIcs recusa o que não é VCALENDAR', () => {
    expect(pareceIcs('')).toBe(false)
    expect(pareceIcs('<html>')).toBe(false)
    expect(pareceIcs('BEGIN:VCALENDAR\r\n')).toBe(false)
  })
})
