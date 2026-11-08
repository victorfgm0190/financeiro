// Help de campo — conteúdo migrado de src/lib/helpCampos.js (texto do ícone ⓘ).
// `pendente`: falta relacaoComTela e o roteiro do formulário — completar na Etapa 6 (help:check).
const p = (titulo, paraQueServe) => ({ titulo, paraQueServe, relacaoComTela: '', obrigatorio: false, pendente: true })

export const campos = {
  'perfil.tipo': p('Tipo', 'Pessoa física ou jurídica. Define se o documento é CPF ou CNPJ.'),
  'perfil.documento': p('Documento', 'Documento do titular, mostrado ao vincular contas a este perfil.'),
  'perfil.cor': p('Cor', 'Cor que identifica o perfil nos selos e listas.'),
}

export const formularios = {}
