import { useMemo, useState } from 'react'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { navegarPara, ABRIR_EXTRATO_KEY } from '../../lib/abrirTela'
import { controleGerencialAtivo, impedimentosDesligar, subcontasGerenciais } from '../../lib/controleGerencial'

// Chave "Usar controle gerencial" do AMBIENTE (configuracoes.controle_gerencial).
// Desligar só com TODAS as subcontas gerenciais em saldo zero (saldo do card da conta:
// getAccountSaldos, saldo de hoje + lançamentos com data futura) e SEM agendamento gerencial
// pendente — senão lista o que impede, com link. Ao desligar, as subcontas ficam inativas (nunca
// excluídas). Ligar de novo reativa as subcontas e tudo volta a funcionar como antes.
export default function ControleGerencialChave({ podeEditar }) {
  const { settings, updateSettings, accounts, schedules, gerencialGroups, getAccountSaldos, updateAccount } = useApp()
  const ligado = controleGerencialAtivo(settings)
  const [bloqueio, setBloqueio] = useState(null)

  const saldoDe = useMemo(() => (conta) => {
    const s = getAccountSaldos(conta)
    return s?.applicable ? s.saldoHoje + s.saldoFuturo : (conta.balance || 0)
  }, [getAccountSaldos])

  const desligar = () => {
    const imp = impedimentosDesligar({ accounts, schedules, gerencialGroups, saldoDe })
    if (imp.contas.length || imp.agendamentos.length) { setBloqueio(imp); return }
    setBloqueio(null)
    for (const a of subcontasGerenciais(accounts)) if (a.active !== false) updateAccount(a.id, { active: false })
    updateSettings({ controleGerencial: false })
  }
  const ligar = () => {
    setBloqueio(null)
    for (const a of subcontasGerenciais(accounts)) if (a.active === false) updateAccount(a.id, { active: true })
    updateSettings({ controleGerencial: true })
  }

  return (
    <div className="mb-4 rounded-xl border border-borda-forte bg-surface-2/40 p-3.5 space-y-2">
      <label className={`flex items-center gap-3 ${podeEditar ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-texto-1">Usar controle gerencial</p>
          <p className="text-xs text-texto-3">
            Vale para o ambiente todo. Desligado, a classificação gerencial some dos lançamentos, agendamentos e
            importação de fatura, e nenhuma subconta, etapa A, devolução ou provisão gerencial é gerada.
            O histórico fica gravado.
          </p>
        </div>
        <input type="checkbox" role="switch" className="h-5 w-9 accent-primary shrink-0" checked={ligado} disabled={!podeEditar}
          onChange={e => (e.target.checked ? ligar() : desligar())} aria-label="Usar controle gerencial" />
      </label>

      {bloqueio && (
        <div role="alert" className="rounded-lg border border-perigo/40 bg-perigo-bg px-3 py-2 text-xs text-texto-1 space-y-2">
          <p className="flex items-start gap-1.5 font-medium">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-perigo" />
            Não dá para desligar ainda. Zere as contas e conclua os agendamentos abaixo:
          </p>
          {bloqueio.contas.length > 0 && (
            <ul className="space-y-1 pl-5">
              {bloqueio.contas.map(({ conta, saldo }) => (
                <li key={conta.id} className="flex flex-wrap items-center gap-x-2">
                  <span>{conta.apelido || conta.name} · saldo {fmt(saldo)}</span>
                  <button type="button" className="inline-flex items-center gap-1 text-primary-fg underline min-h-[32px]"
                    onClick={() => navegarPara('accounts', { handoff: { key: ABRIR_EXTRATO_KEY, valor: { accountId: conta.id } } })}>
                    <ExternalLink size={11} /> Abrir a conta
                  </button>
                </li>
              ))}
            </ul>
          )}
          {bloqueio.agendamentos.length > 0 && (
            <ul className="space-y-1 pl-5">
              {bloqueio.agendamentos.map(({ agendamento, vencimento, valor }) => (
                <li key={agendamento.id} className="flex flex-wrap items-center gap-x-2">
                  <span>{agendamento.description || 'Agendamento'} · vence {fmtDate(vencimento)} · {fmt(valor)}</span>
                  <button type="button" className="inline-flex items-center gap-1 text-primary-fg underline min-h-[32px]"
                    onClick={() => navegarPara('schedule')}>
                    <ExternalLink size={11} /> Abrir Agendamentos
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
