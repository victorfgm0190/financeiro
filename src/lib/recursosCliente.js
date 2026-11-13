// RECURSOS CONTRATADOS por cliente — liberados só pelo administrador da plataforma (Controle de
// Clientes), cobrados à parte. Moram em ambientes.modulos (JSONB, banco CENTRAL), o mesmo cadastro
// do plano que já liga o módulo Contratos: { "<recurso>": true }. Ausente = NÃO liberado.
// Quem ligou/desligou e quando: plataforma_historico do cliente. PURO (front e API).

export const RECURSO_IA_IMPORTACAO = 'ia_sugestoes_importacao'

export const RECURSOS_CONTRATADOS = [
  { id: RECURSO_IA_IMPORTACAO, rotulo: 'Sugestões do Assistente na importação' },
]

export const recursoLiberado = (modulos, recurso) => modulos?.[recurso] === true

// modulos com o recurso ligado/desligado (desligar remove a chave).
export function comRecurso(modulos, recurso, ligado) {
  const out = { ...(modulos || {}) }
  if (ligado) out[recurso] = true
  else delete out[recurso]
  return out
}
