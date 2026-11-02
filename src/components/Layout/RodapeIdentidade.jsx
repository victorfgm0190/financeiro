import { useApp } from '../../context/AppContext'
import { noAmbientePrincipal } from '../../lib/api'

// Identidade no rodapé da barra lateral (e no fim de Configurações no celular): nome e frase do
// AMBIENTE (configuracoes.rodape_titulo / rodape_frase), editados em Configurações › Geral ›
// Identidade do ambiente. Vazios no ambiente principal ('vm') = o texto de sempre (decisão do dono do
// sistema: este rodapé fica sempre visível lá); num cliente vazios = nada. Só o rodapé usa o padrão:
// os relatórios Excel seguem as regras de IdentidadeAmbiente.
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
