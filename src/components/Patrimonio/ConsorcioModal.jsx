import { useState } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import InputMoeda from '../shared/InputMoeda'
import DateInput from '../shared/DateInput'
import { salvarConsorcio } from '../../lib/bemApi'
import HelpCampo from '../shared/HelpCampo'

const COTA_VAZIA = {
  numero: '', data_adesao: '', valor_carta: '', prazo_meses: '', percentual_parcela: '100', valor_parcela_cheia: '',
  saldo_devedor_informado: '', saldo_devedor_data: '', parcelas_pagas_informadas: '', valor_pago_informado: '',
  previsao_encerramento: '', data_ultima_parcela: '',
  abertura_parcelas: '', abertura_valor: '', abertura_data: '',
}
const paraForm = (c) => Object.fromEntries(Object.keys(COTA_VAZIA).map(k => [k, c?.[k] == null ? COTA_VAZIA[k] : String(c[k])]))

// Cadastro do consórcio. Serve também para converter um bem existente: só o tipo do bem muda, e as
// entradas e os vínculos continuam como estão. Várias cotas do mesmo grupo ficam no mesmo bem.
export default function ConsorcioModal({ bemId, consorcio, favorecidos = [], contas = [], onCancel, onSuccess, onErro }) {
  const [form, setForm] = useState({
    administradora: consorcio?.administradora || '',
    grupo: consorcio?.grupo || '',
    data_adesao: consorcio?.data_adesao || '',
    indice_reajuste: consorcio?.indice_reajuste || '',
    conta_origem_id: consorcio?.conta_origem_id || '',
    quitada: consorcio?.situacao === 'quitada',
  })
  const [cotas, setCotas] = useState(consorcio?.cotas?.length ? consorcio.cotas.map(paraForm) : [{ ...COTA_VAZIA }])
  const [salvando, setSalvando] = useState(false)

  const campo = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const campoCota = (i, k) => (e) => setCotas(l => l.map((c, n) => (n === i ? { ...c, [k]: e.target.value } : c)))
  // A data padrão só sugere: preenche as cotas ainda sem data e as novas, e cada cota pode ter a sua.
  const mudarAdesaoPadrao = (e) => {
    const data = e.target.value
    setForm(f => ({ ...f, data_adesao: data }))
    if (data) setCotas(l => l.map(c => (c.data_adesao ? c : { ...c, data_adesao: data })))
  }

  const enviar = async (e) => {
    e.preventDefault()
    setSalvando(true)
    try {
      const r = await salvarConsorcio({ bem_id: bemId, ...form, cotas })
      onSuccess(r)
    } catch (err) {
      onErro(err.message)
      setSalvando(false)
    }
  }

  // Favorecido sempre por dropdown; o valor já gravado continua na lista mesmo se saiu do cadastro.
  const opcoesAdm = [...new Set([form.administradora, ...favorecidos].filter(Boolean))]

  return (
    <form onSubmit={enviar} className="space-y-4" data-help-form="consorcio">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div data-help-id="consorcio.administradora">
          <label className="label">Administradora<HelpCampo campo="consorcio.administradora" /></label>
          <select className="input" value={form.administradora} onChange={campo('administradora')}>
            <option value="">Selecione o favorecido...</option>
            {opcoesAdm.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div data-help-id="consorcio.grupo">
          <label className="label">Grupo<HelpCampo campo="consorcio.grupo" /></label>
          <input className="input" value={form.grupo} onChange={campo('grupo')} placeholder="Número do grupo no contrato" />
        </div>
        <div data-help-id="consorcio.dataAdesao">
          <label className="label">Data de adesão padrão<HelpCampo campo="consorcio.dataAdesao" /></label>
          <DateInput className="input" value={form.data_adesao} onChange={mudarAdesaoPadrao} />
          <p className="text-xs text-texto-3 mt-1">Sugerida ao incluir uma cota. A data que vale é a de cada cota.</p>
        </div>
        <div data-help-id="consorcio.indiceReajuste">
          <label className="label">Índice de reajuste<HelpCampo campo="consorcio.indiceReajuste" /></label>
          <input className="input" value={form.indice_reajuste} onChange={campo('indice_reajuste')} placeholder="Índice de reajuste previsto no contrato" />
        </div>
        <div className="sm:col-span-2" data-help-id="consorcio.contaOrigem">
          <label className="label">Conta ou reserva de onde sai o pagamento<HelpCampo campo="consorcio.contaOrigem" /></label>
          <select className="input" value={form.conta_origem_id} onChange={campo('conta_origem_id')}>
            <option value="">Selecione a conta...</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.apelido || c.name}</option>)}
          </select>
        </div>
      </div>

      {cotas.map((c, i) => (
        <div key={i} className="rounded-lg border border-borda p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-texto-2">Cota {i + 1}</p>
            {cotas.length > 1 && (
              <button type="button" className="text-xs text-texto-3 hover:text-despesa flex items-center gap-1" onClick={() => setCotas(l => l.filter((_, n) => n !== i))}>
                <Trash2 size={12} /> Remover
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div data-help-id="consorcio.cotaNumero">
              <label className="label">Número da cota *<HelpCampo campo="consorcio.cotaNumero" /></label>
              <input className="input" required value={c.numero} onChange={campoCota(i, 'numero')} placeholder="Número da cota no contrato" />
            </div>
            <div data-help-id="consorcio.cotaAdesao">
              <label className="label" htmlFor={`adesao-cota-${i}`}>Data de adesão da cota<HelpCampo campo="consorcio.cotaAdesao" /></label>
              <DateInput id={`adesao-cota-${i}`} className="input" value={c.data_adesao} onChange={campoCota(i, 'data_adesao')} />
            </div>
            <div data-help-id="consorcio.cotaCarta">
              <label className="label">Valor da carta de crédito (R$) *<HelpCampo campo="consorcio.cotaCarta" /></label>
              <InputMoeda required value={c.valor_carta} onChange={campoCota(i, 'valor_carta')} placeholder="Crédito contratado nesta cota" />
            </div>
            <div data-help-id="consorcio.cotaPrazo">
              <label className="label">Prazo (meses)<HelpCampo campo="consorcio.cotaPrazo" /></label>
              <input className="input" type="number" min="1" value={c.prazo_meses} onChange={campoCota(i, 'prazo_meses')} placeholder="Total de meses do grupo" />
            </div>
            <div data-help-id="consorcio.cotaPercentual">
              <label className="label">% da parcela paga *<HelpCampo campo="consorcio.cotaPercentual" /></label>
              <input className="input" type="number" min="1" max="100" step="0.01" required value={c.percentual_parcela} onChange={campoCota(i, 'percentual_parcela')} placeholder="Percentual da parcela cheia que você paga" />
            </div>
            <div data-help-id="consorcio.cotaParcelaCheia">
              <label className="label">Valor da parcela cheia (R$)<HelpCampo campo="consorcio.cotaParcelaCheia" /></label>
              <InputMoeda value={c.valor_parcela_cheia} onChange={campoCota(i, 'valor_parcela_cheia')} placeholder="Parcela a 100%, antes do desconto" />
            </div>
            <div data-help-id="consorcio.cotaSaldoDevedor">
              <label className="label">Saldo devedor informado (R$)<HelpCampo campo="consorcio.cotaSaldoDevedor" /></label>
              <InputMoeda value={c.saldo_devedor_informado} onChange={campoCota(i, 'saldo_devedor_informado')} placeholder="Como consta no extrato da administradora" />
            </div>
            <div data-help-id="consorcio.cotaSaldoData">
              <label className="label">Data da informação do saldo<HelpCampo campo="consorcio.cotaSaldoData" /></label>
              <DateInput className="input" value={c.saldo_devedor_data} onChange={campoCota(i, 'saldo_devedor_data')} />
            </div>
            <div data-help-id="consorcio.cotaParcelasPagas">
              <label className="label">Parcelas pagas informadas<HelpCampo campo="consorcio.cotaParcelasPagas" /></label>
              <input className="input" type="number" min="0" value={c.parcelas_pagas_informadas} onChange={campoCota(i, 'parcelas_pagas_informadas')} placeholder="Quantas a administradora mostra pagas" />
            </div>
            <div data-help-id="consorcio.cotaEncerramento">
              <label className="label" htmlFor={`encerramento-cota-${i}`}>Previsão de encerramento<HelpCampo campo="consorcio.cotaEncerramento" /></label>
              <DateInput id={`encerramento-cota-${i}`} className="input" value={c.previsao_encerramento} onChange={campoCota(i, 'previsao_encerramento')} />
              <p className="text-xs text-texto-3 mt-1">Conforme o contrato. Em branco, o Finup estima por adesão + prazo.</p>
            </div>
            <div data-help-id="consorcio.cotaUltimaParcela">
              <label className="label" htmlFor={`ultima-parcela-cota-${i}`}>Data da última parcela<HelpCampo campo="consorcio.cotaUltimaParcela" /></label>
              <DateInput id={`ultima-parcela-cota-${i}`} className="input" value={c.data_ultima_parcela} onChange={campoCota(i, 'data_ultima_parcela')} />
            </div>
            <div data-help-id="consorcio.cotaValorPago">
              <label className="label">Valores pagos informados (R$)<HelpCampo campo="consorcio.cotaValorPago" /></label>
              <InputMoeda value={c.valor_pago_informado} onChange={campoCota(i, 'valor_pago_informado')} placeholder="Total pago nesta cota, segundo o extrato" />
            </div>
            <div data-help-id="consorcio.cotaAberturaParcelas">
              <label className="label" htmlFor={`abertura-parcelas-${i}`}>Parcelas já pagas antes do Finup<HelpCampo campo="consorcio.cotaAberturaParcelas" /></label>
              <input id={`abertura-parcelas-${i}`} className="input" type="number" min="1" step="1" value={c.abertura_parcelas} onChange={campoCota(i, 'abertura_parcelas')} placeholder="Quantidade paga antes de usar o Finup" />
            </div>
            <div data-help-id="consorcio.cotaAberturaValor">
              <label className="label" htmlFor={`abertura-valor-${i}`}>Valor total pago até então (R$)<HelpCampo campo="consorcio.cotaAberturaValor" /></label>
              <InputMoeda id={`abertura-valor-${i}`} value={c.abertura_valor} onChange={campoCota(i, 'abertura_valor')} placeholder="Soma no bem, sem lançamento em conta" />
            </div>
            <div data-help-id="consorcio.cotaAberturaData">
              <label className="label" htmlFor={`abertura-data-${i}`}>Data de referência<HelpCampo campo="consorcio.cotaAberturaData" /></label>
              <DateInput id={`abertura-data-${i}`} className="input" value={c.abertura_data} onChange={campoCota(i, 'abertura_data')} />
            </div>
          </div>
        </div>
      ))}

      <button type="button" className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5" onClick={() => setCotas(l => [...l, { ...COTA_VAZIA, data_adesao: form.data_adesao }])}>
        <Plus size={13} /> Adicionar outra cota do grupo
      </button>

      <label data-help-id="consorcio.quitado" className="flex items-center gap-2 text-sm text-texto-2 cursor-pointer">
        <input type="checkbox" className="accent-primary" checked={form.quitada} onChange={e => setForm(f => ({ ...f, quitada: e.target.checked }))} />
        Consórcio quitado<HelpCampo campo="consorcio.quitado" />
      </label>

      <div className="flex gap-3">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={salvando}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={salvando}>
          {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
        </button>
      </div>
    </form>
  )
}
