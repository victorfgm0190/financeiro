import { useState } from 'react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import BottomSheet from '../components/shared/BottomSheet'
import { acoes } from './navegacao'

// Menu do botão "+": grid 2x2 com as ações primárias e o resto em lista (tudo de modules.js).
// Escolher uma ação abre o formulário existente dela dentro do próprio sheet.
// `acaoDaTela`: ação contextual registrada pela tela aberta (useRegisterFab — ex.: novo lançamento
// no cartão selecionado); continua disponível como item da lista.
export default function ActionSheet({ open, onClose, modules, onToast, acaoDaTela }) {
  const [ativa, setAtiva] = useState(null)
  const { primarias, outras } = acoes(modules)

  const fechar = () => { setAtiva(null); onClose() }

  if (ativa) {
    const Form = ativa.component
    return (
      <BottomSheet open={open} onClose={fechar} title={ativa.label}>
        <button type="button" onClick={() => setAtiva(null)} className="-mt-2 flex items-center gap-1 text-xs text-gray-400 min-h-[44px]">
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
              className="flex flex-col items-start gap-3 p-4 min-h-[96px] rounded-2xl bg-gray-800/70 border border-gray-700/60 active:bg-gray-800 text-left"
            >
              <span className="w-10 h-10 rounded-full flex items-center justify-center bg-[#0E6B4E]/20 text-emerald-400">
                {Icon && <Icon size={20} />}
              </span>
              <span className="text-sm font-semibold text-gray-100">{m.label}</span>
            </button>
          )
        })}
      </div>

      {(outras.length > 0 || acaoDaTela) && (
        <ul className="divide-y divide-gray-800 rounded-xl border border-gray-800 overflow-hidden">
          {acaoDaTela && (
            <li>
              <button type="button" onClick={() => { fechar(); acaoDaTela() }} className="w-full flex items-center gap-3 px-4 min-h-[52px] text-left text-sm text-gray-200">
                <Sparkles size={18} className="text-emerald-400" />
                <span className="flex-1">Novo nesta tela</span>
                <ChevronRight size={16} className="text-gray-600" />
              </button>
            </li>
          )}
          {outras.map(m => {
            const Icon = m.icon
            return (
              <li key={m.id}>
                <button type="button" onClick={() => setAtiva(m)} className="w-full flex items-center gap-3 px-4 min-h-[52px] text-left text-sm text-gray-200">
                  {Icon && <Icon size={18} className="text-gray-400" />}
                  <span className="flex-1">{m.label}</span>
                  <ChevronRight size={16} className="text-gray-600" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </BottomSheet>
  )
}
