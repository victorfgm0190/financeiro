// Help de campo — conteúdo migrado de src/lib/helpCampos.js (texto do ícone ⓘ).
// `pendente`: falta relacaoComTela e o roteiro do formulário — completar na Etapa 6 (help:check).
const p = (titulo, paraQueServe) => ({ titulo, paraQueServe, relacaoComTela: '', obrigatorio: false, pendente: true })

export const campos = {
  'favorecido.novoNome': p('Novo nome', 'Nome que fica para todos os favorecidos selecionados. Os lançamentos e agendamentos passam a usá-lo.'),
}

export const formularios = {}
