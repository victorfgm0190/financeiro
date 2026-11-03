import { useMemo, useState } from 'react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { parseValorBR } from '../../lib/valorBR'
import { r2 } from '../../lib/contratos/parcelas'
import { aluguelPendentes, REGRAS_ABATIMENTO, regraAbatimento } from '../../lib/contratos/creditos'
import { diferencaDoPagamento } from '../../lib/contratos/efetivacao'
import { rotuloPapel, rotulosContrato } from '../../lib/contratos/rotulos'
import { hojeStr } from '../../lib/contratos/datas'
import CampoValor from './CampoValor'

const Campo = ({ label, children }) => <div><label className="label">{label}</label>{children}</div>
const rotuloParcela = (contrato, s) => `${rotuloPapel(contrato, 'aluguel')} de ${fmtDate(s.startDate)} · ${fmt(s.amount)}`

// Seletor de parcela pendente (destino de crédito). '' = seguir a regra do contrato.
function SeletorDestino({ contrato, valor, onChange }) {
  const { schedules } = useApp()
  const pendentes = useMemo(() => aluguelPendentes(contrato, schedules), [contrato, schedules])
  return (
    <select className="input" value={valor} onChange={e => onChange(e.target.value)}>
      <option value="">Seguir a regra do contrato ({REGRAS_ABATIMENTO[regraAbatimento(contrato)].toLowerCase()})</option>
      {pendentes.map(s => <option key={s.id} value={s.id}>{rotuloParcela(contrato, s)}</option>)}
    </select>
  )
}

// "Novo crédito manual": valor a abater numa parcela futura, em qualquer modalidade.
export function CreditoManualModal({ contrato, onClose, onConcluido }) {
  const { criarCreditoManual } = useApp()
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hojeStr())
  const [destino, setDestino] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const v = parseValorBR(valor)
  const salvar = async () => {
    setSalvando(true)
    setErro('')
    try {
      await criarCreditoManual(contrato, { descricao: descricao.trim(), valor: v, data, destinoId: destino || null })
      onConcluido?.('Crédito criado.')
    } catch (err) { setErro(err?.message || 'Falha ao criar.'); setSalvando(false) }
  }
  return (
    <Modal open onClose={salvando ? () => {} : onClose} title="Novo crédito manual" size="md">
      <div className="space-y-3 text-sm">
        <p className="text-texto-2">Um valor a abater numa parcela pendente. Não gera lançamento: aparece na composição da parcela.</p>
        <Campo label="Descrição">
          <input className="input" value={descricao} onChange={e => setDescricao(e.target.value)} maxLength={200} placeholder="Motivo do crédito (ex.: reembolso de conserto)" />
        </Campo>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Valor"><CampoValor value={valor} onChange={setValor} placeholder="Valor a abater" /></Campo>
          <Campo label="Data do crédito"><input type="date" className="input" value={data} onChange={e => setData(e.target.value)} /></Campo>
        </div>
        <Campo label="Abater em"><SeletorDestino contrato={contrato} valor={destino} onChange={setDestino} /></Campo>
        {erro && <p className="text-xs text-perigo">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" disabled={salvando} onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={salvando || !(v > 0) || !descricao.trim() || !data} onClick={salvar}>Criar crédito</button>
        </div>
      </div>
    </Modal>
  )
}

