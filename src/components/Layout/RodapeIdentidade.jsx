import { useApp } from '../../context/AppContext'
import { noAmbientePrincipal } from '../../lib/api'

// Identidade no rodapé da barra lateral (e no fim de Configurações no celular). Vem da configuração
// do AMBIENTE (configuracoes.rodape_titulo / rodape_frase). Vazia no ambiente principal ('vm') = o
// texto de sempre; num cliente vazia = nada.
const PADRAO_PRINCIPAL = { titulo: 'Gislaine & Victor Moreira', frase: 'Transformando conhecimento em resultados.' }

function useRodape() {
  const { settings } = useApp()
  const titulo = String(settings?.rodapeTitulo || '').trim()
  const frase = String(settings?.rodapeFrase || '').trim()
  if (titulo || frase) return { titulo, frase }
  return noAmbientePrincipal() ? PADRAO_PRINCIPAL : null
}

export default function RodapeIdentidade({ classeTitulo, classeFrase }) {
  const r = useRodape()
  if (!r) return null
  return (
    <>
      {r.titulo && <p className={classeTitulo}>{r.titulo}</p>}
      {r.frase && <p className={classeFrase}>{r.frase}</p>}
    </>
  )
}
