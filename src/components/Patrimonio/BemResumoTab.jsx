import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Scale, Wallet, CalendarDays, ListOrdered, HandCoins, AlertTriangle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import Modal from '../shared/Modal'
import { getExtratoBens, vincularReceita } from '../../lib/bemApi'
import { extratoDoBem, resumoDoBem, linhaDoTempo, ROTULO_CLASSE, CLASSE } from '../../lib/extratoBem'
import BaixasDoBem from './BaixasDoBem'
import { isoLocal } from '../../lib/hoje'
import { isInvestAutoOrigin, isPatrimonioOrigin } from '../../lib/origins'

function Linha({ label, valor, destaque, dica }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-borda last:border-0">
      <span className="text-xs text-texto-3">
        {label}
        {dica && <span className="block text-[11px] text-texto-3/80">{dica}</span>}
      </span>
      <span className={`text-sm text-right ${destaque || 'text-texto-1'}`}>{fmt(valor)}</span>
    </div>
  )
}

const rotuloMes = (mes) => { const [a, m] = mes.split('-'); return `${m}/${a}` }

const PAPEIS = [
  { id: 'terceiro', rotulo: 'Pago por terceiro' },
  { id: 'devolucao', rotulo: 'Devolução ou reembolso' },
]
const papelDaClasse = (classe) => (classe === CLASSE.TERCEIRO ? 'terceiro' : 'devolucao')

