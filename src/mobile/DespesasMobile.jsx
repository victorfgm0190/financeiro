import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { PizzaDespesas, RankingDespesas, Segmentado } from '../components/Dashboard/DespesasCategoria'
import { useModoDespesas } from '../hooks/useDespesasPorCategoria'
import { periodoDoFiltro, PERIOD_OPTS, MODO_OPTS } from '../lib/despesasPorCategoria'

const VISOES = [{ value: 'pizza', label: 'Pizza' }, { value: 'ranking', label: 'Ranking' }]

// "Maiores despesas" no mobile (card do Início e tela própria): os MESMOS blocos do Painel, com
// período e Cheio/Líquido em segmented control e Pizza | Ranking em abas — um card só.
// `oculto`: valores ocultos pelo botão olho do Início.
export default function DespesasMobile({ oculto = false }) {
  const { getFinancialPeriod } = useApp()
  const [filtro, setFiltro] = useState('current')
  const [visao, setVisao] = useState('pizza')
  const [modo, setModo] = useModoDespesas()
  const periodo = useMemo(() => periodoDoFiltro(filtro, getFinancialPeriod), [filtro, getFinancialPeriod])

  if (oculto) return <p className="text-xs text-gray-500">Valores ocultos — toque no olho para mostrar.</p>

  return (
    <div className="space-y-3">
      <Segmentado opcoes={PERIOD_OPTS} valor={filtro} onChange={setFiltro} grande rotulo="Período" />
      <div className="grid grid-cols-2 gap-2">
        <Segmentado opcoes={VISOES} valor={visao} onChange={setVisao} grande rotulo="Visualização" />
        <Segmentado opcoes={MODO_OPTS} valor={modo} onChange={setModo} grande rotulo="Regra do valor" />
      </div>
      {visao === 'pizza'
        ? <PizzaDespesas periodo={periodo} modo={modo} grande />
        : <RankingDespesas periodo={periodo} modo={modo} grande />}
    </div>
  )
}
