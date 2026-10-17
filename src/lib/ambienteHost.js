import { DOMINIO_CLIENTES, SIGLAS_RESERVADAS } from './plataforma.js'

// ENDEREÇO → AMBIENTE (mesma regra na API e na tela de login).
//   www.finup.app.br / finup.app.br → 'vm' (o ambiente do Victor). Campo Ambiente visível: dali se
//                                     entra em qualquer ambiente (cliente recebe código de passagem).
//   <sigla>.finup.app.br            → a sigla (vm.finup.app.br é redirecionado para o www no vercel.json).
//   qualquer outro (financeiro-gnsm.vercel.app, localhost) → AMBIENTE_PADRAO, como o www.
// Devolve { sigla, principal } — principal = endereço "do www" (mostra o campo Ambiente e só aceita
// token do próprio ambiente dele); sigla null = endereço sem ambiente (ex.: www.<sub>.finup.app.br).
export const AMBIENTE_PRINCIPAL = 'vm'
export const SUBDOMINIOS_DO_PRINCIPAL = ['www', AMBIENTE_PRINCIPAL]

export function ambienteDoHost(host, ambientePadrao = null) {
  const h = String(host || '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '')
  if (h === DOMINIO_CLIENTES) return { sigla: AMBIENTE_PRINCIPAL, principal: true }
  if (h.endsWith(`.${DOMINIO_CLIENTES}`)) {
    const sub = h.slice(0, -(DOMINIO_CLIENTES.length + 1))
    if (SUBDOMINIOS_DO_PRINCIPAL.includes(sub)) return { sigla: AMBIENTE_PRINCIPAL, principal: true }
    // Subdomínio reservado (api, admin…) ou com ponto não é endereço de cliente.
    if (!/^[a-z0-9]+$/.test(sub) || SIGLAS_RESERVADAS.includes(sub)) return { sigla: null, principal: false }
    return { sigla: sub, principal: false }
  }
  const padrao = String(ambientePadrao || '').trim().toLowerCase() || null
  return { sigla: padrao, principal: true }
}

// Endereço público de um ambiente (links de e-mail, redirecionamento após o login no www).
export const enderecoDoAmbiente = (sigla) => sigla === AMBIENTE_PRINCIPAL
  ? `https://www.${DOMINIO_CLIENTES}`
  : `https://${sigla}.${DOMINIO_CLIENTES}`
