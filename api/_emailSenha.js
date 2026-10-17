import { enderecoDoAmbiente } from '../src/lib/ambienteHost.js'
import { esc, primeiroNomeDe, RODAPE_TEXTO, linha, tabela, paragrafo, aviso, botao, moldura } from './_emailModelo.js'

// MODELOS dos e-mails de LINK DE SENHA (mesmo visual das boas-vindas). O link aponta para o endereço
// do ambiente: www.finup.app.br para o 'vm', <sigla>.finup.app.br para os clientes — é lá que o
// token é procurado (no banco daquele ambiente).
export const urlDefinirSenha = (sigla, token) => `${enderecoDoAmbiente(sigla)}/definir-senha?token=${encodeURIComponent(token)}`

export function modeloRedefinirSenha({ nome, url }) {
  const primeiroNome = primeiroNomeDe(nome, '')
  const ola = primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!'
  const assunto = 'Redefinir sua senha do Finup'
  const texto = [
    ola,
    '',
    'Recebemos um pedido para redefinir a sua senha do Finup.',
    `Criar nova senha: ${url}`,
    '',
    'O link vale por 1 hora e só pode ser usado uma vez.',
    'Se não foi você, ignore este e-mail: a sua senha continua a mesma.',
    '',
    RODAPE_TEXTO,
  ].join('\n')
  const html = moldura(assunto, `${paragrafo(esc(ola), { forte: true })}
              ${paragrafo('Recebemos um pedido para redefinir a sua senha do Finup.')}
              ${botao('Criar nova senha', url)}
              ${aviso('O link vale por <strong>1 hora</strong> e só pode ser usado uma vez.<br>Se não foi você, ignore este e-mail: a sua senha continua a mesma.')}`)
  return { assunto, html, texto }
}

export function modeloConvite({ nome, username, sigla, url }) {
  const primeiroNome = primeiroNomeDe(nome, '')
  const ola = primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!'
  const ambiente = String(sigla || '').toUpperCase()
  const assunto = 'Crie sua senha de acesso ao Finup'
  const texto = [
    ola,
    '',
    'Você recebeu acesso ao Finup. Crie a sua senha pelo link abaixo.',
    '',
    `Usuário: ${username}`,
    `Ambiente: ${ambiente}`,
    `Criar minha senha: ${url}`,
    '',
    'O link vale por 48 horas e só pode ser usado uma vez.',
    '',
    RODAPE_TEXTO,
  ].join('\n')
  const html = moldura(assunto, `${paragrafo(esc(ola), { forte: true })}
              ${paragrafo('Você recebeu acesso ao Finup. Crie a sua senha pelo botão abaixo.')}
              ${tabela([linha('Usuário', esc(username)), linha('Ambiente', esc(ambiente))])}
              <div style="height:16px;line-height:16px;">&nbsp;</div>
              ${botao('Criar minha senha', url)}
              ${aviso('O link vale por <strong>48 horas</strong> e só pode ser usado uma vez.')}`)
  return { assunto, html, texto }
}
