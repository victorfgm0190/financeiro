import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, CheckCircle, AlertTriangle, Wrench } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { previaDeCorrecao, ordenarParaCorrecao } from '../../lib/integridade/ajustes'
import { resolverPendenciaPorAjuste, varrerIntegridade, fetchResumoIntegridade } from '../../lib/db'
import Modal from '../shared/Modal'
import { fmt } from '../shared/utils'

// Confirmação de "Corrigir" (um item) e "Corrigir todas". Mostra exatamente o que será feito (plano
// calculado sobre o estado atual do app) e só executa no "Confirmar". Ordem: religar parcelas
// (PARCELA_SEM_VINCULO) → etapas A; cada item é replanejado sobre o estado já corrigido. Depois:
//   1. a regra de cada pendência roda de novo sobre o estado corrigido: sumiu → resolvida_por='motor';
//   2. espera o sync gravar no banco e roda a varredura completa — as pendências que eram
//      consequência (séries "incompletas", fechamento da fatura…) vão para Resolvidas sozinhas.
// PARCELA_SEM_VINCULO 'aprovar' mostra as opções; um clique escolhe.

// Espera o sync com o Neon terminar: o app grava com debounce (500 ms) e só então a varredura do
// servidor enxerga a correção. Sem sync em 1,5 s, considera que não havia nada a gravar.
function useAguardarSync() {
  const { syncing, syncError, dbStatus } = useApp()
  const estado = useRef({ syncing, syncError, dbStatus })
  useEffect(() => { estado.current = { syncing, syncError, dbStatus } }, [syncing, syncError, dbStatus])
  return () => new Promise((resolve, reject) => {
    const inicio = Date.now()
    let viuSync = false
    const passo = () => {
      const { syncing: s, syncError: erro, dbStatus: status } = estado.current
      if (erro || status === 'local') { reject(new Error(erro || 'sem conexão com o servidor — a correção ficou salva localmente')); return }
      if (s) viuSync = true
      const decorrido = Date.now() - inicio
      if ((viuSync && !s) || (!viuSync && decorrido > 1500)) { resolve(); return }
      if (decorrido > 30000) { reject(new Error('o sync não terminou em 30 s')); return }
      setTimeout(passo, 100)
    }
    setTimeout(passo, 100)
  })
}

