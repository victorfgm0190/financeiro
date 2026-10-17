import { DOMINIO_CLIENTES } from '../src/lib/plataforma.js'
import { EMAIL_CONTATO } from './_email.js'

// MODELO do e-mail de boas-vindas (HTML + texto). Mesmo conteúdo da mensagem de boas-vindas de
// api/_provisionar.js; o HTML usa tabelas e estilos inline (clientes de e-mail) e um bloco
// prefers-color-scheme para quem suporta modo escuro.
const VERDE = '#0F6E56'
const VERDE_CLARO = '#3CC29B'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

export function modeloBoasVindas(c) {
  const primeiroNome = String(c.nome || '').trim().split(/\s+/)[0] || 'tudo bem'
  const sigla = String(c.sigla).toUpperCase()
  const acesso = `https://${DOMINIO_CLIENTES}`
  const endereco = `https://${c.sigla}.${DOMINIO_CLIENTES}`
  const assunto = `Seu acesso ao Finup — ambiente ${sigla}`
  const rodape = `Dúvidas? Responda este e-mail ou escreva para ${EMAIL_CONTATO}`

  const texto = [
    `Olá, ${primeiroNome}! Seu pedido para usar o Finup foi aprovado.`,
    '',
    `Acesse: ${acesso}`,
    `Ambiente: ${sigla}`,
    `Usuário: admin (ou o e-mail ${c.email})`,
    `Endereço do seu ambiente: ${endereco}`,
    '',
    'Na próxima etapa você vai receber o link para criar a sua senha de acesso.',
    '',
    rodape,
  ].join('\n')

  const linha = (rotulo, valor) => `
              <tr>
                <td class="fx-rotulo" style="padding:8px 0;font-size:13px;color:#5b6b66;width:150px;vertical-align:top;">${rotulo}</td>
                <td class="fx-texto" style="padding:8px 0;font-size:15px;color:#14211d;font-weight:600;word-break:break-word;">${valor}</td>
              </tr>`
  const link = (url) => `<a href="${esc(url)}" class="fx-link" style="color:${VERDE};text-decoration:underline;">${esc(url)}</a>`

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(assunto)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .fx-fundo { background:#0d1412 !important; }
    .fx-cartao { background:#17211e !important; border-color:#2a3833 !important; }
    .fx-texto { color:#e6eeeb !important; }
    .fx-rotulo, .fx-suave { color:#9fb1ab !important; }
    .fx-link { color:${VERDE_CLARO} !important; }
    .fx-aviso { background:#1f2b27 !important; color:#e6eeeb !important; }
  }
  @media (max-width: 480px) {
    .fx-cartao td.fx-pad { padding:20px !important; }
    .fx-rotulo { display:block !important; width:auto !important; padding-bottom:0 !important; }
    .fx-texto { display:block !important; padding-top:2px !important; }
  }
</style>
</head>
<body class="fx-fundo" style="margin:0;padding:0;background:#f2f5f4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="fx-fundo" style="background:#f2f5f4;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="fx-cartao" style="max-width:560px;background:#ffffff;border:1px solid #dfe7e4;border-radius:12px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <tr>
            <td style="background:${VERDE};padding:20px 28px;">
              <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:.3px;">Finup</span>
            </td>
          </tr>
          <tr>
            <td class="fx-pad" style="padding:28px;">
              <p class="fx-texto" style="margin:0 0 8px;font-size:18px;font-weight:600;color:#14211d;">Olá, ${esc(primeiroNome)}!</p>
              <p class="fx-texto" style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#14211d;">Seu pedido para usar o Finup foi aprovado.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${linha('Acesse', link(acesso))}
                ${linha('Ambiente', esc(sigla))}
                ${linha('Usuário', `admin <span class="fx-suave" style="font-weight:400;color:#5b6b66;">(ou o e-mail ${esc(c.email)})</span>`)}
                ${linha('Endereço do seu ambiente', link(endereco))}
              </table>
              <p class="fx-aviso" style="margin:24px 0 0;padding:12px 14px;border-radius:8px;background:#eaf5f1;font-size:14px;line-height:1.5;color:#14211d;">
                Na próxima etapa você vai receber o link para criar a sua senha de acesso.
              </p>
            </td>
          </tr>
          <tr>
            <td class="fx-suave" style="padding:16px 28px 24px;font-size:12px;line-height:1.5;color:#5b6b66;border-top:1px solid #dfe7e4;">
              Dúvidas? Responda este e-mail ou escreva para <a href="mailto:${EMAIL_CONTATO}" class="fx-link" style="color:${VERDE};">${EMAIL_CONTATO}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { assunto, html, texto }
}
