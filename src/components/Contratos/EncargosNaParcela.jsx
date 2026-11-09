import { Plus, Trash2 } from 'lucide-react'
import { fmt } from '../shared/utils'
import { SINAIS, posicaoDoEncargo } from '../../lib/contratos/encargos'
import { encargoParaForm, formParaEncargo } from '../../lib/contratos/encargosForm'
import CampoValor from './CampoValor'
import HelpCampo from '../shared/HelpCampo'

// "Encargos e descontos na parcela" (Aditivo / editar → Valores e bonificação): seguro, taxas e
// descontos que entram no valor de cada parcela enquanto durarem. Não viram despesa separada — só
// aparecem na composição ("Seguro 3/36 +49,06"). Contrato já em andamento: "na próxima parcela
// pendente (nº N do contrato) este item está na parcela k de T".
export default function EncargosNaParcela({ linhas, onChange, proxima = 1 }) {
  const setL = (i, campos) => onChange(linhas.map((l, j) => (j === i ? { ...l, ...campos } : l)))
  return (
    <div className="space-y-2 sm:col-span-2" data-testid="encargos-na-parcela">
      <div className="flex items-center justify-between">
        <p className="label mb-0">Encargos e descontos na parcela</p>
        <button type="button" className="btn-secondary text-xs py-1 flex items-center gap-1"
          onClick={() => onChange([...linhas, { ...encargoParaForm({}), parcela_inicio: String(proxima) }])}>
          <Plus size={12} /> Encargo ou desconto
        </button>
      </div>
      {linhas.length > 0 && <p data-testid="legenda-encargos" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-texto-3"><span>Descrição<HelpCampo campo="encargoParcela.descricao" /></span><span>Encargo/desconto<HelpCampo campo="encargoParcela.sinal" /></span><span>Valor<HelpCampo campo="encargoParcela.valor" /></span><span>Dura<HelpCampo campo="encargoParcela.parcelas" /></span><span>Início<HelpCampo campo="encargoParcela.modoInicio" /></span></p>}
      {linhas.length === 0 && <p className="text-xs text-texto-3">Nenhum. Ex.: seguro incêndio em 36 parcelas, taxa de contrato, desconto combinado. Entram no valor da parcela (o pagamento continua uma linha só).</p>}
      {linhas.map((l, i) => {
        const e = formParaEncargo(l, proxima)
        const k = e ? posicaoDoEncargo(e, proxima) : null
        return (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_130px_120px_32px] gap-2 items-start p-2 rounded-lg bg-surface-2/60">
            <input autoComplete="off" className="input py-1.5 text-sm col-span-2 sm:col-span-1" data-help-id="encargoParcela.descricao" aria-label="Descrição do encargo ou desconto" placeholder="Descrição do encargo ou desconto" value={l.descricao} onChange={ev => setL(i, { descricao: ev.target.value })} />
            <select className="input py-1.5 text-sm" aria-label="Encargo ou desconto" data-help-id="encargoParcela.sinal" value={l.sinal} onChange={ev => setL(i, { sinal: ev.target.value })}>
              {Object.entries(SINAIS).map(([kk, v]) => <option key={kk} value={kk}>{v}</option>)}
            </select>
            <CampoValor className="input py-1.5 text-sm" helpId="encargoParcela.valor" aria-label="Valor por parcela" placeholder="Valor por parcela" value={l.valor} onChange={v => setL(i, { valor: v })} />
            <button type="button" className="p-1.5 text-texto-3 hover:text-perigo" title="Remover" onClick={() => onChange(linhas.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            <div className="col-span-2 sm:col-span-4 flex flex-wrap items-center gap-2 text-xs text-texto-2">
              <span>Dura</span>
              <input type="number" min="1" className="input py-1 px-2 text-xs w-20" aria-label="Número total de parcelas do item" data-help-id="encargoParcela.parcelas" placeholder="parcelas" value={l.parcelas_total} onChange={ev => setL(i, { parcelas_total: ev.target.value })} />
              <span>parcelas;</span>
              <select className="input py-1 text-xs w-auto" aria-label="Como informar o início" data-help-id="encargoParcela.modoInicio" value={l.modo} onChange={ev => setL(i, { modo: ev.target.value })}>
                <option value="inicio">começa na parcela nº do contrato</option>
                <option value="atual">na próxima parcela pendente (nº {proxima}) está na</option>
              </select>
              {l.modo === 'inicio'
                ? <input type="number" className="input py-1 px-2 text-xs w-20" aria-label="Parcela do contrato em que o item começa" data-help-id="encargoParcela.inicio" placeholder="nº" value={l.parcela_inicio} onChange={ev => setL(i, { parcela_inicio: ev.target.value })} />
                : <><input type="number" min="1" className="input py-1 px-2 text-xs w-20" aria-label="Parcela atual do item" data-help-id="encargoParcela.inicio" placeholder="nº" value={l.parcela_atual} onChange={ev => setL(i, { parcela_atual: ev.target.value })} /><span>de {l.parcelas_total || '…'}</span></>}
            </div>
            <p className="col-span-2 sm:col-span-4 text-[11px] text-texto-3">
              {!e ? 'Preencha descrição, valor, número de parcelas e o início.'
                : k < 1 ? `Começa na parcela ${e.parcela_inicio} do contrato.`
                  : k > e.parcelas_total ? 'Já terminou: não entra nas próximas parcelas.'
                    : `Na parcela ${proxima}: ${e.descricao} ${k}/${e.parcelas_total} ${e.sinal === 'desconto' ? '−' : '+'}${fmt(e.valor)}. Sai sozinho depois da ${e.parcelas_total}ª.`}
            </p>
          </div>
        )
      })}
    </div>
  )
}
