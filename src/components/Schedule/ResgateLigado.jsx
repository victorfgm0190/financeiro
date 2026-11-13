// Resgate LIGADO a uma despesa (src/lib/resgateVinculado.js): o que se pode mexer só nele —
//   • mudar a data de uma ocorrência (vale enquanto a despesa não mudar a dela);
//   • excluir uma ocorrência ou o resgate inteiro (não volta pela sincronização);
//   • vincular uma ocorrência pendente a um resgate já feito (e desvincular).
// Valor, conta e função vêm da despesa ("Resgatar de" se muda na despesa).
import { useMemo, useState } from 'react'
import { Info, Link2, Trash2, CalendarClock } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate, today } from '../shared/utils'
import { occEfetiva } from '../../lib/fluxoCaixa'
import { computeOccurrences } from '../../lib/occurrences'
import { candidatosResgateFeito, despesaDoResgate, rotuloOrigem, JANELA_RESGATE_FEITO_DIAS } from '../../lib/resgateVinculado'
import Modal from '../shared/Modal'
import OcorrenciasRegistradas from './OcorrenciasRegistradas'

const nomeConta = (accounts, id) => { const a = (accounts || []).find(x => x.id === id); return a ? (a.apelido || a.name) : '—' }

// Lista de transferências já feitas para vincular à ocorrência `chave` do resgate.
export function VincularResgateLista({ resgate, chave, onFeito }) {
  const { transactions, schedules, accounts, vincularLancamento } = useApp()
  const candidatos = useMemo(
    () => candidatosResgateFeito(resgate, chave, { transactions, schedules, hoje: today() }),
    [resgate, chave, transactions, schedules],
  )
  const [erro, setErro] = useState('')
  if (!resgate || !chave) return null
  const vincular = (txId) => {
    const r = vincularLancamento({ txId, scheduleId: resgate.id, data: chave, manter: 'agendamento' })
    if (r && r.ok === false) { setErro(r.motivo || 'Não foi possível vincular.'); return }
    onFeito?.()
  }
  return (
    <div className="space-y-1.5" data-testid="vincular-resgate-lista">
      <p className="text-xs text-texto-2">
        Transferências já feitas de {nomeConta(accounts, resgate.accountId)} para {nomeConta(accounts, resgate.toAccountId)},
        até {JANELA_RESGATE_FEITO_DIAS} dias de {fmtDate(occEfetiva(resgate, chave).date)}:
      </p>
      {candidatos.length === 0 ? (
        <p className="text-xs text-texto-3">Nenhuma transferência livre nesse período.</p>
      ) : candidatos.map(({ tx, dias, mesmoValor }) => (
        <div key={tx.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-borda px-2.5 py-1.5 text-xs">
          <span className="text-texto-1 font-medium">{fmtDate(tx.date)}</span>
          <span className={mesmoValor ? 'text-receita font-semibold' : 'text-texto-1'}>{fmt(tx.amount)}</span>
          <span className="text-texto-3 min-w-0 flex-1 break-words">{tx.description || 'Transferência'}{dias ? ` · ${dias} dia${dias === 1 ? '' : 's'}` : ''}</span>
          <button type="button" className="btn-primary text-xs py-1 px-2" onClick={() => vincular(tx.id)}>Vincular</button>
        </div>
      ))}
      {erro && <p role="alert" className="text-xs text-perigo">{erro}</p>}
    </div>
  )
}

// Excluir só esta ocorrência ou o resgate inteiro.
export function ExcluirResgateModal({ resgate, chave, onClose, onExcluidoTudo }) {
  const { excluirOcorrenciaResgate, deleteSchedule } = useApp()
  if (!resgate) return null
  return (
    <Modal open onClose={onClose} title="Excluir resgate" size="sm">
      <div className="space-y-3">
        <p className="text-sm text-texto-2">A despesa não muda. O resgate excluído não volta sozinho.</p>
        {chave && (
          <button type="button" className="btn-secondary w-full" onClick={() => { excluirOcorrenciaResgate(resgate.id, chave); onClose() }}>
            Só esta ocorrência ({fmtDate(occEfetiva(resgate, chave).date)})
          </button>
        )}
        <button type="button" className="w-full px-4 py-2 text-sm font-medium bg-perigo-solido text-white hover:bg-perigo-solido-hover rounded-lg transition-colors"
          onClick={() => { deleteSchedule(resgate.id); onClose(); onExcluidoTudo?.() }}>
          O resgate inteiro
        </button>
        <button type="button" className="btn-ghost w-full" onClick={onClose}>Voltar</button>
      </div>
    </Modal>
  )
}

// Painel do resgate ligado (no lugar do formulário completo).
export default function ResgateLigadoPainel({ resgate: inicial, onClose }) {
  const { schedules, accounts, reserveFunctions, transactions, mudarDataResgate, pode } = useApp()
  const resgate = (schedules || []).find(s => s.id === inicial?.id) || inicial
  const despesa = despesaDoResgate(resgate, schedules)
  const pendentes = useMemo(() => (resgate ? computeOccurrences(resgate, 36) : []), [resgate])
  const [chave, setChave] = useState(() => pendentes[0] || '')
  const chaveAtual = pendentes.includes(chave) ? chave : (pendentes[0] || '')
  const dataAtual = chaveAtual ? occEfetiva(resgate, chaveAtual).date : ''
  const [novaData, setNovaData] = useState(null)
  const [excluindo, setExcluindo] = useState(false)
  const [vinculando, setVinculando] = useState(false)
  const podeEditar = pode('agendamentos', 'editar')
  const podeExcluir = pode('agendamentos', 'excluir')
  if (!resgate) return null
  const conta = (accounts || []).find(a => a.id === resgate.accountId)
  const dataCampo = novaData ?? dataAtual

  return (
    <div className="space-y-4" data-testid="painel-resgate-ligado">
      <div data-testid="aviso-resgate-ligado" className="flex items-start gap-2 text-xs text-texto-2 bg-reserva/10 border border-reserva/30 rounded-lg px-3 py-2">
        <Info size={13} className="mt-0.5 shrink-0 text-reserva" />
        <span>
          Este resgate acompanha o agendamento "{despesa?.description || 'da despesa'}": valor, conta e função vêm dele
          (para mudar "Resgatar de", edite a despesa). O resgate fica agendado na mesma data; pague-o (ou vincule a um resgate já feito) quando fizer a transferência. Aqui você pode mudar a data de uma
          ocorrência, excluir ou vincular a um resgate já feito.
        </span>
      </div>
      <div className="text-sm text-texto-1 space-y-0.5">
        <p className="font-medium break-words">{resgate.description}</p>
        <p className="text-xs text-texto-2 break-words">
          {rotuloOrigem(conta, resgate.reservaFuncaoId, reserveFunctions)} → {nomeConta(accounts, resgate.toAccountId)} · {fmt(Number(resgate.amount) || 0)}
        </p>
      </div>

      {pendentes.length > 0 ? (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="resgate-ocorrencia">Ocorrência</label>
            <select id="resgate-ocorrencia" className="input" value={chaveAtual} onChange={e => { setChave(e.target.value); setNovaData(null); setVinculando(false) }}>
              {pendentes.map(k => <option key={k} value={k}>{fmtDate(occEfetiva(resgate, k).date)} · {fmt(Number(occEfetiva(resgate, k).amount) || 0)}</option>)}
            </select>
          </div>
          {podeEditar && (
            <div>
              <label className="label" htmlFor="resgate-data">Data desta ocorrência</label>
              <div className="flex flex-wrap gap-2">
                <input id="resgate-data" type="date" className="input flex-1 min-w-0" value={dataCampo} onChange={e => setNovaData(e.target.value)} />
                <button type="button" className="btn-secondary flex items-center gap-1.5" disabled={!dataCampo || dataCampo === dataAtual}
                  onClick={() => { mudarDataResgate(resgate.id, chaveAtual, dataCampo); setNovaData(null) }}>
                  <CalendarClock size={13} /> Salvar data
                </button>
              </div>
              <p className="text-xs text-texto-3 mt-1">Só no resgate. Se a data da despesa mudar depois, vale a da despesa.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {podeEditar && (
              <button type="button" className="btn-secondary flex items-center gap-1.5" onClick={() => setVinculando(v => !v)}>
                <Link2 size={13} /> Vincular a um resgate já feito
              </button>
            )}
            {podeExcluir && (
              <button type="button" className="btn-secondary flex items-center gap-1.5 hover:text-perigo" onClick={() => setExcluindo(true)}>
                <Trash2 size={13} /> Excluir
              </button>
            )}
          </div>
          {vinculando && <VincularResgateLista resgate={resgate} chave={chaveAtual} onFeito={() => setVinculando(false)} />}
        </div>
      ) : (
        <p className="text-xs text-texto-3">Nenhuma ocorrência pendente.</p>
      )}

      <OcorrenciasRegistradas schedule={resgate} transactions={transactions} accounts={accounts} />

      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Fechar</button>
      </div>
      {excluindo && <ExcluirResgateModal resgate={resgate} chave={chaveAtual} onClose={() => setExcluindo(false)} onExcluidoTudo={onClose} />}
    </div>
  )
}
