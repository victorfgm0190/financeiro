// Configurações › Geral › Guias das telas (preferência do usuário logado, no banco — vale em todos
// os aparelhos):
//   • interruptor geral "Guias do sistema: Ligados / Desligados" — desligado, nenhum tour abre sozinho,
//     o "?" some dos cabeçalhos, o checklist some e as boas-vindas não abrem sozinhas; religar devolve
//     tudo como estava (as marcações de cada tela ficam guardadas);
//   • "Reativar todos" / "Desativar todos" e a lista de telas com o estado de cada uma.
import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { AJUDA_TELAS, TELAS_COM_GUIA } from '../../lib/ajudaTelas'
import { carregarBoasVindas, definirGuiasLigados, ocultarGuia, ocultarTodosGuias, reativarGuia, reativarTodosGuias } from '../../lib/boasVindasApi'
import { useEstadoBoasVindas } from './useGuiaTela'

// Nome da tela na lista: subtela vira "Tela › Subtela".
const nomeDaTela = (id) => {
  const t = AJUDA_TELAS[id]
  if (!id.includes(':')) return t.titulo
  const pai = AJUDA_TELAS[id.split(':')[0]]
  return pai ? `${pai.titulo} › ${t.titulo}` : t.titulo
}

export default function GuiasTelasPanel() {
  const estado = useEstadoBoasVindas()
  const [aviso, setAviso] = useState(null)
  useEffect(() => { carregarBoasVindas() }, [])
  const ocultas = new Set(estado?.guiasOcultos || [])
  const ligados = estado ? estado.guiasLigados !== false : true
  const executar = async (fn, ok) => {
    setAviso(null)
    setAviso((await fn()) ? ok : 'Não foi possível gravar agora. Verifique a conexão e tente de novo.')
  }
  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-texto-1">Guias das telas</h2>
        <p className="text-xs text-texto-2 mt-1">
          Na primeira vez que você entra numa tela, um tour mostra para que serve cada botão. O "?" ao lado do título refaz o tour quando quiser.
        </p>
      </div>

      <label className="flex items-center gap-3 cursor-pointer" data-guia="settings:guias.interruptor">
        <span className="relative shrink-0">
          <input type="checkbox" role="switch" className="sr-only peer" checked={ligados} disabled={!estado}
            aria-label="Guias do sistema"
            onChange={e => executar(() => definirGuiasLigados(e.target.checked), e.target.checked ? 'Guias ligados.' : 'Guias desligados. Você pode religar aqui quando quiser.')} />
          <span className="block w-11 h-6 bg-borda-campo rounded-full peer-checked:bg-primary transition-colors" />
          <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
        </span>
        <span className="text-sm text-texto-1">Guias do sistema: <strong>{ligados ? 'Ligados' : 'Desligados'}</strong></span>
      </label>
      {!ligados && (
        <p className="text-xs text-texto-2">Desligados: nenhum tour abre sozinho e o "?" não aparece nas telas. As escolhas de cada tela ficam guardadas para quando religar.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" data-guia="settings:guias.reativar" className="btn-secondary flex items-center gap-1.5 min-h-[44px]" disabled={!estado}
          onClick={() => executar(reativarTodosGuias, 'Pronto: o tour volta a abrir sozinho em todas as telas.')}>
          <Eye size={15} /> Reativar todos os guias
        </button>
        <button type="button" data-guia="settings:guias.desativar" className="btn-secondary flex items-center gap-1.5 min-h-[44px]" disabled={!estado}
          onClick={() => executar(() => ocultarTodosGuias(TELAS_COM_GUIA), 'Pronto: nenhum tour abre sozinho. O "?" continua funcionando.')}>
          <EyeOff size={15} /> Desativar todos os guias
        </button>
      </div>
      {aviso && <p className="text-xs text-texto-2" role="status">{aviso}</p>}

      <div data-guia="settings:guias.lista">
        <h3 className="text-xs font-semibold text-texto-2 uppercase tracking-wide mb-1">
          Telas ({TELAS_COM_GUIA.length - ocultas.size} de {TELAS_COM_GUIA.length} mostram o tour sozinhas)
        </h3>
        <ul className="divide-y divide-borda border border-borda rounded-xl max-h-96 overflow-y-auto">
          {TELAS_COM_GUIA.map(id => {
            const oculta = ocultas.has(id)
            return (
              <li key={id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="flex-1 min-w-0 text-texto-1 break-words">{nomeDaTela(id)}</span>
                <span className={`text-xs shrink-0 ${oculta ? 'text-texto-2' : 'text-primary-fg'}`}>{oculta ? 'Não mostra mais' : 'Mostra sozinho'}</span>
                <button type="button" className="btn-secondary text-xs py-1 shrink-0 min-w-[6.5rem]" disabled={!estado}
                  aria-label={`${oculta ? 'Mostrar' : 'Não mostrar'} o tour de ${nomeDaTela(id)}`}
                  onClick={() => (oculta ? reativarGuia(id) : ocultarGuia(id))}>
                  {oculta ? 'Mostrar' : 'Não mostrar'}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
