import { DOMINIO_CLIENTES } from '../src/lib/plataforma.js'
import { esc, primeiroNomeDe, RODAPE_TEXTO, linha, linhaEmpilhada, link, tabela, paragrafo, aviso, botao, moldura, VERDE } from './_emailModelo.js'

// MODELO do e-mail de boas-vindas (HTML + texto), enviado no fim do provisionamento do cliente
// (api/_provisionar.js) e no "Reenviar convite". `url` = link do convite (48 h) para o admin criar a
// senha: https://<sigla>.finup.app.br/definir-senha?token=…. Visual comum: api/_emailModelo.js.
// Depois do botão, "Instale o Finup no celular" (iPhone/Android + link para <endereço>/instalar):
// HTML simples, sem imagem externa nem JavaScript (Gmail/Outlook), e a mesma coisa no texto puro.

// Seção "Instale o Finup no celular" (texto e HTML) para o endereço do ambiente.
export function secaoInstalar(endereco) {
  const passoAPasso = `${endereco}/instalar`
  const texto = [
    'Instale o Finup no celular',
    'Não precisa baixar nada na loja de aplicativos.',
    `- iPhone: abra ${endereco} no Safari → botão Compartilhar → "Adicionar à Tela de Início" → Adicionar.`,
    `- Android: abra ${endereco} no Chrome → menu ⋮ → "Instalar app" (ou "Adicionar à tela inicial").`,
    `Ver passo a passo: ${passoAPasso}`,
  ]
  const item = (rotulo, html) => `
                <tr>
                  <td class="fx-texto" style="padding:6px 12px 6px 0;font-size:14px;font-weight:600;color:#14211d;vertical-align:top;white-space:nowrap;">${rotulo}</td>
                  <td class="fx-texto" style="padding:6px 0;font-size:14px;line-height:1.5;color:#14211d;">${html}</td>
                </tr>`
  const html = `
              <div style="height:8px;line-height:8px;">&nbsp;</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #dfe7e4;">
                <tr><td style="padding-top:20px;">
                  ${paragrafo('Instale o Finup no celular', { forte: true })}
                  <p class="fx-suave" style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#5b6b66;">Não precisa baixar nada na loja de aplicativos.</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${item('iPhone', `Abra ${link(endereco)} no <strong>Safari</strong> → botão <strong>Compartilhar</strong> → <strong>“Adicionar à Tela de Início”</strong> → <strong>Adicionar</strong>.`)}
                    ${item('Android', `Abra no <strong>Chrome</strong> → menu <strong>⋮</strong> → <strong>“Instalar app”</strong> (ou <strong>“Adicionar à tela inicial”</strong>).`)}
                  </table>
                  <p style="margin:12px 0 0;font-size:14px;"><a href="${esc(passoAPasso)}" class="fx-link" style="color:${VERDE};text-decoration:underline;font-weight:600;">Ver passo a passo</a></p>
                </td></tr>
              </table>`
  return { texto, html }
}

export function modeloBoasVindas(c, { url } = {}) {
  const primeiroNome = primeiroNomeDe(c.nome)
  const sigla = String(c.sigla).toUpperCase()
  const acesso = `https://${DOMINIO_CLIENTES}`
  const endereco = `https://${c.sigla}.${DOMINIO_CLIENTES}`
  const assunto = `Seu acesso ao Finup — ambiente ${sigla}`
  const instalar = secaoInstalar(endereco)

  const texto = [
    `Olá, ${primeiroNome}! Seu pedido para usar o Finup foi aprovado e o seu ambiente está pronto.`,
    '',
    `Acesse: ${acesso}`,
    `Ambiente: ${sigla}`,
    `Usuário: admin (ou o e-mail ${c.email})`,
    `Endereço do seu ambiente: ${endereco}`,
    '',
    ...(url ? [`Criar minha senha: ${url}`, 'O link vale por 48 horas e só pode ser usado uma vez.', ''] : []),
    ...instalar.texto,
    '',
    RODAPE_TEXTO,
  ].join('\n')

  const html = moldura(assunto, `${paragrafo(`Olá, ${esc(primeiroNome)}!`, { forte: true })}
              ${paragrafo('Seu pedido para usar o Finup foi aprovado e o seu ambiente está pronto.')}
              ${tabela([
                linha('Acesse', link(acesso)),
                linha('Ambiente', esc(sigla)),
                linha('Usuário', `admin <span class="fx-suave" style="font-weight:400;color:#5b6b66;">(ou o e-mail ${esc(c.email)})</span>`),
                linhaEmpilhada('Endereço do seu ambiente', link(endereco)),
              ])}
              ${url ? `<div style="height:16px;line-height:16px;">&nbsp;</div>
              ${botao('Criar minha senha', url)}
              ${aviso('O link vale por <strong>48 horas</strong> e só pode ser usado uma vez.')}` : ''}
              ${instalar.html}`)

  return { assunto, html, texto }
}
