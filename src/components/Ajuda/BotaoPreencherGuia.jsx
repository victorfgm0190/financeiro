// "Preencher com guia" — vai DENTRO do contêiner data-help-form do formulário. Faz quatro coisas:
//   • o botão (só com roteiro na base: src/help/<tela>.js › formularios[form]);
//   • registra o provedor do formulário: resumo com os dados reais ("Ao salvar, vai acontecer…"),
//     validação (`validacao`: { erros() → [{ id, msg }], obrigatorio(id) } — a MESMA do Avançar/Salvar),
//     pré-requisitos (src/lib/prerequisitos.js) e como fechar ("Cadastrar agora");
//   • abre já guiado quando pedido antes (Voltar de um pré-requisito) ou quando o "Faça comigo"
//     (tour da tela, jornada, pré-requisitos) abriu este formulário — o guia assume a tarefa;
//   • oferta discreta na 1ª abertura de cada formulário (Sim / Não / Não perguntar mais), por usuário.
// Também atende o rodapé do help de campo (evento finup:preencher-guia).
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Wand2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { prerequisitosDe } from '../../lib/prerequisitos'
import { tarefaPorId } from '../../lib/tarefasGuiadas'
import { responderOfertaGuia, ofertaGuiaRespondida } from '../../lib/boasVindasApi'
import { useEstadoBoasVindas } from '../BoasVindas/useGuiaTela'
import { tourAtivo, encerrarTour, useTourAtivo } from '../BoasVindas/tourEstado'
import { EVENTO_PREENCHER_GUIA, idFormDe, formAberto } from '../../help/helpCampoEstado.js'
import {
  temRoteiro, iniciarPreenchimento, registrarProvedorGuia, consumirPendente, lerPreenchimento, assinarPreenchimento,
} from '../../help/guiaPreenchimento.js'

export default function BotaoPreencherGuia({ form, funcao = null, resumo = null, validacao = null, oferecer = true, onFechar = null, className = '' }) {
  const { profiles, accounts, categories, dbStatus } = useApp()
  const ref = useRef(null)
  const estado = useEstadoBoasVindas()
  const tour = useTourAtivo()
  const { ativo } = useSyncExternalStore(assinarPreenchimento, lerPreenchimento, lerPreenchimento)
  const [ofertaFechada, setOfertaFechada] = useState(false)
  const roteiro = temRoteiro(form)

  // Provedor: sempre lê o estado mais novo do formulário (refs atualizadas a cada render).
  const atual = useRef({})
  useLayoutEffect(() => {
    atual.current = { resumo, funcao, onFechar, validacao, dados: { profiles, accounts, categories }, conectado: dbStatus === 'connected' }
  })
  useEffect(() => {
    if (!roteiro) return
    return registrarProvedorGuia(form, {
      resumo: () => atual.current.resumo?.() || [],
      preRequisitos: () => {
        const a = atual.current
        if (!a.funcao || !a.conectado) return null
        return prerequisitosDe(a.funcao, a.dados)?.itens || null
      },
      fechar: () => atual.current.onFechar?.(),
      get validacao() { return atual.current.validacao || null },
    })
  }, [form, roteiro])

  // Ao abrir: pedido pendente (Voltar de um pré-requisito) ou "Faça comigo" que abriu este formulário.
  useEffect(() => {
    if (!roteiro) return
    const p = consumirPendente(form)
    if (p) { iniciarPreenchimento(form, { origem: 'pendente', tarefaId: p.tarefaId }); return }
    const t = tourAtivo()
    if (t?.tipo !== 'tarefa') return
    const raiz = ref.current?.closest('[data-help-form]')
    const tarefa = tarefaPorId(t.tarefaId)
    const daqui = raiz && tarefa?.passos?.some(ps => raiz.querySelector(`[data-guia="${ps.alvo}"]`))
    if (!daqui) return
    encerrarTour()
    iniciarPreenchimento(form, { origem: 'tarefa', tarefaId: t.tarefaId })
  }, [form, roteiro])

  // Rodapé do help de campo: "Preencher com guia" no campo deste formulário (ou no formulário aberto).
  useEffect(() => {
    if (!roteiro) return
    const ouvir = (e) => {
      if (e.detail?.atendido) return
      const raiz = ref.current?.closest('[data-help-form]')
      const id = e.detail?.idCampo
      const doCampo = id && raiz?.querySelector(`[data-help-id="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id}"]`)
      if (!doCampo && !(idFormDe(ref.current) === form && formAberto() === form)) return
      e.detail.atendido = iniciarPreenchimento(form, { origem: 'f1' })
    }
    window.addEventListener(EVENTO_PREENCHER_GUIA, ouvir)
    return () => window.removeEventListener(EVENTO_PREENCHER_GUIA, ouvir)
  }, [form, roteiro])

  // Oferta: só na 1ª abertura. Ao aparecer, fica marcada como vista ('vista') — sem resposta, não volta;
  // nesta abertura continua na tela até a pessoa responder ou o guia começar.
  const elegivel = roteiro && oferecer && !!estado && estado.guiasLigados !== false && !ofertaGuiaRespondida(estado, form)
  const [fixada, setFixada] = useState(false)
  if (elegivel && !fixada && !ativo && !tour) setFixada(true)
  useEffect(() => { if (fixada) responderOfertaGuia(form, 'vista') }, [fixada, form])

  if (!roteiro) return null
  const guiando = ativo?.form === form
  const mostrarOferta = fixada && !ofertaFechada && !ativo && !tour
  const responder = (resposta) => {
    setOfertaFechada(true)
    responderOfertaGuia(form, resposta)
    if (resposta === 'sim') iniciarPreenchimento(form, { origem: 'oferta' })
  }

  // Guiando: a linha some (sem espaço em branco no topo do formulário); o guia está no balão.
  if (guiando) return <div ref={ref} data-guia-fora className="hidden" />
  return (
    <div ref={ref} data-guia-fora className={`flex flex-wrap items-center justify-end gap-2 ${className}`}>
      {mostrarOferta && (
        <div role="note" data-testid="oferta-guia" className="flex flex-wrap items-center gap-1.5 text-xs text-texto-2 bg-surface-2/60 border border-borda rounded-lg px-2 py-1 mr-auto">
          <Wand2 size={12} className="text-primary-fg shrink-0" aria-hidden="true" />
          <span>Quer preencher com o guia?</span>
          <button type="button" className="text-primary-fg font-medium hover:underline px-1 min-h-[28px]" onClick={() => responder('sim')}>Sim</button>
          <button type="button" className="text-texto-2 hover:text-texto-1 px-1 min-h-[28px]" onClick={() => responder('nao')}>Não</button>
          <button type="button" className="text-texto-3 hover:text-texto-1 px-1 min-h-[28px]" onClick={() => responder('nunca')}>Não perguntar mais</button>
        </div>
      )}
      <button type="button" data-testid="botao-preencher-guia"
        className="text-xs text-primary-fg hover:underline flex items-center gap-1 min-h-[32px] disabled:opacity-50 disabled:no-underline"
        title="Percorre os campos com explicação; você preenche e salva"
        onClick={() => iniciarPreenchimento(form, { origem: 'botao' })}>
        <Wand2 size={13} aria-hidden="true" /> Preencher com guia
      </button>
    </div>
  )
}
