import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShieldCheck, RefreshCw, Loader2, ExternalLink, EyeOff, RotateCcw, CreditCard, FileText, Wrench, Lock, BadgeCheck } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fetchPendenciasIntegridade, varrerIntegridade, mudarStatusPendencia } from '../../lib/db'
import { REGRAS_POR_CODIGO } from '../../lib/integridade/regras'
import { podeAjustar, podeCorrigirSozinho } from '../../lib/integridade/ajustes'
import AjusteIntegridadeModal from './AjusteIntegridadeModal'
import AceitarSaldoModal from './AceitarSaldoModal'
import Modal from '../shared/Modal'
import TransactionForm from '../Transactions/TransactionForm'
import { fmt } from '../shared/utils'

// Chave de handoff lida pelo CreditCardPanel ao montar: abre direto no cartão/fatura da pendência.
export const ABRIR_FATURA_KEY = 'finup:abrirFatura'

const STATUS = [
  { id: 'pendente', label: 'Pendentes' },
  { id: 'ignorada', label: 'Ignoradas' },
  { id: 'resolvida', label: 'Resolvidas' },
]

const LADO_COR = {
  falta: 'bg-aviso/15 text-aviso',
  sobra: 'bg-perigo-bg text-perigo',
  divergência: 'bg-aviso/15 text-aviso',
  fechamento: 'bg-surface-2 text-texto-2',
  configuração: 'bg-surface-hover/60 text-texto-2',
}

// Campos escalares de esperado/encontrado lado a lado; o resto (listas, objetos) no detalhe.
const ehValor = (k) => /valor|soma|saldo|devolucao|diferenca/.test(k)
function linhasComparacao(esperado, encontrado) {
  const chaves = [...new Set([...Object.keys(esperado || {}), ...Object.keys(encontrado || {})])]
  const escalar = (v) => v == null || ['string', 'number', 'boolean'].includes(typeof v)
  return chaves
    .filter(k => escalar(esperado?.[k]) && escalar(encontrado?.[k]))
    .map(k => {
      const f = (v) => v == null ? '—' : (typeof v === 'number' && ehValor(k) ? fmt(v) : String(v))
      return { k, esperado: f(esperado?.[k]), encontrado: f(encontrado?.[k]) }
    })
}

// Gasto projetado (parcela gerada, sem data do cartão) × gasto importado.
const ehProjecao = (p) => p.encontrado?.projecao === true || p.encontrado?.gasto?.projecao === true
const qtdProjecoes = (p) => (p.encontrado?.gastos_sem_etapa_a || []).filter(g => g.projecao).length

// Primeiro id de lançamento que a pendência aponta — a própria origem, ou o gasto citado.
function lancamentoDa(p, txById) {
  if (txById.has(p.origem_id)) return p.origem_id
  const e = p.encontrado || {}
  const candidatos = [e.gasto?.id, e.duplicata?.id, e.parcela?.id, ...(e.ids || []), ...(e.gastos_sem_etapa_a || []).map(g => g.id)]
  return candidatos.find(id => id && txById.has(id)) || null
}

