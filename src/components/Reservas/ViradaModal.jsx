import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle, Calendar, Loader2 } from 'lucide-react'
import Modal from '../shared/Modal'
import { fmtDate } from '../shared/utils'

// ── Modal "Virar Saldo" — viradas encadeadas ────────────────────────────────
// Máquina de estados em três passos, sem fechar entre uma virada e a próxima:
//
//   multi   → só aparece quando o razão diário tem 2+ meses. "Virada multi-mês?"
//   data    → escolhe a data de corte. O saldo usado é o do ÚLTIMO dia ANTERIOR a ela
//             registrado no razão diário (corte 14/08 → fechamento de 13/08).
//   feito   → mostra o que foi criado e pergunta se quer mais uma virada. Sim → volta a `data`.
//
// Props:
//   loadMonths()   → Promise<string[]>  meses com dados no razão ('YYYY-MM')
//   onVirar(corte) → Promise<{ dataCorte, ledgerDate, count, fallback }>
//                    ledgerDate = data do razão efetivamente usada (null → usou o saldo de hoje)
//                    fallback   = true quando não havia razão anterior ao corte
//   defaultDate    → data sugerida no primeiro corte

const STEP_MULTI = 'multi'
const STEP_DATA = 'data'
const STEP_FEITO = 'feito'

export default function ViradaModal({ defaultDate, todayStr, loadMonths, onVirar, onClose }) {
  const [step, setStep] = useState(null)      // null enquanto carrega os meses
  const [months, setMonths] = useState([])
  const [data, setData] = useState(defaultDate || '')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [ultima, setUltima] = useState(null)  // resultado da última virada
  const [feitas, setFeitas] = useState(0)     // quantas viradas nesta sessão do modal

  // Passo 1: detecta múltiplos meses no razão diário.
  useEffect(() => {
    let cancelado = false
    loadMonths()
      .then(ms => {
        if (cancelado) return
        setMonths(ms || [])
        setStep((ms || []).length > 1 ? STEP_MULTI : STEP_DATA)
      })
      .catch(() => { if (!cancelado) setStep(STEP_DATA) })
    return () => { cancelado = true }
  }, [loadMonths])

  const virar = async () => {
    if (!data) return
    setBusy(true)
    setErro('')
    try {
      const res = await onVirar(data)
      setUltima(res)
      setFeitas(n => n + 1)
      setStep(STEP_FEITO)
    } catch (err) {
      setErro(err?.message || 'Falha ao criar a virada.')
    } finally {
      setBusy(false)
    }
  }

  // "Mais uma virada": sugere o dia seguinte ao corte anterior como próximo corte.
  const proxima = () => {
    setUltima(null)
    setErro('')
    setStep(STEP_DATA)
  }

  const encerrar = () => onClose(feitas)

  return (
    <Modal open onClose={encerrar} title="Virar Saldo" size="sm">
      {step === null && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <Loader2 size={14} className="animate-spin" /> Lendo o razão diário…
        </div>
      )}

      {step === STEP_MULTI && (
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-300">
              O razão diário tem registros de <strong>{months.length} meses</strong>:{' '}
              <span className="text-gray-400">{months.join(', ')}</span>.
            </p>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Uma virada fecha um período só. Com vários meses acumulados você pode encadear
            viradas — escolher um corte por vez, sem fechar esta janela, até chegar em hoje.
          </p>
          <div className="flex gap-3 pt-1">
            <button type="button" className="btn-secondary flex-1" onClick={encerrar}>Não, cancelar</button>
            <button type="button" className="btn-primary flex-1 bg-emerald-700 hover:bg-emerald-600" onClick={() => setStep(STEP_DATA)}>
              Sim, encadear
            </button>
          </div>
        </div>
      )}

      {step === STEP_DATA && (
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            {feitas === 0 ? 'Informe a data de corte:' : `Data de corte da ${feitas + 1}ª virada:`}
          </p>
          <div>
            <label className="text-[11px] text-gray-400 flex items-center gap-1 mb-1">
              <Calendar size={11} /> Data de corte
            </label>
            <input
              type="date"
              value={data}
              max={todayStr}
              onChange={e => setData(e.target.value)}
              className="input w-full text-sm"
            />
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            O novo período começa nesta data. O Saldo Inicial de cada função vem do{' '}
            <strong>último dia anterior a ela</strong> registrado no razão diário — corte em
            14/08 usa o fechamento de 13/08. Sem razão anterior ao corte, cai no Saldo
            Atualizado de hoje. Nada é sobrescrito: o histórico anterior é preservado.
          </p>
          {erro && <p className="text-xs text-despesa">{erro}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" className="btn-secondary flex-1" onClick={encerrar} disabled={busy}>
              {feitas > 0 ? 'Encerrar' : 'Cancelar'}
            </button>
            <button
              type="button"
              className="btn-primary flex-1 bg-emerald-700 hover:bg-emerald-600"
              onClick={virar}
              disabled={busy || !data}
            >
              {busy ? 'Virando…' : 'Confirmar Virada'}
            </button>
          </div>
        </div>
      )}

      {step === STEP_FEITO && ultima && (
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <CheckCircle size={16} className="text-emerald-500 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-200">
              Virada criada — <strong>{ultima.count}</strong> {ultima.count === 1 ? 'função' : 'funções'}.
            </p>
          </div>
          <dl className="text-xs space-y-1.5 bg-gray-800/30 rounded-lg p-3">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Novo período começa em</dt>
              <dd className="text-gray-200 font-medium">{fmtDate(ultima.dataCorte)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Saldo usado (razão diário)</dt>
              <dd className={ultima.fallback ? 'text-orange-500 font-medium' : 'text-gray-200 font-medium'}>
                {ultima.fallback ? 'Saldo Atualizado de hoje' : fmtDate(ultima.ledgerDate)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Hoje</dt>
              <dd className="text-gray-200 font-medium">{fmtDate(todayStr)}</dd>
            </div>
          </dl>
          {ultima.fallback && (
            <p className="text-xs text-orange-500/90 leading-relaxed">
              Não havia registro no razão diário antes de {fmtDate(ultima.dataCorte)} — foi usado
              o Saldo Atualizado de hoje. O razão só cobre os últimos meses.
            </p>
          )}
          <p className="text-sm text-gray-300">Deseja realizar mais uma virada?</p>
          {erro && <p className="text-xs text-despesa">{erro}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" className="btn-secondary flex-1" onClick={encerrar}>Não, encerrar</button>
            <button type="button" className="btn-primary flex-1 bg-emerald-700 hover:bg-emerald-600" onClick={proxima}>
              Sim, mais uma
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
