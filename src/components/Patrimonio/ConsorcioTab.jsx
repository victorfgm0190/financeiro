import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, RotateCcw, Trophy, TrendingUp, HandCoins, Car, Pencil } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import Modal from '../shared/Modal'
import InputMoeda from '../shared/InputMoeda'
import DateInput from '../shared/DateInput'
import { getExtratoBens, registrarEventoConsorcio, estornarEventoConsorcio } from '../../lib/bemApi'
import { extratoDoBem, resumoDoBem } from '../../lib/extratoBem'
import { espelharRegistro } from '../../lib/baixaSemMovimento'
import MarcarPagaModal from './MarcarPagaModal'
import BaixasDoBem from './BaixasDoBem'
import {
  agendamentosDoBem, batimento, encerramentoDaCota, fotoDosAgendamentos, parcelaDaCota, parcelasFinupPorCota, planoEncerrar, planoNovaParcela, prazoDaCota, rotuloSituacao, totaisDasCotas,
} from '../../lib/consorcio'
import { isoLocal } from '../../lib/hoje'

const ROTULO_EVENTO = { contemplar: 'Contemplação', reajuste: 'Reajuste', vender: 'Venda', usar_carta: 'Uso da carta' }

function descricaoEvento(ev) {
  const d = ev.dados || {}
  if (ev.tipo === 'vender') return `Recebido ${fmt(d.valor)} · ${d.ganho >= 0 ? 'ganho' : 'perda'} de ${fmt(Math.abs(d.ganho || 0))}`
  if (ev.tipo === 'usar_carta') return `Bem comprado por ${fmt(d.valor_bem)}`
  return `Nova parcela: ${fmt(d.nova_parcela)}`
}

function FormEvento({ tipo, contas, onCancel, onConfirmar }) {
  const [data, setData] = useState(isoLocal(new Date()))
  const [valor, setValor] = useState('')
  const [contaId, setContaId] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const enviar = async (e) => {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    try {
      await onConfirmar({ data, valor: Number(valor), contaId })
    } catch (err) {
      setErro(err.message)
      setSalvando(false)
    }
  }
  const rotulo = tipo === 'vender' ? 'Valor recebido (R$)' : tipo === 'usar_carta' ? 'Valor do bem comprado (R$)' : 'Nova parcela por cota (R$)'
  const dica = tipo === 'vender' ? 'Quanto entrou na conta pela venda' : tipo === 'usar_carta' ? 'Valor do bem comprado com a carta' : 'Valor mensal de cada cota a partir da data'
  return (
    <form onSubmit={enviar} className="space-y-3">
      <div>
        <label className="label">{tipo === 'reajuste' ? 'Vale a partir de' : 'Data'}</label>
        <DateInput className="input" required value={data} onChange={e => setData(e.target.value)} />
      </div>
      <div>
        <label className="label">{rotulo} *</label>
        <InputMoeda required value={valor} onChange={e => setValor(e.target.value)} placeholder={dica} autoFocus />
      </div>
      {tipo === 'vender' && (
        <div>
          <label className="label">Conta que recebeu *</label>
          <select className="input" required value={contaId} onChange={e => setContaId(e.target.value)}>
            <option value="">Selecione a conta...</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.apelido || c.name}</option>)}
          </select>
          <p className="text-xs text-texto-3 mt-1">
            O ganho é o valor recebido menos o custo próprio líquido. Os agendamentos do consórcio são encerrados.
          </p>
        </div>
      )}
      {tipo === 'usar_carta' && (
        <p className="text-xs text-texto-3">
          O bem passa a valer o valor comprado. Depois, crie o financiamento pela administradora na aba Informações.
        </p>
      )}
      {(tipo === 'reajuste' || tipo === 'contemplar') && (
        <p className="text-xs text-texto-3">
          Os agendamentos do consórcio mudam a partir da data. Se uma reserva abastece esses pagamentos, confira o agendamento dela.
        </p>
      )}
      {erro && <p className="text-sm text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}
      <div className="flex gap-3">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={salvando}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1" disabled={salvando}>{salvando ? 'Salvando…' : 'Confirmar'}</button>
      </div>
    </form>
  )
}

