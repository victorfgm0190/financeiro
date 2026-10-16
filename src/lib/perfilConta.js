// Perfil vinculado a uma conta (contas.profile_id → perfis), para o selo de perfil. Só leitura:
// não atribui nem corrige vínculo.

// Nome curto: PF = primeiro nome ("VICTOR FRANCISCO …" → "VICTOR"); PJ = nome inteiro, sem os
// espaços das pontas (" Lumen Tech " → "Lumen Tech").
export function nomeCurtoPerfil(perfil) {
  const nome = (perfil?.name || '').trim()
  if (!nome) return 'Perfil'
  return perfil.type === 'pf' ? nome.split(/\s+/)[0] : nome
}

// { perfil, rotulo, nomeCompleto }. Conta sem profile_id, ou com um id que não existe mais em
// perfis, sai como "Sem vínculo" (perfil null).
export function perfilDaConta(account, profiles) {
  const perfil = account?.profileId ? (profiles || []).find(p => p.id === account.profileId) || null : null
  if (!perfil) return { perfil: null, rotulo: 'Sem vínculo', nomeCompleto: 'Conta sem perfil vinculado' }
  return { perfil, rotulo: nomeCurtoPerfil(perfil), nomeCompleto: (perfil.name || '').trim() }
}
