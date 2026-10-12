// Preferências de interface guardadas em settings.mobileHomeCards (coluna
// configuracoes.mobile_home_cards, JSONB). Formato atual: { cards: [{ id, on }], despesasModo }.
// O formato antigo (só o array de cards) continua sendo lido.
import { MODOS_DESPESA, MODO_DESPESA_PADRAO } from './despesasPorCategoria.js'

export function lerPreferencias(raw) {
  const obj = Array.isArray(raw) ? { cards: raw } : (raw && typeof raw === 'object' ? raw : {})
  return {
    cards: Array.isArray(obj.cards) ? obj.cards : null,
    despesasModo: MODOS_DESPESA.includes(obj.despesasModo) ? obj.despesasModo : MODO_DESPESA_PADRAO,
  }
}

// Novo valor da coluna com `patch` aplicado, preservando o resto.
export function gravarPreferencias(raw, patch) {
  return { ...lerPreferencias(raw), ...patch }
}
