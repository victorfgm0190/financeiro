import { SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react'
import { PERIODOS } from '../../lib/agendamentosFiltro'

// Barra de filtros das abas de Agendamentos: STATUS (segmentado, escolha única, com contador) à
// esquerda, PERÍODO (dropdown) e o botão FILTROS (badge = filtros avançados ativos) à direita. O
// painel de filtros avançados (children) fica recolhido até clicar em "Filtros".
// Em tela estreita o segmentado ocupa a linha inteira; Período e Filtros descem para a de baixo.
//   status: [{ id, label, count, icon }]   periodos: ids de PERIODOS
//   extra: controle opcional ao lado do período (ex.: seletor de cartão)
//   semPeriodo: esconde o Período (Visão Calendário — o mês navegado faz o papel dele)
export default function FilterBar({
  status, statusAtual, onStatus,
  periodos, periodoAtual, onPeriodo,
  filtrosAtivos = 0, aberto = false, onToggle,
  extra = null, children, semPeriodo = false,
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* STATUS — segmentado */}
        <div role="radiogroup" aria-label="Status" className="flex w-full sm:w-auto max-w-full overflow-x-auto rounded-lg border border-borda-forte bg-surface-2 p-0.5">
          {status.map(s => {
            const ativo = s.id === statusAtual
            const Icone = s.icon
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => onStatus(s.id)}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  ativo ? 'bg-primary text-white shadow-sm' : 'text-texto-2 hover:text-texto-1 hover:bg-surface-hover'
                }`}
              >
                {Icone && <Icone size={12} className="shrink-0" />}
                {s.label}
                {s.count != null && (
                  <span className={`text-[10px] px-1.5 rounded-full font-semibold ${ativo ? 'bg-white/20' : 'bg-surface-hover text-texto-3'}`}>{s.count}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
          {extra}
          {/* PERÍODO */}
          {!semPeriodo && <label className="flex items-center gap-1.5 flex-1 sm:flex-none min-w-0">
            <span className="text-xs text-texto-3 shrink-0">Período:</span>
            <select
              className="input py-1.5 text-xs w-full sm:w-auto"
              value={periodoAtual}
              onChange={e => onPeriodo(e.target.value)}
            >
              {periodos.map(p => <option key={p} value={p}>{PERIODOS[p]}</option>)}
            </select>
          </label>}
          {/* FILTROS */}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={aberto}
            className={`btn-secondary flex items-center gap-1.5 py-1.5 text-xs shrink-0 ${aberto ? 'ring-1 ring-inset ring-primary/50' : ''}`}
          >
            <SlidersHorizontal size={13} /> Filtros
            {filtrosAtivos > 0 && (
              <span className="text-[10px] min-w-[1.1rem] h-[1.1rem] px-1 inline-flex items-center justify-center rounded-full bg-primary text-white font-semibold">{filtrosAtivos}</span>
            )}
            {aberto ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {aberto && children}
    </div>
  )
}
