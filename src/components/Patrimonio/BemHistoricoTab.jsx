import { ArrowDownLeft, CreditCard, Repeat, Loader2 } from 'lucide-react'
import { fmt } from '../shared/utils'
import { fmtData } from './bemUtils'

const TIPOS = {
  entrada_trade_in: { rotulo: 'Entrada (Trade-in)', icone: Repeat, cor: 'text-receita', pino: 'bg-emerald-500' },
  entrada_venda: { rotulo: 'Entrada à Vista', icone: ArrowDownLeft, cor: 'text-blue-400', pino: 'bg-blue-500' },
  pagamento_parcela: { rotulo: 'Pagamento de Parcela', icone: CreditCard, cor: 'text-orange-400', pino: 'bg-orange-500' },
}

function Campo({ label, children, cor }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-gray-600">{label}</span>
      <span className={cor || 'text-gray-300'}>{children}</span>
    </div>
  )
}

function Item({ mov, ultimo }) {
  const meta = TIPOS[mov.tipo] || { rotulo: mov.tipo, icone: ArrowDownLeft, cor: 'text-gray-400', pino: 'bg-gray-600' }
  const Icone = meta.icone

  return (
    <div className="relative pl-8 pb-4">
      {!ultimo && <div className="absolute left-[11px] top-6 bottom-0 w-px bg-gray-800" />}
      <div className={`absolute left-0 top-1 w-[23px] h-[23px] rounded-full flex items-center justify-center ${meta.pino}/15`}>
        <Icone size={12} className={meta.cor} />
      </div>

      <div className="card py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs font-semibold ${meta.cor}`}>{meta.rotulo}</span>
          <span className="text-xs text-gray-600">{fmtData(mov.data)}</span>
        </div>
        <p className="text-sm text-gray-200 mt-0.5">{mov.descricao}</p>

        <div className="mt-2 space-y-1">
          {mov.tipo === 'entrada_trade_in' && (
            <>
              {mov.bem_origem && <Campo label="Bem antigo">{mov.bem_origem}</Campo>}
              <Campo label="Valor de entrada">{fmt(mov.valor_entrada)}</Campo>
              {mov.perda_ganho != null && (
                <Campo label={mov.perda_ganho >= 0 ? 'Ganho' : 'Perda'} cor={mov.perda_ganho >= 0 ? 'text-receita' : 'text-despesa'}>
                  {fmt(mov.perda_ganho)}
                </Campo>
              )}
              {mov.categoria && <Campo label="Categoria">{mov.categoria}</Campo>}
            </>
          )}

          {mov.tipo === 'pagamento_parcela' && (
            <>
              {mov.numero_parcela != null && (
                <Campo label="Parcela">{mov.numero_parcela}/{mov.num_parcelas}</Campo>
              )}
              <Campo label="Principal">{fmt(mov.principal)}</Campo>
              <Campo label="Juros">{fmt(mov.juros)}</Campo>
              <Campo label="Total">{fmt(mov.total)}</Campo>
              {mov.categoria_principal && <Campo label="Cat. principal">{mov.categoria_principal}</Campo>}
              {mov.categoria_juros && <Campo label="Cat. juros">{mov.categoria_juros}</Campo>}
            </>
          )}

          {mov.tipo === 'entrada_venda' && (
            <>
              <Campo label="Valor">{fmt(mov.valor)}</Campo>
              {mov.categoria && <Campo label="Categoria">{mov.categoria}</Campo>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function BemHistoricoTab({ movimentacoes, loading, erro }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-500 gap-2 text-sm">
        <Loader2 size={16} className="animate-spin" /> Carregando histórico...
      </div>
    )
  }
  if (erro) {
    return <div className="card text-sm text-despesa">{erro}</div>
  }
  if (!movimentacoes?.length) {
    return (
      <div className="card text-center py-10">
        <p className="text-sm text-gray-500">Nenhuma movimentação registrada.</p>
        <p className="text-xs text-gray-600 mt-1">
          Entradas, trade-ins e pagamentos de parcela aparecem aqui.
        </p>
      </div>
    )
  }

  // Mais recente primeiro; o backend devolve em ordem cronológica crescente.
  const ordenadas = [...movimentacoes].sort((a, b) => String(b.data).localeCompare(String(a.data)))

  return (
    <div>
      {ordenadas.map((m, i) => (
        <Item key={m.movimentacao_id || i} mov={m} ultimo={i === ordenadas.length - 1} />
      ))}
    </div>
  )
}
