import { useEffect, useMemo, useState } from 'react'
import { Loader2, Undo2, BadgeDollarSign, AlertTriangle } from 'lucide-react'
import Modal from '../shared/Modal'
import InputMoeda from '../shared/InputMoeda'
import CategorySelect from '../shared/CategorySelect'
import FavorecidoAutocomplete from '../shared/FavorecidoAutocomplete'
import HelpCampo from '../shared/HelpCampo'
import { fmt, fmtSinal, fmtDate } from '../shared/utils'
import { useApp } from '../../context/AppContext'
import { venderBem } from '../../lib/bemApi'
import { agendamentosDoBem, fotoDosAgendamentos, planoEncerrar } from '../../lib/consorcio'

// Venda simples do bem (consórcio vende a cota na aba Consórcio). Quem calcula e grava é o servidor;
// aqui ficam o formulário, a prévia e o espelho do resultado no estado do app.
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

function Linha({ rotulo, children, destaque }) {
  return (
    <p className={`flex justify-between gap-3 text-xs ${destaque ? 'font-semibold text-texto-1' : 'text-texto-2'}`}>
      <span>{rotulo}</span><span className="whitespace-nowrap">{children}</span>
    </p>
  )
}

export function VenderBemModal({ conta, onCancelar, onVendido }) {
  const { accounts, categories, schedules, payees, addPayee, addTransaction, updateAccount, updateSchedule, getNextOccurrences } = useApp()
  const contasCaixa = useMemo(() => (accounts || []).filter(a => !['asset', 'liability', 'credit', 'gerencial'].includes(a.type)), [accounts])
  const [f, setF] = useState({ data: hojeIso(), valor: '', conta: '', comprador: '', custos: '', custosCat: '', observacao: '', categoriaResultado: '' })
  const [quitar, setQuitar] = useState(true)
  const [valorQuitacao, setValorQuitacao] = useState('')
  const [previa, setPrevia] = useState(null)
  const [cancelar, setCancelar] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const campo = (k) => (e) => setF(p => ({ ...p, [k]: e?.target ? e.target.value : e }))

  useEffect(() => {
    let vivo = true
    const t = setTimeout(() => {
      venderBem(conta.id, { acao: 'previa', valor: f.valor || 0, custos_valor: f.custos || 0, quitar, valor_quitacao: valorQuitacao === '' ? null : valorQuitacao })
        .then(r => { if (vivo) setPrevia(r) })
        .catch(e => { if (vivo) setErro(e.message) })
    }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [conta.id, f.valor, f.custos, quitar, valorQuitacao])

  // Agendamentos futuros ligados ao bem: transferências para ele e as parcelas do financiamento.
  const futuros = useMemo(() => {
    const ligados = new Set(previa?.divida?.agendamentos || [])
    const lista = [...agendamentosDoBem(schedules, conta.id), ...(schedules || []).filter(s => ligados.has(s.id) && s.toAccountId !== conta.id)]
    return lista.filter(s => (getNextOccurrences?.(s, 1) || []).length > 0)
  }, [schedules, conta.id, previa, getNextOccurrences])
  const marcados = cancelar ?? new Set(futuros.map(s => s.id))
  const alternar = (id) => { const n = new Set(marcados); if (n.has(id)) n.delete(id); else n.add(id); setCancelar(n) }

  const divida = previa?.divida
  const resultado = previa?.resultado ?? 0
  const categoriaDoBem = resultado > 0 ? previa?.categorias?.ganho : previa?.categorias?.perda
  const faltaCategoria = resultado !== 0 && !categoriaDoBem && !f.categoriaResultado

  const confirmar = async () => {
    setEnviando(true)
    setErro('')
    try {
      const encerrar = futuros.filter(s => marcados.has(s.id))
      const r = await venderBem(conta.id, {
        acao: 'confirmar', data: f.data, valor: f.valor, conta_destino_id: f.conta, comprador: f.comprador, custos_valor: f.custos || 0,
        custos_categoria_id: f.custosCat || null, observacao: f.observacao, categoria_resultado_id: f.categoriaResultado || null,
        quitar: !!divida && quitar, valor_quitacao: valorQuitacao === '' ? null : valorQuitacao, agendamentos: fotoDosAgendamentos(encerrar),
      })
      const ef = r.efeitos || {}
      for (const l of ef.lancamentos || []) addTransaction(l)
      updateAccount(conta.id, { balance: ef.saldo, ...(ef.conta || {}) })
      if (ef.divida) updateAccount(ef.divida.id, { balance: ef.divida.saldo })
      for (const p of planoEncerrar(encerrar)) updateSchedule(p.id, p.mudancas)
      if (f.comprador.trim() && !(payees || []).includes(f.comprador.trim())) addPayee?.(f.comprador.trim())
      onVendido(r.venda)
    } catch (e) {
      setErro(e?.dados?.error || e.message)
      setEnviando(false)
    }
  }

  const pronto = f.data && Number(f.valor) > 0 && f.conta && !(Number(f.custos) > 0 && !f.custosCat) && !faltaCategoria && previa

  return (
    <Modal open onClose={onCancelar} title={`Vender ${conta.apelido || conta.name}`}>
      <div className="space-y-3 text-sm" data-testid="vender-bem" data-help-form="vendaBem">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="label" data-help-id="vendaBem.data">Data da venda<HelpCampo campo="vendaBem.data" /><input type="date" className="input mt-1" value={f.data} onChange={campo('data')} /></label>
          <label className="label" data-help-id="vendaBem.valor">Valor recebido<HelpCampo campo="vendaBem.valor" /><InputMoeda className="input mt-1" value={f.valor} onChange={campo('valor')} /></label>
          <label className="label" data-help-id="vendaBem.conta">Conta onde o dinheiro entrou<HelpCampo campo="vendaBem.conta" />
            <select className="input mt-1" value={f.conta} onChange={campo('conta')}>
              <option value="">Escolha…</option>
              {contasCaixa.map(c => <option key={c.id} value={c.id}>{c.apelido || c.name}</option>)}
            </select>
          </label>
          <div className="label" data-help-id="vendaBem.comprador">Comprador<HelpCampo campo="vendaBem.comprador" />
            <FavorecidoAutocomplete value={f.comprador} onChange={v => setF(p => ({ ...p, comprador: v?.target ? v.target.value : v }))} suggestions={payees || []} />
          </div>
          <label className="label" data-help-id="vendaBem.custos">Custos da venda (opcional)<HelpCampo campo="vendaBem.custos" /><InputMoeda className="input mt-1" value={f.custos} onChange={campo('custos')} /></label>
          {Number(f.custos) > 0 && (
            <label className="label" data-help-id="vendaBem.custosCategoria">Categoria dos custos<HelpCampo campo="vendaBem.custosCategoria" />
              <CategorySelect categories={categories} type="expense" value={f.custosCat} onChange={campo('custosCat')} className="input mt-1" />
            </label>
          )}
        </div>
        <label className="label block" data-help-id="vendaBem.observacao">Observação<HelpCampo campo="vendaBem.observacao" /><input className="input mt-1" placeholder="Anotação sobre a venda (opcional)" value={f.observacao} onChange={campo('observacao')} /></label>

        {divida && (
          <div className="rounded-lg border border-aviso/40 bg-aviso/5 p-3 space-y-2" data-testid="venda-divida">
            <p className="text-xs font-semibold text-texto-1">Este bem tem financiamento aberto: saldo devedor de {fmt(divida.saldo_devedor)} ({divida.parcelas_abertas} parcela{divida.parcelas_abertas === 1 ? '' : 's'}).</p>
            <label data-help-id="vendaBem.quitar" className="flex items-center gap-2 text-xs text-texto-1"><input type="checkbox" className="accent-primary" checked={quitar} onChange={e => setQuitar(e.target.checked)} /> Quitar com o dinheiro da venda<HelpCampo campo="vendaBem.quitar" /></label>
            {quitar
              ? <label className="label" data-help-id="vendaBem.valorQuitacao">Valor da quitação<HelpCampo campo="vendaBem.valorQuitacao" /><InputMoeda className="input mt-1" value={valorQuitacao === '' ? divida.saldo_devedor : valorQuitacao} onChange={e => setValorQuitacao(e.target.value)} /></label>
              : <p className="text-xs text-aviso flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" />A dívida continua aberta depois da venda, e as parcelas seguem a pagar.</p>}
          </div>
        )}

        {futuros.length > 0 && (
          <div className="rounded-lg border border-borda p-3 space-y-1" data-testid="venda-agendamentos" data-help-id="vendaBem.cancelarAgendamentos">
            <p className="text-xs font-semibold text-texto-1">Agendamentos futuros deste bem: marque os que devem ser cancelados.<HelpCampo campo="vendaBem.cancelarAgendamentos" /></p>
            {futuros.map(s => (
              <label key={s.id} className="flex items-center gap-2 text-xs text-texto-2">
                <input type="checkbox" className="accent-primary" checked={marcados.has(s.id)} onChange={() => alternar(s.id)} />
                {s.description || 'Agendamento'} · {fmt(s.amount)}
              </label>
            ))}
          </div>
        )}

        {previa && (
          <div className="rounded-lg bg-surface-2/40 p-3 space-y-0.5" data-testid="venda-previa">
            <Linha rotulo="Valor recebido">{fmt(Number(f.valor) || 0)}</Linha>
            {Number(f.custos) > 0 && <Linha rotulo="Custos da venda">{fmtSinal(-Number(f.custos))}</Linha>}
            <Linha rotulo="Saldo contábil do bem">{fmtSinal(-previa.saldo_contabil)}</Linha>
            {divida && quitar && <Linha rotulo="Quitação do financiamento">{fmtSinal(-Number(valorQuitacao === '' ? divida.saldo_devedor : valorQuitacao))}</Linha>}
            <Linha rotulo={resultado >= 0 ? 'Ganho na venda' : 'Perda na venda'} destaque>{fmt(Math.abs(resultado))}</Linha>
          </div>
        )}
        {resultado !== 0 && !categoriaDoBem && (
          <label className="label block" data-help-id="vendaBem.categoriaResultado">Categoria de {resultado > 0 ? 'ganho' : 'perda'} (o bem não tem uma definida)<HelpCampo campo="vendaBem.categoriaResultado" />
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

// Cartão da aba Informações: botão Vender, ou o resumo da venda com o estorno.
export default function VendaDoBem({ conta, bem, podeVender, podeEstornar, onMudou, avisar }) {
  const { deleteTransaction, updateAccount, updateSchedule } = useApp()
  const [abrir, setAbrir] = useState(false)
  const [venda, setVenda] = useState(null)
  const [estornando, setEstornando] = useState(false)
  const vendido = !!bem?.foi_vendido

  useEffect(() => {
    if (!vendido) return undefined
    let vivo = true
    venderBem(conta.id, { acao: 'consultar' }).then(r => { if (vivo) setVenda(r.venda || null) }).catch(() => {})
    return () => { vivo = false }
  }, [conta.id, vendido])

  const estornar = async () => {
    setEstornando(true)
    try {
      const r = await venderBem(conta.id, { acao: 'estornar' })
      const ef = r.efeitos || {}
      for (const id of ef.lancamentos || []) deleteTransaction(id)
      updateAccount(conta.id, { balance: ef.saldo, ...(ef.conta || {}) })
      if (ef.divida) updateAccount(ef.divida.id, { balance: ef.divida.saldo })
      for (const { id, ...campos } of ef.agendamentos || []) updateSchedule(id, campos)
      avisar?.('Venda estornada: o bem voltou ao estado anterior.')
      onMudou?.()
    } catch (e) {
      avisar?.(e?.dados?.error || e.message, 'error')
    } finally {
      setEstornando(false)
    }
  }

  if (vendido) {
    if (!venda) return null
    return (
      <div className="card space-y-1" data-testid="venda-resumo">
        <p className="text-sm font-semibold text-texto-1">Vendido em {fmtDate(venda.data)}</p>
        <Linha rotulo="Valor recebido">{fmt(venda.valor)}</Linha>
        {venda.comprador && <Linha rotulo="Comprador">{venda.comprador}</Linha>}
        {venda.custos_valor > 0 && <Linha rotulo="Custos da venda">{fmt(venda.custos_valor)}</Linha>}
        {venda.quitacao > 0 && <Linha rotulo="Quitação do financiamento">{fmt(venda.quitacao)}</Linha>}
        <Linha rotulo={venda.resultado >= 0 ? 'Ganho na venda' : 'Perda na venda'} destaque>{fmt(Math.abs(venda.resultado))}</Linha>
        {venda.divida_aberta > 0 && <p className="text-xs text-aviso flex gap-1.5 pt-1"><AlertTriangle size={13} className="shrink-0 mt-0.5" />Ficou dívida aberta de {fmt(venda.divida_aberta)} na venda.</p>}
        {podeEstornar && (
          <div className="flex justify-end pt-1">
            <button type="button" className="btn-secondary text-xs py-1 flex items-center gap-1.5" disabled={estornando} onClick={estornar}>
              {estornando ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />} Estornar venda
            </button>
          </div>
        )}
      </div>
    )
  }
  if (!podeVender) return null
  return (
    <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <p className="text-sm text-texto-2">Vendeu este bem por dinheiro, sem troca? O ganho ou a perda é calculado sozinho.</p>
      <button type="button" className="btn-secondary text-sm flex items-center gap-1.5 shrink-0" onClick={() => setAbrir(true)}><BadgeDollarSign size={14} /> Vender</button>
      {abrir && (
        <VenderBemModal
          conta={conta}
          onCancelar={() => setAbrir(false)}
          onVendido={() => { setAbrir(false); avisar?.('Venda registrada.'); onMudou?.() }}
        />
      )}
    </div>
  )
}
