// UM AVISO DE CADA VEZ — os avisos que aparecem sozinhos dizem aqui quando QUEREM aparecer; só o de
// maior prioridade aparece. Os outros esperam (não somem: aparecem quando chegar a vez).
//   atualizacao  "Há uma atualização do Finup"           (src/components/Layout/AvisoAtualizacao.jsx)
//   novidades    "O que mudou nesta versão"              (src/components/Ajuda/Novidades.jsx)
//   aplicativo   "Use o Finup como aplicativo"           (src/components/Layout/UsarComoApp.jsx)
export const PRIORIDADE_AVISO = { atualizacao: 1, novidades: 2, aplicativo: 3 }

const querendo = new Set()
const ouvintes = new Set()
const avisar = () => { for (const f of ouvintes) f() }

export function quererAviso(id, quer) {
  if (!(id in PRIORIDADE_AVISO)) return
  const antes = querendo.has(id)
  if (quer) querendo.add(id)
  else querendo.delete(id)
  if (antes !== !!quer) avisar()
}

export const vezDoAviso = (id) => querendo.has(id) && [...querendo].every(o => PRIORIDADE_AVISO[o] >= PRIORIDADE_AVISO[id])
// Algum aviso de prioridade maior quer aparecer?
export const outroAvisoNaFrente = (id) => [...querendo].some(o => PRIORIDADE_AVISO[o] < PRIORIDADE_AVISO[id])
export function assinarAvisos(f) { ouvintes.add(f); return () => ouvintes.delete(f) }
export function _reiniciarAvisos() { querendo.clear(); avisar() }
