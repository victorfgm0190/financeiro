import { useMemo, useState } from 'react'
import { Link2, Search } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { r2 } from '../../lib/contratos/parcelas'
import { candidatosLancamento } from '../../lib/contratos/vinculo'
import { rotuloPapel } from '../../lib/contratos/rotulos'
import { fmtYm, addMesesData } from '../../lib/contratos/datas'

const MAX_LISTA = 60
const rotuloLinha = (contrato, l) =>
  `${rotuloPapel(contrato, l.papel)}${l.numero ? ` ${l.numero}${l.total ? `/${l.total}` : ''}` : ''} · ${fmtYm(l.competencia)} · venc. ${fmtDate(l.vencimento)}`

// Liga um pagamento JÁ LANÇADO a uma linha do contrato, sem criar nem alterar lançamento.
//   linha: a parcela (pendente ou "sem pagamento vinculado") → escolher o lançamento, ordenado por
//          favorecido semelhante, mesma categoria, mesmo valor e data mais próxima (com o motivo);
//   tx + linhasAbertas: "Associar a uma parcela" de um pagamento que está no contrato sem linha.
// Prévia antes de gravar: o que vai ser ligado e a diferença para o valor esperado.
export default function VincularPagamentoModal({ contrato, linha = null, tx = null, linhasAbertas = [], onClose, onConcluido }) {
  const { transactions, schedules, accounts, vincularLancamento, vincularLancamentoNaLinha } = useApp()
  const [texto, setTexto] = useState('')
  const [de, setDe] = useState(() => (linha ? addMesesData(linha.vencimento, -2) : ''))
  const [ate, setAte] = useState(() => (linha ? addMesesData(linha.vencimento, 2) : ''))
  const [txId, setTxId] = useState(tx?.id || '')
  const [linhaKey, setLinhaKey] = useState(linha?.key || '')
  const [revisar, setRevisar] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const contasDoPerfil = useMemo(() => new Set((accounts || [])
    .filter(a => a.type !== 'credit' && contrato.perfil_id && a.profileId === contrato.perfil_id).map(a => a.id)), [accounts, contrato.perfil_id])
  const candidatos = useMemo(() => (linha
    ? candidatosLancamento(contrato, transactions, schedules, linha, { contasDoPerfil, filtro: { texto, de, ate } }).slice(0, MAX_LISTA)
    : []), [linha, contrato, transactions, schedules, contasDoPerfil, texto, de, ate])

  const txEscolhido = tx || candidatos.find(c => c.tx.id === txId)?.tx || null
  const linhaEscolhida = linha || linhasAbertas.find(l => l.key === linhaKey) || null
  const diferenca = txEscolhido && linhaEscolhida ? r2(Number(txEscolhido.amount) - Number(linhaEscolhida.valor)) : 0

  const gravar = async () => {
    setSalvando(true)
    setErro('')
    try {
      await vincularLancamentoNaLinha(contrato, linhaEscolhida, txEscolhido, { vincular: vincularLancamento })
      onConcluido?.(`Pagamento de ${fmtDate(txEscolhido.date)} ligado a ${rotuloLinha(contrato, linhaEscolhida)}.`)
    } catch (err) {
      setErro(err?.message || 'Falha ao vincular.')
      setSalvando(false)
    }
  }

  return (
    <Modal open onClose={salvando ? () => {} : onClose} title={linha ? 'Vincular pagamento' : 'Associar a uma parcela'} size="lg">
      <div className="space-y-3 text-sm">
        {revisar ? (
          <div className="space-y-2">
            <p className="text-texto-2">Confira antes de gravar:</p>
            <div className="rounded-lg bg-surface-2/60 p-3 text-xs space-y-1">
              <p><span className="text-texto-3">Pagamento:</span> <span className="text-texto-1">{fmtDate(txEscolhido.date)} · {txEscolhido.payee || txEscolhido.description} · {fmt(txEscolhido.amount)}</span></p>
              <p><span className="text-texto-3">Parcela:</span> <span className="text-texto-1">{rotuloLinha(contrato, linhaEscolhida)} · esperado {fmt(linhaEscolhida.valor)}</span></p>
              {linhaEscolhida.semParcela && <p className="text-texto-2">Esta competência não tem parcela: ela é criada já paga com este lançamento.</p>}
              {Math.abs(diferenca) > 0.005 && (
                <p className="text-aviso">Diferença de {fmt(diferenca)}: fica na composição como "Diferença no pagamento" (o lançamento não muda).</p>
              )}
            </div>
          </div>
        ) : linha ? (
          <>
            <p className="text-texto-2">
              {rotuloLinha(contrato, linha)} · esperado <strong className="text-texto-1">{fmt(linha.valor)}</strong>.
              Escolha o lançamento já feito (mesma conta ou perfil, sem contrato e sem agendamento).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-texto-3" />
                <input className="input pl-8" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por favorecido, descrição ou valor" />
              </div>
              <input type="date" className="input" value={de} onChange={e => setDe(e.target.value)} aria-label="Pagamentos a partir de" />
              <input type="date" className="input" value={ate} onChange={e => setAte(e.target.value)} aria-label="Pagamentos até" />
            </div>
            <div className="max-h-[45vh] overflow-y-auto space-y-1">
              {candidatos.length === 0 && <p className="text-xs text-texto-3 py-3 text-center">Nenhum lançamento livre com esses filtros. Amplie o período ou limpe a busca.</p>}
              {candidatos.map(c => (
                <label key={c.tx.id} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 cursor-pointer ${txId === c.tx.id ? 'bg-primary/10 outline outline-1 outline-primary' : 'bg-surface-2/60 hover:bg-surface-hover'}`}>
                  <input type="radio" name="vinc-tx" className="accent-primary mt-1" checked={txId === c.tx.id} onChange={() => setTxId(c.tx.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex justify-between gap-2 text-xs">
                      <span className="text-texto-1 truncate">{fmtDate(c.tx.date)} · {c.tx.payee || '—'}</span>
                      <span className="text-texto-1 font-medium whitespace-nowrap">{fmt(c.tx.amount)}</span>
                    </span>
                    <span className="block text-[11px] text-texto-3 truncate">{c.tx.description}</span>
                    {c.motivos.length > 0 && <span className="block text-[11px] text-primary-fg">{c.motivos.join(' · ')}</span>}
                  </span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-texto-2">
              Pagamento de {fmtDate(tx.date)} · {tx.payee || tx.description} · <strong className="text-texto-1">{fmt(tx.amount)}</strong>. Escolha a parcela que ele pagou:
            </p>
            <div className="max-h-[45vh] overflow-y-auto space-y-1">
              {linhasAbertas.length === 0 && <p className="text-xs text-texto-3 py-3 text-center">Nenhuma parcela sem pagamento.</p>}
              {linhasAbertas.map(l => (
                <label key={l.key} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer text-xs ${linhaKey === l.key ? 'bg-primary/10 outline outline-1 outline-primary' : 'bg-surface-2/60 hover:bg-surface-hover'}`}>
                  <input type="radio" name="vinc-linha" className="accent-primary" checked={linhaKey === l.key} onChange={() => setLinhaKey(l.key)} />
                  <span className="flex-1 text-texto-1">{rotuloLinha(contrato, l)}{l.semParcela ? ' · sem pagamento vinculado' : ''}</span>
                  <span className="text-texto-2 whitespace-nowrap">{fmt(l.valor)}</span>
                </label>
              ))}
            </div>
          </>
        )}

        {erro && <p className="text-xs text-perigo">{erro}</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-borda">
          <button type="button" className="btn-secondary" disabled={salvando} onClick={revisar ? () => setRevisar(false) : onClose}>{revisar ? 'Voltar' : 'Cancelar'}</button>
          {revisar ? (
            <button type="button" className="btn-primary flex items-center gap-1.5" disabled={salvando} onClick={gravar}><Link2 size={14} /> Gravar vínculo</button>
          ) : (
            <button type="button" className="btn-primary" disabled={!txEscolhido || !linhaEscolhida} onClick={() => setRevisar(true)}>Revisar</button>
          )}
        </div>
      </div>
    </Modal>
  )
}
