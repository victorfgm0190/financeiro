// Quando o mobile pode mostrar saldos. Mesmo sinal do Painel (desktop): dbStatus do AppContext.
// Enquanto 'connecting', `data` ainda é o cache do localStorage; o recálculo automático dos
// saldos só roda depois de 'connected' (AppContext, setTimeout 0) — então os números mudariam.
//
//   'carregando'    → dbStatus 'connecting' há menos de LIMITE_MS: placeholder no lugar do número.
//   'pronto'        → 'connected': valores finais.
//   'desatualizado' → 'local' (Neon indisponível) ou 'connecting' há mais de LIMITE_MS: mostra os
//                     valores disponíveis (cache) com aviso.
export const LIMITE_MS = 15000

export function estadoSaldos(dbStatus, decorridoMs) {
  if (dbStatus === 'connected') return 'pronto'
  if (dbStatus === 'connecting' && decorridoMs < LIMITE_MS) return 'carregando'
  return 'desatualizado'
}
