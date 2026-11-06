// Dados e textos compartilhados pelo painel e pela barra da jornada guiada.
import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { assinarBoasVindas, estadoBoasVindas } from '../../lib/boasVindasApi'

export const JORNADA_TITULO = 'Sua jornada'
export const JORNADA_BOTOES = { verNaTela: 'Ver na tela', fazerComigo: 'Fazer comigo', entendi: 'Entendi ✔', continuar: 'Continuar de onde parei' }

// Estado da jornada (do banco) + os dados que decidem os passos "fazer" (mesmos do checklist + lançamentos).
export function useDadosJornada() {
  const { profiles, accounts, transactions, schedules, cardImports, contratos, reserveFunctions } = useApp()
  const [estado, setEstado] = useState(estadoBoasVindas)
  useEffect(() => assinarBoasVindas(setEstado), [])
  return { estado, dados: { profiles, accounts, transactions, schedules, cardImports, contratos, reserveFunctions, progresso: estado?.progresso } }
}
