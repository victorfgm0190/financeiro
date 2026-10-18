// OFX (extrato bancário) → lançamentos. Aceita OFX 1.x (SGML, tags sem fechamento) e 2.x (XML),
// em UTF-8 ou latin-1/windows-1252 (CHARSET:1252 ou encoding="ISO-8859-1"). Usa DTPOSTED (data),
// TRNAMT (valor; negativo = saída), MEMO/NAME (descrição) e FITID; e BANKID/ACCTID para
// identificar o extrato ("este extrato parece ser da conta X").

// Bytes → texto, respeitando o charset declarado no cabeçalho.
export function decodificarOfx(bytes) {
  if (typeof bytes === 'string') return bytes
  const cabeca = new TextDecoder('latin1').decode(bytes.slice(0, 600))
  const latin = /CHARSET:\s*(1252|8859|ISO-8859-1|WINDOWS-1252)|encoding="(ISO-8859-1|windows-1252)"/i.test(cabeca)
  if (latin) return new TextDecoder('windows-1252').decode(bytes)
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  // Sem declaração e com caractere inválido no UTF-8 → era latin-1.
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8
}

export const pareceOfx = (texto) => /<OFX>/i.test(texto) || /^\s*OFXHEADER:/i.test(texto)

const campo = (bloco, tag) => {
  const m = bloco.match(new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, 'i'))
  return m ? m[1].trim() : ''
}
const desfazerEntidades = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")

// "20261015120000[-3:BRT]" → '2026-10-15'
function dataOfx(s) {
  const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
// "-123.45" | "-123,45" | "1234" → número; NaN se inválido.
function valorOfx(s) {
  let t = String(s || '').trim().replace(/\s/g, '')
  if (!t) return NaN
  if (t.includes(',') && !t.includes('.')) t = t.replace(',', '.')
  else if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

// Texto → { banco, conta, linhas: [{ linha, data, valor, descricao, fitid }], erros: [...] }.
// `linha` = posição da transação no extrato (1, 2, 3…), para as mensagens de erro.
export function lerOfx(texto) {
  const banco = campo(texto, 'BANKID') || campo(texto, 'ORG') || null
  const conta = campo(texto, 'ACCTID') || null
  const blocos = texto.split(/<STMTTRN>/i).slice(1).map(b => b.split(/<\/STMTTRN>/i)[0])
  const linhas = []
  const erros = []
  blocos.forEach((b, i) => {
    const linha = i + 1
    const data = dataOfx(campo(b, 'DTPOSTED'))
    const valor = valorOfx(campo(b, 'TRNAMT'))
    const descricao = desfazerEntidades(campo(b, 'MEMO') || campo(b, 'NAME')).replace(/\s+/g, ' ').trim()
    const fitid = campo(b, 'FITID') || null
    const motivos = []
    if (!data) motivos.push('data inválida')
    if (!Number.isFinite(valor) || valor === 0) motivos.push('valor inválido')
    if (!descricao) motivos.push('sem descrição')
    if (motivos.length) erros.push({ linha, motivo: `Transação ${linha}: ${motivos.join(', ')}` })
    linhas.push({ linha, data, valor, descricao, categoria: '', favorecido: '', fitid, erros: motivos })
  })
  return { banco, conta, linhas, erros }
}
