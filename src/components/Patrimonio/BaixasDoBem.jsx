import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import ConfirmDialog from '../shared/ConfirmDialog'
import { estornarBaixaBem } from '../../lib/bemApi'
import { espelharEstorno } from '../../lib/baixaSemMovimento'
import { SELO_BAIXA } from '../../lib/extratoBem'

// Baixas sem movimento em conta do bem, com o selo do motivo e o estorno: a parcela volta a pendente.
export default function BaixasDoBem({ baixas = [], onMudou }) {
  const { pode, schedules, updateSchedule, updateAccount, deleteTransaction } = useApp()
  const podeEditar = pode?.('patrimonio', 'editar')
  const [estornando, setEstornando] = useState(null)
  const [erro, setErro] = useState('')

  const confirmar = async () => {
    setErro('')
    try {
      const { efeitos } = await estornarBaixaBem(estornando.id)
      espelharEstorno(efeitos, {
        deleteTransaction, updateSchedule, schedules, atualizarSaldo: (id, saldo) => updateAccount(id, { balance: saldo }),
      })
      setEstornando(null)
      await onMudou?.(efeitos)
    } catch (e) {
      setEstornando(null)
      setErro(e.message)
    }
  }

  if (baixas.length === 0) return null
  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-texto-2 mb-3">Baixas sem movimento em conta</h3>
      {erro && <p className="text-sm text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2 mb-2">{erro}</p>}
      <div className="space-y-2">
        {baixas.map(b => (
          <div key={b.id} className="flex items-center justify-between gap-3 border-b border-borda/60 last:border-0 pb-2">
            <div className="min-w-0">
              <p className="text-sm text-texto-1">
                {SELO_BAIXA[b.tipo]} · {fmt(b.valor)}
                {b.quantidade_parcelas > 1 && <span className="text-texto-3"> · {b.quantidade_parcelas} parcelas</span>}
              </p>
              <p className="text-xs text-texto-3 truncate">
                {[fmtDate(b.data), b.cota_numero && `Cota ${b.cota_numero}`, b.favorecido, b.descricao, b.lancamento_id && 'com receita no Demonstrativo'].filter(Boolean).join(' · ')}
              </p>
            </div>
            {podeEditar && (
              <button type="button" className="btn-secondary text-xs py-1 px-2 flex items-center gap-1 shrink-0" onClick={() => setEstornando(b)}>
                <RotateCcw size={12} /> Estornar
              </button>
            )}
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!estornando}
        onClose={() => setEstornando(null)}
        onConfirm={confirmar}
        danger
        title="Estornar esta baixa?"
        confirmLabel="Estornar"
        message={`A parcela volta a pendente e ${estornando ? fmt(estornando.valor) : ''} sai do bem.${estornando?.lancamento_id ? ' A receita de benefício também é apagada.' : ''}`}
      />
    </div>
  )
}
