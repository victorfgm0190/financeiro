import { useCallback, useEffect, useState } from 'react'
import { Sparkles, ChevronRight, Trash2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import Modal from '../shared/Modal'
import Toast from '../shared/Toast'
import { fmt, fmtDate } from '../shared/utils'
import { listarPreLancamentos, concluirPreLancamento, EVENTO_PRE_LANCAMENTOS } from '../../lib/assistenteApi'
import { ferramentaDoPre } from '../../lib/assistente'
import PreviaAssistente from './PreviaAssistente'

// Início (mobile e Painel do desktop): "X pré-lançamentos para revisar" → lista com Efetivar (abre a
// prévia; salvar baixa o pré-lançamento) e Descartar. Pré-lançamento não entra em saldo nenhum.
export default function AvisoPreLancamentos({ onToast }) {
  const { pode, accounts } = useApp()
  const habilitado = pode('lancamentos', 'incluir')
  const [itens, setItens] = useState([])
  const [aberto, setAberto] = useState(false)
  const [efetivando, setEfetivando] = useState(null)
  const [erro, setErro] = useState('')
  const [toast, setToast] = useState(null)

  const carregar = useCallback(() => {
    if (!habilitado) return
    listarPreLancamentos().then(l => { setItens(l); setErro('') }).catch(() => { /* sem internet: o aviso some */ })
  }, [habilitado])
  useEffect(() => {
    carregar()
    window.addEventListener(EVENTO_PRE_LANCAMENTOS, carregar)
    return () => window.removeEventListener(EVENTO_PRE_LANCAMENTOS, carregar)
  }, [carregar])

  if (!habilitado || (!itens.length && !aberto && !toast)) return toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null
  const nomeConta = (id) => { const a = accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : 'conta a escolher' }
  const descartar = (id) => concluirPreLancamento(id, 'descartado').catch(e => setErro(e.message))
  const avisar = onToast || setToast

  return (
    <>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      {itens.length > 0 && <button type="button" onClick={() => setAberto(true)}
        className="w-full flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 min-h-[48px] text-left text-sm text-texto-1">
        <Sparkles size={16} className="shrink-0 text-primary-fg" />
        <span className="flex-1">{itens.length} pré-lançamento{itens.length !== 1 ? 's' : ''} para revisar</span>
        <ChevronRight size={16} className="text-texto-3" />
      </button>}

      <Modal open={aberto && !efetivando} onClose={() => setAberto(false)} title="Pré-lançamentos do assistente">
        <div className="space-y-2">
          <p className="text-xs text-texto-3">Sugestões fechadas sem confirmar. Não afetam saldos, faturas nem relatórios até você efetivar.</p>
          {erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}
          <ul className="divide-y divide-borda rounded-lg border border-borda">
            {itens.map(i => {
              const p = i.payload || {}
              const agend = ferramentaDoPre(i) === 'criar_agendamento'
              return (
                <li key={i.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm text-texto-1">{p.descricao || i.texto_original || 'Sem descrição'}</p>
                    <p className="text-[11px] text-texto-3">
                      {agend ? 'Agendamento' : 'Lançamento'} · {p.valor > 0 ? fmt(p.valor) : 'sem valor'} · {fmtDate(agend ? (p.vencimento || p.data) : p.data)} · {nomeConta(p.conta_id)}
                    </p>
                  </div>
                  <button type="button" className="btn-primary text-xs px-3 min-h-[36px]" onClick={() => setEfetivando(i)}>Efetivar</button>
                  <button type="button" aria-label="Descartar" title="Descartar" className="p-2 rounded text-texto-3 hover:text-perigo" onClick={() => descartar(i.id)}>
                    <Trash2 size={14} />
                  </button>
                </li>
              )
            })}
            {!itens.length && <li className="px-3 py-4 text-center text-xs text-texto-3">Nada para revisar.</li>}
          </ul>
        </div>
      </Modal>

      <Modal open={!!efetivando} onClose={() => setEfetivando(null)} title="Efetivar pré-lançamento" size="lg">
        {efetivando && (
          <PreviaAssistente
            ferramenta={ferramentaDoPre(efetivando)}
            sugestao={efetivando.payload || {}}
            textoOriginal={efetivando.texto_original || ''}
            preId={efetivando.id}
            onClose={() => setEfetivando(null)}
            onToast={avisar}
          />
        )}
      </Modal>
    </>
  )
}
