import { fmt } from './utils'
import { situacaoRateio, COR_SITUACAO_RATEIO } from '../../lib/rateio'

// Campo Categoria com rateio (lançamento e agendamento): "Rateado (2) · ✓ Total: R$ 250,00" quando
// fecha; "Rateado (1) · faltam R$ 50,00" / "passa R$ 10,00" até completar. Sem valor no lançamento,
// só a soma das linhas (como antes).
export default function ResumoRateio({ linhas = [], categories = [], total = 0, extra = '' }) {
  const soma = linhas.reduce((s, r) => s + (Number(r.valor) || 0), 0)
  const sit = Number(total) > 0 ? situacaoRateio(total, soma) : null
  const texto = !sit || sit.estado === 'ok'
    ? `${sit ? '✓ ' : ''}Total: ${fmt(sit ? total : soma)}`
    : sit.estado === 'falta' ? `faltam ${fmt(sit.diferenca)}` : `passa ${fmt(sit.diferenca)}`
  return (
    <div className="input flex-1 flex items-center justify-between gap-2 text-xs text-texto-2" data-testid="resumo-rateio">
      <span className="min-w-0" title={linhas.map(r => `${categories.find(c => c.id === r.categoriaId)?.name || '?'}: ${fmt(r.valor)}`).join('\n')}>
        Rateado ({linhas.length}){extra}
      </span>
      <span className={`shrink-0 ${sit ? `font-medium ${COR_SITUACAO_RATEIO[sit.estado]}` : 'text-texto-3'}`}>{texto}</span>
    </div>
  )
}
