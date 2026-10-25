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

// Transferência entre perfis na visão do perfil ativo (relatórios/KPIs): o lado do perfil ativo
// vira despesa (saiu) ou receita (entrou), na categoria da visão (CNPJ/CPF), e o favorecido passa a
// ser o nome do perfil do OUTRO lado — sempre, mesmo com payee preenchido. Só leitura: devolve uma
// cópia, o lançamento original não muda. Sem perfil ativo ("Tudo"), perfis iguais ou conta sem
// perfil → devolve o próprio tx (continua transferência).
export function transferenciaNaVisaoDoPerfil(tx, activeProfile, accById, profileById) {
  if (!activeProfile || tx.type !== 'transfer') return tx
  const fromP = accById.get(tx.accountId)?.profileId || null
  const toP = accById.get(tx.toAccountId)?.profileId || null
  if (!fromP || !toP || fromP === toP) return tx
  const fromIsActive = fromP === activeProfile.id
  const toIsActive = toP === activeProfile.id
  if (fromIsActive === toIsActive) return tx
  const categoryId = (activeProfile.type === 'pj' ? tx.categoriaCnpjId : tx.categoriaCpfId) || ''
  const outro = profileById.get(fromIsActive ? toP : fromP)
  const payee = outro?.name || tx.payee
  return fromIsActive
    ? { ...tx, type: 'expense', categoryId, payee }
    : { ...tx, type: 'income', categoryId, payee, accountId: tx.toAccountId }
}
