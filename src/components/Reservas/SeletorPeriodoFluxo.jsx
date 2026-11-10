import { useState, useEffect, useRef } from 'react'
import { Calendar } from 'lucide-react'
import BottomSheet from '../shared/BottomSheet'
import { useIsMobile } from '../../hooks/useIsMobile'
import {
  erroPeriodo, atalhosPeriodo, aplicarAtalho, periodoPadrao, rotuloPeriodo, somarMeses, MAX_MESES_FLUXO,
} from '../../lib/fluxoPeriodo'
import HelpCampo from '../shared/HelpCampo'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Mês + ano ('YYYY-MM') com dois selects. Anos: do atual até onde o limite de meses alcança.
function CampoMes({ rotulo, valor, anos, onChange, helpId }) {
  const [ano, mes] = valor.split('-')
  const id = `fluxo-periodo-${rotulo.toLowerCase()}`
  return (
    <div className="space-y-1" data-help-id={helpId}>
      <label htmlFor={id} className="text-xs text-texto-2 inline-flex items-center">{rotulo}<HelpCampo campo={helpId} /></label>
      <div className="flex gap-2">
        <select id={id} className="input text-xs py-1.5 flex-1" value={mes} onChange={e => onChange(`${ano}-${e.target.value}`)} aria-label={`${rotulo}: mês`}>
          {MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
        </select>
        <select className="input text-xs py-1.5 w-24" value={ano} onChange={e => onChange(`${e.target.value}-${mes}`)} aria-label={`${rotulo}: ano`}>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
    </div>
  )
}

function Conteudo({ periodo, atual, onAplicar, onFechar }) {
  const [de, setDe] = useState(periodo.de)
  const [ate, setAte] = useState(periodo.ate)
  // "n meses" escolhido por atalho: mudar o "De" leva o "Até" junto; mexer no "Até" desfaz.
  const [meses, setMeses] = useState(null)
  const anoAtual = Number(atual.slice(0, 4))
  const anoMax = Number(somarMeses(atual, MAX_MESES_FLUXO * 2).slice(0, 4))
  const anos = Array.from({ length: anoMax - anoAtual + 1 }, (_, i) => String(anoAtual + i))
  const erro = erroPeriodo({ de, ate }, atual)

  const mudarDe = (v) => { setDe(v); if (meses) setAte(somarMeses(v, meses - 1)) }
  const mudarAte = (v) => { setAte(v); setMeses(null) }
  const atalho = (a) => { setAte(aplicarAtalho(a, de)); setMeses(a.meses || null) }
  const aplicar = () => { if (!erro) onAplicar({ de, ate, meses }) }
  const padrao = () => { const p = periodoPadrao(atual); onAplicar({ ...p, meses: null }) }

  return (
    <div className="space-y-3" data-help-form="periodoFluxoReservas">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CampoMes rotulo="De" valor={de} anos={anos} onChange={mudarDe} helpId="periodoFluxo.de" />
        <CampoMes rotulo="Até" valor={ate} anos={anos} onChange={mudarAte} helpId="periodoFluxo.ate" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5" data-help-id="periodoFluxo.atalhos">
        {atalhosPeriodo(atual).map(a => {
          const ativo = aplicarAtalho(a, de) === ate && (a.meses ? meses === a.meses : !meses)
          return (
            <button key={a.id} type="button" onClick={() => atalho(a)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${ativo ? 'border-primary text-primary-fg bg-primary/10' : 'border-borda text-texto-2 hover:bg-surface-hover'}`}>
              {a.rotulo}
            </button>
          )
        })}
        <HelpCampo campo="periodoFluxo.atalhos" />
      </div>
      <p className="text-[11px] text-texto-3">
        A projeção sempre parte do saldo de hoje; meses antes do "De" só ficam escondidos. Máximo de {MAX_MESES_FLUXO} meses.
      </p>
      {erro && <p role="alert" className="text-xs text-despesa">{erro}</p>}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button type="button" onClick={padrao} className="btn-secondary text-xs py-1.5">Padrão</button>
        <div className="flex gap-2">
          {onFechar && <button type="button" onClick={onFechar} className="btn-secondary text-xs py-1.5">Cancelar</button>}
          <button type="button" onClick={aplicar} disabled={!!erro} className="btn-primary text-xs py-1.5 disabled:opacity-50">Aplicar</button>
        </div>
      </div>
    </div>
  )
}

// Botão com o período do Fluxo Futuro (ícone + "Nov/26 – Out/27"). Abre popover (desktop) ou
// bottom sheet (celular) com De/Até, atalhos, Padrão e Aplicar.
export default function SeletorPeriodoFluxo({ periodo, atual, onAplicar }) {
  const [aberto, setAberto] = useState(false)
  const isMobile = useIsMobile()
  const ref = useRef(null)
  useEffect(() => {
    if (!aberto || isMobile) return
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    const esc = (e) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    window.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); window.removeEventListener('keydown', esc) }
  }, [aberto, isMobile])

  const aplicar = (p) => { setAberto(false); onAplicar(p) }
  const fechar = () => setAberto(false)

  return (
    <div className="relative" ref={ref}>
      <button type="button" data-guia="reservas:fluxo.periodo" onClick={() => setAberto(a => !a)}
        className="flex items-center gap-1.5 text-xs text-texto-3 hover:text-texto-1 hover:underline"
        aria-haspopup="dialog" aria-expanded={aberto} title="Escolher o período do Fluxo Futuro">
        <Calendar size={12} /> {rotuloPeriodo(periodo)}
      </button>
      {aberto && !isMobile && (
        <div role="dialog" aria-label="Período do Fluxo Futuro"
          className="absolute right-0 top-full mt-2 z-40 w-[22rem] max-w-[calc(100vw-2rem)] card p-4 shadow-2xl border border-borda">
          <p className="text-sm font-semibold text-texto-1 mb-3">Período do Fluxo Futuro</p>
          <Conteudo periodo={periodo} atual={atual} onAplicar={aplicar} onFechar={fechar} />
        </div>
      )}
      {isMobile && (
        <BottomSheet open={aberto} onClose={fechar} title="Período do Fluxo Futuro">
          {aberto && <Conteudo periodo={periodo} atual={atual} onAplicar={aplicar} />}
        </BottomSheet>
      )}
    </div>
  )
}