// "Trocar parcela de destino" de um crédito aberto.
export function TrocarDestinoModal({ contrato, credito, onClose, onConcluido }) {
  const { trocarDestinoCredito } = useApp()
  const [destino, setDestino] = useState(credito.destino_agendamento_id || '')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const salvar = async () => {
    setSalvando(true)
    try {
      await trocarDestinoCredito(contrato, credito.id, destino || null)
      onConcluido?.('Destino do crédito alterado.')
    } catch (err) { setErro(err?.message || 'Falha ao alterar.'); setSalvando(false) }
  }
  return (
    <Modal open onClose={salvando ? () => {} : onClose} title="Trocar parcela de destino" size="md">
      <div className="space-y-3 text-sm">
        <p className="text-texto-2">{credito.descricao || 'Crédito'} · <strong className="text-texto-1">{fmt(credito.valor)}</strong>. Escolha em qual parcela pendente ele será abatido.</p>
        <SeletorDestino contrato={contrato} valor={destino} onChange={setDestino} />
        {erro && <p className="text-xs text-perigo">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" disabled={salvando} onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={salvando || destino === (credito.destino_agendamento_id || '')} onClick={salvar}>Salvar</button>
        </div>
      </div>
    </Modal>
  )
}

// "Justificar diferença" de parcela paga a menor (D4): ligar créditos abertos e/ou criar um crédito
// manual já compensado. Soma ≤ diferença; o resto continua "Diferença no pagamento". O valor do
// lançamento não muda.
export function JustificarDiferencaModal({ contrato, linha, onClose, onConcluido }) {
  const { creditosContratos, justificarDiferenca } = useApp()
  const tx = linha.tx
  const esperado = linha.meta?.valor_previsto ?? (linha.schedule ? r2(linha.schedule.composicao?.total ?? linha.schedule.amount) : null)
  const { previsto, diferenca } = diferencaDoPagamento(tx, esperado)
  const abertos = (creditosContratos || []).filter(c => c.contrato_id === contrato.id && c.status === 'aberto')
  const [ligar, setLigar] = useState([])
  const [desc, setDesc] = useState('')
  const [valorManual, setValorManual] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const vManual = parseValorBR(valorManual) || 0
  const soma = r2(abertos.filter(c => ligar.includes(c.id)).reduce((a, c) => a + Number(c.valor), 0) + vManual)
  const passa = soma > diferenca + 0.005
  const rot = rotulosContrato(contrato)
  const salvar = async () => {
    setSalvando(true)
    setErro('')
    try {
      await justificarDiferenca(contrato, tx, {
        ligar, esperado, parcelaId: linha.schedule?.id || null,
        manual: vManual > 0 ? { descricao: desc.trim() || 'Desconto praticado', valor: vManual } : null,
      })
      onConcluido?.('Diferença justificada.')
    } catch (err) { setErro(err?.message || 'Falha ao salvar.'); setSalvando(false) }
  }
  return (
    <Modal open onClose={salvando ? () => {} : onClose} title="Justificar diferença" size="md">
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-surface-2/60 text-xs">
          <div><p className="text-texto-3">Esperado</p><p className="text-texto-1">{fmt(previsto)}</p></div>
          <div><p className="text-texto-3">Pago em {fmtDate(tx.date)}</p><p className="text-texto-1">{fmt(tx.amount)}</p></div>
          <div><p className="text-texto-3">Diferença</p><p className="text-aviso font-semibold">{fmt(diferenca)}</p></div>
        </div>
        <div>
          <p className="label">Créditos abertos ({rot.abaCreditos.toLowerCase()})</p>
          {abertos.length === 0 ? <p className="text-xs text-texto-3">Nenhum crédito aberto.</p> : (
            <div className="space-y-1">
              {abertos.map(c => (
                <label key={c.id} className="flex items-center justify-between gap-2 text-xs bg-surface-2/60 rounded px-2 py-1.5">
                  <span className="flex items-center gap-2 min-w-0">
                    <input type="checkbox" className="accent-primary" checked={ligar.includes(c.id)}
                      onChange={e => setLigar(p => (e.target.checked ? [...p, c.id] : p.filter(x => x !== c.id)))} />
                    <span className="text-texto-2 truncate">{c.descricao || 'Crédito'} · {fmtDate(c.data_origem)}</span>
                  </span>
                  <span className="text-texto-1 whitespace-nowrap">{fmt(c.valor)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
          <Campo label="Crédito manual (opcional)">
            <input className="input" value={desc} onChange={e => setDesc(e.target.value)} maxLength={200} placeholder="Motivo do desconto já praticado" />
          </Campo>
          <Campo label="Valor"><CampoValor value={valorManual} onChange={setValorManual} placeholder="Valor do desconto" /></Campo>
        </div>
        <p className={`text-xs ${passa ? 'text-perigo' : 'text-texto-2'}`}>
          Justificado: <strong>{fmt(soma)}</strong> de {fmt(diferenca)}.{' '}
          {passa ? 'A soma passa da diferença.' : soma < diferenca ? `Sobra ${fmt(r2(diferenca - soma))} como "Diferença no pagamento".` : ''}
        </p>
        {erro && <p className="text-xs text-perigo">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" disabled={salvando} onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={salvando || !(soma > 0) || passa} onClick={salvar}>Salvar justificativa</button>
        </div>
      </div>
    </Modal>
  )
}
