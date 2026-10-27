import { useState } from 'react'
import Modal from '../shared/Modal'
import DateInput from '../shared/DateInput'
import { fmt, fmtDate } from '../shared/utils'
import { opcoesAplicarData } from '../../lib/fluxoCaixaDatas'

// Mudar a data de um evento futuro. Duas opções:
//  • "Só simular" (padrão): data provisória — de agendamento fica gravada em
//    fluxo_datas_provisorias (a mesma do relatório); de envelope/lançamento, só nesta tela;
//  • "Gravar no agendamento": altera o agendamento real (mesmas regras do "Aplicar data" do
//    relatório — fatura/gerencial bloqueados; recorrente escolhe "só esta" ou "esta e as próximas").
// onSimular(nova) / onGravar(nova, modo) lançam o erro, mostrado aqui.
export default function MudarDataModal({ linha, schedule, primeiraPendente, onSimular, onGravar, onClose }) {
  const dataReal = linha._dataOriginal || linha.date
  const [nova, setNova] = useState(linha.date)
  const [destino, setDestino] = useState('simular')
  const op = schedule && nova ? opcoesAplicarData(schedule, linha._origDate, nova, primeiraPendente) : null
  const [modo, setModo] = useState(op?.once ? 'unica' : 'ocorrencia')
  const modoEfetivo = op?.once ? 'unica' : (modo === 'serie' && !op?.serie?.ok ? 'ocorrencia' : modo)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const podeGravar = !!schedule && !op?.bloqueio
  const confirmar = async () => {
    if (!nova) { setErro('Informe a nova data.'); return }
    setErro('')
    setSalvando(true)
    try {
      if (destino === 'gravar') await onGravar(nova, modoEfetivo)
      else await onSimular(nova)
      onClose()
    } catch (err) {
      setErro(err?.message || 'Falha ao mudar a data.')
      setSalvando(false)
    }
  }

  const radio = (checked, onChange, disabled, titulo, desc) => (
    <label className={`flex items-start gap-2 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <input type="radio" className="mt-0.5 accent-primary" checked={checked} disabled={disabled} onChange={onChange} />
      <span className="text-sm text-texto-1">{titulo}<span className="block text-xs text-texto-3">{desc}</span></span>
    </label>
  )

  return (
    <Modal open onClose={onClose} title="Mudar data">
      <div className="space-y-4">
        <div className="text-sm">
          <p className="text-texto-1 font-medium">{linha.description}</p>
          <p className="text-texto-2">{fmt(linha.saida || linha.entrada)}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-texto-3 line-through">{fmtDate(dataReal)}</span>
          <span className="text-texto-3">→</span>
          <DateInput className="input w-auto" value={nova} onChange={e => setNova(e.target.value)} hoje />
        </div>

        <div className="space-y-2">
          {radio(destino === 'simular', () => setDestino('simular'), false, 'Só simular nesta tela',
            linha._scheduleId
              ? 'Data provisória: muda o fluxo (aqui e no relatório Fluxo de Caixa), não o agendamento.'
              : 'Muda só o fluxo desta tela; volta ao recarregar.')}
          {radio(destino === 'gravar', () => setDestino('gravar'), !podeGravar, 'Gravar no agendamento',
            !schedule ? 'Este evento não é um agendamento.' : op?.bloqueio || 'Atualiza o agendamento real.')}
        </div>

        {destino === 'gravar' && podeGravar && (
          op.once ? (
            <p className="text-xs text-texto-2">Agendamento <span className="text-texto-1">Única</span>: a data dele passa a ser {fmtDate(nova)}.</p>
          ) : (
            <div className="space-y-2 pl-5">
              {radio(modoEfetivo === 'ocorrencia', () => setModo('ocorrencia'), false, 'Só esta ocorrência', 'Exceção desta ocorrência; a série não muda.')}
              {radio(modoEfetivo === 'serie', () => setModo('serie'), !op.serie.ok, 'Esta e as próximas (move a série)',
                op.serie.ok ? 'A série passa a partir desta nova data.' : op.serie.motivo)}
              {modoEfetivo === 'serie' && op.avisos.map((a, i) => <p key={i} className="text-xs p-2 rounded bg-aviso/10 text-aviso">{a}</p>)}
            </div>
          )
        )}

        {erro && <p className="text-xs text-perigo">{erro}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" className="btn-secondary flex-1" disabled={salvando} onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary flex-1" disabled={salvando || !nova} onClick={confirmar}>{salvando ? 'Gravando...' : 'Confirmar'}</button>
        </div>
      </div>
    </Modal>
  )
}
