import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BadgeDollarSign, Loader2 } from 'lucide-react'
import Modal from '../shared/Modal'
import InputMoeda from '../shared/InputMoeda'
import CategorySelect from '../shared/CategorySelect'
import FavorecidoAutocomplete from '../shared/FavorecidoAutocomplete'
import HelpCampo from '../shared/HelpCampo'
import { fmt, fmtSinal } from '../shared/utils'
import { useApp } from '../../context/AppContext'
import { previaVendaCota, registrarEventoConsorcio } from '../../lib/bemApi'
import { agendamentosDoBem, avisoCustoAcimaDoSaldo, fotoDosAgendamentos, planoVendaDaCota } from '../../lib/consorcio'
import { isoLocal } from '../../lib/hoje'

// Venda real de uma cota. Quem calcula e grava é o servidor; o que muda nos agendamentos é do estado do app,
// que os ajusta e manda a foto de antes para o estorno.
function Linha({ rotulo, children, destaque }) {
  return (
    <p className={`flex justify-between gap-3 text-xs ${destaque ? 'font-semibold text-texto-1' : 'text-texto-2'}`}>
      <span>{rotulo}</span><span className="whitespace-nowrap">{children}</span>
    </p>
  )
}

export default function VenderCotaModal({ bemId, cota, cotas, onCancelar, onVendida }) {
  const { accounts, categories, schedules, payees, addPayee, addTransaction, updateAccount, updateSchedule, getNextOccurrences } = useApp()
  const contasCaixa = useMemo(() => (accounts || []).filter(a => !['asset', 'liability', 'credit', 'gerencial'].includes(a.type)), [accounts])
  const [f, setF] = useState({ data: isoLocal(new Date()), valor: '', conta: '', comprador: '', custos: '', custosCat: '', custoCota: '', observacao: '', categoriaResultado: '' })
  const [previa, setPrevia] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [limitou, setLimitou] = useState(false)
  const campo = (k) => (e) => setF(p => ({ ...p, [k]: e?.target ? e.target.value : e }))
  // O campo não passa do saldo do bem: o servidor recusa o que passar.
  const mudarCusto = (e) => {
    const saldo = previa?.saldo_bem
    const passou = saldo != null && Number(e.target.value) > saldo
    setLimitou(passou)
    setF(p => ({ ...p, custoCota: passou ? String(saldo) : e.target.value }))
  }

  useEffect(() => {
    let vivo = true
    const t = setTimeout(() => {
      previaVendaCota({ bem_id: bemId, cota_numero: cota.numero, data: f.data, valor: f.valor || 0, custos_valor: f.custos || 0, custo_cota: f.custoCota === '' ? null : f.custoCota, conta_destino_id: f.conta || null })
        .then(r => { if (vivo) { setPrevia(r); setErro('') } })
        .catch(e => { if (vivo) setErro(e?.dados?.error || e.message) })
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [bemId, cota.numero, f.data, f.valor, f.custos, f.custoCota, f.conta])

  const doBem = useMemo(() => agendamentosDoBem(schedules, bemId), [schedules, bemId])
  const plano = useMemo(
    () => planoVendaDaCota(doBem, cotas, cota.numero, f.data, s => getNextOccurrences?.(s, 400) || []),
    [doBem, cotas, cota.numero, f.data, getNextOccurrences],
  )
  const resultado = previa?.resultado ?? 0
  const categoriaDoBem = resultado > 0 ? previa?.categorias?.ganho : previa?.categorias?.perda
  const faltaCategoria = resultado !== 0 && !categoriaDoBem && !f.categoriaResultado
  const avisoCusto = limitou ? avisoCustoAcimaDoSaldo(previa?.saldo_bem) : previa?.aviso_custo
  const pronto = f.data && Number(f.valor) > 0 && f.conta && !(Number(f.custos) > 0 && !f.custosCat) && !faltaCategoria && previa

  const confirmar = async () => {
    setEnviando(true)
    setErro('')
    try {
      const afetados = doBem.filter(s => plano.some(p => p.id === s.id))
      const r = await registrarEventoConsorcio({
        bem_id: bemId, tipo: 'vender_cota', data: f.data, agendamentos: fotoDosAgendamentos(afetados),
        dados: {
          cota_numero: cota.numero, valor: f.valor, conta_destino_id: f.conta, comprador: f.comprador, custos_valor: f.custos || 0, custos_categoria_id: f.custosCat || null,
          custo_cota: f.custoCota === '' || previa?.ultima ? null : f.custoCota, observacao: f.observacao, categoria_resultado_id: f.categoriaResultado || null,
        },
      })
      const ef = r.efeitos || {}
      for (const l of ef.lancamentos || []) addTransaction(l)
      if (ef.saldo != null) updateAccount(bemId, { balance: ef.saldo })
      if (ef.conta) updateAccount(bemId, ef.conta)
      for (const p of plano) updateSchedule(p.id, p.mudancas)
      if (f.comprador.trim() && !(payees || []).includes(f.comprador.trim())) addPayee?.(f.comprador.trim())
      onVendida()
    } catch (e) {
      setErro(e?.dados?.error || e.message)
      setEnviando(false)
    }
  }

  return (
    <Modal open onClose={onCancelar} title={`Vender cota ${cota.numero}`}>
      <div className="space-y-3 text-sm" data-testid="vender-cota" data-help-form="vendaCota">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="label" data-help-id="vendaCota.data">Data da venda<HelpCampo campo="vendaCota.data" /><input type="date" className="input mt-1" value={f.data} onChange={campo('data')} /></label>
          <label className="label" data-help-id="vendaCota.valor">Valor recebido<HelpCampo campo="vendaCota.valor" /><InputMoeda className="input mt-1" value={f.valor} onChange={campo('valor')} /></label>
          <label className="label" data-help-id="vendaCota.conta">Conta onde o dinheiro entrou<HelpCampo campo="vendaCota.conta" />
            <select className="input mt-1" value={f.conta} onChange={campo('conta')}>
              <option value="">Escolha…</option>
              {contasCaixa.map(c => <option key={c.id} value={c.id}>{c.apelido || c.name}</option>)}
            </select>
          </label>
          <div className="label" data-help-id="vendaCota.comprador">Comprador<HelpCampo campo="vendaCota.comprador" />
            <FavorecidoAutocomplete value={f.comprador} onChange={v => setF(p => ({ ...p, comprador: v?.target ? v.target.value : v }))} suggestions={payees || []} />
          </div>
          <label className="label" data-help-id="vendaCota.custos">Custos da venda (opcional)<HelpCampo campo="vendaCota.custos" /><InputMoeda className="input mt-1" value={f.custos} onChange={campo('custos')} /></label>
          {Number(f.custos) > 0 && (
            <label className="label" data-help-id="vendaCota.custosCategoria">Categoria dos custos<HelpCampo campo="vendaCota.custosCategoria" />
              <CategorySelect categories={categories} type="expense" value={f.custosCat} onChange={campo('custosCat')} className="input mt-1" />
            </label>
          )}
          {!previa?.ultima && (
            <label className="label" data-help-id="vendaCota.custoCota">Custo da cota<HelpCampo campo="vendaCota.custoCota" />
              <InputMoeda className="input mt-1" value={f.custoCota === '' ? (previa?.custo ?? '') : f.custoCota} max={previa?.saldo_bem} onChange={mudarCusto} />
              <span className="block text-[11px] text-texto-3 mt-0.5 font-normal">Estimado: pago próprio, por terceiro, abertura e créditos atribuídos à cota. Corrija se souber o valor exato.</span>
              {avisoCusto && <span className="block text-[11px] text-aviso mt-0.5 font-normal" role="status" data-testid="cota-aviso-custo">{avisoCusto}</span>}
            </label>
          )}
        </div>
        <label className="label block" data-help-id="vendaCota.observacao">Observação<HelpCampo campo="vendaCota.observacao" /><input className="input mt-1" placeholder="Anotação sobre a venda (opcional)" value={f.observacao} onChange={campo('observacao')} /></label>

        {previa && (
          <div className="rounded-lg bg-surface-2/40 p-3 space-y-0.5" data-testid="cota-previa">
            <Linha rotulo="Valor recebido">{fmt(Number(f.valor) || 0)}</Linha>
            {Number(f.custos) > 0 && <Linha rotulo="Custos da venda">{fmtSinal(-Number(f.custos))}</Linha>}
            <Linha rotulo={previa.ultima ? 'Custo: saldo restante do bem' : 'Custo da cota'}>{fmtSinal(-previa.custo)}</Linha>
            {previa.ultima && <Linha rotulo="Diferença em relação à estimativa">{fmtSinal(previa.diferenca_estimativa)}</Linha>}
            <Linha rotulo={resultado >= 0 ? 'Ganho na venda' : 'Perda na venda'} destaque>{fmt(Math.abs(resultado))}</Linha>
            {previa.funcao && <p className="text-[11px] text-texto-3 pt-1">O valor entra na função {previa.funcao.nome}, vinculada ao consórcio.</p>}
          </div>
        )}

        <div className="rounded-lg border border-borda p-3 space-y-1" data-testid="cota-agendamentos">
          <p className="text-xs font-semibold text-texto-1">O que muda nos agendamentos</p>
          {plano.length === 0 && <p className="text-xs text-texto-3">Nenhum agendamento pendente ligado a este consórcio.</p>}
          {plano.map(p => (
            <p key={p.id} className="text-xs text-texto-2">
              {p.descricao}: {p.acao === 'encerrar' ? 'encerrado' : `${fmt(p.de)} → ${fmt(p.para)} a partir de ${p.aPartirDe.slice(5, 7)}/${p.aPartirDe.slice(0, 4)}`}
            </p>
          ))}
        </div>

        {previa?.aviso_isencao && (
          <p className="rounded-lg border border-aviso/40 bg-aviso/10 p-2 text-xs text-texto-1 flex gap-2" role="status" data-testid="cota-aviso-isencao">
            <AlertTriangle size={14} className="text-aviso shrink-0 mt-0.5" /><span>{previa.aviso_isencao}</span>
          </p>
        )}
        {resultado !== 0 && !categoriaDoBem && (
          <label className="label block" data-help-id="vendaCota.categoriaResultado">Categoria de {resultado > 0 ? 'ganho' : 'perda'} (o bem não tem uma definida)<HelpCampo campo="vendaCota.categoriaResultado" />
            <CategorySelect categories={categories} type={resultado > 0 ? 'income' : 'expense'} value={f.categoriaResultado} onChange={campo('categoriaResultado')} className="input mt-1" />
          </label>
        )}
        {erro && <p className="text-xs text-perigo" role="alert">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={enviando} onClick={onCancelar}>Cancelar</button>
          <button type="button" className="btn-primary flex items-center gap-1.5" disabled={enviando || !pronto} onClick={confirmar}>
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <BadgeDollarSign size={14} />} Confirmar venda
          </button>
        </div>
      </div>
    </Modal>
  )
}
