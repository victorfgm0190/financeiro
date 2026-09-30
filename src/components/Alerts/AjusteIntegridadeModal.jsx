import { useMemo, useState } from 'react'
import { Loader2, CheckCircle, AlertTriangle, Wrench } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { planejarAjuste } from '../../lib/integridade/ajustes'
import { resolverPendenciaPorAjuste } from '../../lib/db'
import Modal from '../shared/Modal'
import { fmt } from '../shared/utils'

// Confirmação do ajuste de pendências 'auto'. Mostra exatamente o que será criado/alterado (plano
// calculado sobre o estado atual do app) e só executa no "Confirmar". Depois do ajuste, a regra de
// cada pendência roda de novo sobre o estado ajustado: sumiu → resolvida_por='motor'; senão fica
// pendente e o motivo aparece aqui.
export default function AjusteIntegridadeModal({ pendencias, onClose, onConcluido }) {
  const { data, aplicarAjustesIntegridade } = useApp()
  const [executando, setExecutando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')

  // Plano congelado na abertura do modal: é o que o usuário está aprovando.
  const [planos] = useState(() => (pendencias || []).map(p => ({ p, plano: planejarAjuste(data, p) })))
  const aplicaveis = planos.filter(x => x.plano.ok)
  const criacoes = aplicaveis.filter(x => x.plano.acao === 'criar')
  const total = useMemo(() => aplicaveis.reduce((s, x) => s + (x.plano.acao === 'criar' ? x.plano.valor : 0), 0), [aplicaveis])

  const confirmar = async () => {
    setExecutando(true)
    setErro('')
    try {
      const res = await aplicarAjustesIntegridade(aplicaveis.map(x => x.p))
      const aplicadoPor = new Map(res.aplicados.map(a => [a.pendenciaId, a]))
      const linhas = []
      for (const v of res.verificacao) {
        const aplicado = aplicadoPor.get(v.pendenciaId)
        const ignorado = res.ignorados.find(i => i.pendenciaId === v.pendenciaId)
        let gravada = false
        let falha = null
        if (v.resolvida) {
          try {
            await resolverPendenciaPorAjuste(v.pendenciaId, aplicado
              ? { acao: aplicado.acao, tx_id: aplicado.txId, valor: aplicado.valor, descricao: aplicado.texto }
              : { acao: 'nenhuma', motivo: ignorado?.motivo || null })
            gravada = true
          } catch (e) {
            falha = e.message
          }
        }
        linhas.push({ ...v, aplicado, ignorado, gravada, falha })
      }
      setResultado(linhas)
      onConcluido?.()
    } catch (e) {
      setErro(`Falha ao ajustar: ${e.message}`)
    } finally {
      setExecutando(false)
    }
  }

  const titulo = planos.length > 1 ? 'Ajustar pendências automáticas' : 'Ajustar pendência'

  return (
    <Modal open onClose={executando ? () => {} : onClose} title={titulo} size="lg">
      {!resultado ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            {criacoes.length > 0 && <>Serão criadas <span className="text-gray-100 font-medium">{criacoes.length} transferência(s)</span>, total <span className="text-gray-100 font-medium">{fmt(total)}</span>. </>}
            {aplicaveis.length - criacoes.length > 0 && <>{aplicaveis.length - criacoes.length} transferência(s) serão atualizadas. </>}
            O saldo das contas é recalculado em seguida pelo recálculo normal.
          </p>
          <ul className="space-y-2">
            {planos.map(({ p, plano }) => (
              <li key={p.id} className={`rounded-lg p-3 text-xs ${plano.ok ? 'bg-gray-800/70 text-gray-200' : 'bg-gray-800/30 text-gray-500'}`}>
                {plano.ok
                  ? <span className="font-mono break-all">{plano.texto}</span>
                  : <><span className="text-gray-400">{p.descricao}</span><br />Sem ação: {plano.motivo}</>}
              </li>
            ))}
          </ul>
          {erro && <p className="text-sm text-red-400">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={onClose} disabled={executando}>Cancelar</button>
            <button className="btn-primary flex items-center gap-2" onClick={confirmar} disabled={executando || aplicaveis.length === 0}>
              {executando ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
              Confirmar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {resultado.map(r => (
            <div key={r.pendenciaId} className="flex items-start gap-2 text-xs bg-gray-800/60 rounded-lg p-3">
              {r.resolvida && r.gravada
                ? <CheckCircle size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                : <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />}
              <div className="text-gray-300 min-w-0 break-words">
                {r.aplicado ? <p className="font-mono break-all">{r.aplicado.texto}</p> : <p>Nenhuma alteração: {r.ignorado?.motivo}</p>}
                {r.resolvida && r.gravada && <p className="text-emerald-400 mt-1">Divergência sumiu — pendência resolvida pelo motor.</p>}
                {r.resolvida && !r.gravada && <p className="text-amber-400 mt-1">Divergência sumiu, mas não foi possível marcar a pendência ({r.falha}). A próxima varredura resolve.</p>}
                {!r.resolvida && <p className="text-amber-400 mt-1">Continua pendente: {r.motivo}</p>}
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <button className="btn-primary" onClick={onClose}>Fechar</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
