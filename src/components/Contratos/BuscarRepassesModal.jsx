import { useMemo, useState } from 'react'
import { Link2, Loader2 } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { fmtYm, hojeStr } from '../../lib/contratos/datas'
import { buscarRepassesLancados, TEXTO_NAO_ENCONTRADO, JANELA_DIAS } from '../../lib/contratos/buscaRepasses'

const PULAR = ''

// BUSCAR REPASSES JÁ LANÇADOS (Etapa 6): para cada competência com repasse ainda sem baixa, o
// lançamento provável que já está na conta do contrato. O usuário confirma, troca ou pula cada um —
// nada é ligado sem o clique em "Vincular". O lançamento não muda; o agendamento da competência é
// baixado por ele. Valor diferente do calculado: a pergunta do ajuste de sempre, depois.
//   linhas: as da TabelaRepasse (competenciasDoRepasse com `paga`).
export default function BuscarRepassesModal({ contrato, linhas, onClose }) {
  const { schedules, transactions, pode, vincularRepasseLancado, vincularLancamento, desvincularLancamento } = useApp()
  const podeEditar = pode('contratos', 'editar')
  const hoje = hojeStr()
  // A lista é a do momento em que a tela abriu (vincular tira o lançamento dos candidatos).
  const [busca] = useState(() => buscarRepassesLancados(contrato, linhas, schedules, transactions, { hoje }))
  const [escolha, setEscolha] = useState(() => Object.fromEntries(busca.map(b => [b.competencia, b.sugestao || PULAR])))
  const [resultado, setResultado] = useState({})
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState('')

  const escolhidos = busca.filter(b => escolha[b.competencia] && !resultado[b.competencia]?.ok)
  const repetido = useMemo(() => {
    const vistos = new Set()
    for (const b of escolhidos) {
      if (vistos.has(escolha[b.competencia])) return b.competencia
      vistos.add(escolha[b.competencia])
    }
    return null
  }, [escolhidos, escolha])
  const encontrados = busca.filter(b => b.candidatos.length)

  const vincular = async () => {
    if (repetido) return setErro(`O mesmo lançamento foi escolhido em duas competências (${fmtYm(repetido)}). Troque ou pule uma delas.`)
    setGravando(true)
    setErro('')
    for (const b of escolhidos) {
      try {
        await vincularRepasseLancado(contrato, b.competencia, escolha[b.competencia], { vincular: vincularLancamento, desvincular: desvincularLancamento })
        setResultado(r => ({ ...r, [b.competencia]: { ok: true } }))
      } catch (e) {
        setResultado(r => ({ ...r, [b.competencia]: { ok: false, erro: e?.message || 'Falha ao vincular.' } }))
      }
    }
    setGravando(false)
  }

  const feitos = Object.values(resultado).filter(r => r.ok).length
  return (
    <Modal open onClose={gravando ? () => {} : onClose} title={`Repasses já lançados — ${contrato.favorecido || 'administradora'}`} size="lg">
      <div className="space-y-3 text-sm">
        <p className="text-xs text-texto-2">
          Recebimentos que já estão na conta do contrato, sem contrato, com favorecido parecido com a administradora, valor
          igual ao repasse (até ±5%) e data a até {JANELA_DIAS} dias do repasse. Confira cada sugestão: troque o lançamento
          ou pule. O lançamento não muda (valor, data, categoria e conta ficam); o repasse da competência é baixado por ele.
        </p>
        {busca.length === 0 && <p className="text-xs text-texto-3 py-3 text-center">Nenhuma competência com repasse em aberto.</p>}
        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {busca.map(b => {
            const r = resultado[b.competencia]
            return (
              <div key={b.competencia} data-testid="busca-repasse" className="rounded-lg bg-surface-2/60 p-2 space-y-1">
                <div className="flex flex-wrap justify-between gap-2 text-xs">
                  <span className="text-texto-1 font-medium">{fmtYm(b.competencia)} · repasse {fmt(b.valor)}{b.conferida ? ' (conferido)' : ''}</span>
                  <span className="text-texto-3">dia do repasse {fmtDate(b.vencimento)}</span>
                </div>
                {r?.ok ? (
                  <p className="text-xs text-receita">Vinculado.</p>
                ) : b.candidatos.length === 0 ? (
                  // Dia do repasse ainda não chegou: só previsto (não é "não encontrado").
                  b.vencimento > hoje
                    ? <p className="text-xs text-texto-2">Previsto</p>
                    : <p className="text-xs text-aviso">{TEXTO_NAO_ENCONTRADO}</p>
                ) : (
                  <select className="input py-1 text-xs" value={escolha[b.competencia]} disabled={gravando || !podeEditar}
                    aria-label={`Lançamento para ${fmtYm(b.competencia)}`} onChange={e => setEscolha(x => ({ ...x, [b.competencia]: e.target.value }))}>
                    {b.candidatos.map(c => (
                      <option key={c.tx.id} value={c.tx.id}>
                        {fmtDate(c.tx.date)} · {c.tx.payee || c.tx.description} · {fmt(c.tx.amount)} — {c.motivos.join(', ')}
                      </option>
                    ))}
                    <option value={PULAR}>Pular (não vincular agora)</option>
                  </select>
                )}
                {r && !r.ok && <p role="alert" className="text-xs text-perigo">{r.erro}</p>}
              </div>
            )
          })}
        </div>
        {erro && <p role="alert" className="text-xs text-perigo">{erro}</p>}
        {feitos > 0 && <p className="text-xs text-receita">{feitos} repasse(s) vinculado(s). Valor diferente do calculado: o Finup pergunta do ajuste.</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-borda">
          <button type="button" className="btn-secondary" disabled={gravando} onClick={onClose}>{feitos ? 'Fechar' : 'Cancelar'}</button>
          {podeEditar && encontrados.length > 0 && (
            <button type="button" className="btn-primary flex items-center gap-1.5" disabled={gravando || !escolhidos.length} onClick={vincular}>
              {gravando ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Vincular {escolhidos.length ? `(${escolhidos.length})` : ''}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
