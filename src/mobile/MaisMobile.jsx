import { ChevronRight } from 'lucide-react'
import { secoesMais } from './navegacao'
import ThemeToggle from '../components/ThemeToggle'
import SessaoUsuario from '../components/Layout/SessaoUsuario'

// Tela "Mais": gerada 100% de modules.js (secoesMais) — aqui só o layout de cada tipo de seção.
export default function MaisMobile({ modules, irPara }) {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-texto-1 pt-1">Mais</h1>
      {secoesMais(modules).map(sec => (
        <section key={sec.titulo}>
          <h2 className="text-xs uppercase tracking-wide text-texto-3 mb-2">{sec.titulo}</h2>
          {sec.tipo === 'grupo' && (
            <div className="grid grid-cols-2 gap-3">
              {sec.itens.map(m => {
                const Icon = m.icon
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => irPara(m.id)}
                    className="flex flex-col items-start gap-3 p-4 min-h-[88px] rounded-2xl bg-surface border border-borda active:bg-surface-hover text-left"
                  >
                    {Icon && <Icon size={20} className="text-primary-fg" />}
                    <span className="text-sm font-medium text-texto-1">{m.label}</span>
                  </button>
                )
              })}
            </div>
          )}
          {sec.tipo === 'config' && (
            <ul className="rounded-xl border border-borda divide-y divide-borda">
              {sec.itens.map(m => {
                const Icon = m.icon
                return (
                  <li key={m.id}>
                    <button type="button" onClick={() => irPara(m.id)} className="w-full flex items-center gap-3 px-4 min-h-[52px] text-left text-sm text-texto-1">
                      {Icon && <Icon size={18} className="text-texto-2" />}
                      <span className="flex-1">{m.label}</span>
                      <ChevronRight size={16} className="text-texto-3" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ))}
      <section>
        <ThemeToggle />
      </section>
      <section className="rounded-xl border border-borda px-4 py-3">
        <SessaoUsuario comSair />
      </section>
    </div>
  )
}