export default function AjusteIntegridadeModal({ pendencias, todas = false, onClose, onConcluido }) {
  const { data, aplicarAjustesIntegridade } = useApp()
  const aguardarSync = useAguardarSync()
  const [executando, setExecutando] = useState(false)
  const [etapa, setEtapa] = useState('')
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')
  const [escolhas, setEscolhas] = useState({})

  // Estado congelado na abertura do modal: é o que o usuário está aprovando.
  const [base] = useState(() => data)
  const ordenadas = useMemo(() => ordenarParaCorrecao(pendencias || []), [pendencias])
  // Prévia na mesma sequência da execução: cada item planejado sobre o estado já corrigido pelos
  // anteriores (a etapa A de uma parcela religada enxerga a série religada).
  const planos = useMemo(
    () => previaDeCorrecao(base, ordenadas.map(p => (escolhas[p.id] ? { ...p, opcao: escolhas[p.id] } : p))),
    [ordenadas, escolhas, base],
  )
  const aplicaveis = planos.filter(x => x.plano?.ok)
  const faltaEscolha = planos.some(x => x.escolher && !escolhas[x.p.id])
  const qtd = (acao) => aplicaveis.filter(x => x.plano.acao === acao).length
  const totalCriado = aplicaveis.reduce((s, x) => s + (x.plano.acao === 'criar' ? x.plano.valor : 0), 0)

  const confirmar = async () => {
    setExecutando(true)
    setErro('')
    try {
      setEtapa('Aplicando correções…')
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
      let varredura = null
      let falhaVarredura = null
      try {
        setEtapa('Gravando no servidor…')
        await aguardarSync()
        setEtapa('Varrendo de novo…')
        const r = await varrerIntegridade()
        const resumo = await fetchResumoIntegridade()
        varredura = { ...r, pendentes: resumo?.pendentes ?? null }
      } catch (e) {
        falhaVarredura = e.message
      }
      setResultado({ linhas, varredura, falhaVarredura, corrigidas: res.aplicados.length })
      onConcluido?.()
    } catch (e) {
      setErro(`Falha ao corrigir: ${e.message}`)
    } finally {
      setExecutando(false)
      setEtapa('')
    }
  }

  const titulo = todas ? 'Corrigir todas as automáticas' : planos.length > 1 ? 'Corrigir pendências' : 'Corrigir pendência'

  return (
    <Modal open onClose={executando ? () => {} : onClose} title={titulo} size="lg">
      {!resultado ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            {qtd('religar') > 0 && <>Serão religadas <span className="text-gray-100 font-medium">{qtd('religar')} parcela(s)</span> à série (sem mudar valor, data, fatura nem saldo). </>}
            {qtd('criar') > 0 && <>Serão criadas <span className="text-gray-100 font-medium">{qtd('criar')} transferência(s)</span>, total <span className="text-gray-100 font-medium">{fmt(totalCriado)}</span>. </>}
            {qtd('atualizar') > 0 && <>{qtd('atualizar')} transferência(s) serão atualizadas. </>}
            {aplicaveis.length === 0 && !faltaEscolha && <>Nada a corrigir. </>}
            Ao final, a varredura completa roda sozinha.
          </p>
          <ul className="space-y-2">
            {planos.map(({ p, escolher, plano }) => (
              <li key={p.id} className={`rounded-lg p-3 text-xs ${!plano || plano.ok ? 'bg-gray-800/70 text-gray-200' : 'bg-gray-800/30 text-gray-500'}`}>
                {escolher && (
                  <div className="space-y-1.5 mb-2">
                    <p className="text-gray-300">{p.descricao}</p>
                    {(p.esperado?.opcoes || []).map(o => (
                      <button key={o.id} type="button" onClick={() => setEscolhas(e => ({ ...e, [p.id]: o.id }))}
                        className={`w-full text-left px-2 py-1.5 rounded border flex items-start gap-2 ${escolhas[p.id] === o.id
                          ? 'border-[#0F6E56] bg-[#0F6E56]/20 text-gray-100'
                          : o.recomendada ? 'border-emerald-600/60 bg-emerald-500/5 text-gray-100 hover:border-emerald-500' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}>
                        <span className="flex-1">{o.rotulo}</span>
                        {o.recomendada && <span className="badge shrink-0 bg-emerald-500/15 text-emerald-400">mais provável</span>}
                      </button>
                    ))}
                  </div>
                )}
                {plano?.ok && <span className="font-mono break-all">{plano.texto}</span>}
                {plano && !plano.ok && <><span className="text-gray-400">{p.descricao}</span><br />Sem ação: {plano.motivo}</>}
              </li>
            ))}
          </ul>
          {erro && <p className="text-sm text-red-400">{erro}</p>}
          <div className="flex items-center justify-end gap-2">
            {etapa && <span className="text-xs text-gray-500 mr-auto flex items-center gap-1"><Loader2 size={12} className="animate-spin" />{etapa}</span>}
            <button className="btn-secondary" onClick={onClose} disabled={executando}>Cancelar</button>
            <button className="btn-primary flex items-center gap-2" onClick={confirmar} disabled={executando || aplicaveis.length === 0}>
              {executando ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
              Confirmar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm bg-gray-800/60 rounded-lg p-3 text-gray-300">
            <span className="text-emerald-400 font-medium">{resultado.corrigidas} corrigida(s)</span>
            {resultado.varredura && (
              <>
                {' · '}<span className="text-amber-400 font-medium">{resultado.varredura.pendentes ?? '—'} ainda pendente(s)</span>
                {' · '}varredura: {resultado.varredura.resolvidas} resolvida(s), {resultado.varredura.novas} nova(s)
              </>
            )}
            {resultado.falhaVarredura && (
              <p className="text-amber-400 text-xs mt-1">A varredura automática não rodou ({resultado.falhaVarredura}). Use "Varrer agora".</p>
            )}
          </div>
          {resultado.linhas.map(r => (
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
