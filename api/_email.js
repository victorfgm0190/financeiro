import process from 'node:process'

// ENVIO DE E-MAIL pelo Resend (API HTTP, sem SDK). Variáveis na Vercel: RESEND_API_KEY e EMAIL_FROM
// ("Finup <nao-responda@finup.app.br>"). As respostas dos clientes vão para a caixa de contato.
// Log: só destinatário, assunto, id do Resend e status — nunca a chave nem o conteúdo.
export const EMAIL_CONTATO = 'contato@finup.app.br'
const URL_RESEND = 'https://api.resend.com/emails'

export class ErroEmail extends Error {
  constructor(message, status = 502) {
    super(message)
    this.status = status
  }
}

export async function enviarEmail({ para, assunto, html, texto }, { env = process.env } = {}) {
  if (!env.RESEND_API_KEY) throw new ErroEmail('Envio de e-mail não configurado', 503)
  if (!env.EMAIL_FROM) throw new ErroEmail('Envio de e-mail não configurado (EMAIL_FROM)', 503)
  if (!para) throw new ErroEmail('Destinatário não informado', 400)

  let res
  try {
    res = await fetch(URL_RESEND, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [para], reply_to: EMAIL_CONTATO, subject: assunto, html, text: texto }),
    })
  } catch (err) {
    console.error('[email] falha de rede', { para, assunto, erro: err?.message })
    throw new ErroEmail('Não foi possível conectar ao serviço de e-mail')
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.id) {
    console.error('[email] recusado', { para, assunto, status: res.status })
    throw new ErroEmail(`Serviço de e-mail recusou o envio (${res.status}${json.message ? `: ${json.message}` : ''})`)
  }
  console.info('[email] enviado', { para, assunto, id: json.id, status: res.status })
  return { id: json.id }
}
