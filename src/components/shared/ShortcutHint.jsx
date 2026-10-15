import { useShortcutLabel } from '../../context/atalhosHooks'

// Selo discreto com a combinação ATUAL do atalho da ação (ex.: "Alt+G"), ao lado do rótulo do botão.
// Nada no mobile, com o atalho desativado ou quando `habilitado` = false (a ação não vale agora,
// ex.: modo rápido do lançamento). Herda a cor do texto do botão (.atalho-hint), então funciona sobre
// botão primário, secundário e item de menu nos dois temas. Segurar Alt realça todos (ModoAltAtalhos).
// soNoAlt: só aparece enquanto o Alt está seguro (para onde o selo fixo poluiria, ex.: menu lateral).
export default function ShortcutHint({ actionId, habilitado = true, soNoAlt = false, className = '' }) {
  const texto = useShortcutLabel(actionId)
  if (!texto || !habilitado) return null
  return (
    <kbd aria-hidden="true" data-so-no-alt={soNoAlt ? '' : undefined} className={`atalho-hint ${className}`}>
      {texto}
    </kbd>
  )
}