export default function IntegridadePanel({ setActivePage }) {
  const { accounts, transactions, pode } = useApp()
  // Varrer, corrigir, aceitar saldo, ignorar/reabrir pendências = editar em Alertas/Integridade.
  const podeEditarAl = pode('alertas', 'editar')
  const [status, setStatus] = useState('pendente')
  const [pendencias, setPendencias] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [varrendo, setVarrendo] = useState(false)
  const [resumo, setResumo] = useState(null)
  const [erro, setErro] = useState('')
  const [editTx, setEditTx] = useState(null)
  const [ajustar, setAjustar] = useState(null) // { pendencias, todas } no modal de correção
  const [aceitarSaldo, setAceitarSaldo] = useState(null) // pendência GER_SALDO_SUBCONTA no modal de marco

  const accById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])
  const txById = useMemo(() => new Map(transactions.map(t => [t.id, t])), [transactions])

  // Sem setState síncrono aqui: quem troca o filtro já liga o "carregando" (ver trocarStatus).
  const carregar = useCallback(() => fetchPendenciasIntegridade({ status })
    .then(lista => { setPendencias(lista); setErro('') })
    .catch(e => setErro(`Não foi possível carregar as pendências (${e.message}).`))
    .finally(() => setCarregando(false)), [status])
  useEffect(() => {
    let vivo = true
    fetchPendenciasIntegridade({ status })
      .then(lista => { if (vivo) { setPendencias(lista); setErro('') } })
      .catch(e => { if (vivo) setErro(`Não foi possível carregar as pendências (${e.message}).`) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [status])

  const trocarStatus = (s) => {
    if (s === status) return
    setCarregando(true)
    setStatus(s)
  }

  const varrer = async () => {
    setVarrendo(true)
    setErro('')
    try {
      setResumo(await varrerIntegridade())
      await carregar()
    } catch (e) {
      setErro(`Falha na varredura (${e.message}).`)
    } finally {
      setVarrendo(false)
    }
  }

  const mudarStatus = async (p, action) => {
    try {
      await mudarStatusPendencia(p.id, action)
      setPendencias(prev => prev.filter(x => x.id !== p.id))
    } catch (e) {
      setErro(`Não foi possível atualizar a pendência (${e.message}).`)
    }
  }

  const irParaFatura = (p) => {
    const ym = /^(\d{2})\/(\d{4})$/.exec(p.fatura_ref || '')
    try {
      sessionStorage.setItem(ABRIR_FATURA_KEY, JSON.stringify({ cardId: p.conta_id, faturaMesAno: ym ? `${ym[2]}-${ym[1]}` : null }))
    } catch { /* ignore */ }
    setActivePage?.('credit')
  }

  const corrigiveis = useMemo(() => pendencias.filter(podeCorrigirSozinho), [pendencias])

  const porRegra = useMemo(() => {
    const m = new Map()
    for (const p of pendencias) {
      if (!m.has(p.regra)) m.set(p.regra, [])
      m.get(p.regra).push(p)
    }
    return [...m.entries()]
  }, [pendencias])

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-texto-2">Motor de Integridade</h2>
          <p className="text-xs text-texto-3 mt-0.5">
            Compara fatura, etapas A, subcontas Ger. e resgates com as regras. Só detecta — nada é corrigido aqui.
          </p>
          <p className="text-[11px] text-texto-3 mt-0.5 flex items-center gap-1">
            <Lock size={10} /> Faturas fechadas não são avaliadas
          </p>
        </div>
        {podeEditarAl && (
          <button className="btn-primary flex items-center gap-2" onClick={varrer} disabled={varrendo}>
            {varrendo ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {varrendo ? 'Varrendo…' : 'Varrer agora'}
          </button>
        )}
      </div>

      {resumo && (
        <div className="card text-xs text-texto-2">
          Varredura de {resumo.hoje} (faturas desde {resumo.desde || 'o início'}):{' '}
          <span className="text-aviso font-medium">{resumo.novas} nova(s)</span> ·{' '}
          <span className="text-texto-2">{resumo.mantidas} mantida(s)</span> ·{' '}
          <span className="text-primary-fg">{resumo.resolvidas} resolvida(s)</span>
          {resumo.ignoradas > 0 && <> · {resumo.ignoradas} ignorada(s) ainda presentes</>}
          {resumo.arquivadas > 0 && <> · {resumo.arquivadas} ignorada(s) por fatura fechada</>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {STATUS.map(s => (
          <button key={s.id} onClick={() => trocarStatus(s.id)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${status === s.id ? 'bg-primary text-white' : 'bg-surface-2 text-texto-2 hover:text-texto-1'}`}>
            {s.label}
          </button>
        ))}
        {status === 'pendente' && corrigiveis.length > 0 && podeEditarAl && (
          <button className="ml-auto text-xs flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary-hover"
            title="Aplica todas as correções automáticas (religar parcelas, depois etapas A) e varre de novo"
            onClick={() => setAjustar({ pendencias: corrigiveis, todas: true })}>
            <Wrench size={12} /> Corrigir todas ({corrigiveis.length})
          </button>
        )}
      </div>

      {erro && <div className="card border border-perigo/40 text-sm text-perigo">{erro}</div>}

      {carregando ? (
        <div className="card flex items-center justify-center py-10 text-texto-3"><Loader2 size={18} className="animate-spin" /></div>
      ) : porRegra.length === 0 ? (
        <div className="card text-center py-12">
          <ShieldCheck size={32} className="text-primary-fg mx-auto mb-3" />
          <p className="text-texto-2">Nenhuma pendência {status === 'pendente' ? 'aberta' : status === 'ignorada' ? 'ignorada' : 'resolvida'}</p>
          {status === 'pendente' && <p className="text-xs text-texto-3 mt-1">Use "Varrer agora" para conferir os dados.</p>}
        </div>
      ) : porRegra.map(([regra, itens]) => {
        const def = REGRAS_POR_CODIGO[regra]
        return (
          <div key={regra} className="card space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-texto-1">{def?.descricao || regra}</h3>
              <span className="badge bg-surface-hover/60 text-texto-2 font-mono">{regra}</span>
              {def?.lado && <span className={`badge ${LADO_COR[def.lado] || LADO_COR.configuração}`}>{def.lado}</span>}
              <span className="text-xs text-texto-3 ml-auto">{itens.length}</span>
              {itens.filter(podeCorrigirSozinho).length > 1 && podeEditarAl && (
                <button className="text-xs flex items-center gap-1 px-2 py-1 rounded bg-surface-hover text-texto-1 hover:bg-surface-hover"
                  onClick={() => setAjustar({ pendencias: itens.filter(podeCorrigirSozinho) })}>
                  <Wrench size={12} /> Corrigir as automáticas desta regra ({itens.filter(podeCorrigirSozinho).length})
                </button>
              )}
            </div>
            {itens.map(p => {
              const card = accById.get(p.conta_id)
              const lancId = lancamentoDa(p, txById)
              const linhas = linhasComparacao(p.esperado, p.encontrado)
              return (
                <div key={p.id} className="bg-surface-2/60 rounded-lg p-3 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm text-texto-1 flex-1 min-w-0 break-words">{p.descricao}</p>
                    {ehProjecao(p) && (
                      <span className="badge shrink-0 bg-surface-2 text-texto-2 border border-dashed border-borda-forte"
                        title="Parcela projetada (gerada pelo sistema, sem data do cartão) — ainda não confirmada pela importação da fatura">
                        projeção
                      </span>
                    )}
                    {qtdProjecoes(p) > 0 && (
                      <span className="badge shrink-0 bg-surface-2 text-texto-2 border border-dashed border-borda-forte">
                        {qtdProjecoes(p)} projeção(ões)
                      </span>
                    )}
                    <span className={`badge shrink-0 ${p.severidade === 'auto' ? 'bg-primary/15 text-primary-fg' : 'bg-aviso/15 text-aviso'}`}>
                      {p.severidade === 'auto' ? 'automática' : 'requer aprovação'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-texto-3">
                    {card && <span className="flex items-center gap-1"><CreditCard size={11} />{card.apelido || card.name}</span>}
                    {p.fatura_ref && <span>Fatura {p.fatura_ref}</span>}
                    {p.status === 'ignorada' && p.resolvida_por === 'fatura_fechada' && (
                      <span className="flex items-center gap-1"><Lock size={11} />fatura fechada</span>
                    )}
                  </div>
                  {linhas.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="text-xs w-full">
                        <thead>
                          <tr className="text-texto-3">
                            <th className="text-left font-normal pr-3"></th>
                            <th className="text-left font-normal pr-3">Esperado</th>
                            <th className="text-left font-normal">Encontrado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {linhas.map(l => (
                            <tr key={l.k}>
                              <td className="text-texto-3 pr-3 whitespace-nowrap">{l.k.replace(/_/g, ' ')}</td>
                              <td className="text-texto-2 pr-3">{l.esperado}</td>
                              <td className={l.esperado !== l.encontrado ? 'text-aviso' : 'text-texto-2'}>{l.encontrado}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <details className="text-xs">
                    <summary className="text-texto-3 cursor-pointer hover:text-texto-2">Detalhes (ids)</summary>
                    <pre className="mt-2 text-[11px] text-texto-2 whitespace-pre-wrap break-all">{JSON.stringify({ origem_id: p.origem_id, esperado: p.esperado, encontrado: p.encontrado }, null, 2)}</pre>
                  </details>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {podeAjustar(p) && podeEditarAl && (
                      <button className="text-xs flex items-center gap-1 px-2 py-1 rounded bg-primary text-white hover:bg-primary-hover"
                        onClick={() => setAjustar({ pendencias: [p] })}>
                        <Wrench size={12} /> Corrigir
                      </button>
                    )}
                    {p.regra === 'GER_SALDO_SUBCONTA' && p.status === 'pendente' && podeEditarAl && (
                      <button className="text-xs flex items-center gap-1 px-2 py-1 rounded bg-surface-hover text-texto-1 hover:bg-surface-hover"
                        title="Grava um marco de saldo da subconta. Não cria lançamento e não altera saldo."
                        onClick={() => setAceitarSaldo(p)}>
                        <BadgeCheck size={12} /> Aceitar saldo atual como correto
                      </button>
                    )}
                    {lancId && (
                      <button className="text-xs flex items-center gap-1 px-2 py-1 rounded bg-surface-hover text-texto-1 hover:bg-surface-hover"
                        onClick={() => setEditTx(txById.get(lancId))}>
                        <FileText size={12} /> Abrir lançamento
                      </button>
                    )}
                    {p.conta_id && accById.get(p.conta_id)?.type === 'credit' && (
                      <button className="text-xs flex items-center gap-1 px-2 py-1 rounded bg-surface-hover text-texto-1 hover:bg-surface-hover"
                        onClick={() => irParaFatura(p)}>
                        <ExternalLink size={12} /> Ir para a fatura
                      </button>
                    )}
                    {p.status === 'pendente' && podeEditarAl && (
                      <button className="text-xs flex items-center gap-1 px-2 py-1 rounded text-texto-2 hover:text-texto-1"
                        onClick={() => mudarStatus(p, 'ignorar')}>
                        <EyeOff size={12} /> Ignorar
                      </button>
                    )}
                    {p.status === 'ignorada' && podeEditarAl && (
                      <button className="text-xs flex items-center gap-1 px-2 py-1 rounded text-texto-2 hover:text-texto-1"
                        onClick={() => mudarStatus(p, 'reabrir')}>
                        <RotateCcw size={12} /> Reabrir
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {ajustar && (
        <AjusteIntegridadeModal pendencias={ajustar.pendencias} todas={!!ajustar.todas} onClose={() => setAjustar(null)} onConcluido={carregar} />
      )}

      {aceitarSaldo && (
        <AceitarSaldoModal pendencia={aceitarSaldo} onClose={() => setAceitarSaldo(null)} onConcluido={carregar} />
      )}

      <Modal open={!!editTx} onClose={() => setEditTx(null)} title="Editar Lançamento">
        {editTx && <TransactionForm initial={editTx} onClose={() => setEditTx(null)} />}
      </Modal>
    </div>
  )
}
