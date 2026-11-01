// Configurações › Geral › Guias das telas: reativar ou desativar de uma vez o guia que abre sozinho
// em cada tela. Preferência do usuário logado, gravada no banco (vale em todos os aparelhos).
import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { TELAS_COM_GUIA } from '../../lib/ajudaTelas'
import { carregarBoasVindas, ocultarTodosGuias, reativarTodosGuias } from '../../lib/boasVindasApi'
import { useEstadoBoasVindas, limparEscondidos } from './useGuiaTela'

export default function GuiasTelasPanel() {
  const estado = useEstadoBoasVindas()
  const [aviso, setAviso] = useState(null)
  useEffect(() => { carregarBoasVindas() }, [])
  const ocultos = estado?.guiasOcultos?.length || 0
  const executar = async (fn, ok) => {
    setAviso(null)
    setAviso((await fn()) ? ok : 'Não foi possível gravar agora. Verifique a conexão e tente de novo.')
  }
  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-texto-1">Guias das telas</h2>
        <p className="text-xs text-texto-2 mt-1">
          Ao entrar numa tela, o guia dela abre sozinho e mostra para que serve cada botão. O "?" ao lado do título abre o guia a qualquer momento.
        </p>
      </div>
      <p className="text-sm text-texto-1" aria-live="polite">
        {!estado ? 'Carregando…' : ocultos === 0 ? 'Todos os guias estão ativos.' : `${ocultos} de ${TELAS_COM_GUIA.length} telas não abrem o guia sozinhas.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" data-guia="settings:guias.reativar" className="btn-secondary flex items-center gap-1.5 min-h-[44px]" disabled={!estado}
          onClick={() => { limparEscondidos(); executar(reativarTodosGuias, 'Pronto: os guias voltam a abrir sozinhos em todas as telas.') }}>
          <Eye size={15} /> Reativar todos os guias
        </button>
        <button type="button" data-guia="settings:guias.desativar" className="btn-secondary flex items-center gap-1.5 min-h-[44px]" disabled={!estado}
          onClick={() => executar(() => ocultarTodosGuias(TELAS_COM_GUIA), 'Pronto: nenhum guia abre sozinho. O "?" continua funcionando.')}>
          <EyeOff size={15} /> Desativar todos os guias
        </button>
      </div>
      {aviso && <p className="text-xs text-texto-2" role="status">{aviso}</p>}
    </div>
  )
}
