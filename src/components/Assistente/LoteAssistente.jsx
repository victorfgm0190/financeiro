import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, Pencil, X, CheckCircle2, ListChecks, Save, AlertTriangle, Loader2, Send } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { tipoPreLancamento } from '../../lib/assistente'
import { papelDaContaApp } from '../../lib/assistente/contas'
import { sugestaoComConta, pendenciasDoItem, lancamentoDireto, rotuloTipo } from '../../lib/assistente/loteApp'
import { controleGerencialAtivo } from '../../lib/controleGerencial'
import { listarPreLancamentos, guardarPreLancamento, interpretar } from '../../lib/assistenteApi'
import EscolherConta from './EscolherConta'
import PreviaAssistente from './PreviaAssistente'

// Assistente IA — VÁRIOS lançamentos num pedido (src/lib/assistente/lote.js): lista com um item por
// movimento (checkbox, editar = a prévia normal, remover).
//   • Sem conta citada: "Em qual conta? Vale para todos" UMA vez; trocável por item.
//   • Revisar um a um: as prévias normais em sequência ("1 de 3").
//   • Salvar selecionados: grava direto SÓ os itens sem pendência (loteApp.pendenciasDoItem); os
//     outros ficam marcados e exigem a revisão individual.
//   • Fechar sem salvar: cada item ainda aberto vira pré-lançamento (como na prévia de 1 item).
//   • `faltantes` ({ lidos, total, trecho }): a IA não leu tudo (resposta cortada ou mais de 10).
//     Aviso no topo; com o trecho recortado com certeza, "Enviar o restante" manda só ele (um uso
//     normal no limite diário) e os itens novos entram nesta mesma lista.
const LOTE_DE = new Set(['registrar_lancamento', 'criar_agendamento'])
export default function LoteAssistente({ itens: itensIniciais, faltantes = null, textoOriginal, onClose, onToast, onNovo }) {
  const {
    accounts, activeProfileId, transactions, schedules, getNextOccurrences, categories, gerencialGroups, settings,
    addTransaction, payees, addPayee,
  } = useApp()
  // status: 'aberto' | 'salvo' | 'mesmo' (já existia) | 'removido'
  const [itens, setItens] = useState(() => itensIniciais.map((it, i) => ({ ...it, i, sel: true, status: 'aberto', conta: '' })))
  const [contaGeral, setContaGeral] = useState('')
  const [pres, setPres] = useState([])
  const [aberto, setAberto] = useState(null) // { fila: [i...], pos }
  const [falta, setFalta] = useState(faltantes)
  const [lendoResto, setLendoResto] = useState(false)
  const [erroResto, setErroResto] = useState('')
  useEffect(() => {
    let vivo = true
    listarPreLancamentos().then(l => { if (vivo) setPres(l) }).catch(() => {})
    return () => { vivo = false }
  }, [])

  const mudar = (i, patch) => setItens(prev => prev.map(it => (it.i === i ? { ...it, ...patch } : it)))
  const sugestaoDe = (it) => sugestaoComConta(it.parametros, it.conta || (it.parametros.pergunta_cartao ? '' : contaGeral))
  const ctx = useMemo(() => ({
    accounts, transactions, preLancamentos: pres, schedules, getNextOccurrences, categories, gerencialGroups,
    gerencialLigado: controleGerencialAtivo(settings),
  }), [accounts, transactions, pres, schedules, getNextOccurrences, categories, gerencialGroups, settings])
  const linhas = itens.map(it => ({ ...it, sugestao: sugestaoDe(it), pend: it.status === 'aberto' ? pendenciasDoItem({ ferramenta: it.ferramenta, sugestao: sugestaoDe(it) }, ctx) : [] }))
  const abertos = linhas.filter(l => l.status === 'aberto')
  const semConta = abertos.some(l => l.ferramenta === 'registrar_lancamento' && !l.parametros.conta_id && !l.parametros.pergunta_cartao)

  // Fechar sem salvar: os itens ainda abertos viram pré-lançamentos (depois do desmonte; o timer
  // sobrevive ao mount/unmount de teste do StrictMode, como em usePreLancamentoAoFechar).
  const atuais = useRef({ linhas, textoOriginal, onToast })
  useEffect(() => { atuais.current = { linhas, textoOriginal, onToast } })
  const timer = useRef(null)
  useEffect(() => {
    clearTimeout(timer.current)
    return () => {
      timer.current = setTimeout(() => {
        const { linhas: ls, textoOriginal: txt, onToast: toast } = atuais.current
        const resto = ls.filter(l => l.status === 'aberto')
        if (!resto.length) return
        Promise.all(resto.map(l => guardarPreLancamento(tipoPreLancamento(l.ferramenta), { ...l.sugestao, ferramenta: l.ferramenta }, txt)))
          .then(() => toast?.(`${resto.length} ${resto.length > 1 ? 'itens guardados' : 'item guardado'} em pré-lançamentos para revisar depois.`))
          .catch(err => toast?.(`Não consegui guardar os pré-lançamentos: ${err.message}`))
      }, 0)
    }
  }, [])

  const salvarSelecionados = () => {
    const prontos = linhas.filter(l => l.status === 'aberto' && l.sel && !l.pend.length)
    for (const l of prontos) {
      const tx = lancamentoDireto(l.sugestao, { accounts, gerencialGroups, gerencialLigado: ctx.gerencialLigado })
      if (tx.payee && !payees.includes(tx.payee)) addPayee(tx.payee)
      addTransaction(tx)
      mudar(l.i, { status: 'salvo' })
    }
    const faltam = linhas.filter(l => l.status === 'aberto' && l.sel && l.pend.length).length
    onToast?.(`${prontos.length} ${prontos.length === 1 ? 'lançamento salvo' : 'lançamentos salvos'}${faltam ? `; ${faltam} para revisar um a um` : ''}.`)
  }
  const revisar = (fila) => fila.length && setAberto({ fila, pos: 0 })

  const enviarResto = async () => {
    setLendoResto(true)
    setErroResto('')
    try {
      const r = await interpretar({ texto: falta.trecho, perfilAtivo: activeProfileId || undefined })
      const novos = r.ferramenta === 'lote' ? (r.itens || []) : LOTE_DE.has(r.ferramenta) ? [{ ferramenta: r.ferramenta, parametros: r.parametros }] : []
      if (!novos.length) { setErroResto('Não consegui ler o restante. Envie esse trecho num pedido novo.'); return }
      setItens(prev => [...prev, ...novos.map((it, k) => ({ ...it, i: prev.length + k, sel: true, status: 'aberto', conta: '' }))])
      // Contagem do restante somada à do pedido original.
      const f = r.ferramenta === 'lote' ? r.faltantes : null
      setFalta(f ? { ...f, lidos: falta.lidos + f.lidos, total: f.total ? falta.lidos + f.total : null } : null)
    } catch (err) {
      setErroResto(err.message)
    } finally {
      setLendoResto(false)
    }
  }

  // ── Prévia normal de um item (editar ou "revisar um a um") ──
  if (aberto) {
    const i = aberto.fila[aberto.pos]
    const l = linhas.find(x => x.i === i)
    const proximo = () => setAberto(a => (a.pos + 1 < a.fila.length ? { ...a, pos: a.pos + 1 } : null))
    const desfecho = (d) => mudar(i, { status: d === 'descartado' ? 'removido' : d === 'mesmo' ? 'mesmo' : 'salvo' })
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-xs text-texto-2">
          <span className="font-medium">{aberto.fila.length > 1 ? `${aberto.pos + 1} de ${aberto.fila.length}` : `Item ${i + 1} de ${linhas.length}`}</span>
          <button type="button" className="text-primary-fg hover:text-texto-1 min-h-[32px]" onClick={() => setAberto(null)}>Voltar à lista</button>
        </div>
        <PreviaAssistente key={`${i}-${aberto.pos}`} ferramenta={l.ferramenta} sugestao={l.sugestao} textoOriginal={textoOriginal}
          guardarAoFechar={false} onConcluido={desfecho} onClose={proximo} onToast={onToast} />
      </div>
    )
  }

  const nome = (id) => { const a = accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : null }
  const nomeCat = (id) => categories.find(c => c.id === id)?.name || null
  const contasTroca = accounts.filter(a => a.active !== false && papelDaContaApp(a) !== 'gerencial')
    .sort((a, b) => (a.apelido || a.name).localeCompare(b.apelido || b.name, 'pt-BR'))
  const selAbertos = abertos.filter(l => l.sel)
  const prontos = selAbertos.filter(l => !l.pend.length)

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-texto-1">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-primary-fg" />
        <div className="flex-1 min-w-0">
          <p className="font-medium">{linhas.length} lançamentos encontrados. Nada foi salvo ainda.</p>
          {textoOriginal && <p className="mt-0.5 whitespace-pre-wrap break-words text-texto-3">“{textoOriginal}”</p>}
        </div>
      </div>

      {falta && (
        <div className="rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2 text-xs text-texto-1 space-y-1.5" role="status">
          <p className="flex items-start gap-1.5 font-medium">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-aviso" />
            {falta.total ? `Li ${falta.lidos} de ${falta.total} movimentos.` : `Li ${falta.lidos} movimentos; a resposta parou antes do fim do texto.`}
          </p>
          {falta.trecho ? (
            <>
              <p className="text-texto-2">Os que faltaram:</p>
              <p className="whitespace-pre-wrap break-words rounded border border-borda bg-surface-2/60 px-2 py-1 text-texto-2">{falta.trecho}</p>
              <button type="button" className="btn-secondary w-full inline-flex items-center justify-center gap-1.5 min-h-[40px]" disabled={lendoResto} onClick={enviarResto}>
                {lendoResto
                  ? <><Loader2 size={14} className="animate-spin" /> {falta.total ? `Lendo ${falta.total - falta.lidos} movimentos…` : 'Lendo…'}</>
                  : <><Send size={14} /> Enviar o restante</>}
              </button>
            </>
          ) : (
            <p className="text-texto-2">Não deu para separar com certeza o trecho que faltou: confira o texto e envie o que ficou de fora num pedido novo.</p>
          )}
          {erroResto && <p className="text-perigo">{erroResto}</p>}
        </div>
      )}

      {semConta && !contaGeral && (
        <EscolherConta accounts={accounts} activeProfileId={activeProfileId} onEscolher={setContaGeral}
          titulo="Em qual conta? Vale para todos (dá para trocar em cada item)." />
      )}

      <ul className="divide-y divide-borda rounded-lg border border-borda">
        {linhas.map(l => {
          const p = l.sugestao
          const fechado = l.status !== 'aberto'
          const valor = p.moeda && p.moeda !== 'BRL' && p.valor_original ? `US$ ${Number(p.valor_original).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : p.valor ? fmt(p.valor) : '—'
          return (
            <li key={l.i} className={`px-3 py-2 ${fechado ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1 w-4 h-4 accent-primary shrink-0" aria-label={`Selecionar item ${l.i + 1}`}
                  checked={l.sel && !fechado} disabled={fechado} onChange={e => mudar(l.i, { sel: e.target.checked })} />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-texto-1">
                    <span className={p.tipo === 'receita' ? 'text-receita' : p.tipo === 'transferencia' ? 'text-transferencia' : 'text-despesa'}>{rotuloTipo(p, l.ferramenta)}</span>
                    <span className="font-semibold tabular-nums">{valor}</span>
                    <span className="truncate">{p.descricao || p.favorecido_novo || nomeCat(p.categoria_id) || ''}</span>
                  </p>
                  <p className="text-[11px] text-texto-3 break-words">
                    {nomeCat(p.categoria_id) || 'sem categoria'} · {fmtDate(p.data || p.vencimento)} ·{' '}
                    {fechado ? (nome(p.conta_id) || 'sem conta') : (
                      <select className="bg-transparent border-b border-borda-campo text-texto-2 text-[11px] max-w-[11rem]" aria-label={`Conta do item ${l.i + 1}`}
                        value={p.conta_id || ''} onChange={e => mudar(l.i, { conta: e.target.value })}>
                        <option value="">Em qual conta?</option>
                        {contasTroca.map(a => <option key={a.id} value={a.id}>{a.apelido || a.name}</option>)}
                      </select>
                    )}
                  </p>
                  {l.status === 'salvo' && <p className="text-[11px] text-receita flex items-center gap-1"><CheckCircle2 size={12} /> Salvo</p>}
                  {l.status === 'mesmo' && <p className="text-[11px] text-texto-3">Já estava lançado — nada salvo.</p>}
                  {l.status === 'removido' && <p className="text-[11px] text-texto-3">Removido.</p>}
                  {l.pend.length > 0 && (
                    <p className="flex flex-wrap gap-1">
                      {l.pend.map(m => <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-aviso/15 text-aviso">revisar: {m}</span>)}
                    </p>
                  )}
                </div>
                {!fechado && (
                  <div className="flex shrink-0 items-center">
                    <button type="button" title="Editar (prévia completa)" aria-label={`Editar item ${l.i + 1}`} onClick={() => revisar([l.i])}
                      className="p-2 min-h-[36px] text-texto-2 hover:text-texto-1"><Pencil size={14} /></button>
                    <button type="button" title="Remover (não salva nem guarda)" aria-label={`Remover item ${l.i + 1}`} onClick={() => mudar(l.i, { status: 'removido' })}
                      className="p-2 min-h-[36px] text-texto-2 hover:text-perigo"><X size={14} /></button>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {abertos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px]"
            disabled={!selAbertos.length} onClick={() => revisar(selAbertos.map(l => l.i))}>
            <ListChecks size={15} /> Revisar um a um
          </button>
          <button type="button" className="btn-primary flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px]"
            disabled={!prontos.length} onClick={salvarSelecionados}
            title={selAbertos.length > prontos.length ? 'Os itens marcados "revisar" só se salvam um a um' : undefined}>
            <Save size={15} /> Salvar selecionados{prontos.length ? ` (${prontos.length})` : ''}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary flex-1 min-h-[44px]" onClick={onNovo}>Novo pedido</button>
          <button type="button" className="btn-primary flex-1 min-h-[44px]" onClick={onClose}>Fechar</button>
        </div>
      )}
    </div>
  )
}
