// Textos do vínculo conta × perfil (CPF/CNPJ), num lugar só: aviso do formulário de conta, dica do
// selo "Sem vínculo" nos cartões de conta e o aviso ao salvar. Baseados no comportamento REAL de uma
// conta sem perfil (profile_id vazio):
//   • a lista de contas, os lançamentos e os agendamentos dela só aparecem no filtro "Tudo" — com um
//     perfil selecionado no topo, ela some (AppContext profileAccounts / profileTransactions);
//   • não entra no Saldo Principal de nenhum perfil, só no de "Tudo" (lib/saldoPrincipal);
//   • não entra nos totais e relatórios filtrados por perfil;
//   • não pode ser Conta central (a Conta central é uma por perfil).
// Genéricos para qualquer cliente: nada de nome de pessoa, conta ou banco.

export const AVISO_SEM_VINCULO =
  'Esta conta não está ligada a nenhum perfil. Ela só aparece quando o filtro "Tudo" está selecionado, ' +
  'não entra no Saldo Principal nem nos totais e relatórios dos perfis, e não pode ser Conta central. ' +
  'Escolha um perfil para ela não ficar "perdida".'

export const DICA_SELO_SEM_VINCULO = `Sem vínculo: ${AVISO_SEM_VINCULO}`

export const SEM_PERFIL_CADASTRADO = 'Você ainda não cadastrou um perfil (CPF/CNPJ).'
export const BOTAO_CRIAR_PERFIL = 'Criar perfil agora'

// Conta salva sem perfil enquanto um perfil está selecionado no topo.
export const avisoContaForaDoFiltro = (nomeConta, nomePerfil) =>
  `A conta "${nomeConta}" foi salva sem vínculo e não aparece com o filtro "${nomePerfil}". Selecione "Tudo" no topo para vê-la.`

// Perfil já marcado numa conta NOVA: o do filtro do topo; em "Tudo", o único perfil do ambiente
// (quando há só um). Sem nenhum dos dois, "Sem vínculo".
export function perfilPadraoDaContaNova({ activeProfileId = null, profiles = [] } = {}) {
  if (activeProfileId && profiles.some(p => p.id === activeProfileId)) return activeProfileId
  return profiles.length === 1 ? profiles[0].id : null
}