// Escolher uma receita que ainda não está ligada a nenhum bem. A devolução vem pré-marcada: a receita
// entrou numa conta sua. Pago por terceiro é para quando o terceiro pagou a parcela direto.
function LigarReceitaModal({ bemId, onClose, onLigar }) {
  const { profileTransactions } = useApp()
  const [busca, setBusca] = useState('')
  const [escolhida, setEscolhida] = useState(null)
  const [papel, setPapel] = useState('devolucao')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const candidatas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (profileTransactions || [])
      .filter(t => t.type === 'income' && !t.reservaAuto && !t.bemId && t.accountId !== bemId
        && !isInvestAutoOrigin(t) && !isPatrimonioOrigin(t))
      .filter(t => !q || `${t.description || ''} ${t.payee || ''}`.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 50)
  }, [profileTransactions, bemId, busca])

  const confirmar = async () => {
    setSalvando(true)
    setErro('')
    try {
      await onLigar(escolhida, papel)
      onClose()
    } catch (e) {
      setErro(e.message)
      setSalvando(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Ligar uma receita a este bem" size="lg">
      <div className="space-y-3">
        <div>
          <label className="label">Buscar receita</label>
          <input className="input" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome de quem pagou ou descrição da receita" autoFocus />
        </div>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-borda divide-y divide-borda/60">
          {candidatas.length === 0 && <p className="text-sm text-texto-3 text-center py-6">Nenhuma receita encontrada.</p>}
          {candidatas.map(t => (
            <button
              key={t.id} type="button" onClick={() => setEscolhida(t)}
              className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 text-sm hover:bg-surface-hover ${escolhida?.id === t.id ? 'bg-primary/15' : ''}`}
            >
              <span className="min-w-0">
                <span className="block text-texto-1 truncate">{t.description || t.payee || 'Receita'}</span>
                <span className="block text-xs text-texto-3">{fmtDate(t.date)}{t.payee && t.description ? ` · ${t.payee}` : ''}</span>
              </span>
              <span className="text-receita shrink-0">{fmt(t.amount)}</span>
            </button>
          ))}
        </div>
        <div>
          <label className="label">O que é esta receita?</label>
          <select className="input" value={papel} onChange={e => setPapel(e.target.value)}>
            {PAPEIS.map(p => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
          </select>
          {papel === 'terceiro' && (
            <p className="text-xs text-aviso mt-1">
              Use se o terceiro pagou a parcela direto. Se você pagou e ele devolveu, marque como devolução:
              senão a parcela conta duas vezes.
            </p>
          )}
        </div>
        {erro && <p className="text-sm text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}
        <div className="flex gap-3">
          <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn-primary flex-1" onClick={confirmar} disabled={!escolhida || salvando}>
            {salvando ? 'Ligando…' : 'Ligar ao bem'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// Visão Bem: tudo sai do Extrato do bem (src/lib/extratoBem.js), a mesma leitura do relatório de caixa.
// A aba é montada de novo a cada abertura, então uma baixa ou um estorno já aparecem.
export default function BemResumoTab({ bemId, onMudou }) {
  const { pode, updateTransaction } = useApp()
  const podeEditar = pode?.('patrimonio', 'editar')
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [ligando, setLigando] = useState(false)
  const [erroReceita, setErroReceita] = useState('')

  const carregar = useCallback(() => getExtratoBens(bemId)
    .then(r => { setDados(r); setErro('') })
    .catch(e => setErro(e.message)), [bemId])

  useEffect(() => {
    let vivo = true
    getExtratoBens(bemId)
      .then(r => { if (vivo) { setDados(r); setErro('') } })
      .catch(e => { if (vivo) setErro(e.message) })
    return () => { vivo = false }
  }, [bemId])

  const calculo = useMemo(() => {
    const bem = dados?.bens?.[0]
    if (!bem) return null
    const parcelas = dados.parcelas || []
    const linhas = extratoDoBem(bem, dados)
    const resumo = resumoDoBem(bem, linhas, parcelas, dados.cotas)
    return {
      linhas,
      resumo,
      tempo: linhaDoTempo(linhas, parcelas, { ate: isoLocal(new Date()), faltaFixa: resumo.ehConsorcio ? resumo.faltaPagar : null }),
    }
  }, [dados])

  const gravarPapel = async (lancamentoId, papel) => {
    const r = await vincularReceita(bemId, lancamentoId, papel)
    updateTransaction(lancamentoId, { bemId: r.bem_id, bemPapel: r.bem_papel })
    await carregar()
  }
  const trocarPapel = (lancamentoId, papel) => {
    setErroReceita('')
    gravarPapel(lancamentoId, papel).catch(e => setErroReceita(e.message))
  }

  if (erro) return <p className="text-sm text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>
  if (!dados) {
    return <p className="flex items-center gap-2 text-sm text-texto-3 py-8 justify-center"><Loader2 size={14} className="animate-spin" /> Carregando…</p>
  }
  if (!calculo) return <p className="text-sm text-texto-3 py-8 text-center">Bem não encontrado.</p>

  const { resumo: r, tempo, linhas } = calculo
  const receitas = linhas.filter(l => l.receita)

  return (
    <div className="space-y-4">
      {r.valorInformado && (
        <p className="text-xs text-aviso bg-aviso/5 border border-aviso/20 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle size={13} className="shrink-0 mt-px" />
          Valor informado, sem lançamentos: o pago vem do valor digitado no cadastro do bem.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-semibold text-texto-2 mb-3 flex items-center gap-2">
            <Wallet size={14} className="text-receita" /> Quanto já foi pago
          </h3>
          <Linha label={r.ehConsorcio ? 'Valor da carta de crédito' : 'Valor do bem'} valor={r.valorBem} />
          <Linha label="Pago acumulado (sem juros)" valor={r.pagoSemJuros} />
          <Linha label="Pago acumulado (com juros)" valor={r.pagoComJuros} destaque="text-receita font-semibold" />
          <Linha
            label={r.ehConsorcio ? 'Falta pagar (compromisso)' : 'Falta pagar'} valor={r.faltaPagar} destaque="text-despesa font-semibold"
            dica={r.ehConsorcio ? 'Saldo devedor informado pela administradora' : 'Parcelas em aberto, com juros e descontos'}
          />
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-texto-2 mb-3 flex items-center gap-2">
            <Scale size={14} className="text-texto-2" /> Quanto custou para você
          </h3>
          <Linha label="Pago com recursos próprios" valor={r.proprios} />
          <Linha label="Pago por terceiros" valor={r.terceiros} />
          {r.foraDoFinup > 0 && <Linha label="Pago fora do Finup" valor={r.foraDoFinup} dica="Conta não controlada, sem lançamento" />}
          {r.abertura > 0 && <Linha label="Histórico de abertura" valor={r.abertura} dica="Pago antes de usar o Finup, sem lançamento" />}
          {r.benfeitorias > 0 && <Linha label="Benfeitorias (contrato)" valor={r.benfeitorias} dica="Feitas pelo inquilino e abatidas do aluguel" />}
          {r.creditos > 0 && <Linha label="Créditos e rendimentos" valor={r.creditos} dica="Não saiu do seu bolso" />}
          <Linha label="Devoluções recebidas" valor={r.devolucoes} />
          <Linha label="Custo próprio líquido" valor={r.custoProprioLiquido} destaque="font-semibold" dica="O que saiu do seu bolso, menos devoluções" />
          <Linha label="Juros pagos" valor={r.jurosPagos} />
          <Linha label="Descontos de antecipação" valor={r.descontos} />
          <Linha label="Custo final até hoje" valor={r.custoFinalRealizado} dica={r.ehConsorcio ? 'O que já foi pago' : 'Valor do bem + juros pagos'} />
          <Linha label="Custo final projetado" valor={r.custoFinalProjetado} dica={r.ehConsorcio ? 'Pago + saldo devedor informado' : 'Valor do bem + juros previstos − descontos'} />
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold text-texto-2 flex items-center gap-2">
            <HandCoins size={14} className="text-texto-2" /> Receitas deste bem
          </h3>
          {podeEditar && (
            <button type="button" className="btn-secondary text-xs py-1 px-3" onClick={() => setLigando(true)}>Ligar receita</button>
          )}
        </div>
        {erroReceita && <p className="text-sm text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2 mb-2">{erroReceita}</p>}
        {receitas.length === 0
          ? <p className="text-xs text-texto-3">Nenhuma receita ligada. Ligue aqui um reembolso ou o que um terceiro pagou por você.</p>
          : (
            <div className="space-y-2">
              {receitas.map(l => (
                <div key={l.id} className="flex flex-col sm:flex-row sm:items-center gap-2 border-b border-borda/60 last:border-0 pb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-texto-1 truncate">{l.descricao || 'Receita'} · {fmt(l.valor)}</p>
                    <p className="text-xs text-texto-3">
                      {fmtDate(l.data)}
                      {l.sugerida && <span className="text-aviso"> · Sugestão, confirme</span>}
                    </p>
                  </div>
                  {podeEditar && (
                    <div className="flex items-center gap-2">
                      <select className="input text-xs py-1 w-auto" aria-label="O que é esta receita" value={papelDaClasse(l.classe)} onChange={e => trocarPapel(l.id, e.target.value)}>
                        {PAPEIS.map(p => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
                      </select>
                      {l.sugerida && (
                        <button type="button" className="btn-primary text-xs py-1 px-2" onClick={() => trocarPapel(l.id, papelDaClasse(l.classe))}>Confirmar</button>
                      )}
                      {!l.sugerida && (
                        <button type="button" className="text-xs text-texto-3 hover:text-texto-1" onClick={() => trocarPapel(l.id, null)}>Desligar</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-texto-2 mb-3 flex items-center gap-2">
          <CalendarDays size={14} className="text-texto-2" /> Mês a mês
        </h3>
        {tempo.length === 0
          ? <p className="text-sm text-texto-3 text-center py-4">Nenhum pagamento registrado neste bem.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-borda text-xs text-texto-2">
                    <th className="text-left font-medium py-2 pr-3">Mês</th>
                    <th className="text-right font-medium py-2 px-2">Pago no mês</th>
                    <th className="text-right font-medium py-2 px-2">Pago acumulado</th>
                    <th className="text-right font-medium py-2 px-2">Falta pagar</th>
                    <th className="text-right font-medium py-2 pl-2">Juros acumulados</th>
                  </tr>
                </thead>
                <tbody>
                  {tempo.map(m => (
                    <tr key={m.mes} className="border-b border-borda/60 last:border-0">
                      <td className="py-1.5 pr-3 text-texto-2">{rotuloMes(m.mes)}</td>
                      <td className="py-1.5 px-2 text-right text-texto-1">{fmt(m.pagoNoMes)}</td>
                      <td className="py-1.5 px-2 text-right text-texto-1">{fmt(m.pagoAcumulado)}</td>
                      <td className="py-1.5 px-2 text-right text-texto-1">{fmt(m.faltaPagar)}</td>
                      <td className="py-1.5 pl-2 text-right text-texto-1">{fmt(m.jurosAcumulados)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      <BaixasDoBem baixas={dados.baixas || []} onMudou={async (efeitos) => { await carregar(); await onMudou?.(efeitos) }} />

      {linhas.length > 0 && (
        <details className="card">
          <summary className="text-sm font-semibold text-texto-2 cursor-pointer flex items-center gap-2">
            <ListOrdered size={14} className="text-texto-2" /> Lançamentos deste resumo ({linhas.length})
          </summary>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm min-w-[520px]">
              <tbody>
                {linhas.map(l => (
                  <tr key={l.id} className="border-b border-borda/60 last:border-0">
                    <td className="py-1.5 pr-3 text-texto-2 whitespace-nowrap">{fmtDate(l.data)}</td>
                    <td className="py-1.5 px-2 text-texto-2 whitespace-nowrap">
                      {ROTULO_CLASSE[l.classe]}
                      {l.selo && l.selo !== ROTULO_CLASSE[l.classe] && <span className="block text-[11px] text-texto-3">{l.selo}</span>}
                    </td>
                    <td className="py-1.5 px-2 text-texto-3">{l.descricao}</td>
                    <td className="py-1.5 pl-2 text-right text-texto-1 whitespace-nowrap">{fmt(l.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {ligando && (
        <LigarReceitaModal
          bemId={bemId}
          onClose={() => setLigando(false)}
          onLigar={(tx, papel) => gravarPapel(tx.id, papel)}
        />
      )}
    </div>
  )
}
