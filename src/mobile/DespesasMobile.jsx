import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { PizzaDespesas, RankingDespesas, Segmentado } from '../components/Dashboard/DespesasCategoria'
import { useModoDespesas } from '../hooks/useDespesasPorCategoria'
import { periodoDoFiltro, PERIOD_OPTS, MODO_OPTS } from '../lib/despesasPorCategoria'

const VISOES = [{ value: 'pizza', label: 'Pizza' }, { value: 'ranking', label: 'Ranking' }]

// Período e aba do último uso (card do Início ou tela). O "Ver tudo" do card troca de tela —
// o card desmonta —, então a tela cheia começa daqui. O modo Cheio/Líquido já é salvo nas
// preferências (useModoDespesas). Vale só para a sessão aberta.
const ultimo = { filtro: 'current', visao: 'pizza' }

// "Maiores despesas" no mobile (card do Início e tela própria): os MESMOS blocos do Painel, com
// período e Cheio/Líquido em segmented control e Pizza | Ranking em abas — um card só.
// `card`: card do Início, sempre compacto (top 5 + Outras); a tela abre em "Ver todas", e
// "Mostrar menos" volta ao top 5 + Outras.
// `oculto`: valores ocultos pelo botão olho do Início.
export default function DespesasMobile({ card = false, oculto = false }) {
  const { getFinancialPeriod } = useApp()
  const [filtro, setFiltroState] = useState(ultimo.filtro)
  const [visao, setVisaoState] = useState(ultimo.visao)
  const [todas, setTodas] = useState(!card)
  const [modo, setModo] = useModoDespesas()
  const periodo = useMemo(() => periodoDoFiltro(filtro, getFinancialPeriod), [filtro, getFinancialPeriod])
  const setFiltro = (f) => { ultimo.filtro = f; setFiltroState(f) }
  const setVisao = (v) => { ultimo.visao = v; setVisaoState(v) }

  if (oculto) return <p className="text-xs text-gray-500">Valores ocultos — toque no olho para mostrar.</p>

  const props = { periodo, modo, grande: true, todas, onAlternarTodas: card ? undefined : () => setTodas(t => !t) }
  return (
    <div className="space-y-3">
      <Segmentado opcoes={PERIOD_OPTS} valor={filtro} onChange={setFiltro} grande rotulo="Período" />
      <div className="grid grid-cols-2 gap-2">
        <Segmentado opcoes={VISOES} valor={visao} onChange={setVisao} grande rotulo="Visualização" />
        <Segmentado opcoes={MODO_OPTS} valor={modo} onChange={setModo} grande rotulo="Regra do valor" />
      </div>
      {visao === 'pizza' ? <PizzaDespesas {...props} /> : <RankingDespesas {...props} />}
    </div>
  )
}
