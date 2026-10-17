import { EMAIL_CONTATO } from './_email.js'

// VISUAL COMUM dos e-mails do Finup (boas-vindas, links de senha): cartão com faixa verde, tabelas e
// estilos inline (clientes de e-mail) e um bloco prefers-color-scheme para quem suporta modo escuro.
export const VERDE = '#0F6E56'
const VERDE_CLARO = '#3CC29B'

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

export const primeiroNomeDe = (nome, padrao = 'tudo bem') => String(nome || '').trim().split(/\s+/)[0] || padrao

export const RODAPE_TEXTO = `Dúvidas? Responda este e-mail ou escreva para ${EMAIL_CONTATO}`

// Linha "rótulo | valor" da tabela de dados. O rótulo tem folga à direita para não encostar no valor.
export const linha = (rotulo, valor) => `
              <tr>
                <td class="fx-rotulo" style="padding:8px 16px 8px 0;font-size:13px;color:#5b6b66;width:150px;vertical-align:top;">${rotulo}</td>
                <td class="fx-texto" style="padding:8px 0;font-size:15px;color:#14211d;font-weight:600;word-break:break-word;">${valor}</td>
              </tr>`

// Rótulo numa linha e o valor embaixo (rótulos longos, como "Endereço do seu ambiente").
export const linhaEmpilhada = (rotulo, valor) => `
              <tr>
                <td colspan="2" style="padding:8px 0;">
                  <div class="fx-rotulo" style="font-size:13px;color:#5b6b66;">${rotulo}</div>
                  <div class="fx-texto" style="padding-top:4px;font-size:15px;color:#14211d;font-weight:600;word-break:break-word;">${valor}</div>
                </td>
              </tr>`

export const link = (url) => `<a href="${esc(url)}" class="fx-link" style="color:${VERDE};text-decoration:underline;">${esc(url)}</a>`

export const tabela = (linhas) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas.join('')}
              </table>`

export const paragrafo = (html, { forte = false } = {}) =>
  `<p class="fx-texto" style="margin:0 0 ${forte ? 8 : 20}px;font-size:${forte ? 18 : 15}px;${forte ? 'font-weight:600;' : 'line-height:1.5;'}color:#14211d;">${html}</p>`

export const aviso = (html) => `<p class="fx-aviso" style="margin:24px 0 0;padding:12px 14px;border-radius:8px;background:#eaf5f1;font-size:14px;line-height:1.5;color:#14211d;">
                ${html}
              </p>`

// Botão "à prova de cliente de e-mail" + o link por extenso para quem não vê o botão.
export const botao = (texto, url) => `
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;">
                <tr>
                  <td style="border-radius:8px;background:${VERDE};">
                    <a href="${esc(url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(texto)}</a>
                  </td>
                </tr>
              </table>
              <p class="fx-suave" style="margin:0 0 20px;font-size:12px;line-height:1.5;color:#5b6b66;word-break:break-all;">
                Se o botão não funcionar, copie e cole no navegador:<br>${link(url)}
              </p>`

export function moldura(assunto, corpo) {
  return `<!doctype html>
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
              ${corpo}
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
}
