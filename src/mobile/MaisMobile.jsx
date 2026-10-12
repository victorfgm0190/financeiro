import { Laptop, ChevronRight } from 'lucide-react'
import { secoesMais } from './navegacao'

// Tela "Mais": gerada 100% de modules.js (secoesMais) — aqui só o layout de cada tipo de seção.
export default function MaisMobile({ modules, irPara }) {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-100 pt-1">Mais</h1>
      {secoesMais(modules).map(sec => (
        <section key={sec.titulo}>
          <h2 className="text-xs uppercase tracking-wide text-gray-500 mb-2">{sec.titulo}</h2>
          {sec.tipo === 'grupo' && (
            <div className="grid grid-cols-2 gap-3">
              {sec.itens.map(m => {
                const Icon = m.icon
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => irPara(m.id)}
                    className="flex flex-col items-start gap-3 p-4 min-h-[88px] rounded-2xl bg-gray-900 border border-gray-800 active:bg-gray-800 text-left"
                  >
                    {Icon && <Icon size={20} className="text-emerald-400" />}
                    <span className="text-sm font-medium text-gray-100">{m.label}</span>
                  </button>
                )
              })}
            </div>
          )}
          {sec.tipo === 'desktop' && (
            <ul className="rounded-xl border border-gray-800 divide-y divide-gray-800">
              {sec.itens.map(m => (
                <li key={m.id} aria-disabled="true" className="flex items-center gap-3 px-4 min-h-[48px] text-sm text-gray-500">
                  <Laptop size={16} className="text-gray-600" />
                  <span className="flex-1">{m.label}</span>
                  <span className="text-[11px] text-gray-600">no computador</span>
                </li>
              ))}
            </ul>
          )}
          {sec.tipo === 'config' && (
            <ul className="rounded-xl border border-gray-800 divide-y divide-gray-800">
              {sec.itens.map(m => {
                const Icon = m.icon
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => irPara(m.id)} className="w-full flex items-center gap-3 px-4 min-h-[52px] text-left text-sm text-gray-200">
                      {Icon && <Icon size={18} className="text-gray-400" />}
                      <span className="flex-1">{m.label}</span>
                      <ChevronRight size={16} className="text-gray-600" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
