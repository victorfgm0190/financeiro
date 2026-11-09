import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { opcoesTipoDocumento, naturezaDoMovimento } from '../../lib/tiposDocumento'
import HelpCampo from './HelpCampo'

// Select "Tipo de documento" dos formulários de agendamento e lançamento. Filtra pela natureza
// (despesa → pagar/ambos; receita → receber/ambos; transferência → todos). O valor já gravado
// aparece sempre, mesmo inativo. Vazio = "Sem tipo" (permitido na edição).
// `confira`: selo da prévia do Assistente (campo preenchido pelo pedido). `help`: ⓘ do help de campo.
export default function TipoDocumentoSelect({ value, onChange, tipoMov, required = false, erro = '', label = 'Tipo de documento', confira = false, help = null }) {
  const { tiposDocumento } = useApp()
  const opcoes = useMemo(
    () => opcoesTipoDocumento(tiposDocumento, naturezaDoMovimento(tipoMov), value || null),
    [tiposDocumento, tipoMov, value],
  )
  return (
    <div data-help-id={help || undefined}>
      <label className="label">
        {label}{required ? ' *' : ''}{help && <HelpCampo campo={help} />}
        {confira && <span className="ml-1.5 text-[11px] font-medium text-aviso" title="Sugestão do assistente: confira">● confira</span>}
      </label>
      <select
        className={`input ${erro ? 'border-perigo' : ''}`}
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
      >
        <option value="">{required ? '— Selecione —' : 'Sem tipo'}</option>
        {opcoes.map(t => (
          <option key={t.id} value={t.id}>
            {t.sigla} — {t.nome}{t.ativo === false ? ' (inativo)' : ''}
          </option>
        ))}
      </select>
      {erro && <p className="text-[11px] text-perigo mt-1">{erro}</p>}
    </div>
  )
}
