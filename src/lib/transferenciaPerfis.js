// Transferência entre perfis diferentes (CPF↔CNPJ): cada visão pode ter a sua categoria
// (categoria_cnpj_id / categoria_cpf_id). Regra única usada pelo Novo Lançamento, pelo
// Agendamento e pela efetivação (formulário e motor).

// As duas contas têm perfil e os perfis são diferentes.
export function isTransferenciaEntrePerfis(fromAcc, toAcc) {
  const fromP = fromAcc?.profileId || null
  const toP = toAcc?.profileId || null
  return !!fromP && !!toP && fromP !== toP
}

// Categorias que um lançamento gerado deve carregar: as informadas, só se a transferência
// for entre perfis (senão null — mesma regra do submit do Novo Lançamento).
export function categoriasEntrePerfis(fromAcc, toAcc, { categoriaCnpjId, categoriaCpfId } = {}) {
  const ok = isTransferenciaEntrePerfis(fromAcc, toAcc)
  return {
    categoriaCnpjId: ok ? (categoriaCnpjId || null) : null,
    categoriaCpfId: ok ? (categoriaCpfId || null) : null,
  }
}
