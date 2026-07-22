import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Copy } from 'lucide-react'
import { today } from './utils'
import Modal from './Modal'
import ScheduleForm from '../Schedule/ScheduleForm'

// Mapeia um lançamento (transaction) para o `initial` de um Agendamento NOVO (ScheduleForm).
// Só copia os campos "de conteúdo"; data/frequência/recorrência ficam nos defaults do form
// (Data de Início = hoje; frequência vazia — o usuário escolhe). Nada de id/parentTxId/origin/
// installment* — é um agendamento novo. Observação de nomes: o lançamento usa `type`, o
// agendamento usa `transactionType`; os demais campos compartilham o mesmo nome camelCase.
function txToScheduleInitial(tx) {
  if (!tx) return null
  return {
    description: tx.description || '',
    transactionType: tx.type || 'expense',
    amount: tx.amount ?? '',
    accountId: tx.accountId || '',       // conta origem (também from_account_id em transferência)
    toAccountId: tx.toAccountId || '',   // conta destino (transferência)
    categoryId: tx.categoryId || '',
    payee: tx.payee || '',
    costCenter: tx.costCenter || '',
    reservaFuncaoId: tx.reservaFuncaoId || '',
    grupoGerencial: tx.grupoGerencial || null,
  }
}

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
  return (
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        onClick={openPopover}
        title="Duplicar lançamento"
        className={className || 'p-1.5 text-gray-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded transition-colors'}
      >
        <Copy size={iconSize} />
      </button>
      {open && createPortal(
        <>
          {/* Overlay escuro: cobre a viewport e fecha ao clicar fora. */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            className="bg-black/60"
            onClick={() => setStep(null)}
          />
          {/* Modal centralizado — funciona igual em desktop e mobile (independe da posição do botão). */}
          <div
            ref={popRef}
            style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 9999 }}
            className="bg-surface border border-gray-700 rounded-lg shadow-2xl p-3 w-[248px] max-w-[calc(100vw-2rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            {step === 'choice' ? (
              <>
                <p className="text-xs text-gray-400 mb-2">Duplicar como...</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={chooseLancamento}
                    className="flex-1 flex flex-col items-center gap-1 px-2 py-2.5 text-xs font-medium text-gray-300 border border-gray-700 rounded-lg hover:border-emerald-500/60 hover:text-emerald-400 hover:bg-emerald-400/5 transition-colors"
                  >
                    <span className="text-base leading-none">📋</span>
                    Criar Lançamento
                  </button>
                  <button
                    type="button"
                    onClick={chooseAgendamento}
                    className="flex-1 flex flex-col items-center gap-1 px-2 py-2.5 text-xs font-medium text-gray-300 border border-gray-700 rounded-lg hover:border-indigo-500/60 hover:text-indigo-400 hover:bg-indigo-400/5 transition-colors"
                  >
                    <span className="text-base leading-none">🔔</span>
                    Criar Agendamento
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="block text-xs text-gray-400 mb-1.5">Data da cópia</label>
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
                    className="px-2.5 py-1 text-xs text-gray-400 hover:text-gray-200 rounded transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirm}
                    className="px-3 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors"
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
      {/* Agendamento pré-preenchido — mesmo padrão de abertura de "Novo Agendamento". */}
      <Modal open={!!schedInitial} onClose={() => setSchedInitial(null)} title="Novo Agendamento" size="lg">
        {schedInitial && <ScheduleForm initial={schedInitial} onClose={() => setSchedInitial(null)} />}
      </Modal>
    </span>
  )
}
