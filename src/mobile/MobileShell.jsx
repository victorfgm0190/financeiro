import { useMemo, useRef, useState } from 'react'
import { Plus, ChevronLeft, Search } from 'lucide-react'
import { useFab } from '../context/FabContext'
import { useScrollRestoration, ScrollScopeContext, saveScrollNow } from '../hooks/useScrollRestoration'
import { abas } from './navegacao'
import ActionSheet from './ActionSheet'

const VERDE = '#0E6B4E'
const CINZA = '#5B6660'

// Layout mobile: conteúdo com scroll + barra inferior [aba aba (+) aba aba]. Tudo vem de
// modules.js; telas `page` são os MESMOS painéis do desktop (mapa `panels` do App).
// ativo / irPara: módulo aberto (estado do App, para os painéis navegarem por página).
export default function MobileShell({ modules, panels, ativo, irPara, saldosPrincipais, onToast, onOpenSearch }) {
  const { fabAction } = useFab()
  const [acoesAbertas, setAcoesAbertas] = useState(false)

  // Scroll por módulo (o container que rola é este, não o <main> do desktop).
  const contentRef = useRef(null)
  const [scrollScope, setScrollScope] = useState(null)
  const scrollKey = scrollScope ?? `m:${ativo}`
  useScrollRestoration(contentRef, scrollKey)
  const scrollCtx = useMemo(() => ({
    setScope: setScrollScope,
    saveNow: () => saveScrollNow(contentRef, scrollKey),
  }), [scrollKey])

  const tabs = abas(modules)
  const modulo = modules.find(m => m.id === ativo) || tabs[0]
  const ehAba = modulo.place === 'tab'
  // Módulo fora da barra (Mais › Reservas, Configurações…) acende a aba "Mais".
  const abaAcesa = ehAba ? modulo.id : 'mais'

  const ir = (id) => {
    if (id !== ativo) saveScrollNow(contentRef, scrollKey)
    setScrollScope(null)
    irPara(id)
  }

  const Tela = modulo.component
  const conteudo = Tela
    ? <Tela modules={modules} irPara={ir} saldosPrincipais={saldosPrincipais} onToast={onToast} />
    : panels[modulo.page]

  const meio = Math.ceil(tabs.length / 2)
  const botaoAba = (m) => {
    const Icon = m.icon
    const aceso = abaAcesa === m.id
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => ir(m.id)}
        aria-current={aceso ? 'page' : undefined}
        className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[44px]"
        style={{ color: aceso ? VERDE : CINZA }}
      >
        {Icon && <Icon size={22} strokeWidth={aceso ? 2.4 : 2} />}
        <span className={`text-[11px] leading-none ${aceso ? 'font-semibold' : ''}`}>{m.label}</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-950">
      {modulo.id !== 'inicio' && modulo.id !== 'mais' && (
        <header className="flex items-center gap-1 px-2 h-14 shrink-0 border-b border-gray-800 bg-gray-950" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          {!ehAba ? (
            <button type="button" onClick={() => ir('mais')} aria-label="Voltar para Mais" className="w-11 h-11 flex items-center justify-center text-gray-400">
              <ChevronLeft size={22} />
            </button>
          ) : <span className="w-2" />}
          <h1 className="flex-1 text-base font-semibold text-gray-100 truncate">{modulo.label}</h1>
          <button type="button" onClick={onOpenSearch} aria-label="Buscar" className="w-11 h-11 flex items-center justify-center text-gray-400">
            <Search size={20} />
          </button>
        </header>
      )}

      <main
        ref={contentRef}
        className="flex-1 overflow-y-auto px-4 pt-4"
        style={{ paddingBottom: 'calc(104px + env(safe-area-inset-bottom))' }}
      >
        <ScrollScopeContext.Provider value={scrollCtx}>
          {conteudo}
        </ScrollScopeContext.Provider>
      </main>

      <nav
        aria-label="Navegação principal"
        className="fixed bottom-0 inset-x-0 z-40 bg-gray-950/95 border-t border-gray-800 flex items-stretch"
        style={{ height: 'calc(68px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.slice(0, meio).map(botaoAba)}
        <div className="flex-1 flex justify-center">
          <button
            type="button"
            onClick={() => setAcoesAbertas(true)}
            aria-label="Novo"
            className="w-14 h-14 -mt-5 rounded-full flex items-center justify-center text-white shadow-lg"
            style={{ backgroundColor: VERDE, boxShadow: '0 6px 18px rgba(14,107,78,0.45)' }}
          >
            <Plus size={26} />
          </button>
        </div>
        {tabs.slice(meio).map(botaoAba)}
      </nav>

      <ActionSheet
        open={acoesAbertas}
        onClose={() => setAcoesAbertas(false)}
        modules={modules}
        onToast={onToast}
        acaoDaTela={fabAction}
      />
    </div>
  )
}
