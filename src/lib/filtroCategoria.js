// Filtro de categoria das listas: vazio = Todas; SEM_CATEGORIA = só os itens sem categoria.
export const SEM_CATEGORIA = '__sem_categoria__'

export const casaCategoria = (categoryId, filtro) => {
  if (!filtro) return true
  if (filtro === SEM_CATEGORIA) return !categoryId
  return categoryId === filtro
}
