import { useState } from 'react'
import { FileSignature, Pencil, Undo2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'
import { r2, rotuloContrato, textoProjecao } from '../../lib/contratos/parcelas'
import ComposicaoBoletoModal from './ComposicaoBoletoModal'

const ROTULO_RESP = { inquilino: 'meu', proprietario: 'dono' }

// Card "Composição" de um lançamento de contrato (base, bonificação, créditos, itens do boleto,
// total) + link para a ficha. Editável no lançamento pago: condomínio pela tela da composição;
// aluguel devolvendo um crédito (volta a aberto e vai para o próximo aluguel).
export default function ComposicaoCard({ txId, onValorAlterado }) {
  const { transactions, contratoPorId, abrirFichaContrato, editarComposicaoLancamento, contratosHabilitado, pode } = useApp()
  const [editar, setEditar] = useState(false)
  const [aviso, setAviso] = useState('')
  const tx = transactions.find(t => t.id === txId)
  if (!contratosHabilitado || !tx?.contratoId) return null
  const contrato = contratoPorId(tx.contratoId)
  const c = tx.composicao
  const podeEditar = pode('contratos', 'editar') && pode('lancamentos', 'editar')

  const salvar = async (composicao) => {
    const r = await editarComposicaoLancamento(tx, composicao)
    setAviso(r.ok ? 'Composição atualizada.' : r.aviso)
    if (r.ok) onValorAlterado?.(r2(composicao.total))
    return r.ok
  }
  const devolverCredito = (creditoId) => {
    const itens = (c.itens || []).filter(i => i.credito_id !== creditoId)
    return salvar({ ...c, itens, total: r2(itens.reduce((a, i) => a + Number(i.valor), 0)) })
  }

  return (
    <div className="rounded-lg border border-borda-forte p-3 space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-texto-1 inline-flex items-center gap-1.5"><FileSignature size={13} /> Composição</p>
        <button type="button" className="text-primary-fg hover:underline" onClick={() => abrirFichaContrato(tx.contratoId)}>
          {contrato ? rotuloContrato(contrato) : 'Contrato'} — abrir a ficha
        </button>
      </div>
      {c?.estimada && <p className="text-aviso">⚠ Composição estimada — revisar (os itens do proprietário repetem o último boleto).</p>}
      {!c?.itens?.length ? <p className="text-texto-3">Sem composição gravada.</p> : (
        <ul className="space-y-0.5">
          {c.itens.map((i, k) => (
            <li key={k} className="flex justify-between gap-2">
              <span className="text-texto-2 min-w-0 truncate">
                {i.desc}{i.responsavel ? <span className="text-texto-3"> · {ROTULO_RESP[i.responsavel]}</span> : null}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className={Number(i.valor) < 0 ? 'text-receita' : 'text-texto-1'}>{fmt(i.valor)}</span>
                {podeEditar && i.credito_id && c.tipo !== 'condominio' && (
                  <button type="button" title="Devolver este crédito (não abater neste aluguel)" className="text-texto-3 hover:text-texto-1"
                    onClick={() => devolverCredito(i.credito_id)}><Undo2 size={12} /></button>
                )}
              </span>
            </li>
          ))}
          <li className="flex justify-between gap-2 border-t border-borda pt-1 font-semibold">
            <span className="text-texto-1">Total</span><span className="text-texto-1">{fmt(c.total ?? tx.amount)}</span>
          </li>
        </ul>
      )}
      {c?.projecao && <p className="text-texto-3">{textoProjecao(c.projecao)}</p>}
      {podeEditar && c?.tipo === 'condominio' && (
        <button type="button" className="btn-secondary text-xs py-1 inline-flex items-center gap-1" onClick={() => setEditar(true)}>
          <Pencil size={12} /> Editar composição
        </button>
      )}
      {aviso && <p className="text-aviso">{aviso}</p>}
      {editar && contrato && (
        <ComposicaoBoletoModal contrato={contrato} tx={tx} composicaoInicial={c} modo="edicao"
          onConfirmar={async ({ composicao }) => { if (await salvar(composicao)) setEditar(false) }}
          onClose={() => setEditar(false)} />
      )}
    </div>
  )
}
