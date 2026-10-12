import { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { isResgateReservaSombra } from '../components/shared/utils'
import { criarClassificadores } from '../lib/receitasDespesas'
import { despesasPorCategoria } from '../lib/despesasPorCategoria'
import { lerPreferencias, gravarPreferencias } from '../lib/preferenciasUi'

// Despesas por categoria do perfil ativo (mesmos lançamentos e classificação do KPI "Despesas do
// Mês"). Pizza, ranking e a lista do clique chamam isto com o mesmo período/modo.
export function useDespesasPorCategoria(periodo, modo) {
  const { profileReportTransactions, reserveFunctions, profileAccounts } = useApp()
  const cls = useMemo(() => criarClassificadores(reserveFunctions, profileAccounts), [reserveFunctions, profileAccounts])
  return useMemo(
    () => despesasPorCategoria(profileReportTransactions, periodo, { ...cls, isResgateReservaSombra }, modo),
    [profileReportTransactions, periodo, cls, modo]
  )
}

// Modo Cheio/Líquido dos blocos de despesas — lembrado em settings.mobileHomeCards (mesma coluna
// dos cards do Início), compartilhado por desktop e mobile.
export function useModoDespesas() {
  const { settings, updateSettings } = useApp()
  const raw = settings?.mobileHomeCards
  const modo = lerPreferencias(raw).despesasModo
  const setModo = (m) => { if (m !== modo) updateSettings({ mobileHomeCards: gravarPreferencias(raw, { despesasModo: m }) }) }
  return [modo, setModo]
}
