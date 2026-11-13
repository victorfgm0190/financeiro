import { useApp } from '../../context/AppContext'
import { statusSugestoesImportacao } from '../../lib/sugestoesImportacaoApi'
import { useStatusSugestoesIa, ESPERAS_STATUS_MS } from '../../hooks/useStatusSugestoesIa'
import HelpCampo from '../shared/HelpCampo'

// Configurações › Geral › "Sugestões do Assistente na importação" (Etapa 6c). Recurso CONTRATADO:
// só aparece quando o administrador da plataforma liberou para este cliente (ambientes.modulos no
// central, conferido no servidor). Sem liberação, nada aparece — nem desabilitado.
export const TEXTO_SUGESTOES_IA = 'A descrição, o valor e a data das compras da fatura são enviados ao serviço de IA (Anthropic) só para gerar a sugestão. A descrição do banco pode conter o nome da loja ou de uma pessoa (ex.: Pix). Não enviamos conta, cartão, CPF/CNPJ nem saldo. Nada é gravado sem você confirmar.'

export default function SugestoesAssistenteOpcao({ somenteLeitura = false, carregarStatus = statusSugestoesImportacao, esperasMs = ESPERAS_STATUS_MS }) {
  const { settings, updateSettings } = useApp()
  const { liberado } = useStatusSugestoesIa(carregarStatus, esperasMs)
  if (!liberado) return null
  return (
    <label data-testid="opcao-sugestoes-ia" data-help-id="importarFatura.sugestoesIa" className="flex items-start gap-2.5 cursor-pointer mt-4 pt-4 border-t border-borda">
      <div className="relative shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={settings?.iaSugestoesImportacao === true}
          disabled={somenteLeitura}
          onChange={e => updateSettings({ iaSugestoesImportacao: e.target.checked })}
          className="sr-only peer"
          aria-label="Sugestões do Assistente na importação"
        />
        <div className="w-9 h-5 bg-borda-campo rounded-full peer-checked:bg-primary transition-colors" />
        <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
      </div>
      <span className="text-sm text-texto-2 select-none">
        Sugestões do Assistente na importação<HelpCampo campo="importarFatura.sugestoesIa" />
        <span className="block text-xs text-texto-3">Na Importar Fatura, o Assistente sugere a resposta de “É este?” e a categoria, o grupo e o favorecido das compras novas que as suas regras não classificaram. Você aceita ou ignora cada uma.</span>
        <span className="block text-xs text-texto-3 mt-1">{TEXTO_SUGESTOES_IA}</span>
      </span>
    </label>
  )
}
