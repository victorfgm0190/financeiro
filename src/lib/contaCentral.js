// Conta central (conta_corrente_principal) POR PERFIL. Toda operação que precisa dela — etapa A e
// devoluções do gerencial do cartão, pagamento de fatura sem conta pagadora, resgate de reserva,
// provisão, financiamento — usa a Conta central do PERFIL DO ITEM envolvido (cartão, reserva,
// agendamento, provisão, bem), nunca o filtro de perfil da tela. Sem Conta central no perfil, a
// operação é bloqueada com `msgSemContaCentral` — não cai para outra conta (favorita, primeira
// corrente ou Conta central de outro perfil).

export const nomePerfil = (profiles, profileId) =>
  String((profiles || []).find(p => p.id === profileId)?.name || '').trim() || null

// Conta central do perfil, ou null (perfil ausente ou sem Conta central).
export function contaCentralDoPerfil(accounts, profileId) {
  if (!profileId) return null
  return (accounts || []).find(a => a.type === 'checking' && a.contaCorrentePrincipal && a.profileId === profileId) || null
}

export function msgSemContaCentral(profiles, profileId, conta = null) {
  if (!profileId) {
    const nome = conta ? `"${String(conta.apelido || conta.name || '').trim()}" ` : ''
    return `A conta ${nome}não tem perfil. Defina o perfil dela em Contas → editar conta.`
  }
  return `O perfil ${nomePerfil(profiles, profileId) || profileId} não tem Conta central. Defina em Contas → editar conta.`
}

// Conta central para o item cuja conta é `contaDoItem` (cartão, reserva, conta do agendamento).
// → { conta, erro }: exatamente um dos dois.
export function contaCentralPara(accounts, profiles, contaDoItem) {
  const profileId = contaDoItem?.profileId || null
  const conta = contaCentralDoPerfil(accounts, profileId)
  return conta ? { conta, erro: null } : { conta: null, erro: msgSemContaCentral(profiles, profileId, contaDoItem) }
}

export const contaCentralParaId = (accounts, profiles, accountId) =>
  contaCentralPara(accounts, profiles, (accounts || []).find(a => a.id === accountId) || null)

// Itens do perfil que dependem da Conta central (bloqueiam excluir/inativar a atual sem outra).
export function dependentesDaContaCentral(profileId, { accounts = [], schedules = [] } = {}) {
  if (!profileId) return []
  const doPerfil = (accounts || []).filter(a => a.profileId === profileId)
  const ids = new Set(doPerfil.map(a => a.id))
  const out = []
  if (doPerfil.some(a => a.type === 'credit')) out.push('cartão')
  if (doPerfil.some(a => a.isReserva || a.vinculoTipo === 'reserva')) out.push('reserva')
  if (doPerfil.some(a => a.type === 'gerencial')) out.push('subconta Ger.')
  if ((schedules || []).some(s => s.financingInstallmentId && (ids.has(s.accountId) || ids.has(s.toAccountId)))) out.push('financiamento')
  return out
}

// Excluir/inativar a Conta central: bloqueio (mensagem) quando o perfil tem dependentes; senão
// só aviso. → { bloqueio, aviso } (um deles, ou ambos null quando a conta não é Conta central).
export function checarRemocaoContaCentral(conta, { accounts = [], schedules = [], profiles = [] } = {}, acao = 'excluir') {
  if (!conta?.contaCorrentePrincipal || !conta.profileId) return { bloqueio: null, aviso: null }
  const nome = nomePerfil(profiles, conta.profileId) || 'este perfil'
  const deps = dependentesDaContaCentral(conta.profileId, { accounts, schedules })
  if (deps.length) return { bloqueio: `Defina outra Conta central para ${nome} antes de ${acao} esta conta.`, aviso: null }
  return { bloqueio: null, aviso: `Esta é a Conta central de ${nome}. Depois de ${acao === 'excluir' ? 'excluí-la' : 'inativá-la'}, o perfil fica sem Conta central.` }
}

// Favorita (is_main) e Conta central: uma por perfil. Contas sem perfil formam um grupo próprio
// para a favorita; Conta central exige perfil.
export const mesmoPerfil = (a, b) => (a?.profileId || null) === (b?.profileId || null)

// Perfis com dependentes (cartão/reserva/Ger./financiamento) e SEM Conta central — banner em
// Contas/Painel: os processos automáticos (etapa A, pagamento de fatura) pulam esses itens.
export function perfisSemContaCentral({ accounts = [], schedules = [], profiles = [] } = {}) {
  return (profiles || [])
    .map(p => ({ perfil: p, nome: nomePerfil(profiles, p.id), dependentes: dependentesDaContaCentral(p.id, { accounts, schedules }) }))
    .filter(x => x.dependentes.length > 0 && !contaCentralDoPerfil(accounts, x.perfil.id))
}
