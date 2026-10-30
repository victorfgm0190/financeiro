import { Globe, Loader2 } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'

const pct = (f) => `${(f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
const ORIGEM_SPREAD = { historico: (n) => `média das últimas ${n} compras em dólar do cartão`, cartao: () => 'padrão do cartão', padrao: () => 'padrão' }

// Prévia do Assistente: compra em dólar → cotação, spread, valor ESTIMADO em R$ e o IOF
// (src/lib/cambio.js). Sem categoria de IOF conhecida (e IOF em linha separada) → pergunta aqui.
export default function CompraEmDolar({ valorOriginal, cambio, carregando, categories, catIof, onCatIof }) {
  const usd = `US$ ${Number(valorOriginal).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (carregando || !cambio) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-borda bg-surface-2 px-3 py-2 text-xs text-texto-2">
        <Loader2 size={14} className="animate-spin shrink-0" /> Compra em dólar ({usd}): buscando a cotação PTAX no Banco Central…
      </div>
    )
  }
  const despesas = (categories || []).filter(c => c.type !== 'income')
  return (
    <div className="rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2 text-xs text-texto-1 space-y-1">
      <p className="flex items-center gap-1.5 font-medium">
        <Globe size={14} className="shrink-0 text-aviso" /> Compra em dólar
        <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-aviso/20 text-aviso">estimado</span>
      </p>
      {cambio.cotacao ? (
        <p className="break-words">
          {usd} × PTAX {cambio.cotacao.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
          {cambio.dataCotacao ? ` (${fmtDate(cambio.dataCotacao)})` : ''} + spread {pct(cambio.spread)} ({ORIGEM_SPREAD[cambio.origem](cambio.n)})
          {cambio.separada ? ' = ' : ' + IOF ' + pct(cambio.aliquota) + ' = '}
          <strong>{fmt(cambio.valorCompra)}</strong>. O valor certo vem na fatura: a importação ajusta.
        </p>
      ) : (
        <p className="text-aviso break-words">Não consegui a cotação do dólar{cambio.erro ? ` (${cambio.erro})` : ''}. Digite o valor em R$ abaixo.</p>
      )}
      {cambio.separada && (
        <p>
          IOF {pct(cambio.aliquota)}{cambio.iof ? `: ${fmt(cambio.iof)}` : ''} em lançamento separado (estimado), no mesmo cartão e data — recalculado sobre o valor em R$ que for salvo.
        </p>
      )}
      {cambio.separada && (
        <label className="flex flex-wrap items-center gap-2">
          <span className={catIof ? 'text-texto-2' : 'text-aviso'}>Categoria do IOF{catIof ? '' : ' (escolha)'}:</span>
          <select className="input !py-1 !text-xs flex-1 min-w-[10rem]" value={catIof} onChange={e => onCatIof(e.target.value)}>
            <option value="">Sem categoria</option>
            {despesas.map(c => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}
