import { useState } from 'react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { parseValorBR, valorParaInput } from '../../lib/valorBR'
import { r2 } from '../../lib/contratos/parcelas'

// "Confirmar reajuste" de uma parcela de aluguel: aceita a projeção ou o valor do boleto (aluguel
// contratual, sem bonificação). Pergunta se vale para as próximas parcelas do ciclo (P4).
export default function ConfirmarReajusteModal({ contrato, parcela, onClose, onConfirmado }) {
  const { confirmarReajusteContrato } = useApp()
  const projetado = r2(parcela?.composicao?.base ?? parcela?.amount)
  const [valor, setValor] = useState(valorParaInput(projetado))
  const [escopo, setEscopo] = useState('ciclo')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  if (!contrato || !parcela) return null
  const bonif = (parcela.composicao?.itens || []).filter(i => i.tipo === 'bonificacao').reduce((a, i) => a + Number(i.valor), 0)
  const confirmar = async () => {
    const v = parseValorBR(valor)
    if (!(v > 0)) return setErro('Informe um valor válido.')
    setSalvando(true)
    try {
      const r = await confirmarReajusteContrato(contrato, parcela.id, v, { escopo })
      onConfirmado?.(r)
      onClose()
    } catch (err) {
      setErro(err?.message || 'Falha ao confirmar.')
      setSalvando(false)
    }
  }
  return (
    <Modal open onClose={onClose} title="Confirmar reajuste" size="sm">
      <div className="space-y-3 text-sm">
        <p className="text-texto-2">
          Parcela de {fmtDate(parcela.startDate)} (ciclo {parcela.composicao?.ciclo ?? 0}). Projeção: <strong className="text-texto-1">{fmt(projetado)}</strong>
          {contrato.indice_reajuste !== 'FIXO' && contrato.indice_reajuste !== 'NENHUM' ? ` pelo ${contrato.indice_reajuste}` : ''}.
        </p>
        <div>
          <label className="label">Aluguel contratual reajustado (sem bonificação)</label>
          <input className="input" inputMode="decimal" value={valor} onChange={e => { setErro(''); setValor(e.target.value) }} autoFocus />
          {bonif !== 0 && <p className="text-[11px] text-texto-3 mt-1">Esta parcela ainda tem bonificação de {fmt(-bonif)}, descontada do total.</p>}
        </div>
        <fieldset className="space-y-1.5">
          <legend className="label">Aplicar às próximas parcelas do ciclo?</legend>
          <label className="flex items-center gap-2 text-texto-2"><input type="radio" className="accent-primary" checked={escopo === 'ciclo'} onChange={() => setEscopo('ciclo')} /> Sim — esta e as seguintes do ciclo (e reprojeta os próximos)</label>
          <label className="flex items-center gap-2 text-texto-2"><input type="radio" className="accent-primary" checked={escopo === 'so_esta'} onChange={() => setEscopo('so_esta')} /> Não — só esta parcela</label>
        </fieldset>
        {erro && <p className="text-xs text-perigo">{erro}</p>}
        <div className="flex gap-2 justify-end">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={salvando} onClick={confirmar}>Confirmar</button>
        </div>
      </div>
    </Modal>
  )
}
