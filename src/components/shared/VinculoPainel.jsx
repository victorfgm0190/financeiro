import { useMemo, useState } from 'react'
import { Link2, Search, AlertTriangle, GitMerge } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from './utils'
import { candidatosDoLancamento, divergenciaVinculo, CAMPOS_MESCLA, ROTULO_CAMPO_MESCLA } from '../../lib/vinculo'

const fatura = (ym) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : '')

// "Vincular" a partir do LANÇAMENTO (lib/vinculo): candidatos = ocorrências pendentes de agendamentos
// e, no cartão, parcelas de séries. Ocorrência → vincula (pergunta qual valor/data manter quando
// diferem). Parcela → mescla (escolha dos campos + confirmação explícita; o avulso é removido).
export default function VinculoPainel({ tx, onClose, onToast }) {
  const { schedules, transactions, accounts, getNextOccurrences, vincularLancamento, mesclarComParcela, rateiosByLancamento } = useApp()
  const [busca, setBusca] = useState('')
  const [escolhido, setEscolhido] = useState(null)
  const [manter, setManter] = useState('lancamento')
  const [campos, setCampos] = useState(new Set())
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState('')
  const conta = (id) => { const a = accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : '—' }
  const closingDay = accounts.find(a => a.id === tx.accountId)?.closingDay || 14
  const candidatos = useMemo(
    () => candidatosDoLancamento(tx, { schedules, transactions, getNextOccurrences, closingDay, busca, rateios: rateiosByLancamento }),
    [tx, schedules, transactions, getNextOccurrences, closingDay, busca, rateiosByLancamento]
  )

  const escolher = (c) => {
    setEscolhido(c)
    setErro('')
    setConfirmando(false)
    if (c.tipo === 'parcela') {
      // Padrão: o que difere em valor e data vem do avulso (o real); rateio só se a parcela não tiver.
      const ini = new Set()
      if (Math.round(Number(c.tx.amount) * 100) !== Math.round(Number(tx.amount) * 100)) ini.add('amount')
      if ((rateiosByLancamento.get(tx.id) || []).length && !(rateiosByLancamento.get(c.tx.id) || []).length) ini.add('rateio')
      setCampos(ini)
    }
  }

  const vincular = () => {
    const r = vincularLancamento({ txId: tx.id, scheduleId: escolhido.scheduleId, data: escolhido.data, manter })
    if (!r?.ok) { setErro(r?.motivo || 'Não foi possível vincular.'); return }
    onToast?.(`Vinculado à ocorrência de ${fmtDate(escolhido.data)} de "${escolhido.descricao}". Histórico registrado.`)
    onClose?.(true)
  }
  const mesclar = () => {
    const r = mesclarComParcela({ avulsoId: tx.id, parcelaId: escolhido.id, campos: [...campos] })
    if (!r?.ok) { setErro(r?.motivo || 'Não foi possível mesclar.'); return }
    onToast?.(`Mesclado: a parcela ${r.rotulo} foi mantida e o avulso removido. Histórico registrado.`)
    onClose?.(true)
  }

  const div = escolhido?.tipo === 'ocorrencia' ? divergenciaVinculo(tx, escolhido.schedule, escolhido.data) : null
  const valorDe = (t, campo) => {
    if (campo === 'rateio') return `${(rateiosByLancamento.get(t.id) || []).length || 'sem'} linha(s)`
    if (campo === 'amount') return fmt(t.amount)
    if (campo === 'date') return fmtDate(t.date)
    return t[campo] || '—'
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-texto-2">
        <span className="font-medium text-texto-1">{tx.description || tx.payee || 'Lançamento'}</span> · {fmtDate(tx.date)} · {fmt(tx.amount)} · {conta(tx.accountId)}
      </p>
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-texto-3" />
        <input className="input pl-8 text-sm" value={busca} onChange={e => { setBusca(e.target.value); setEscolhido(null) }} placeholder="Buscar agendamento ou parcela por descrição ou favorecido" aria-label="Buscar" />
      </div>
      {!escolhido && (
        candidatos.length === 0
          ? <p className="text-xs text-texto-3">Nenhum agendamento pendente ou parcela parecida (mesmo sentido, até 15 dias). Use a busca para procurar outro.</p>
          : (
            <ul className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {candidatos.map(c => (
                <li key={c.id} className="flex items-center gap-2 rounded-lg border border-borda px-2.5 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="text-texto-1 truncate">
                      {c.tipo === 'parcela' ? <GitMerge size={11} className="inline mr-1 text-texto-3" /> : <Link2 size={11} className="inline mr-1 text-texto-3" />}
                      {c.descricao || '(sem descrição)'}
                    </p>
                    <p className="text-texto-3 break-words">
                      {c.favorecido ? `${c.favorecido} · ` : ''}{fmtDate(c.tipo === 'ocorrencia' ? c.dataEfetiva : c.data)} · {conta(c.accountId)}
                      {c.tipo === 'parcela' ? ` · parcela ${c.num}/${c.total} – fatura ${fatura(c.fatura)}` : ' · agendamento pendente'}
                    </p>
                    {c.motivos?.length > 0 && <p className="text-[11px] text-texto-3">{c.motivos.join(' · ')}</p>}
                  </div>
                  <span className="shrink-0 font-medium text-texto-1">{fmt(c.valor)}</span>
                  <button type="button" className="btn-secondary text-xs py-1 px-2 shrink-0" onClick={() => escolher(c)}>
                    {c.tipo === 'parcela' ? 'Mesclar' : 'Vincular'}
                  </button>
                </li>
              ))}
            </ul>
          )
      )}

      {escolhido?.tipo === 'ocorrencia' && (
        <div className="rounded-lg border border-borda-forte p-3 space-y-2 text-xs">
          <p className="text-texto-1">Vincular à ocorrência de <strong>{fmtDate(escolhido.data)}</strong> de "{escolhido.descricao}" ({fmt(escolhido.valor)}).</p>
          <p className="text-texto-3">A ocorrência fica baixada apontando este lançamento — nada novo é criado. As próximas não mudam.</p>
          {div?.diverge && (
            <fieldset className="space-y-1">
              <legend className="text-aviso mb-1">Valor ou data diferentes. O que fica na ocorrência?</legend>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="radio" name="manter" className="accent-primary mt-0.5" checked={manter === 'lancamento'} onChange={() => setManter('lancamento')} />
                <span>Os do lançamento real: {fmt(tx.amount)} · {fmtDate(tx.date)}</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="radio" name="manter" className="accent-primary mt-0.5" checked={manter === 'agendamento'} onChange={() => setManter('agendamento')} />
                <span>Os previstos: {fmt(div.valor ? div.valor.previsto : tx.amount)} · {fmtDate(div.data ? div.data.previsto : tx.date)}</span>
              </label>
            </fieldset>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-secondary flex-1" onClick={() => setEscolhido(null)}>Voltar</button>
            <button type="button" className="btn-primary flex-1" onClick={vincular}><Link2 size={13} className="inline mr-1" /> Vincular</button>
          </div>
        </div>
      )}

      {escolhido?.tipo === 'parcela' && (
        <div className="rounded-lg border border-borda-forte p-3 space-y-2 text-xs">
          <p className="text-texto-1">Mesclar com a parcela <strong>{escolhido.num}/{escolhido.total}</strong> (fatura {fatura(escolhido.fatura)}). A parcela fica; marque o que ela deve receber deste lançamento:</p>
          <ul className="space-y-1">
            {CAMPOS_MESCLA.map(campo => (
              <li key={campo}>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" className="accent-primary mt-0.5" checked={campos.has(campo)}
                    onChange={() => setCampos(prev => { const n = new Set(prev); if (n.has(campo)) n.delete(campo); else n.add(campo); return n })} />
                  <span>{ROTULO_CAMPO_MESCLA[campo]}: {valorDe(escolhido.tx, campo)} → {valorDe(tx, campo)}</span>
                </label>
              </li>
            ))}
          </ul>
          {!confirmando ? (
            <div className="flex gap-2 pt-1">
              <button type="button" className="btn-secondary flex-1" onClick={() => setEscolhido(null)}>Voltar</button>
              <button type="button" className="btn-primary flex-1" onClick={() => setConfirmando(true)}><GitMerge size={13} className="inline mr-1" /> Mesclar com a parcela</button>
            </div>
          ) : (
            <div role="alert" className="rounded-lg border-2 border-aviso/60 bg-aviso/10 p-2.5 space-y-2">
              <p className="flex items-start gap-2 text-texto-1">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-aviso" />
                O lançamento avulso será removido e a parcela {escolhido.num}/{escolhido.total} mantida. Confirmar?
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setConfirmando(false)}>Cancelar</button>
                <button type="button" className="btn-danger flex-1" onClick={mesclar}>Confirmar</button>
              </div>
            </div>
          )}
        </div>
      )}
      {erro && <p className="text-xs text-perigo">{erro}</p>}
    </div>
  )
}
