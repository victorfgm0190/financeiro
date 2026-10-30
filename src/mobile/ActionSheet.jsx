import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import BottomSheet from '../components/shared/BottomSheet'
import { acoes } from './navegacao'

// Menu do botão "+": grid 2x2 com as ações primárias e o resto em lista (tudo de modules.js).
// Escolher uma ação abre o formulário existente dela dentro do próprio sheet.
// `acaoDaTela`: { run, label } registrada pela tela aberta (useRegisterFab — ex.: novo lançamento
// no cartão selecionado), como item da lista com ícone + (a estrela é só do Assistente).
export default function ActionSheet({ open, onClose, modules, onToast, acaoDaTela }) {
  const [ativa, setAtiva] = useState(null)
  const { primarias, outras } = acoes(modules)

  const fechar = () => { setAtiva(null); onClose() }

  if (ativa) {
    const Form = ativa.component
    return (
      <BottomSheet open={open} onClose={fechar} title={ativa.label}>
        <button type="button" onClick={() => setAtiva(null)} className="-mt-2 flex items-center gap-1 text-xs text-texto-2 min-h-[44px]">
          <ChevronLeft size={14} /> Outras ações
        </button>
        <Form onClose={fechar} onToast={onToast} />
      </BottomSheet>
    )
  }

  return (
    <BottomSheet open={open} onClose={fechar} title="O que você quer fazer?">
      <div className="grid grid-cols-2 gap-3">
        {primarias.map(m => {
          const Icon = m.icon
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setAtiva(m)}
              className="flex flex-col items-start gap-3 p-4 min-h-[96px] rounded-2xl bg-surface-2/70 border border-borda-forte/60 active:bg-surface-2 text-left"
            >
              <span className="w-10 h-10 rounded-full flex items-center justify-center bg-primary/20 text-primary-fg">
                {Icon && <Icon size={20} />}
              </span>
              <span className="text-sm font-semibold text-texto-1">{m.label}</span>
            </button>
          )
        })}
      </div>

      {(outras.length > 0 || acaoDaTela) && (
        <ul className="divide-y divide-borda rounded-xl border border-borda overflow-hidden">
          {acaoDaTela && (
            <li>
              <button type="button" onClick={() => { fechar(); acaoDaTela.run() }} className="w-full flex items-center gap-3 px-4 min-h-[52px] text-left text-sm text-texto-1">
                <Plus size={18} className="text-primary-fg" />
                <span className="flex-1">{acaoDaTela.label || 'Novo nesta tela'}</span>
                <ChevronRight size={16} className="text-texto-3" />
              </button>
            </li>
          )}
          {outras.map(m => {
            const Icon = m.icon
            return (
              <li key={m.id}>
                <button type="button" onClick={() => setAtiva(m)} className="w-full flex items-center gap-3 px-4 min-h-[52px] text-left text-sm text-texto-1">
                  {Icon && <Icon size={18} className="text-texto-2" />}
                  <span className="flex-1">{m.label}</span>
                  <ChevronRight size={16} className="text-texto-3" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </BottomSheet>
  )
}
