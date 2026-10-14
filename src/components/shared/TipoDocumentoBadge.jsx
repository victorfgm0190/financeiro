// Badge da coluna "Doc.": sigla em texto neutro com a cor do tipo num filete interno à esquerda
// (box-shadow inset: não ocupa espaço), nome completo no tooltip. `tipo` é o resultado de
// resolverTipoDocumento (null → "—"). Fallback (CC/ENV/RES não gravados) sai com borda tracejada.
// `compacto`: versão menor da linha do Fluxo no celular (11px, ~16px de altura).
const HEX = /^#[0-9a-f]{6}$/i

export default function TipoDocumentoBadge({ tipo, compacto = false }) {
  if (!tipo) return <span className="text-[11px] text-texto-3">—</span>
  const cor = HEX.test(tipo.cor || '') ? tipo.cor : null
  const style = cor ? { boxShadow: `inset 2px 0 0 ${cor}` } : undefined
  const titulo = tipo.fallback ? `${tipo.nome} (automático — sem tipo gravado)` : tipo.nome
  return (
    <span
      title={titulo}
      style={style}
      className={`${compacto
        ? 'inline-flex items-center h-4 text-[11px] px-[5px] align-middle'
        : 'inline-block text-[10px] px-1.5 py-1'} font-semibold leading-none rounded border whitespace-nowrap ${
        cor ? 'text-texto-1 bg-surface-2 border-borda-forte' : 'text-texto-2 bg-surface-hover/40 border-borda-forte'
      } ${tipo.fallback ? 'border-dashed' : ''}`}
    >
      {tipo.sigla}
    </span>
  )
}
