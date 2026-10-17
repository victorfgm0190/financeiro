import { DOMINIO_CLIENTES } from '../src/lib/plataforma.js'
import { esc, primeiroNomeDe, RODAPE_TEXTO, linha, linhaEmpilhada, link, tabela, paragrafo, aviso, moldura } from './_emailModelo.js'

// MODELO do e-mail de boas-vindas (HTML + texto). Mesmo conteúdo da mensagem de boas-vindas de
// api/_provisionar.js; o visual é o comum dos e-mails (api/_emailModelo.js).
export function modeloBoasVindas(c) {
  const primeiroNome = primeiroNomeDe(c.nome)
  const sigla = String(c.sigla).toUpperCase()
  const acesso = `https://${DOMINIO_CLIENTES}`
  const endereco = `https://${c.sigla}.${DOMINIO_CLIENTES}`
  const assunto = `Seu acesso ao Finup — ambiente ${sigla}`

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
    RODAPE_TEXTO,
  ].join('\n')

  const html = moldura(assunto, `${paragrafo(`Olá, ${esc(primeiroNome)}!`, { forte: true })}
              ${paragrafo('Seu pedido para usar o Finup foi aprovado.')}
              ${tabela([
                linha('Acesse', link(acesso)),
                linha('Ambiente', esc(sigla)),
                linha('Usuário', `admin <span class="fx-suave" style="font-weight:400;color:#5b6b66;">(ou o e-mail ${esc(c.email)})</span>`),
                linhaEmpilhada('Endereço do seu ambiente', link(endereco)),
              ])}
              ${aviso('Na próxima etapa você vai receber o link para criar a sua senha de acesso.')}`)

  return { assunto, html, texto }
}
