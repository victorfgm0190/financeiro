import { useApp } from '../../context/AppContext'

// Identidade no rodapé da barra lateral (e no fim de Configurações no celular): nome e frase do
// AMBIENTE (configuracoes.rodape_titulo / rodape_frase), editados em Configurações › Geral ›
// Identidade do ambiente. Vazios = nada.
function useRodape() {
  const { settings } = useApp()
  const titulo = String(settings?.rodapeTitulo || '').trim()
  const frase = String(settings?.rodapeFrase || '').trim()
  return titulo || frase ? { titulo, frase } : null
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
