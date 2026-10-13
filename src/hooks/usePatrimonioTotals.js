import { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { categorizarPatrimonio, totaisPatrimonio } from '../lib/patrimonio'

// Patrimônio do perfil ativo: categorias + totais + itens de cada total. Fonte única do painel de
// Patrimônio, do KPI "Patrimônio Líquido" da tela Contas e do modal de composição.
export function usePatrimonioTotals() {
  const { profileAccounts, accountGroups, creditUsage } = useApp()
  const categorized = useMemo(
    () => categorizarPatrimonio(profileAccounts, accountGroups),
    [profileAccounts, accountGroups]
  )
  const totals = useMemo(() => totaisPatrimonio(categorized, creditUsage), [categorized, creditUsage])
  return { categorized, totals }
}
