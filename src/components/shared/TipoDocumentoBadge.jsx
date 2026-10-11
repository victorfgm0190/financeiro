// Badge da coluna "Doc.": sigla na cor do tipo, nome completo no tooltip. `tipo` é o resultado de
// resolverTipoDocumento (null → "—"). Fallback (CC/ENV/RES não gravados) sai com borda tracejada.
const HEX = /^#[0-9a-f]{6}$/i

export default function TipoDocumentoBadge({ tipo }) {
  if (!tipo) return <span className="text-[11px] text-gray-600">—</span>
  const cor = HEX.test(tipo.cor || '') ? tipo.cor : null
  const style = cor ? { color: cor, backgroundColor: `${cor}26`, borderColor: `${cor}66` } : undefined
  const titulo = tipo.fallback ? `${tipo.nome} (automático — sem tipo gravado)` : tipo.nome
  return (
    <span
      title={titulo}
      style={style}
      className={`inline-block text-[10px] font-semibold leading-none px-1.5 py-1 rounded border whitespace-nowrap ${
        cor ? '' : 'text-gray-300 bg-gray-700/40 border-gray-600'
      } ${tipo.fallback ? 'border-dashed' : ''}`}
    >
      {tipo.sigla}
    </span>
  )
}
