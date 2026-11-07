import { useMemo, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { fmtSinal } from '../shared/utils'
import { useApp } from '../../context/AppContext'
import { avisosDaConta, diasDoCaixa, somarDiasIso } from '../../lib/avisoCaixaReserva'
import { previsoesDasFuncoes } from '../../lib/previsaoReserva'
import { saldosDasFuncoes } from '../../lib/saldoReserva'
import { saldosDaConta } from '../../lib/saldos'
import { isoLocal } from '../../lib/hoje'

// Aviso discreto por conta de reserva (Reservas › Resumo e Painel). Dispensar vale neste aparelho até a
// situação mudar: guarda exatamente o que estava sendo avisado.
const chave = (usuarioId, contaId) => `finup:aviso-caixa:${usuarioId || 'u'}:${contaId}`
const lerDispensa = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const gravarDispensa = (k, v) => { try { localStorage.setItem(k, v) } catch { /* sem armazenamento: volta a avisar */ } }

function AvisoDaConta({ conta, aviso, compacto, usuarioId, onVer }) {
  const k = chave(usuarioId, conta.id)
  const [dispensada, setDispensada] = useState(() => lerDispensa(k))
  if (dispensada === aviso.assinatura) return null
  const dispensar = () => { gravarDispensa(k, aviso.assinatura); setDispensada(aviso.assinatura) }
  return (
    <div className="rounded-lg border border-aviso/30 bg-aviso/5 px-3 py-2 text-xs flex items-start gap-2" role="status" data-testid={`aviso-caixa-${conta.id}`}>
      <AlertTriangle size={13} className="text-aviso shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="font-medium text-texto-1">{conta.apelido || conta.name}</p>
        {aviso.textoNegativas && <p className="text-texto-2">{aviso.textoNegativas}</p>}
        {aviso.textoNegativas && !compacto && (
          <p className="text-texto-3">{aviso.negativas.map(n => `${n.nome} ${fmtSinal(n.saldo)}`).join(' · ')}</p>
        )}
        {aviso.textoFalta && <p className="text-texto-2">{aviso.textoFalta}</p>}
      </div>
      {onVer && <button type="button" className="text-primary-fg hover:text-texto-1 shrink-0" onClick={onVer}>Ver</button>}
      <button type="button" className="text-texto-3 hover:text-texto-1 shrink-0" aria-label={`Dispensar aviso de ${conta.apelido || conta.name}`} title="Dispensar até a situação mudar" onClick={dispensar}><X size={13} /></button>
    </div>
  )
}

export default function AvisosCaixaReserva({ compacto = false, onVer = null }) {
  const { accounts, profileAccounts, reserveFunctions, reservePeriods, reserveAdjustments, transactions, schedules, scheduleReservaFuncoes, getNextOccurrences, settings, usuario } = useApp()
  const hoje = isoLocal(new Date())
  const avisos = useMemo(() => {
    const contas = (profileAccounts || accounts || []).filter(a => (reserveFunctions || []).some(f => f.accountId === a.id))
    const fim = somarDiasIso(hoje, diasDoCaixa(settings))
    return contas.map(conta => {
      const fns = reserveFunctions.filter(f => f.accountId === conta.id)
      const saldos = saldosDasFuncoes({ functions: fns, periods: reservePeriods, adjustments: reserveAdjustments, transactions, ate: hoje })
      const funcoes = fns.map((f, i) => ({ id: f.id, name: f.name, saldo: saldos[i].saldo }))
      const previsoes = previsoesDasFuncoes(fns, { accounts, schedules, scheduleReservaFuncoes, getNextOccurrences }, { ini: hoje, fim })
      const saldoConta = saldosDaConta(conta.id, conta.initialBalance, transactions, hoje).balance
      return { conta, aviso: avisosDaConta({ saldoConta, funcoes, previsoes }) }
    }).filter(x => x.aviso.temAviso)
  }, [accounts, profileAccounts, reserveFunctions, reservePeriods, reserveAdjustments, transactions, schedules, scheduleReservaFuncoes, getNextOccurrences, settings, hoje])
  if (!avisos.length) return null
  return (
    <div className="space-y-2" data-testid="avisos-caixa-reserva">
      {avisos.map(({ conta, aviso }) => (
        <AvisoDaConta key={conta.id} conta={conta} aviso={aviso} compacto={compacto} usuarioId={usuario?.id} onVer={onVer} />
      ))}
    </div>
  )
}
