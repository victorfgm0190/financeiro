import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { X, Info, BookOpen, Wand2 } from 'lucide-react'
import { helpDoCampo, helpDoFormulario } from '../../help/index.js'
import {
  lerHelpCampo, assinarHelpCampo, abrirHelpCampo, fecharHelpCampo, idHelpDe, ehMac, pedirAjudaDaTela, pedirPreencherComGuia,
} from '../../help/helpCampoEstado.js'
import { instalarTeclaF1 } from '../../help/teclaF1.js'
import { useIsMobile } from '../../hooks/useIsMobile'
import { navegarPara } from '../../lib/abrirTela'

// HELP DE CAMPO — um painel só no app (montado no App), aberto pela F1 ou pelo ícone ⓘ.
//   Computador: drawer lateral que NÃO bloqueia o formulário — o foco fica no campo, o painel
//   acompanha a troca de campo e o Esc fecha só ele (o modal de baixo continua aberto).
//   Celular: bottom sheet (aberto pelo ⓘ; tocar no campo só abre o teclado).
// Rodapé: "Ajuda da tela" (o "?" do cabeçalho) e "Preencher com guia" (formulário com roteiro na base).
// semLogin (Login, Esqueci a senha, Definir/Trocar senha, Pedido de cadastro): sem "Ajuda da tela" nem
// Central de Ajuda, que exigem login — só a ajuda dos campos desta tela.
export default function HelpCampoPainel({ semLogin = false }) {
  const estado = useSyncExternalStore(assinarHelpCampo, lerHelpCampo, lerHelpCampo)
  const celular = useIsMobile()

  useEffect(() => instalarTeclaF1(), [])

  // Acompanha o campo com foco; Esc fecha só o painel (captura: antes do Esc do modal).
  useEffect(() => {
    if (!estado.aberto) return
    const foco = (e) => {
      if (e.target?.closest?.('[data-help-painel]')) return
      const id = idHelpDe(e.target)
      if (id && id !== lerHelpCampo().id && helpDoCampo(id)) abrirHelpCampo(id, { origem: lerHelpCampo().origem })
    }
    const esc = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation?.()
      fecharHelpCampo()
    }
    document.addEventListener('focusin', foco)
    window.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('focusin', foco); window.removeEventListener('keydown', esc, true) }
  }, [estado.aberto])

  if (!estado.aberto || typeof document === 'undefined') return null
  const campo = estado.id ? helpDoCampo(estado.id) : null
  const form = estado.form ? helpDoFormulario(estado.form) : null
  const titulo = campo ? campo.titulo : form ? 'Sobre este formulário' : 'Ajuda desta tela'
  const dicaTecla = ehMac() ? 'fn+F1' : 'F1'

  const corpo = (
    <div className="space-y-3 text-sm text-texto-2 leading-relaxed">
      {campo ? (
        <>
          <p className="text-texto-1">{campo.paraQueServe}</p>
          {campo.obrigatorio && <p className="text-[11px] font-medium text-aviso">Obrigatório</p>}
          {campo.relacaoComTela && <Bloco titulo="Como mexe no resto da tela">{campo.relacaoComTela}</Bloco>}
          {campo.oQueAconteceAoSalvar && <Bloco titulo="Ao salvar">{campo.oQueAconteceAoSalvar}</Bloco>}
          {campo.quandoUsar && <Bloco titulo="Quando usar">{campo.quandoUsar}</Bloco>}
          {campo.exemplo && <Bloco titulo="Exemplo">{campo.exemplo}</Bloco>}
          {campo.atencao && <p className="text-xs text-aviso bg-aviso/10 rounded-lg px-2.5 py-2">⚠ {campo.atencao}</p>}
        </>
      ) : form ? (
        <>
          <p className="text-texto-1">{form.objetivo}</p>
          {form.preRequisitos.length > 0 && (
            <Bloco titulo="Antes de começar">
              <ul className="list-disc pl-4 space-y-0.5">{form.preRequisitos.map(p => <li key={p.id}>{p.texto}</li>)}</ul>
            </Bloco>
          )}
          <Bloco titulo="Ao salvar">{form.resumoAoSalvar}</Bloco>
          <p className="text-xs text-texto-3">Com o foco num campo, {dicaTecla} mostra a ajuda dele.</p>
        </>
      ) : semLogin ? (
        <p data-testid="ajuda-sem-login">Toque no ⓘ ao lado de um campo, ou use {dicaTecla} com o foco nele, para ver a ajuda daquele campo.</p>
      ) : (
        <>
          <p>Esta tela não tem o botão de ajuda ligado agora.</p>
          <button type="button" className="btn-secondary text-xs py-1 flex items-center gap-1" onClick={() => { fecharHelpCampo(); navegarPara('ajuda') }}>
            <BookOpen size={12} /> Abrir a Central de Ajuda
          </button>
        </>
      )}
    </div>
  )

  const rodape = (
    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-borda">
      {!semLogin && (
        <button type="button" className="btn-secondary text-xs py-1 flex items-center gap-1"
          onClick={() => { if (pedirAjudaDaTela()) fecharHelpCampo(); else { fecharHelpCampo(); navegarPara('ajuda') } }}>
          <BookOpen size={12} /> Ajuda da tela
        </button>
      )}
      {/* Só em formulário com roteiro; o botão do próprio formulário atende (BotaoPreencherGuia). */}
      {estado.form && helpDoFormulario(estado.form)?.ordemCampos?.length > 0 && (
        <button type="button" className="btn-secondary text-xs py-1 flex items-center gap-1" title="Percorre os campos do formulário com explicação"
          onClick={() => { if (pedirPreencherComGuia(estado.id)) fecharHelpCampo() }}>
          <Wand2 size={12} /> Preencher com guia
        </button>
      )}
      {!celular && <span className="ml-auto text-[10px] text-texto-3">{dicaTecla}: ajuda do campo · Esc fecha</span>}
    </div>
  )

  const cabecalho = (
    <div className="flex items-start justify-between gap-2 mb-2">
      <h2 className="text-sm font-semibold text-texto-1 flex items-center gap-1.5"><Info size={14} className="text-primary-fg shrink-0" /> {titulo}</h2>
      <button type="button" className="p-1 -m-1 text-texto-3 hover:text-texto-1" aria-label="Fechar ajuda" onClick={fecharHelpCampo}><X size={16} /></button>
    </div>
  )

  if (celular) {
    return createPortal(
      <div data-help-painel className="fixed inset-0 z-[70] flex items-end" data-testid="help-campo-painel" data-modo="sheet">
        <button type="button" aria-label="Fechar ajuda" className="absolute inset-0 bg-black/30" onClick={fecharHelpCampo} />
        <section role="dialog" aria-modal="false" aria-label={titulo}
          className="relative w-full max-h-[75vh] overflow-y-auto bg-surface border-t border-borda-forte rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-borda-forte" aria-hidden="true" />
          {cabecalho}{corpo}<div className="mt-3">{rodape}</div>
        </section>
      </div>,
      document.body,
    )
  }
  return createPortal(
    <aside data-help-painel role="complementary" aria-label={titulo} aria-live="polite" data-testid="help-campo-painel" data-modo="drawer"
      className="fixed right-0 top-0 bottom-0 z-[70] w-[340px] max-w-[90vw] bg-surface border-l border-borda-forte shadow-2xl p-4 flex flex-col">
      {cabecalho}
      <div className="flex-1 overflow-y-auto">{corpo}</div>
      <div className="mt-3">{rodape}</div>
    </aside>,
    document.body,
  )
}

const Bloco = ({ titulo, children }) => (
  <div>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-3 mb-0.5">{titulo}</p>
    <div>{children}</div>
  </div>
)
