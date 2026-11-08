// Help de campo — conteúdo migrado de src/lib/helpCampos.js (texto do ícone ⓘ).
// `pendente`: falta relacaoComTela e o roteiro do formulário — completar na Etapa 6 (help:check).
const p = (titulo, paraQueServe) => ({ titulo, paraQueServe, relacaoComTela: '', obrigatorio: false, pendente: true })

export const campos = {
  'categoria.grupo': p('Grupo', 'Agrupa categorias nos relatórios e no orçamento. Escolha um grupo existente ou digite um novo.'),
  'categoria.tipo': p('Tipo', 'Define se a categoria aparece em despesas, em receitas ou nas duas.'),
  'categoria.perfis': p('Perfis', 'Perfis em que a categoria pode ser usada. Sem seleção, vale para todos.'),
}

export const formularios = {}
