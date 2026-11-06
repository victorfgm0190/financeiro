import { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import InputMoeda from '../shared/InputMoeda'
import { fmt, fmtSinal, fmtDate } from '../shared/utils'
import { viradaReservaAcao } from '../../lib/db'
import { agruparPendencias } from '../../lib/viradaReserva'
import { dataBR } from '../../lib/mesFinanceiro'

// Lançamentos gravados com data em período já fechado. O lançamento já está salvo; aqui o usuário escolhe
// entre a) Ajuste no próximo período aberto (já preenchido) ou b) Reabrir, do fechamento mais recente até
// o mês do lançamento. Depois de qualquer um, oferece refazer os rendimentos seguintes.
const msgErro = (err) => err?.dados?.error || err?.message || 'Não foi possível concluir.'
const rotuloGrupo = (mes) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`

function FormAjuste({ pendencia, funcoes, hoje, onFeito, onCancelar }) {
  const [functionId, setFunctionId] = useState(pendencia.function_id || '')
  const [valor, setValor] = useState(pendencia.valor)
  const [observacao, setObservacao] = useState(pendencia.observacaoSugerida || '')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const salvar = async () => {
    setEnviando(true)
    setErro('')
    try {
      onFeito(await viradaReservaAcao({ acao: 'pendencia_ajustar', id: pendencia.id, functionId, valor, observacao, hoje }))
    } catch (err) {
      setErro(msgErro(err))
      setEnviando(false)
    }
  }
  return (
    <div className="rounded border border-borda p-2 space-y-2 bg-surface-2/30" data-testid="pendencia-form-ajuste">
      <p className="text-[11px] text-texto-2">Ajuste no próximo período aberto, em {fmtDate(pendencia.dataAjuste)}. O período fechado não muda, e o valor vai para a coluna Ajuste.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="text-[11px] text-texto-2">Função
          <select className="input mt-1 w-full" value={functionId} onChange={e => setFunctionId(e.target.value)}>
            <option value="">Escolha…</option>
            {funcoes.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-texto-2">Valor
          <InputMoeda className="input mt-1 w-full" value={valor} onChange={e => setValor(e.target.value)} negativo />
        </label>
        <label className="text-[11px] text-texto-2">Observação
          <input className="input mt-1 w-full" value={observacao} onChange={e => setObservacao(e.target.value)} />
        </label>
      </div>
      {erro && <p className="text-xs text-perigo" role="alert">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary text-xs py-1" disabled={enviando} onClick={onCancelar}>Cancelar</button>
        <button type="button" className="btn-primary text-xs py-1" disabled={enviando || !functionId || !observacao.trim() || !Number(valor)} onClick={salvar}>
          {enviando ? <Loader2 size={12} className="animate-spin" /> : 'Lançar Ajuste'}
        </button>
      </div>
    </div>
  )
}

function ConfirmaReabrir({ pendencia, hoje, onFeito, onCancelar }) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const cortes = pendencia.fechamentosADesfazer || []
  const reabrir = async () => {
    setEnviando(true)
    setErro('')
    try {
      onFeito(await viradaReservaAcao({ acao: 'pendencia_reabrir', id: pendencia.id, hoje }))
    } catch (err) {
      setErro(msgErro(err))
      setEnviando(false)
    }
  }
  return (
    <div className="rounded border border-aviso/40 p-2 space-y-2 bg-aviso/5" data-testid="pendencia-confirma-reabrir">
      <p className="text-[11px] text-texto-1">Serão desfeitos {cortes.length === 1 ? 'o fechamento de' : `${cortes.length} fechamentos, a partir do mais recente:`} {cortes.map(dataBR).join(', ')}. Esses meses voltam a ficar abertos e precisarão de nova virada.</p>
      {erro && <p className="text-xs text-perigo" role="alert">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary text-xs py-1" disabled={enviando} onClick={onCancelar}>Cancelar</button>
        <button type="button" className="btn-primary text-xs py-1" disabled={enviando} onClick={reabrir}>{enviando ? <Loader2 size={12} className="animate-spin" /> : 'Reabrir'}</button>
      </div>
    </div>
  )
}

function RefazerRendimentos({ refazer, functions, hoje, onConcluir }) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const nome = (id) => functions.find(f => f.id === id)?.name || '(função removida)'
  const refazerAgora = async () => {
    setEnviando(true)
    setErro('')
    try {
      await viradaReservaAcao({ acao: 'rendimentos_refazer', desde: refazer.desde, hoje })
      onConcluir()
    } catch (err) {
      setErro(msgErro(err))
      setEnviando(false)
    }
  }
  return (
    <div className="rounded border border-primary/40 p-2 space-y-2" data-testid="pendencia-refazer-rendimentos">
      <p className="text-xs text-texto-1 font-medium">O saldo das funções mudou. Refazer {refazer.itens.length === 1 ? 'o rateio do rendimento seguinte' : `o rateio dos ${refazer.itens.length} rendimentos seguintes`}?</p>
      <ul className="text-[11px] text-texto-2 space-y-1">
        {refazer.itens.map(it => (
          <li key={it.lancamentoId}>
            {fmtDate(it.date)} · {it.description || 'Rendimento'}: {Object.keys({ ...it.antes, ...it.depois }).map(id => `${nome(id)} ${fmt(it.antes[id] || 0)} → ${fmt(it.depois[id] || 0)}`).join('; ')}
          </li>
        ))}
      </ul>
      {erro && <p className="text-xs text-perigo" role="alert">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary text-xs py-1" disabled={enviando} onClick={onConcluir}>Agora não</button>
        <button type="button" className="btn-primary text-xs py-1" disabled={enviando} onClick={refazerAgora}>{enviando ? <Loader2 size={12} className="animate-spin" /> : 'Refazer rendimentos'}</button>
      </div>
    </div>
  )
}

export default function PendenciasFechado({ itens, functions = [], accounts = [], hoje, podeEditar = false, onMudou }) {
  const [aberto, setAberto] = useState(null)          // { id, opcao: 'ajuste' | 'reabrir' }
  const [refazer, setRefazer] = useState(null)
  const grupos = agruparPendencias(itens)
  const nomeConta = (id) => { const a = accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : 'Conta de reserva' }
  const nomeFuncao = (id) => functions.find(f => f.id === id)?.name || 'Sem função'
  const concluir = (r) => {
    setAberto(null)
    if (r?.refazer?.itens?.length) setRefazer(r.refazer)
    return onMudou?.()
  }
  const fecharRefazer = () => {
    setRefazer(null)
    return onMudou?.()
  }
  return (
    <div className="card border border-aviso/40 bg-aviso/5 py-2.5 px-3 text-xs space-y-2" role="status" data-testid="pendencias-fechado">
      <p className="font-semibold text-texto-1 flex items-center gap-1.5">
        <AlertTriangle size={13} className="text-aviso shrink-0" />
        {itens.length === 1 ? '1 lançamento gravado com data em período já fechado' : `${itens.length} lançamentos gravados com data em período já fechado`}
      </p>
      <p className="text-[11px] text-texto-2">Eles já estão salvos e contam no saldo da conta, mas não no saldo das funções. Escolha o que fazer com cada um.</p>
      {refazer && <RefazerRendimentos refazer={refazer} functions={functions} hoje={hoje} onConcluir={fecharRefazer} />}
      {grupos.map(g => (
        <div key={g.chave} className="space-y-1" data-testid="pendencias-grupo">
          <p className="text-[11px] font-semibold text-texto-2 flex justify-between gap-2"><span>{nomeConta(g.accountId)} · {rotuloGrupo(g.mes)}</span><span>{fmtSinal(g.total)}</span></p>
          {g.itens.map(p => (
            <div key={p.id} className="border-t border-borda/50 pt-1 space-y-1" data-testid="pendencia-item">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-texto-1">{fmtDate(p.data)} · {p.descricao || 'Lançamento'} · {nomeFuncao(p.function_id)}{p.motivo === 'excluido' ? ' (excluído)' : p.motivo === 'editado' ? ' (editado)' : ''}</span>
                <span className="font-semibold whitespace-nowrap">{fmtSinal(p.valor)}</span>
                {podeEditar && (
                  <span className="ml-auto flex flex-wrap gap-1.5">
                    <button type="button" className="btn-secondary text-xs py-0.5" onClick={() => setAberto({ id: p.id, opcao: 'ajuste' })}>Ajuste no próximo período</button>
                    <button type="button" className="btn-secondary text-xs py-0.5 disabled:opacity-40" disabled={!p.podeReabrir} title={p.motivoReabrir || undefined} onClick={() => setAberto({ id: p.id, opcao: 'reabrir' })}>Reabrir</button>
                  </span>
                )}
              </div>
              {podeEditar && !p.podeReabrir && p.motivoReabrir && <p className="text-[11px] text-texto-3">Reabrir indisponível: {p.motivoReabrir}</p>}
              {aberto?.id === p.id && aberto.opcao === 'ajuste' && (
                <FormAjuste
                  pendencia={p}
                  funcoes={functions.filter(f => !p.account_id || f.accountId === p.account_id)}
                  hoje={hoje}
                  onFeito={concluir}
                  onCancelar={() => setAberto(null)}
                />
              )}
              {aberto?.id === p.id && aberto.opcao === 'reabrir' && (
                <ConfirmaReabrir pendencia={p} hoje={hoje} onFeito={concluir} onCancelar={() => setAberto(null)} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
