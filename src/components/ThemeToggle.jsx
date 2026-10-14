import { useId } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

// Seletor de tema do CONTEXTO ATUAL (mobile ou desktop). Cada contexto guarda a sua escolha.
// Só classes de token; o item ativo é marcado por fundo + borda + aria-pressed (não só por cor).
// `compacto`: só ícones (rótulo no aria-label/tooltip) — para caber na largura da Sidebar.
const OPCOES = [
  { valor: 'light', rotulo: 'Claro', Icon: Sun },
  { valor: 'dark', rotulo: 'Escuro', Icon: Moon },
  { valor: 'system', rotulo: 'Sistema', Icon: Monitor },
]

export default function ThemeToggle({ className = '', compacto = false }) {
  const { contexto, preferencia, setPreferencia } = useTheme()
  const tituloId = useId()
  const titulo = `Tema neste dispositivo (${contexto})`

  return (
    <div className={className}>
      <p id={tituloId} className={`text-xs font-medium text-texto-3 mb-1 ${compacto ? 'leading-tight' : 'uppercase tracking-wide'}`}>{titulo}</p>
      <div role="group" aria-labelledby={tituloId} className="inline-flex rounded-lg border border-borda bg-surface-2 p-0.5">
        {OPCOES.map(({ valor, rotulo, Icon }) => {
          const ativo = preferencia === valor
          return (
            <button
              key={valor}
              type="button"
              aria-pressed={ativo}
              aria-label={compacto ? rotulo : undefined}
              title={compacto ? rotulo : undefined}
              onClick={() => setPreferencia(valor)}
              className={`flex items-center justify-center gap-1.5 rounded-md border transition-colors ${
                compacto ? 'px-2.5 py-1' : 'px-3 py-1.5 text-sm min-h-[44px] md:min-h-0'
              } ${
                ativo
                  ? 'bg-surface border-borda-forte text-primary-fg font-semibold'
                  : 'border-transparent text-texto-2 hover:bg-surface-hover hover:text-texto-1'
              }`}
            >
              <Icon size={14} aria-hidden="true" />
              {!compacto && rotulo}
            </button>
          )
        })}
      </div>
    </div>
  )
}
