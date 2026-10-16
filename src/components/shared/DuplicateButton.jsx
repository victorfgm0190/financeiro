import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Copy } from 'lucide-react'
import { today } from './utils'
import Modal from './Modal'
import ScheduleForm from '../Schedule/ScheduleForm'
import { txToScheduleInitial } from '../../lib/herancaCampos'
import { useApp } from '../../context/AppContext'

// Lançamento → `initial` de um Agendamento NOVO: txToScheduleInitial (lib/herancaCampos.js) —
// data/frequência ficam nos defaults do form; o tipo de documento é mantido.

// Botão "Duplicar" para uma linha de extrato. Ao clicar, pergunta "Duplicar como…":
//   📋 Criar Lançamento  → fluxo existente (escolhe a DATA e chama onConfirm(novaData)).
//   🔔 Criar Agendamento → abre o ScheduleForm em modo novo, pré-preenchido a partir do
//      lançamento (sourceTx), no MESMO padrão de "Novo Agendamento" (Modal + ScheduleForm).
// Autossuficiente (estado + posicionamento próprios) para reuso nos extratos de Contas e Cartão.
// Retrocompatível: sem `sourceTx`, pula a escolha e vai direto ao seletor de data (comportamento
// anterior), pois não há como montar o agendamento sem o lançamento de origem.
export default function DuplicateButton({ onConfirm, sourceTx, iconSize = 14, className }) {
  const [step, setStep] = useState(null) // null (fechado) | 'choice' | 'date'
  const [date, setDate] = useState(today())
  const [schedInitial, setSchedInitial] = useState(null)
  const btnRef = useRef(null)
  const popRef = useRef(null)

  const open = step !== null
  // Duplicar cria lançamento ou agendamento: sem permissão de incluir em nenhum, o botão some.
  const { pode } = useApp()
  const podeDuplicar = pode('lancamentos', 'incluir') || pode('agendamentos', 'incluir')

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (popRef.current?.contains(e.target)) return
      setStep(null)
    }
    const onKey = (e) => { if (e.key === 'Escape') setStep(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const openPopover = (e) => {
    e.stopPropagation()
    setDate(today())
    // Sem lançamento de origem não dá para montar o agendamento → mantém o fluxo antigo (só data).
    setStep(sourceTx ? 'choice' : 'date')
  }

  const chooseLancamento = () => {
    setDate(today())
    setStep('date')
  }

  const chooseAgendamento = () => {
    setSchedInitial(txToScheduleInitial(sourceTx))
    setStep(null)
  }

  const confirm = () => {
    if (!date) return
    setStep(null)
    onConfirm(date)
  }

  // Barreira de propagação de cliques: este componente é montado dentro de uma
  // <tr onClick={onEdit}> (linha do extrato). Cliques dentro do popover e do
  // ScheduleForm sobem pela ÁRVORE REACT — inclusive através de createPortal — e
  // disparariam o onEdit da linha, abrindo "Editar Lançamento" por baixo. O span
  // display:contents (não afeta o layout) intercepta e interrompe essa propagação.
  if (!podeDuplicar) return null
  return (
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        onClick={openPopover}
        title="Duplicar lançamento"
        aria-label="Duplicar"
        className={className || 'p-1.5 text-texto-3 hover:text-primary-fg hover:bg-primary/10 rounded transition-colors'}
      >
        <Copy size={iconSize} />
      </button>
      {open && createPortal(
        <>
          {/* Overlay escuro: cobre a viewport e fecha ao clicar fora. */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            className="bg-overlay"
            onClick={() => setStep(null)}
          />
          {/* Modal centralizado — funciona igual em desktop e mobile (independe da posição do botão). */}
          <div
            ref={popRef}
            style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 9999 }}
            className="bg-surface border border-borda-forte rounded-lg shadow-2xl p-3 w-[248px] max-w-[calc(100vw-2rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            {step === 'choice' ? (
              <>
                <p className="text-xs text-texto-2 mb-2">Duplicar como...</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={chooseLancamento}
                    className="flex-1 flex flex-col items-center gap-1 px-2 py-2.5 text-xs font-medium text-texto-2 border border-borda-forte rounded-lg hover:border-primary/60 hover:text-primary-fg hover:bg-primary/5 transition-colors"
                  >
                    <span className="text-base leading-none">📋</span>
                    Criar Lançamento
                  </button>
                  <button
                    type="button"
                    onClick={chooseAgendamento}
                    className="flex-1 flex flex-col items-center gap-1 px-2 py-2.5 text-xs font-medium text-texto-2 border border-borda-forte rounded-lg hover:border-primary/60 hover:text-primary-fg hover:bg-primary/5 transition-colors"
                  >
                    <span className="text-base leading-none">🔔</span>
                    Criar Agendamento
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="block text-xs text-texto-2 mb-1.5">Data da cópia</label>
                <input
                  type="date"
                  className="input w-full text-sm"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirm() } }}
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-2.5">
                  <button
                    type="button"
                    onClick={() => setStep(null)}
                    className="px-2.5 py-1 text-xs text-texto-2 hover:text-texto-1 rounded transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirm}
                    className="px-3 py-1 text-xs font-medium bg-primary hover:bg-primary-hover text-white rounded transition-colors"
                  >
                    Duplicar
                  </button>
                </div>
              </>
            )}
          </div>
        </>,
        document.body
      )}
      {/* Agendamento pré-preenchido — mesmo padrão de abertura de "Novo Agendamento".
          Portado para o body: este botão vive dentro do container de ações da linha do
          extrato, que tem `opacity-0 group-hover:opacity-100`. Sem o portal o modal é
          descendente desse container e some junto quando o cursor deixa a <tr> (o
          `position: fixed` não escapa de opacity/transform do ancestral). O portal o
          torna filho do body, igual ao "Novo Lançamento" aberto pelo pai. */}
      {schedInitial && createPortal(
        <Modal open onClose={() => setSchedInitial(null)} title="Novo Agendamento" size="lg">
          <ScheduleForm initial={schedInitial} onClose={() => setSchedInitial(null)} />
        </Modal>,
        document.body
      )}
    </span>
  )
}
