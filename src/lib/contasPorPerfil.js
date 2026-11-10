// Contas por perfil para os seletores de transferência (formulário de lançamento, agendamento,
// baixa de agendamento, prévia do Assistente, "+" do celular).
// - ORIGEM: só as contas do perfil atual (com filtro de perfil ativo); a conta já escolhida continua
//   na lista mesmo sendo de outro perfil (edição, prévia), para não sumir do campo.
// - DESTINO: as do perfil atual primeiro; abaixo, as dos outros perfis, um bloco por perfil — assim dá
//   para transferir de um perfil para outro sem trocar o filtro.
// Só perfis que o usuário pode ver: o servidor já entrega só as contas e os perfis permitidos
// (api/load.js › recortarLeitura). Aqui, por garantia, conta de perfil fora da lista `profiles` nunca
// entra; conta sem perfil só aparece para quem vê todos (o servidor também não a entrega aos demais).

const ativaNoAparelho = (a, isMobile) => a.active !== false && (!isMobile || !a.hideOnMobile)

// Origem: contas do perfil atual (+ a já escolhida). Sem filtro de perfil: todas.
export function contasDaOrigem(accounts, activeProfileId, valorAtual = null) {
  const lista = accounts || []
  if (!activeProfileId) return lista
  return lista.filter(a => a.profileId === activeProfileId || (valorAtual && a.id === valorAtual))
}

// Destino: blocos [{ key, perfil, atual, contas }] — o perfil atual primeiro, depois os outros na
// ordem dos perfis, por último as contas sem perfil. Sem filtro de perfil: um bloco por perfil, na
// ordem dos perfis. `excludeId`: a conta de origem.
export function blocosDestinoPorPerfil(accounts, profiles, activeProfileId, { excludeId = null, isMobile = false } = {}) {
  const perfis = profiles || []
  const conhecidos = new Set(perfis.map(p => p.id))
  const pool = (accounts || []).filter(a => ativaNoAparelho(a, isMobile) && (!excludeId || a.id !== excludeId)
    && (!a.profileId || conhecidos.has(a.profileId)))
  const ordem = [...perfis].sort((a, b) => (a.id === activeProfileId ? -1 : b.id === activeProfileId ? 1 : 0))
  const blocos = []
  for (const p of ordem) {
    const contas = pool.filter(a => a.profileId === p.id)
    if (contas.length) blocos.push({ key: `perfil:${p.id}`, perfil: p, atual: p.id === activeProfileId, contas })
  }
  const semPerfil = pool.filter(a => !a.profileId)
  if (semPerfil.length) blocos.push({ key: 'sem-perfil', perfil: null, atual: false, contas: semPerfil })
  return blocos
}
