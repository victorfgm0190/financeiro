// Transferência entre perfis diferentes: cada perfil pode ter a sua categoria para a movimentação —
// a do perfil da conta de ORIGEM (saída) e a do perfil da conta de DESTINO (entrada). Regra única
// usada pelo Novo Lançamento, pelo Agendamento, pela baixa, pela prévia do Assistente e pelos
// relatórios (KPIs com perfil selecionado, Demonstrativo).
//
// Gravação (desde 10/11/2026): categoria_origem_id / categoria_destino_id, por LADO. As colunas
// antigas categoria_cnpj_id / categoria_cpf_id (por TIPO de perfil) continuam sendo gravadas quando
// os dois perfis são de tipos diferentes (CPF↔CNPJ), para compatibilidade. Entre perfis do MESMO
// tipo (CPF→CPF, CNPJ→CNPJ) as antigas não têm como dizer qual lado é qual: ficam como estão.
// Leitura: as novas; sem nenhuma das novas (lançamento antigo), as antigas pelo tipo de cada lado.

// As duas contas têm perfil e os perfis são diferentes.
export function isTransferenciaEntrePerfis(fromAcc, toAcc) {
  const fromP = fromAcc?.profileId || null
  const toP = toAcc?.profileId || null
  return !!fromP && !!toP && fromP !== toP
}

const tipoDoPerfil = (acc, profiles) => (profiles || []).find(p => p.id === acc?.profileId)?.type || null
const ehPj = (acc, profiles) => tipoDoPerfil(acc, profiles) === 'pj'

// Categorias de cada lado de uma transferência (ou agendamento): { origem, destino } (id ou null).
// As colunas novas valem quando alguma delas está preenchida; senão, as antigas pelo tipo do perfil
// de cada lado (PJ → categoria_cnpj_id, PF → categoria_cpf_id), como era lido antes.
export function categoriasDosLados(tx, fromAcc, toAcc, profiles) {
  if (!tx) return { origem: null, destino: null }
  if (tx.categoriaOrigemId || tx.categoriaDestinoId) {
    return { origem: tx.categoriaOrigemId || null, destino: tx.categoriaDestinoId || null }
  }
  const antiga = (acc) => (ehPj(acc, profiles) ? tx.categoriaCnpjId : tx.categoriaCpfId) || null
  return { origem: antiga(fromAcc), destino: antiga(toAcc) }
}

// Campos a gravar num lançamento/agendamento. `cats`: { categoriaOrigemId, categoriaDestinoId } (o
// que a tela escolheu) ou um agendamento/lançamento já gravado. Sem transferência entre perfis:
// tudo null.
// Mesmo tipo de perfil: só as novas (as antigas ficam fora do objeto — não mudam).
export function categoriasEntrePerfis(fromAcc, toAcc, cats = {}, profiles = []) {
  if (!isTransferenciaEntrePerfis(fromAcc, toAcc)) {
    return { categoriaOrigemId: null, categoriaDestinoId: null, categoriaCnpjId: null, categoriaCpfId: null }
  }
  // A tela passa só { categoriaOrigemId, categoriaDestinoId }; um registro gravado (agendamento na
  // baixa) pode ter só as antigas — categoriasDosLados resolve os dois casos.
  const lados = categoriasDosLados(cats || {}, fromAcc, toAcc, profiles)
  const out = { categoriaOrigemId: lados.origem, categoriaDestinoId: lados.destino }
  const origemPj = ehPj(fromAcc, profiles)
  if (origemPj !== ehPj(toAcc, profiles)) {
    out.categoriaCnpjId = origemPj ? lados.origem : lados.destino
    out.categoriaCpfId = origemPj ? lados.destino : lados.origem
  }
  return out
}

// Transferência entre perfis na visão do perfil ativo (relatórios/KPIs): o lado do perfil ativo
// vira despesa (saiu) ou receita (entrou), na categoria daquele LADO, e o favorecido passa a ser o
// nome do perfil do OUTRO lado — sempre, mesmo com payee preenchido. Só leitura: devolve uma cópia,
// o lançamento original não muda. Sem perfil ativo ("Tudo"), perfis iguais ou conta sem perfil →
// devolve o próprio tx (continua transferência).
export function transferenciaNaVisaoDoPerfil(tx, activeProfile, accById, profileById) {
  if (!activeProfile || tx.type !== 'transfer') return tx
  const fromAcc = accById.get(tx.accountId)
  const toAcc = accById.get(tx.toAccountId)
  const fromP = fromAcc?.profileId || null
  const toP = toAcc?.profileId || null
  if (!fromP || !toP || fromP === toP) return tx
  const fromIsActive = fromP === activeProfile.id
  const toIsActive = toP === activeProfile.id
  if (fromIsActive === toIsActive) return tx
  const lados = categoriasDosLados(tx, fromAcc, toAcc, [...profileById.values()])
  const categoryId = (fromIsActive ? lados.origem : lados.destino) || ''
  const outro = profileById.get(fromIsActive ? toP : fromP)
  const payee = outro?.name || tx.payee
  return fromIsActive
    ? { ...tx, type: 'expense', categoryId, payee }
    : { ...tx, type: 'income', categoryId, payee, accountId: tx.toAccountId }
}

// Demonstrativo Financeiro ("Incluir transferências entre perfis", modo Todos).
// Expande transferências ENTRE PERFIS em DUAS pernas income/expense, cada uma com a categoria do seu
// lado: origem → categoria_origem_id, destino → categoria_destino_id (lançamento antigo: as colunas por
// tipo, PJ → categoria_cnpj_id, PF → categoria_cpf_id). A perna da conta
// de ORIGEM vira despesa (saiu dinheiro); a da conta de DESTINO vira receita. Usado quando o toggle
// "Incluir transferências entre perfis" está ligado (efetivo só no modo "Todos", sem perfil ativo).
// As pernas levam a flag _interProfile para passarem pelos filtros de conta/categoria do relatório.
export function pernasEntrePerfis(transactions, accounts, profiles) {
  const accById = new Map(accounts.map(a => [a.id, a]))
  const out = []
  for (const tx of transactions) {
    if (tx.type === 'transfer') {
      const fromP = accById.get(tx.accountId)?.profileId || null
      const toP = accById.get(tx.toAccountId)?.profileId || null
      if (fromP && toP && fromP !== toP) {
        const lados = categoriasDosLados(tx, accById.get(tx.accountId), accById.get(tx.toAccountId), profiles)
        out.push({ ...tx, id: `${tx.id}:ipout`, type: 'expense', categoryId: lados.origem || '', _interProfile: true })
        out.push({ ...tx, id: `${tx.id}:ipin`, type: 'income', categoryId: lados.destino || '', accountId: tx.toAccountId, _interProfile: true })
        continue
      }
    }
    out.push(tx)
  }
  return out
}
