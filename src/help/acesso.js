// Help de campo — telas sem login (Etapa 3, bloco 5b): Login, Esqueci minha senha, Definir senha e
// Pedido de cadastro. Texto curto e genérico, sem detalhe de segurança. Nada específico de um cliente.

const c = (titulo, paraQueServe, relacaoComTela, obrigatorio = true) => ({ titulo, paraQueServe, relacaoComTela, obrigatorio })

export const campos = {
  'acesso.ambiente': c('Ambiente', 'Sigla do seu ambiente de acesso.', 'O login vale para o ambiente desta sigla.'),
  'acesso.usuario': c('Usuário ou e-mail', 'O usuário ou o e-mail cadastrado para você.', 'Junto com a senha, abre o seu acesso.'),
  'acesso.senha': c('Senha', 'A sua senha de acesso.', 'Esqueceu? Use "Esqueci minha senha" para receber um link.'),
  'acesso.usuarioEsqueci': c('Usuário ou e-mail', 'O usuário ou o e-mail cadastrado para você.', 'Se ele existir, enviamos um link para criar uma nova senha.'),
  'acesso.novaSenha': c('Nova senha', 'A senha que você vai usar para entrar.', 'Os requisitos aparecem logo abaixo e ficam marcados quando cumpridos.'),
  'acesso.confirmarSenha': c('Confirmar senha', 'Digite a mesma senha de novo.', 'Precisa ser igual à nova senha.'),
  'pedidoCadastro.nome': c('Nome completo', 'Nome de quem pede o cadastro.', 'Usamos para falar com você.'),
  'pedidoCadastro.email': c('E-mail', 'E-mail para contato.', 'Usamos para responder ao pedido.'),
  'pedidoCadastro.telefone': c('Telefone', 'Celular com DDD.', 'Usamos para falar com você.'),
  'pedidoCadastro.naoWhatsapp': c('Não é WhatsApp', 'Marque se o número for fixo.', 'Indica que o número não recebe WhatsApp.', false),
  'pedidoCadastro.tipo': c('Tipo', 'Pessoa física ou jurídica.', 'Muda o documento pedido: CPF ou CNPJ.'),
  'pedidoCadastro.documento': c('CPF ou CNPJ', 'Documento de quem pede o cadastro.', 'O pedido só é enviado com um número válido.'),
  'pedidoCadastro.empresa': c('Empresa', 'Nome da empresa.', 'Só aparece para pessoa jurídica.', false),
  'pedidoCadastro.sigla': c('Sigla desejada', 'Nome curto do seu ambiente.', 'Vira o endereço de acesso; a tela avisa se já estiver em uso.'),
  'pedidoCadastro.comoConheceu': c('Como conheceu', 'Conte como chegou até aqui.', 'Opcional.', false),
  'pedidoCadastro.termos': c('Termos e privacidade', 'Confirma que você leu e aceita os termos.', 'Sem o aceite, o pedido não é enviado.'),
}

export const formularios = {}
