import { useMemo, useState } from 'react'
import { Check, AlertTriangle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { ORIGIN } from '../../lib/origins'
import { fmt, today } from '../shared/utils'
import Modal from '../shared/Modal'
import DateInput from '../shared/DateInput'

// Saldo atual de UMA conta, pela mesma regra que o card exibe: contas de liquidez usam o
// `saldoAtual` da engine de ciclo (initialBalance + lançamentos até hoje); cartão desconta a
// dívida; patrimoniais usam o balance gravado.
function saldoAtualDe(account, getAccountSaldos) {
  if (!account) return 0
  if (account.type === 'credit') return -(account.creditDebt || 0)
  const s = getAccountSaldos(account)
  if (s?.applicable) return s.saldoAtual
  return account.balance || 0
}

// Lançador de rendimento de uma conta. O usuário informa o SALDO NOVO (o que o banco/app
// mostra hoje) e o sistema lança a DIFERENÇA como receita na categoria configurada.
//
// Modo 'grupo': o saldo de referência é a soma das contas do mesmo account_group_id — útil
// quando um investimento é acompanhado pelo total do grupo. A receita, porém, vai SEMPRE na
// conta clicada (é ela que tem a categoria de rendimento configurada).
export default function RendimentoModal({ account, onClose }) {
  const { accounts, addTransaction, getAccountSaldos } = useApp()

  const isGrupo = account.rendimentoModo === 'grupo' && !!account.accountGroupId
  // Contas do escopo: no modo grupo, todas as do mesmo grupo (inclusive a clicada); senão só ela.
  const contasDoEscopo = useMemo(
    () => isGrupo ? accounts.filter(a => a.accountGroupId === account.accountGroupId) : [account],
    [isGrupo, accounts, account]
  )
  const saldoAtual = useMemo(
    () => Math.round(contasDoEscopo.reduce((s, a) => s + saldoAtualDe(a, getAccountSaldos), 0) * 100) / 100,
    [contasDoEscopo, getAccountSaldos]
  )

  const [novoSaldo, setNovoSaldo] = useState('')
  const [date, setDate] = useState(today())
  const [saving, setSaving] = useState(false)

  const preenchido = novoSaldo !== '' && !Number.isNaN(Number(novoSaldo))
  const rendimento = preenchido ? Math.round((Number(novoSaldo) - saldoAtual) * 100) / 100 : null
  const valido = rendimento != null && rendimento > 0

  const handleConfirm = () => {
    if (!valido || saving) return
    setSaving(true)
    addTransaction({
      type: 'income',
      accountId: account.id,          // no modo grupo o saldo é somado, mas a receita é desta conta
      accountType: account.type,      // define o efeito no saldo (crédito x conta de liquidez)
      amount: rendimento,
      date,
      categoryId: account.rendimentoCategoriaId,
      description: 'Rendimento',
      origin: ORIGIN.RENDIMENTO_MANUAL,
    })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Lançar Rendimento — ${account.name}`}>
      <div className="space-y-4">
        {/* Saldo de referência (somente leitura) */}
        <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
          <p className="text-xs text-gray-500 mb-0.5">
            {isGrupo ? 'Saldo atual do grupo' : 'Saldo atual da conta'}
          </p>
          <p className="text-xl font-bold text-gray-100">{fmt(saldoAtual)}</p>
          {isGrupo && (
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Soma de {contasDoEscopo.length} conta{contasDoEscopo.length !== 1 ? 's' : ''} do grupo.
              O lançamento será feito em <span className="text-gray-300 font-medium">{account.name}</span>.
            </p>
          )}
        </div>

        <div>
          <label className="label">Novo saldo (R$) *</label>
          <input
            type="number"
            step="0.01"
            className="input"
            value={novoSaldo}
            onChange={e => setNovoSaldo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm() } }}
            placeholder="0,00"
            autoFocus
          />
        </div>

        {/* Rendimento calculado em tempo real. Azul = receita · laranja = inválido
            (o usuário tem deficiência de visão de cores; ícone + texto acompanham a cor). */}
        {preenchido && (
          valido ? (
            <div className="p-3 rounded-lg border border-[#85B7EB]/30 bg-[#85B7EB]/10">
              <p className="text-xs text-gray-400 mb-0.5">Rendimento a lançar</p>
              <p className="text-lg font-bold text-receita flex items-center gap-1.5">
                <Check size={16} /> {fmt(rendimento)}
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-lg border border-[#F0997B]/30 bg-[#F0997B]/10">
              <p className="text-sm font-medium text-despesa flex items-center gap-1.5">
                <AlertTriangle size={15} /> {fmt(rendimento)}
              </p>
              <p className="text-xs text-despesa/80 mt-1">
                Saldo informado deve ser maior que o saldo atual.
              </p>
            </div>
          )
        )}

        <div>
          <label className="label">Data</label>
          <DateInput className="input" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        <div className="flex gap-3 pt-1">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!valido || saving}
            onClick={handleConfirm}
          >
            Confirmar
          </button>
        </div>
      </div>
    </Modal>
  )
}
