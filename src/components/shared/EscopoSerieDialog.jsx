import { useState } from 'react'
import { Layers } from 'lucide-react'
import { ESCOPO, ROTULO_CAMPO } from '../../lib/camposSerie'

// Pergunta da regra única de séries, exibida no lugar do formulário (dentro do mesmo modal — um
// modal fixo aninhado ficaria recortado). Campos da SÉRIE (favorecido, tipo) não entram na
// pergunta: vão para todas as pendentes de qualquer jeito, e o texto avisa.
//
// variante 'ocorrencia' (agendamento recorrente — data/valor de UMA ocorrência): pergunta direta
// "Aplicar esta alteração às próximas ocorrências?" com dois botões. `conflitos` = ocorrências
// seguintes cuja exceção (do campo alterado) será descartada no "Sim" — avisadas antes.
// `continua` (série sem fim): não mostra a contagem de pendentes, que é só o teto da projeção.
export default function EscopoSerieDialog({ mudancas, nProximas, nPendentesSerie = 0, onConfirm, onCancel, variante, conflitos = [], continua = false }) {
  const [escopo, setEscopo] = useState(ESCOPO.PARCELA)
  const [motivo, setMotivo] = useState('')
  const parcela = mudancas.filter(m => !['payee', 'tipoDocumentoId'].includes(m.campo)).map(m => ROTULO_CAMPO[m.campo] || m.campo)
  const serie = mudancas.filter(m => ['payee', 'tipoDocumentoId'].includes(m.campo)).map(m => ROTULO_CAMPO[m.campo] || m.campo)
  const opcao = (valor, titulo, detalhe) => (
    <label className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${escopo === valor ? 'border-primary bg-primary/10' : 'border-borda-forte hover:border-borda-forte'}`}>
      <input type="radio" name="escopo-serie" className="mt-0.5 accent-primary" checked={escopo === valor} onChange={() => setEscopo(valor)} />
      <span>
        <span className="block text-sm text-texto-1">{titulo}</span>
        <span className="block text-xs text-texto-3 mt-0.5">{detalhe}</span>
      </span>
    </label>
  )
  const dataBR = (d) => String(d).split('-').reverse().join('/')
  if (variante === 'ocorrencia') {
    const confirmar = (esc) => onConfirm({ escopo: esc, motivo: motivo.trim() || null })
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <Layers size={16} className="text-primary-fg mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-texto-1">Aplicar esta alteração às próximas ocorrências?</p>
            <p className="text-xs text-texto-2 mt-0.5">
              Você alterou: <span className="text-texto-1">{parcela.join(', ')}</span>.{' '}
              {continua
                ? 'Vale para todas as próximas ocorrências pendentes.'
                : `Há ${nProximas} parcela${nProximas !== 1 ? 's' : ''} pendente${nProximas !== 1 ? 's' : ''} depois desta.`}
            </p>
          </div>
        </div>
        <ul className="text-xs text-texto-2 space-y-1 list-disc pl-5">
          <li><span className="text-texto-1">Sim</span>: vale para esta e todas as pendentes seguintes. Data: a série passa a vencer no novo dia (mês sem o dia → último dia do mês).</li>
          <li><span className="text-texto-1">Não</span>: só esta ocorrência muda; as demais ficam exatamente como estão.</li>
        </ul>
        {conflitos.length > 0 && (
          <p className="text-xs text-aviso bg-surface-2 border border-borda-forte rounded-lg px-3 py-2">
            ⚠ No "Sim", {conflitos.length === 1 ? 'a exceção' : `as ${conflitos.length} exceções`} já
            {conflitos.length === 1 ? ' existente' : ' existentes'} em {conflitos.map(c => dataBR(c.data)).join(', ')} {conflitos.length === 1 ? 'será descartada' : 'serão descartadas'}.
          </p>
        )}
        <p className="text-[11px] text-texto-3">Ocorrências já registradas/efetivadas nunca mudam.</p>
        <div>
          <label className="label">Motivo da alteração (opcional)</label>
          <input className="input" value={motivo} maxLength={200} onChange={e => setMotivo(e.target.value)} placeholder="Digite o motivo (opcional)" />
        </div>
        <div className="flex gap-2 justify-end flex-wrap">
          <button type="button" className="btn-secondary" onClick={onCancel}>Voltar</button>
          <button type="button" className="btn-secondary" onClick={() => confirmar(ESCOPO.PARCELA)}>Não, só a esta</button>
          <button type="button" className="btn-primary" onClick={() => confirmar(ESCOPO.PROXIMAS)}>Sim, a esta e às próximas</button>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Layers size={16} className="text-primary-fg mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-texto-1">Este item faz parte de uma série</p>
          <p className="text-xs text-texto-2 mt-0.5">
            Você alterou: <span className="text-texto-1">{parcela.join(', ')}</span>. Onde aplicar?
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {opcao(ESCOPO.PARCELA, 'Só esta parcela', 'As outras parcelas continuam como estão.')}
        {opcao(ESCOPO.PROXIMAS, 'Esta e as próximas pendentes', `Aplica nesta e em ${nProximas} parcela${nProximas !== 1 ? 's' : ''} pendente${nProximas !== 1 ? 's' : ''} seguinte${nProximas !== 1 ? 's' : ''}. Data desloca as próximas pelo mesmo número de dias.`)}
      </div>
      {serie.length > 0 && (
        <p className="text-xs text-texto-2 bg-surface-2 border border-borda-forte rounded-lg px-3 py-2">
          {serie.join(' e ')} {serie.length > 1 ? 'são campos' : 'é campo'} da série: {serie.length > 1 ? 'vão' : 'vai'} para todas as pendentes{nPendentesSerie ? ` (${nPendentesSerie})` : ''}, qualquer que seja a opção.
        </p>
      )}
      <p className="text-[11px] text-texto-3">Parcelas já pagas/efetivadas e lançamentos já gerados nunca mudam.</p>
      <div>
        <label className="label">Motivo da alteração (opcional)</label>
        <input className="input" value={motivo} maxLength={200} onChange={e => setMotivo(e.target.value)} placeholder="Digite o motivo (opcional)" />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn-secondary" onClick={onCancel}>Voltar</button>
        <button type="button" className="btn-primary" onClick={() => onConfirm({ escopo, motivo: motivo.trim() || null })}>Aplicar</button>
      </div>
    </div>
  )
}
