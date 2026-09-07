import { ChevronLeft, ChevronRight, CheckCircle2, Clock, AlertTriangle, Loader2, Settings2, Building2, Split } from 'lucide-react'
import { fmt } from '../shared/utils'
import { fmtData, statusParcela, ESTILO_STATUS, textoFavorecido } from './bemUtils'

const ICONE = {
  paga: CheckCircle2,
  parcial: Clock,
  vencida: AlertTriangle,
  aberta: Clock,
}

function ParcelaCard({ parcela, numParcelas, onPagar }) {
  const status = statusParcela(parcela)
  const estilo = ESTILO_STATUS[status]
  const Icone = ICONE[status]
  const podePagar = parcela.status !== 'paid'
  // Fallback derivado para a parcela gravada antes da coluna existir (o backend faz o mesmo em
  // serializarParcela — repetido aqui porque a lista também vem de respostas antigas em cache).
  const saldo = parcela.saldo_restante != null
    ? parcela.saldo_restante
    : Math.max(0, (parcela.total_provisioned || 0) - (parcela.total_pago || 0))

  return (
    <div className={`rounded-xl border p-3 ${estilo.borda} ${estilo.fundo}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-200">
          Parcela {parcela.numero}/{numParcelas}
        </p>
        <span className={`text-xs font-semibold flex items-center gap-1 ${estilo.texto}`}>
          <Icone size={12} /> {estilo.label}
        </span>
      </div>

      <p className="text-xs text-gray-500 mt-1">Vence: {fmtData(parcela.data_vencimento)}</p>

      <div className="grid grid-cols-4 gap-2 mt-2.5 text-xs">
        <div>
          <p className="text-gray-600">Principal</p>
          <p className="text-gray-300">{fmt(parcela.principal_provisioned)}</p>
        </div>
        <div>
          <p className="text-gray-600">Juros</p>
          <p className="text-gray-300">{fmt(parcela.juros_provisioned)}</p>
        </div>
        <div>
          <p className="text-gray-600">Total</p>
          <p className="text-gray-200 font-medium">{fmt(parcela.total_provisioned)}</p>
        </div>
        <div>
          <p className="text-gray-600">Saldo Restante</p>
          {/* Zerado = quitada; num pagamento parcial é o que ainda falta daquela parcela. */}
          <p className={saldo > 0 ? 'text-amber-400 font-medium' : 'text-teal-400 font-medium'}>
            {fmt(saldo)}
          </p>
        </div>
      </div>

      {parcela.total_pago > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-800/80 text-xs space-y-0.5">
          <div className="flex justify-between">
            <span className="text-gray-600">Pago</span>
            <span className="text-gray-300">
              {fmt(parcela.total_pago)}
              {parcela.data_pagamento && ` em ${fmtData(parcela.data_pagamento)}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Principal / Juros</span>
            <span className="text-gray-400">
              {fmt(parcela.principal_pago)} / {fmt(parcela.juros_pago)}
            </span>
          </div>
          {parcela.desvio_juros > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Juros em falta</span>
              <span className="text-amber-400">{fmt(parcela.desvio_juros)}</span>
            </div>
          )}
        </div>
      )}

      {podePagar && (
        <button
          className="btn-primary w-full mt-3 text-xs py-1.5"
          onClick={() => onPagar(parcela)}
        >
          Pagar
        </button>
      )}
    </div>
  )
}

export default function BemParcelasTab({
  financiamento, parcelas, page, totalPages, totalParcelas, loading, onPage, onPagar,
  onEditarFavorecido, onSepararJuros,
}) {
  if (!financiamento) {
    return (
      <div className="card text-center py-10">
        <p className="text-sm text-gray-500">Este bem ainda não tem financiamento.</p>
        <p className="text-xs text-gray-600 mt-1">Crie o financiamento na aba Informações.</p>
      </div>
    )
  }

  // O resumo vem do financiamento inteiro (todas as parcelas), não só da página exibida.
  const pagas = financiamento.parcelas?.filter(p => p.status === 'paid').length ?? 0
  const total = financiamento.num_parcelas || totalParcelas || 0
  const pct = total > 0 ? (pagas / total) * 100 : 0

  // O texto (`banco`) e não o nome da conta: é ele que o backend gravou no `payee` das N
  // parcelas, então é ele que esta tela tem que anunciar. A conta vinculada aparece embaixo
  // quando difere — as duas informações existem, e escondê-las uma atrás da outra já produziu
  // uma aba dizendo "Safra" com as parcelas em "BANCO SAFRA".
  const favorecido = textoFavorecido(financiamento)
  const contaVinculada = financiamento.banco_favorecido_nome

  return (
    <div className="space-y-4">
      <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-600">Favorecido das parcelas</p>
          <p className="text-sm text-gray-200 flex items-center gap-1.5 mt-0.5 truncate">
            <Building2 size={13} className="text-gray-500 shrink-0" />
            {favorecido || <span className="text-gray-500">Nenhum favorecido definido</span>}
          </p>
          {contaVinculada && contaVinculada !== favorecido && (
            <p className="text-xs text-gray-600 mt-0.5 truncate">Conta vinculada: {contaVinculada}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
            onClick={onEditarFavorecido}
          >
            <Settings2 size={13} /> Editar Favorecido
          </button>
          {/* Só faz sentido para financiamento provisionado ANTES da separação existir. O modal
              consulta o backend e avisa quando não há nada a separar. */}
          <button
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
            onClick={onSepararJuros}
            title="Separa os agendamentos antigos em duas linhas: principal e juros"
          >
            <Split size={13} /> Separar Juros
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-300 font-medium">
            {pagas}/{total} parcelas pagas
          </span>
          <span className="text-sm text-teal-400 font-semibold">{pct.toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-2 bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
          <div>
            <p className="text-gray-600">Pago</p>
            <p className="text-gray-200">{fmt(financiamento.realizado?.total)}</p>
          </div>
          <div>
            <p className="text-gray-600">Saldo Restante</p>
            <p className="text-gray-200">
              {fmt(financiamento.analise?.saldo_restante ?? financiamento.analise?.total_restante)}
            </p>
          </div>
          <div>
            <p className="text-gray-600">Valor Total</p>
            <p className="text-gray-200">{fmt(financiamento.valor_total)}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-500 gap-2 text-sm">
          <Loader2 size={16} className="animate-spin" /> Carregando parcelas...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {parcelas.map(p => (
            <ParcelaCard key={p.id} parcela={p} numParcelas={total} onPagar={onPagar} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1 disabled:opacity-40"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1 || loading}
          >
            <ChevronLeft size={13} /> Anterior
          </button>
          <span className="text-xs text-gray-500">Página {page} de {totalPages}</span>
          <button
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1 disabled:opacity-40"
            onClick={() => onPage(page + 1)}
            disabled={page >= totalPages || loading}
          >
            Próximo <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
