// Botão "?" ao lado do título de cada tela: abre um painel lateral curto com para que serve a tela,
// o que fazem os cards/botões principais e 1–2 dicas. Textos: src/lib/ajudaTelas.js (AJUDA_TELAS).
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle, X } from 'lucide-react'
import { ajudaDaTela } from '../../lib/ajudaTelas'

export default function AjudaTela({ pagina, className = '' }) {
  const [aberto, setAberto] = useState(false)
  const ajuda = ajudaDaTela(pagina)
  useEffect(() => {
    if (!aberto) return
    const esc = (e) => { if (e.key === 'Escape') setAberto(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aberto])
  if (!ajuda) return null
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} aria-label={`Ajuda: ${ajuda.titulo}`} title="Ajuda desta tela"
        className={`shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full text-texto-2 hover:text-texto-1 hover:bg-surface-hover ${className}`}>
        <HelpCircle size={17} />
      </button>
      {aberto && createPortal(
        <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={`Ajuda: ${ajuda.titulo}`}>
          <button type="button" aria-label="Fechar ajuda" className="absolute inset-0 bg-overlay" onClick={() => setAberto(false)} />
          <aside className="absolute right-0 top-0 h-full w-full sm:w-[24rem] bg-surface border-l border-borda shadow-2xl flex flex-col"
            style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-borda">
              <HelpCircle size={18} className="text-primary-fg shrink-0" />
              <h2 className="text-base font-semibold text-texto-1 flex-1 min-w-0">{ajuda.titulo}</h2>
              <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="w-11 h-11 flex items-center justify-center text-texto-2 hover:text-texto-1"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm text-texto-1">
              <section>
                <h3 className="text-xs font-semibold text-texto-2 uppercase tracking-wide mb-1">Para que serve</h3>
                <p className="leading-relaxed">{ajuda.paraQueServe}</p>
              </section>
              {ajuda.itens?.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-texto-2 uppercase tracking-wide mb-1">O que tem aqui</h3>
                  <dl className="space-y-2">
                    {ajuda.itens.map(([nome, texto]) => (
                      <div key={nome}><dt className="font-medium">{nome}</dt><dd className="text-texto-1 leading-relaxed">{texto}</dd></div>
                    ))}
                  </dl>
                </section>
              )}
              {ajuda.dicas?.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-texto-2 uppercase tracking-wide mb-1">Dicas</h3>
                  <ul className="list-disc pl-5 space-y-1">{ajuda.dicas.map(d => <li key={d} className="leading-relaxed">{d}</li>)}</ul>
                </section>
              )}
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </>
  )
}
