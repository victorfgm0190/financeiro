import { DOMINIO_CLIENTES } from '../src/lib/plataforma.js'
import { esc, primeiroNomeDe, RODAPE_TEXTO, linha, linhaEmpilhada, link, tabela, paragrafo, aviso, botao, moldura } from './_emailModelo.js'

// MODELO do e-mail de boas-vindas (HTML + texto), enviado no fim do provisionamento do cliente
// (api/_provisionar.js) e no "Reenviar convite". `url` = link do convite (48 h) para o admin criar a
// senha: https://<sigla>.finup.app.br/definir-senha?token=…. Visual comum: api/_emailModelo.js.
export function modeloBoasVindas(c, { url } = {}) {
  const primeiroNome = primeiroNomeDe(c.nome)
  const sigla = String(c.sigla).toUpperCase()
  const acesso = `https://${DOMINIO_CLIENTES}`
  const endereco = `https://${c.sigla}.${DOMINIO_CLIENTES}`
  const assunto = `Seu acesso ao Finup — ambiente ${sigla}`

  const texto = [
    `Olá, ${primeiroNome}! Seu pedido para usar o Finup foi aprovado e o seu ambiente está pronto.`,
    '',
    `Acesse: ${acesso}`,
    `Ambiente: ${sigla}`,
    `Usuário: admin (ou o e-mail ${c.email})`,
    `Endereço do seu ambiente: ${endereco}`,
    '',
    ...(url ? [`Criar minha senha: ${url}`, 'O link vale por 48 horas e só pode ser usado uma vez.', ''] : []),
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
              ${aviso('O link vale por <strong>48 horas</strong> e só pode ser usado uma vez.')}` : ''}`)

  return { assunto, html, texto }
}
