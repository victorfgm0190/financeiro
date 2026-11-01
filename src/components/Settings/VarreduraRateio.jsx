import { useMemo, useState } from 'react'
import { Split } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { baixasSemRateio } from '../../lib/rateio'
import { linhasHistorico, novoLoteId } from '../../lib/historico'

// Configurações › Dados › Manutenção: lançamentos criados/ligados por BAIXA de agendamento rateado que
// ficaram sem rateio (antes da herança automática). Só lista; "Aplicar rateio do agendamento" grava
// o rateio (proporcional ao valor de cada um) depois da confirmação, com histórico.
export default function VarreduraRateio({ somenteLeitura = false }) {
  const { schedules, transactions, rateiosByLancamento, saveRateiosFor, registrarEdicao, categories, accounts } = useApp()
  const [aberta, setAberta] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [feito, setFeito] = useState(null)
  const lista = useMemo(
    () => (aberta ? baixasSemRateio({ schedules, transactions, rateiosPorId: rateiosByLancamento }) : []),
    [aberta, schedules, transactions, rateiosByLancamento]
  )
  const cat = (id) => categories.find(c => c.id === id)?.name || '?'
  const conta = (id) => { const a = accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : '' }
  const resumo = (linhas) => linhas.map(l => `${cat(l.categoriaId)} ${fmt(l.valor)}`).join(' + ')

  const aplicar = () => {
    const loteId = novoLoteId()
    for (const it of lista) saveRateiosFor(it.tx.id, it.linhas)
    const historico = linhasHistorico({
      entidade: 'lancamento', loteId, motivo: 'Manutenção: rateio do agendamento aplicado a baixa sem rateio',
      itens: lista.map(it => ({ id: it.tx.id, mudancas: [{ campo: 'rateio', de: null, para: resumo(it.linhas) }] })),
    })
    if (historico.length) registrarEdicao({ historico, loteId }).catch(err => console.warn('[varredura] histórico:', err.message))
    setFeito(lista.length)
    setConfirmando(false)
  }

  return (
    <div className="bg-surface-2 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-texto-1 flex items-center gap-2"><Split size={14} /> Rateio de agendamentos nas baixas</p>
        <p className="text-xs text-texto-3 mt-0.5">
          Lista os lançamentos que baixaram um agendamento rateado e ficaram sem o rateio (relatórios por categoria somam o total na categoria principal). Nada muda até você confirmar.
        </p>
      </div>
      {!aberta ? (
        <button type="button" data-guia="settings:manutencao.rateio-procurar" className="btn-secondary text-xs" onClick={() => { setAberta(true); setFeito(null) }}>Procurar</button>
      ) : lista.length === 0 ? (
        <p className="text-xs text-texto-2">{feito ? `Rateio aplicado em ${feito} lançamento(s). Histórico registrado.` : 'Nenhum lançamento de baixa sem rateio.'}</p>
      ) : (
        <>
          <ul className="max-h-72 overflow-y-auto divide-y divide-borda text-xs">
            {lista.map(it => (
              <li key={it.tx.id} className="py-1.5">
                <p className="text-texto-1">{fmtDate(it.tx.date)} · {it.tx.description || it.tx.payee || '—'} · {fmt(it.tx.amount)} · {conta(it.tx.accountId)}</p>
                <p className="text-texto-3">Agendamento "{it.schedule.description}" ({fmtDate(it.data)}) → {resumo(it.linhas)}</p>
              </li>
            ))}
          </ul>
          {!somenteLeitura && (!confirmando ? (
            <button type="button" className="btn-primary text-xs" onClick={() => setConfirmando(true)}>
              Aplicar rateio do agendamento ({lista.length})
            </button>
          ) : (
            <div role="alert" className="rounded-lg border border-aviso/50 bg-aviso/10 p-2.5 space-y-2 text-xs">
              <p>Gravar o rateio do agendamento em {lista.length} lançamento(s)? O valor e a conta não mudam; só a divisão por categoria.</p>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary text-xs" onClick={() => setConfirmando(false)}>Cancelar</button>
                <button type="button" className="btn-primary text-xs" onClick={aplicar}>Confirmar</button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
