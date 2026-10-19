import { useMemo, useRef, useState } from 'react'
import { Plus, ChevronLeft, Search } from 'lucide-react'
import { useFab } from '../context/FabContext'
import { useScrollRestoration, ScrollScopeContext, saveScrollNow } from '../hooks/useScrollRestoration'
import { abas, acoes } from './navegacao'
import ActionSheet from './ActionSheet'
import PerfilChips from './PerfilChips'
import { useSaldosProntos } from '../hooks/useSaldosProntos'
import { TelaCarregando, AvisoDesatualizado } from './Carregando'
import IndicadorSync from '../components/Offline/IndicadorSync'
import FaixaOffline from '../components/Offline/FaixaOffline'


// Layout mobile: conteúdo com scroll + barra inferior [aba aba (+) aba aba]. Tudo vem de
// modules.js; telas `page` são os MESMOS painéis do desktop (mapa `panels` do App).
// ativo / irPara: módulo aberto (estado do App, para os painéis navegarem por página).
export default function MobileShell({ modules, panels, ativo, irPara, saldosPrincipais, onToast, onOpenSearch }) {
  const { fabAction } = useFab()
  const saldos = useSaldosProntos()
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
  // Botão "+": só com alguma ação permitida (as ações já chegam filtradas pelo nível de acesso).
  const temAcoes = (() => { const a = acoes(modules); return a.primarias.length + a.outras.length > 0 })()
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
  // Tela com saldo (`saldo: true`) só aparece depois do recálculo — antes, placeholder (o Início
  // trata os próprios números).
  const conteudo = saldos === 'carregando' && modulo.saldo
    ? <TelaCarregando />
    : Tela
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
        className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[44px] ${aceso ? 'text-primary-fg' : 'text-texto-3'}`}
      >
        {Icon && <Icon size={22} strokeWidth={aceso ? 2.4 : 2} />}
        <span className={`text-[11px] leading-none ${aceso ? 'font-semibold' : ''}`}>{m.label}</span>
      </button>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-page">
      {/* Faixa escura sob a status bar do iPhone no tema claro (Início/Mais não têm header).
          Fixa, sem layout nem toque; altura = safe-area (0 fora do iOS standalone). index.css */}
      <div className="faixa-status-ios" aria-hidden="true" />
      {modulo.id !== 'inicio' && modulo.id !== 'mais' && (
        <header className="faixa-safe-top flex items-center gap-1 px-2 h-14 shrink-0 border-b border-borda bg-page" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          {!ehAba ? (
            <button type="button" onClick={() => ir('mais')} aria-label="Voltar para Mais" className="w-11 h-11 flex items-center justify-center text-texto-2">
              <ChevronLeft size={22} />
            </button>
          ) : <span className="w-2" />}
          <h1 className="flex-1 text-base font-semibold text-texto-1 truncate">{modulo.label}</h1>
          <button type="button" onClick={onOpenSearch} aria-label="Buscar" className="w-11 h-11 flex items-center justify-center text-texto-2">
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
          <FaixaOffline />
          <IndicadorSync faixa />
          {saldos === 'desatualizado' && modulo.id !== 'mais' && <AvisoDesatualizado />}
          {modulo.perfil && !Tela && <div className="mb-4"><PerfilChips /></div>}
          {conteudo}
        </ScrollScopeContext.Provider>
      </main>

      <nav
        aria-label="Navegação principal"
        className="fixed bottom-0 inset-x-0 z-40 bg-page/95 border-t border-borda flex items-stretch"
        style={{ height: 'calc(68px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.slice(0, meio).map(botaoAba)}
        <div className="flex-1 flex justify-center">
          {temAcoes && <button
            type="button"
            onClick={() => setAcoesAbertas(true)}
            aria-label="Novo"
            className="w-14 h-14 -mt-5 rounded-full flex items-center justify-center bg-primary text-white shadow-lg"
            style={{ boxShadow: '0 6px 18px rgba(14,107,78,0.45)' }}
          >
            <Plus size={26} />
          </button>}
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