// Aba Consórcio: cotas, batimento com a administradora e eventos com estorno. Os agendamentos e o saldo
// de conta corrente são do estado do app: o evento grava no servidor e o app espelha aqui.
export default function ConsorcioTab({ bemId, consorcio, tipoBem, onEditar, onMudou, avisar }) {
  const { pode, schedules, accounts, updateSchedule, getNextOccurrences, addTransaction, deleteTransaction, updateAccount, markScheduleRegistered } = useApp()
  const podeEditar = pode?.('patrimonio', 'editar')
  const [extrato, setExtrato] = useState(null)
  const [evento, setEvento] = useState(null)
  const [estornando, setEstornando] = useState(false)
  const [marcando, setMarcando] = useState(null) // { alvo, rotulo, valorSugerido, dataSugerida, soCredito }

  useEffect(() => {
    let vivo = true
    getExtratoBens(bemId).then(r => { if (vivo) setExtrato(r) }).catch(() => { if (vivo) setExtrato({ erro: true }) })
    return () => { vivo = false }
  }, [bemId, consorcio])

  const cotas = useMemo(() => consorcio.cotas || [], [consorcio])
  const totais = useMemo(() => totaisDasCotas(cotas), [cotas])
  const resumo = useMemo(() => {
    const bem = extrato?.bens?.[0]
    return bem ? resumoDoBem(bem, extratoDoBem(bem, extrato), extrato.parcelas, extrato.cotas) : null
  }, [extrato])
  const baixas = useMemo(() => extrato?.baixas || [], [extrato])
  const bate = resumo ? batimento(cotas, resumo.pagoSemJuros, baixas) : null
  const pagasPorCota = resumo ? parcelasFinupPorCota(cotas, resumo.pagoSemJuros, baixas) : null
  // Próximas parcelas a pagar: as ocorrências pendentes dos agendamentos deste bem.
  const pendentes = useMemo(() => agendamentosDoBem(schedules, bemId)
    .flatMap(s => (getNextOccurrences?.(s, 3) || []).map(ocorrencia => ({ schedule: s, ocorrencia })))
    .sort((a, b) => String(a.ocorrencia).localeCompare(String(b.ocorrencia)))
    .slice(0, 6), [schedules, bemId, getNextOccurrences])
  const prazos = cotas.map((c, i) => (pagasPorCota ? prazoDaCota(c, pagasPorCota[i]) : null))
  const somaPrazos = cotas.every(c => c.prazo_meses != null) ? cotas.reduce((s, c) => s + Number(c.prazo_meses), 0) : null
  const somaRestantes = pagasPorCota && prazos.every(p => p.restantes != null) ? prazos.reduce((s, p) => s + p.restantes, 0) : null
  const ativos = (consorcio.eventos || []).filter(e => !e.estornado_em)
  const ultimoId = ativos[0]?.id
  const vendida = consorcio.situacao === 'vendida'
  const cartaUsada = tipoBem !== 'consorcio'
  const contasCaixa = (accounts || []).filter(a => !['asset', 'liability', 'credit', 'gerencial'].includes(a.type))

  const aplicar = (plano) => { for (const p of plano) updateSchedule(p.id, p.mudancas) }

  const confirmarEvento = async ({ data, valor, contaId }) => {
    const doBem = agendamentosDoBem(schedules, bemId)
    const foto = fotoDosAgendamentos(doBem)
    const dados = evento === 'vender' ? { valor, conta_destino_id: contaId }
      : evento === 'usar_carta' ? { valor_bem: valor } : { nova_parcela: valor }
    const r = await registrarEventoConsorcio({ bem_id: bemId, tipo: evento, data, dados, agendamentos: foto })
    const ef = r.efeitos || {}
    for (const l of ef.lancamentos || []) addTransaction(l)
    if (ef.saldo != null) updateAccount(bemId, { balance: ef.saldo })
    if (ef.conta) updateAccount(bemId, ef.conta)
    if (evento === 'contemplar' || evento === 'reajuste') {
      aplicar(planoNovaParcela(doBem, { valor, data }, s => getNextOccurrences(s, 400)))
    }
    if (evento === 'vender') aplicar(planoEncerrar(doBem))
    setEvento(null)
    avisar(`${ROTULO_EVENTO[evento]} registrada.`)
    onMudou()
  }

  const aposMarcar = async ({ efeitos }) => {
    espelharRegistro(efeitos, {
      addTransaction, markScheduleRegistered, atualizarSaldo: (id, saldo) => updateAccount(id, { balance: saldo }),
    })
    setMarcando(null)
    avisar('Baixa registrada. Nenhum saldo de conta mudou.')
    onMudou()
  }

  const estornar = async (ev) => {
    setEstornando(true)
    try {
      const r = await estornarEventoConsorcio(ev.id)
      const ef = r.efeitos || {}
      for (const id of ef.lancamentos || []) deleteTransaction(id)
      if (ef.saldo != null) updateAccount(bemId, { balance: ef.saldo })
      if (ef.conta) updateAccount(bemId, ef.conta)
      for (const { id, ...campos } of ef.agendamentos || []) updateSchedule(id, campos)
      avisar('Evento estornado.')
      onMudou()
    } catch (e) {
      avisar(e.message, 'error')
    } finally {
      setEstornando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-texto-2">Consórcio · {rotuloSituacao(consorcio.situacao)}</h3>
            <p className="text-xs text-texto-3 mt-0.5">
              {[consorcio.administradora, consorcio.grupo && `Grupo ${consorcio.grupo}`, consorcio.indice_reajuste && `Índice ${consorcio.indice_reajuste}`].filter(Boolean).join(' · ') || 'Sem dados do contrato'}
            </p>
          </div>
          {podeEditar && (
            <button type="button" className="btn-secondary text-xs py-1 px-3 flex items-center gap-1.5 shrink-0" onClick={onEditar}>
              <Pencil size={12} /> Editar
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="border-b border-borda text-xs text-texto-2">
                <th className="text-left font-medium py-2 pr-3">Cota</th>
                <th className="text-left font-medium py-2 px-2">Adesão</th>
                <th className="text-right font-medium py-2 px-2">Carta</th>
                <th className="text-right font-medium py-2 px-2">Parcela</th>
                <th className="text-right font-medium py-2 px-2">Pagas/Prazo</th>
                <th className="text-right font-medium py-2 px-2">Restantes</th>
                <th className="text-left font-medium py-2 px-2">Encerramento</th>
                <th className="text-right font-medium py-2 pl-2">Saldo devedor</th>
              </tr>
            </thead>
            <tbody>
              {cotas.map((c, i) => {
                const p = prazos[i]
                const enc = encerramentoDaCota(c)
                return (
                <tr key={c.id} className="border-b border-borda/60">
                  <td className="py-1.5 pr-3 text-texto-1">{c.numero}</td>
                  <td className="py-1.5 px-2 text-texto-2">{c.data_adesao ? fmtDate(c.data_adesao) : '—'}</td>
                  <td className="py-1.5 px-2 text-right text-texto-1">{fmt(c.valor_carta)}</td>
                  <td className="py-1.5 px-2 text-right text-texto-1">{fmt(parcelaDaCota(c))} <span className="text-xs text-texto-3">({Number(c.percentual_parcela)}%)</span></td>
                  <td className="py-1.5 px-2 text-right text-texto-1">
                    {p ? `${p.pagas}/${p.prazo ?? '—'}` : '—'}
                    {Number(c.abertura_parcelas) > 0 && <span className="block text-[11px] text-texto-3">{c.abertura_parcelas} de abertura</span>}
                    {p?.diverge && <span className="block text-[11px] text-aviso">administradora: {p.informadas}/{p.prazo ?? '—'}</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right text-texto-1">
                    {p?.restantes ?? '—'}
                    {p?.diverge && p.restantesInformadas != null && <span className="block text-[11px] text-aviso">administradora: {p.restantesInformadas}</span>}
                  </td>
                  <td className="py-1.5 px-2 text-texto-1">
                    {enc.data ? fmtDate(enc.data) : '—'}
                    {enc.estimado && <span className="block text-[11px] text-texto-3">estimado</span>}
                    {c.previsao_encerramento && c.data_ultima_parcela && <span className="block text-[11px] text-texto-3">última parcela {fmtDate(c.data_ultima_parcela)}</span>}
                  </td>
                  <td className="py-1.5 pl-2 text-right text-texto-1">
                    {c.saldo_devedor_informado == null ? '—' : fmt(c.saldo_devedor_informado)}
                    {c.saldo_devedor_data && <span className="block text-[11px] text-texto-3">em {fmtDate(c.saldo_devedor_data)}</span>}
                  </td>
                </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-2 pr-3 text-texto-1">Total</td>
                <td />
                <td className="py-2 px-2 text-right text-texto-1">{fmt(totais.carta)}</td>
                <td className="py-2 px-2 text-right text-texto-1">{fmt(totais.parcelaMensal)}</td>
                <td className="py-2 px-2 text-right text-texto-2">{bate ? `${bate.parcelasFinup}/${somaPrazos ?? '—'}` : '—'}</td>
                <td className="py-2 px-2 text-right text-texto-2">{somaRestantes ?? '—'}</td>
                <td />
                <td className="py-2 pl-2 text-right text-texto-1">{fmt(totais.saldoDevedor)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {cotas.length > 1 && (
          <p className="text-xs text-texto-3 mt-2">
            O pagamento não é ligado a uma cota: as pagas no Finup são o total do batimento dividido entre as cotas.
          </p>
        )}
        {totais.meiaParcela && (
          <p className="text-xs text-aviso bg-aviso/5 border border-aviso/20 rounded-lg px-3 py-2 mt-3 flex items-start gap-2">
            <AlertTriangle size={13} className="shrink-0 mt-px" />
            Com meia parcela, o saldo devedor não diminui. A diferença é cobrada depois, normalmente na contemplação.
          </p>
        )}
      </div>

      {resumo && (
        <div className="card">
          <h3 className="text-sm font-semibold text-texto-2 mb-3">De onde veio o que foi pago</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            {[['Recursos próprios', resumo.proprios], ['Por terceiro', resumo.terceiros], ['Fora do Finup', resumo.foraDoFinup], ['Créditos e rendimentos', resumo.creditos], ['Histórico de abertura', resumo.abertura]].map(([rotulo, valor]) => (
              <div key={rotulo}>
                <p className="text-texto-3">{rotulo}</p>
                <p className="text-sm text-texto-1">{fmt(valor)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="text-sm font-semibold text-texto-2 mb-3">Batimento com a administradora</h3>
        {!bate
          ? <p className="flex items-center gap-2 text-sm text-texto-3"><Loader2 size={14} className="animate-spin" /> Carregando…</p>
          : (
            <div className="space-y-1 text-sm">
              <div className="flex justify-between gap-3"><span className="text-texto-3 text-xs">Parcelas no Finup × informadas</span><span className="text-texto-1">{bate.parcelasFinup} × {bate.parcelasInformadas ?? '—'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-texto-3 text-xs">Valor pago no Finup × informado</span><span className="text-texto-1">{fmt(bate.pagoFinup)} × {bate.valorPagoInformado == null ? '—' : fmt(bate.valorPagoInformado)}</span></div>
              {bate.diverge && (
                <p className="text-xs text-aviso flex items-start gap-1.5 pt-1">
                  <AlertTriangle size={13} className="shrink-0 mt-px" />
                  Não bate com a administradora{bate.difParcelas ? `: ${bate.difParcelas > 0 ? '+' : ''}${bate.difParcelas} parcela(s)` : ''}{bate.difValor ? ` e ${fmt(bate.difValor)}` : ''}. Confira os pagamentos.
                </p>
              )}
              {!bate.diverge && bate.parcelasInformadas != null && <p className="text-xs text-receita pt-1">Os números batem.</p>}
            </div>
          )}
      </div>

      {podeEditar && !vendida && (
        <div className="card">
          <h3 className="text-sm font-semibold text-texto-2 mb-3">Parcelas pendentes</h3>
          {pendentes.length === 0 && <p className="text-xs text-texto-3 mb-2">Nenhum agendamento pendente neste consórcio.</p>}
          <div className="space-y-2">
            {pendentes.map(({ schedule: s, ocorrencia }) => (
              <div key={`${s.id}:${ocorrencia}`} className="flex items-center justify-between gap-3 border-b border-borda/60 last:border-0 pb-2">
                <p className="text-sm text-texto-1 min-w-0 truncate">{fmtDate(ocorrencia)} · {fmt(s.amount)} <span className="text-xs text-texto-3">{s.description}</span></p>
                <button
                  type="button" className="btn-secondary text-xs py-1 px-2 shrink-0"
                  onClick={() => setMarcando({ alvo: { scheduleId: s.id, ocorrencia }, rotulo: `${s.description || 'Parcela'} de ${fmtDate(ocorrencia)}`, valorSugerido: s.amount, dataSugerida: ocorrencia })}
                >
                  Marcar como paga
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" className="btn-secondary text-xs py-1 px-2" onClick={() => setMarcando({ alvo: {}, rotulo: 'Parcela sem agendamento' })}>Marcar outra parcela como paga</button>
            <button type="button" className="btn-secondary text-xs py-1 px-2" onClick={() => setMarcando({ alvo: {}, rotulo: 'Crédito que abate valor, sem quitar uma parcela', soCredito: true })}>Registrar crédito ou rendimento</button>
          </div>
        </div>
      )}

      <BaixasDoBem baixas={baixas} onMudou={onMudou} />

      {podeEditar && !vendida && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {consorcio.situacao !== 'contemplada' && (
            <button type="button" className="btn-secondary text-xs py-2 flex items-center justify-center gap-1.5" onClick={() => setEvento('contemplar')}><Trophy size={13} /> Contemplar</button>
          )}
          {consorcio.situacao === 'contemplada' && !cartaUsada && (
            <button type="button" className="btn-secondary text-xs py-2 flex items-center justify-center gap-1.5" onClick={() => setEvento('usar_carta')}><Car size={13} /> Usar a carta</button>
          )}
          <button type="button" className="btn-secondary text-xs py-2 flex items-center justify-center gap-1.5" onClick={() => setEvento('reajuste')}><TrendingUp size={13} /> Reajuste</button>
          <button type="button" className="btn-secondary text-xs py-2 flex items-center justify-center gap-1.5" onClick={() => setEvento('vender')}><HandCoins size={13} /> Vender</button>
        </div>
      )}

      <div className="card">
        <h3 className="text-sm font-semibold text-texto-2 mb-3">Eventos</h3>
        {(consorcio.eventos || []).length === 0
          ? <p className="text-xs text-texto-3">Nenhum evento registrado.</p>
          : (
            <div className="space-y-2">
              {consorcio.eventos.map(ev => (
                <div key={ev.id} className="flex items-center justify-between gap-3 border-b border-borda/60 last:border-0 pb-2">
                  <div className="min-w-0">
                    <p className={`text-sm ${ev.estornado_em ? 'text-texto-3 line-through' : 'text-texto-1'}`}>{ROTULO_EVENTO[ev.tipo]} · {fmtDate(ev.data)}</p>
                    <p className="text-xs text-texto-3">{descricaoEvento(ev)}{ev.estornado_em ? ' · estornado' : ''}</p>
                  </div>
                  {podeEditar && ev.id === ultimoId && (
                    <button type="button" className="btn-secondary text-xs py-1 px-2 flex items-center gap-1 shrink-0" disabled={estornando} onClick={() => estornar(ev)}>
                      <RotateCcw size={12} /> Estornar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
      </div>

      {marcando && (
        <Modal open onClose={() => setMarcando(null)} title={marcando.soCredito ? 'Registrar crédito ou rendimento' : 'Marcar parcela como paga'}>
          <MarcarPagaModal bemId={bemId} cotas={cotas} {...marcando} onCancel={() => setMarcando(null)} onSuccess={aposMarcar} />
        </Modal>
      )}

      {evento && (
        <Modal open onClose={() => setEvento(null)} title={ROTULO_EVENTO[evento]}>
          <FormEvento tipo={evento} contas={contasCaixa} onCancel={() => setEvento(null)} onConfirmar={confirmarEvento} />
        </Modal>
      )}
    </div>
  )
}
