import { useState } from 'react'
import { ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { usePatrimonioTotals } from '../../hooks/usePatrimonioTotals'
import { fmt, fmtSinal } from '../shared/utils'
import Modal from '../shared/Modal'

// De onde vem cada número do Patrimônio. Lê os MESMOS totals/itens dos cards (usePatrimonioTotals)
// e, no cartão, as faturas que o creditUsage já calculou — nada é recalculado aqui, por isso o
// rodapé sempre bate com o card.
//
// tipo: 'bens' | 'investimentos' | 'contas' | 'dividas' | 'passivos' | 'cartao' | 'pl'
// Navegação fica com quem abre: onAbrirConta(conta), onAbrirBem(conta), onAbrirFatura(cardId, mesAno).

const META = {
  bens:          { titulo: 'Bens e Ativos',          cor: 'text-receita',    chaves: ['bens'] },
  investimentos: { titulo: 'Investimentos',          cor: 'text-receita',    chaves: ['investimentos'] },
  contas:        { titulo: 'Contas Financeiras',     cor: 'text-receita',    chaves: ['contas'] },
  dividas:       { titulo: 'Dívidas',                cor: 'text-despesa',    chaves: ['dividas'] },
  passivos:      { titulo: 'Dívidas e Passivos',     cor: 'text-despesa',    chaves: ['dividas', 'emprestimos'] },
  cartao:        { titulo: 'Dívida Cartão de Crédito', cor: 'text-despesa',    chaves: ['cartao'] },
  pl:            { titulo: 'Patrimônio Líquido',     cor: 'text-receita' },
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const rotuloMes = (k) => { const [y, m] = k.split('-'); return `${MESES[Number(m) - 1]}/${y}` }
const statusFatura = (f) => f.isFaturaPaga ? 'Paga' : f.isFaturaParcial ? 'Parcial' : 'Aberta'
const zero = (v) => Math.abs(v) < 0.005

function LinhaItem({ nome, sub, valor, cor, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-surface-hover/40 rounded-lg px-1 -mx-1 transition-colors group"
    >
      <div className="min-w-0 flex items-center gap-1.5">
        {children}
        <div className="min-w-0">
          <p className="text-sm text-texto-1 truncate">{nome}</p>
          {sub && <p className="text-xs text-texto-3 truncate">{sub}</p>}
        </div>
      </div>
      <span className="flex items-center gap-1 shrink-0">
        <span className={`text-sm font-semibold ${cor}`}>{fmt(valor)}</span>
        <ChevronRight size={13} className="text-texto-3 group-hover:text-texto-2" />
      </span>
    </button>
  )
}

function ListaCartoes({ itens, onAbrirFatura }) {
  const { creditUsageByCard } = useApp()
  const [aberto, setAberto] = useState(null)
  return itens.map(({ conta, valor }) => {
    const faturas = (creditUsageByCard[conta.id]?.faturas || []).filter(f => !zero(f.emAberto))
    const expandido = aberto === conta.id
    return (
      <div key={conta.id} className="border-b border-borda/50 last:border-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAberto(expandido ? null : conta.id)}
            className="p-1.5 -ml-1 rounded text-texto-3 hover:text-texto-1 hover:bg-surface-hover"
            title={expandido ? 'Ocultar faturas' : 'Ver faturas em aberto'}
          >
            {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <div className="flex-1 min-w-0">
            <LinhaItem
              nome={conta.apelido || conta.name}
              sub={`${faturas.length} fatura${faturas.length !== 1 ? 's' : ''} em aberto`}
              valor={valor}
              cor="text-despesa"
              onClick={() => onAbrirFatura(conta.id, faturas[0]?.billKey || null)}
            />
          </div>
        </div>
        {expandido && (
          <div className="ml-7 mb-2 space-y-0.5">
            {faturas.map(f => (
              <button
                key={f.billKey}
                type="button"
                onClick={() => onAbrirFatura(conta.id, f.billKey)}
                className="w-full text-left rounded-lg px-2 py-1.5 bg-surface-2/40 hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-texto-1">
                    {rotuloMes(f.billKey)}
                    <span className={`ml-2 text-[11px] ${f.isFaturaParcial ? 'text-aviso' : 'text-texto-3'}`}>{statusFatura(f)}</span>
                  </span>
                  <span className="text-xs font-semibold text-despesa">{fmt(f.emAberto)}</span>
                </div>
                <p className="text-[11px] text-texto-3">total {fmt(f.billTotal)} · pago {fmt(f.totalPago)}</p>
              </button>
            ))}
            {faturas.length === 0 && <p className="text-xs text-texto-3 px-2 py-1">Nenhuma fatura em aberto.</p>}
          </div>
        )}
      </div>
    )
  })
}

function Formula({ totals, onDetalhar }) {
  const linhas = [
    { tipo: 'bens', sinal: '+', label: 'Bens', valor: totals.bens },
    { tipo: 'investimentos', sinal: '+', label: 'Investimentos', valor: totals.investimentos },
    { tipo: 'contas', sinal: '+', label: 'Contas', valor: totals.contas },
    { tipo: 'dividas', sinal: '−', label: 'Dívidas', valor: totals.dividas },
    // Empréstimos só aparecem quando existem — a fórmula pedida é Bens + Invest. + Contas − Dívidas − Cartão.
    ...(zero(totals.emprestimos) ? [] : [{ tipo: 'passivos', sinal: '−', label: 'Empréstimos', valor: totals.emprestimos }]),
    { tipo: 'cartao', sinal: '−', label: 'Cartão', valor: totals.cartao },
  ]
  return (
    <div>
      {linhas.map(l => (
        <LinhaItem
          key={l.label}
          nome={`(${l.sinal}) ${l.label}`}
          valor={l.valor}
          cor={META[l.tipo].cor}
          onClick={() => onDetalhar(l.tipo)}
        />
      ))}
    </div>
  )
}

export default function ComposicaoPatrimonioModal({ tipo: tipoInicial, onClose, onAbrirConta, onAbrirBem, onAbrirFatura }) {
  const { totals } = usePatrimonioTotals()
  const { accountGroups } = useApp()
  // Pilha simples: do PL dá para descer numa categoria e voltar.
  const [tipo, setTipo] = useState(tipoInicial)
  if (!tipo) return null
  const meta = META[tipo]

  let corpo, total
  if (tipo === 'pl') {
    total = totals.pl
    corpo = <Formula totals={totals} onDetalhar={setTipo} />
  } else {
    const itens = meta.chaves
      .flatMap(k => totals.itens[k])
      .filter(i => !zero(i.valor))
      .sort((a, b) => b.valor - a.valor)
    total = meta.chaves.reduce((s, k) => s + totals[k], 0)
    if (tipo === 'cartao') {
      corpo = <ListaCartoes itens={itens} onAbrirFatura={onAbrirFatura} />
    } else {
      corpo = itens.map(({ conta, valor }) => {
        const grupo = accountGroups?.find(g => g.id === conta.accountGroupId)
        return (
          <div key={conta.id} className="border-b border-borda/50 last:border-0">
            <LinhaItem
              nome={conta.apelido || conta.name}
              sub={[conta.bank, grupo?.name].filter(Boolean).join(' · ')}
              valor={valor}
              cor={meta.cor}
              onClick={() => (tipo === 'bens' ? onAbrirBem(conta) : onAbrirConta(conta))}
            />
          </div>
        )
      })
    }
    if (itens.length === 0) corpo = <p className="text-xs text-texto-3 text-center py-6">Nenhum item com valor.</p>
  }

  return (
    <Modal open onClose={onClose} title={meta.titulo} size="md">
      <div className="space-y-3">
        {tipo !== tipoInicial && (
          <button type="button" onClick={() => setTipo(tipoInicial)} className="flex items-center gap-1 text-xs text-texto-2 hover:text-texto-1">
            <ArrowLeft size={13} /> {META[tipoInicial].titulo}
          </button>
        )}
        <div className="max-h-[60vh] md:max-h-96 overflow-y-auto overscroll-contain">{corpo}</div>
        <div className="flex items-center justify-between pt-2 border-t border-borda">
          <span className="text-xs text-texto-3 uppercase tracking-wide">{tipo === 'pl' ? '= Patrimônio Líquido' : 'Total'}</span>
          <span className={`text-lg font-bold ${tipo === 'pl' && total < 0 ? 'text-despesa' : meta.cor}`}>{fmtSinal(total)}</span>
        </div>
      </div>
    </Modal>
  )
}
