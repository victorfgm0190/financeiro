import { Package, RotateCcw, Loader2, AlertTriangle } from 'lucide-react'
import { fmt } from '../shared/utils'
import { fmtData } from './bemUtils'

// Painel de topo do BemDetail: mostra a entrada à vista já registrada (transferências
// vinculadas + trade-in) e oferece o estorno.
//
// Ele existe porque a aba Histórico é um extrato cronológico — bom para auditar, ruim para
// responder "o que essa entrada fez com meus saldos?". Aqui a mesma informação aparece
// consolidada e ao lado do botão que a desfaz.

function Linha({ label, children, cor }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={cor || 'text-gray-300'}>{children}</span>
    </div>
  )
}

export default function TradeInResumo({ movimentacoes, saldoBem, contas = [], onEstornar, estornando }) {
  const entradas = (movimentacoes || []).filter(
    m => m.tipo === 'entrada_venda' || m.tipo === 'entrada_trade_in',
  )
  if (entradas.length === 0) return null

  const transferencias = entradas.filter(m => m.tipo === 'entrada_venda')
  const tradeIns = entradas.filter(m => m.tipo === 'entrada_trade_in')

  const totalTransferencias = transferencias.reduce((s, m) => s + (Number(m.valor) || 0), 0)
  const totalTradeIn = tradeIns.reduce((s, m) => s + (Number(m.valor_entrada) || 0), 0)
  const perdaGanho = tradeIns.reduce((s, m) => s + (Number(m.perda_ganho) || 0), 0)

  // A data da entrada é a da movimentação mais recente — todas nascem no mesmo POST.
  const data = entradas.map(m => m.data).sort().at(-1)
  const saldoAtualDe = (id) => contas.find(c => c.id === id)?.balance

  return (
    <div className="card border border-teal-500/20 bg-teal-500/[0.03] space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package size={15} className="text-teal-400" />
          <div>
            <h3 className="text-sm font-semibold text-teal-300">Entrada registrada</h3>
            <p className="text-xs text-gray-600">{fmtData(data)}</p>
          </div>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 shrink-0">
          ATIVA
        </span>
      </div>

      {transferencias.length > 0 && (
        <div className="rounded-lg border border-gray-800 p-2.5 space-y-1">
          <p className="text-[11px] font-semibold text-blue-400 mb-1.5">
            Transferências vinculadas ({transferencias.length})
          </p>
          {transferencias.map(m => (
            <Linha key={m.movimentacao_id} label={m.descricao || 'Entrada à vista'}>
              {fmt(m.valor)}
            </Linha>
          ))}
          <div className="pt-1.5 mt-1.5 border-t border-gray-800">
            <Linha label="Total" cor="text-blue-400 font-semibold">{fmt(totalTransferencias)}</Linha>
          </div>
        </div>
      )}

      {tradeIns.map(m => {
        const saldoAgora = saldoAtualDe(m.bem_origem_id)
        return (
          <div key={m.movimentacao_id} className="rounded-lg border border-gray-800 p-2.5 space-y-1">
            <p className="text-[11px] font-semibold text-amber-400 mb-1.5">Bem dado na troca</p>
            <Linha label="Bem">{m.bem_origem || '—'}</Linha>
            {m.saldo_origem_anterior != null && (
              <Linha label="Valia antes">{fmt(m.saldo_origem_anterior)}</Linha>
            )}
            <Linha label="Valor da troca">{fmt(m.valor_entrada)}</Linha>
            {saldoAgora != null && <Linha label="Saldo agora">{fmt(saldoAgora)}</Linha>}
            {m.perda_ganho != null && m.perda_ganho !== 0 && (
              <Linha
                label={m.perda_ganho >= 0 ? 'Ganho de capital' : 'Perda de capital'}
                cor={m.perda_ganho >= 0 ? 'text-receita font-semibold' : 'text-despesa font-semibold'}
              >
                {fmt(m.perda_ganho)}
              </Linha>
            )}
            {m.categoria && <Linha label="Categoria">{m.categoria}</Linha>}
            {m.saldo_origem_anterior == null && (
              <p className="text-[11px] text-amber-400/80 flex items-start gap-1.5 pt-1">
                <AlertTriangle size={12} className="shrink-0 mt-px" />
                Esta entrada é anterior ao registro do saldo original. No estorno o saldo do bem
                volta pela nota fiscal — confira o valor depois.
              </p>
            )}
          </div>
        )
      })}

      <div className="rounded-lg bg-gray-800/60 p-2.5 space-y-1">
        <Linha label="Total da entrada" cor="text-teal-400 font-semibold text-sm">
          {fmt(totalTransferencias + totalTradeIn)}
        </Linha>
        <Linha label="Saldo atual do bem">{fmt(saldoBem)}</Linha>
        {perdaGanho !== 0 && (
          <Linha
            label={perdaGanho >= 0 ? 'Ganho lançado' : 'Perda lançada'}
            cor={perdaGanho >= 0 ? 'text-receita' : 'text-despesa'}
          >
            {fmt(perdaGanho)}
          </Linha>
        )}
      </div>

      <button
        type="button"
        onClick={onEstornar}
        disabled={estornando}
        className="btn-danger w-full text-xs py-2 flex items-center justify-center gap-2"
      >
        {estornando ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
        {estornando ? 'Estornando...' : 'Estornar entrada'}
      </button>
      <p className="text-[11px] text-gray-600 text-center">
        Desfaz o trade-in e desvincula as transferências. As transferências em si continuam no
        Extrato.
      </p>
    </div>
  )
}
