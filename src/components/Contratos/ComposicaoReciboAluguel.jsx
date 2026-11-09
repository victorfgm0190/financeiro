import { useMemo, useRef, useState } from 'react'
import { Plus, Trash2, ClipboardPaste, Camera, ListPlus, ImagePlus, Loader2 } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { parseValorBR, valorBRFormatado } from '../../lib/valorBR'
import { parsearTextoBoleto } from '../../lib/contratos/composicao'
import { destinosCreditos } from '../../lib/contratos/creditos'
import { extrairReciboDeImagem } from '../../lib/contratos/imagemBoleto'
import { gerarPlanoParcelas, rotuloContrato } from '../../lib/contratos/parcelas'
import { ymDe, hojeStr } from '../../lib/contratos/datas'
import {
  TIPOS_ITEM_ALUGUEL, classificarRecibo, esperadoDaComposicao, creditosLigaveis, validarRecibo, ehLinhaDeTotal,
} from '../../lib/contratos/composicaoAluguel'
import CampoValor from './CampoValor'
import HelpCampo from '../shared/HelpCampo'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const MANUAL = '__manual'

// Item classificado → linha do formulário (valor sempre positivo + débito/crédito, como no recibo).
const comoLinha = (i) => ({
  ...i, valorTexto: valorBRFormatado(Math.abs(i.valor)), natureza: i.valor < 0 ? 'credito' : 'debito',
  acao: i.tipo === 'credito' ? (i.credito_id ? 'ligar' : MANUAL) : null, seguir: false, recorrente: false, parcelasTotal: '', parcelaAtual: '1',
})
const valorDaLinha = (l) => r2((l.natureza === 'credito' ? -1 : 1) * (parseValorBR(l.valorTexto) || 0))

// "Composição do recibo" da parcela PRINCIPAL (aluguel): o mesmo host/modal da composição do boleto,
// para pendente e paga. Digitar, colar texto ou foto/print/PDF (leitura do Assistente, sempre com
// prévia). Cada item é reconhecido contra o esperado da parcela (contratual, bonificação, encargos
// recorrentes); desconto parecido com crédito a abater vem sugerido para ligar; item novo é único,
// com "Tornar recorrente". Pendente: o valor passa ao total do recibo. Paga: soma = valor pago e o
// lançamento não muda. Nada grava sem "Confirmar composição".
export default function ComposicaoReciboAluguel({ contrato, parcela, tx = null, ocorrencia = null, composicaoInicial = null, leituraInicial = null, onConfirmar, onClose }) {
  const { schedules, creditosContratos } = useApp()
  const paga = !!tx
  const competencia = ymDe(ocorrencia || parcela?.startDate || tx?.date || hojeStr())
  // Esperado da parcela (sem créditos): a composição prevista da parcela pendente; senão, o plano do
  // contrato para a competência (parcela paga, série vinculada, recibo já informado).
  const esperados = useMemo(() => {
    const c = parcela?.composicao
    if (!paga && c?.itens?.length && !c.informada) return esperadoDaComposicao(c)
    const p = gerarPlanoParcelas(contrato, { hoje: hojeStr() }).find(x => x.papel === 'aluguel' && x.competencia === competencia)
    return esperadoDaComposicao(p?.composicao)
  }, [contrato, parcela, paga, competencia])
  const ligaveis = useMemo(() => creditosLigaveis(creditosContratos, contrato.id, tx?.id), [creditosContratos, contrato.id, tx])
  const destinos = useMemo(() => destinosCreditos(contrato, schedules || [], creditosContratos || []), [contrato, schedules, creditosContratos])

  const classificar = (lidos) => classificarRecibo(lidos, { esperados, creditos: ligaveis }).map(comoLinha)
  const [linhas, setLinhas] = useState(() => {
    if (leituraInicial?.itens?.length) return classificar(leituraInicial.itens)
    if (composicaoInicial?.itens?.length) return composicaoInicial.itens.filter(i => i.tipo !== 'ajuste').map(i => comoLinha({ ...i }))
    return []
  })
  const [entrada, setEntrada] = useState(linhas.length ? 'digitar' : 'foto')
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [leitura, setLeitura] = useState(leituraInicial)
  const [lendo, setLendo] = useState(false)
  const [totalTexto, setTotalTexto] = useState(() => {
    const t = leituraInicial?.total ?? (!paga && composicaoInicial?.informada ? composicaoInicial.total : null)
    return t ? valorBRFormatado(t) : ''
  })
  const cameraRef = useRef(null)
  const arquivoRef = useRef(null)

  const alvo = paga ? r2(tx.amount) : (parseValorBR(totalTexto) > 0 ? r2(parseValorBR(totalTexto)) : null)
  const itens = linhas.map(l => ({ ...l, valor: valorDaLinha(l) }))
  const soma = r2(itens.reduce((a, i) => a + i.valor, 0))
  const diferenca = alvo != null ? r2(alvo - soma) : 0
  const pendencia = (() => {
    if (!itens.length) return 'Informe os itens do recibo.'
    if (itens.some(i => !i.valor)) return 'Há item sem valor.'
    if (itens.some(i => i.tipo === 'credito' && i.valor > 0)) return 'Item "Crédito do proprietário" precisa ser Crédito (−).'
    if (itens.some(i => i.tipo === 'credito' && i.acao !== MANUAL && !i.credito_id)) return 'Escolha o crédito de cada item "Crédito do proprietário".'
    if (itens.some(i => i.recorrente && !(Number(i.parcelasTotal) >= 1))) return 'Informe em quantas parcelas o item recorrente se repete.'
    return validarRecibo(itens.map(i => ({ ...i, credito_id: i.acao === MANUAL ? null : i.credito_id })), alvo)
  })()

  const setLinha = (i, campos) => setLinhas(prev => prev.map((l, j) => (j === i ? { ...l, ...campos } : l)))
  const carregar = (lidos) => { setLinhas(classificar(lidos.filter(l => !ehLinhaDeTotal(l.desc)))); setEntrada('digitar') }
  const lerTexto = () => {
    const r = parsearTextoBoleto(texto)
    if (!r.itens.length) { setAviso('Nenhum item com valor no texto. Cada linha precisa terminar com o valor (ex.: "Seguro incêndio 49,06"; desconto com "(-)" ou "-49,06").'); return }
    carregar(r.itens)
    if (!paga && r.total != null && !totalTexto) setTotalTexto(valorBRFormatado(r.total))
    setAviso(r.ignoradas.length ? `Linha sem valor ignorada: ${r.ignoradas.join(' / ')}` : '')
  }
  const lerArquivo = async (e) => {
    const arq = e.target.files?.[0]
    e.target.value = ''
    if (!arq) return
    setLendo(true)
    setAviso('')
    try {
      const l = await extrairReciboDeImagem(arq)
      setLeitura(l)
      carregar(l.itens)
      if (!paga && l.total) setTotalTexto(valorBRFormatado(l.total))
    } catch (err) {
      setAviso(err?.message || 'Não consegui ler o recibo.')
    } finally {
      setLendo(false)
    }
  }
  const confirmar = async () => {
    setSalvando(true)
    setAviso('')
    try {
      const finais = itens.map(i => ({
        desc: i.desc, valor: i.valor, tipo: i.tipo,
        ...(i.encargo_id ? { encargo_id: i.encargo_id } : {}),
        ...(i.tipo === 'credito' ? (i.acao === MANUAL ? { acao: 'manual' } : { credito_id: i.credito_id }) : {}),
      }))
      const recorrentes = itens.map((i, indice) => (i.tipo === 'unico' && i.recorrente ? { indice, parcelas_total: Number(i.parcelasTotal), parcela_atual: Number(i.parcelaAtual) || 1 } : null)).filter(Boolean)
      const seguir = itens.filter(i => i.encargo_id && i.difere && i.seguir).map(i => ({ encargo_id: i.encargo_id, valor: i.valor }))
      const recibo = leitura ? { referencia: leitura.referencia || null, vencimento: leitura.vencimento || null, data_pagamento: leitura.data_pagamento || null, valor_pago: leitura.valor_pago || null } : null
      await onConfirmar({ itens: finais, total: alvo ?? soma, recibo, recorrentes, seguir })
    } catch (err) {
      setAviso(err?.message || 'Falha ao salvar.')
      setSalvando(false)
    }
  }

  const tab = (id, rotulo, Icone) => (
    <button type="button" onClick={() => setEntrada(id)}
      className={`text-xs px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 ${entrada === id ? 'bg-primary/15 text-primary-fg font-semibold' : 'text-texto-2 hover:bg-surface-hover'}`}>
      <Icone size={12} /> {rotulo}
    </button>
  )
  const usados = new Set(itens.filter(i => i.tipo === 'credito' && i.acao !== MANUAL && i.credito_id).map(i => i.credito_id))
  const rotuloCredito = (c) => `${c.descricao || 'Crédito'} · ${fmt(c.valor)}${c.status === 'previsto' ? ' (previsto)' : ''}`

  return (
    <Modal open onClose={salvando ? () => {} : onClose} title="Composição do recibo do aluguel" size="xl">
      <div className="space-y-3 text-sm" data-help-form="composicaoRecibo">
        <p className="text-texto-2">
          {rotuloContrato(contrato)}
          {paga
            ? <> · pagamento de {fmtDate(tx.date)} · valor pago <strong className="text-texto-1">{fmt(tx.amount)}</strong>. O lançamento não muda: só a composição.</>
            : <> · parcela de {fmtDate(parcela.startDate)} (pendente) · valor atual <strong className="text-texto-1">{fmt(parcela.amount)}</strong>. O valor da parcela passa a ser o total do recibo (só esta parcela).</>}
        </p>
        <div className="flex flex-wrap items-center gap-1" data-help-id="composicaoRecibo.entrada">
          {tab('digitar', 'Digitar itens', ListPlus)}
          {tab('colar', 'Colar texto', ClipboardPaste)}
          {tab('foto', 'Foto ou PDF', Camera)}
          <HelpCampo campo="composicaoRecibo.entrada" />
        </div>

        {entrada === 'colar' && (
          <div className="space-y-2">
            <textarea className="input min-h-[140px] font-mono text-xs" data-help-id="composicaoRecibo.texto" aria-label="Texto do recibo" value={texto} onChange={e => setTexto(e.target.value)}
              placeholder={'Cole aqui o texto do recibo, um item por linha (desconto com "-" ou "(-)")'} />
            <div className="flex items-center gap-1"><button type="button" className="btn-primary text-xs" onClick={lerTexto} disabled={!texto.trim()}>Ler texto</button><HelpCampo campo="composicaoRecibo.texto" /></div>
          </div>
        )}
        {entrada === 'foto' && (
          <div className="space-y-2">
            <p className="text-xs text-texto-2">Tire uma foto do recibo ou anexe uma foto, um print ou o PDF. O Assistente lê a referência, as datas, o valor pago e os itens (débito soma, crédito subtrai); você confere antes de gravar. O arquivo não fica guardado.</p>
            <div className="flex flex-wrap items-center gap-2" data-help-id="composicaoRecibo.foto">
              <button type="button" className="btn-secondary text-xs inline-flex items-center gap-1.5 min-h-[40px]" disabled={lendo} onClick={() => cameraRef.current?.click()}>
                <Camera size={14} /> Tirar foto
              </button>
              <button type="button" className="btn-secondary text-xs inline-flex items-center gap-1.5 min-h-[40px]" disabled={lendo} onClick={() => arquivoRef.current?.click()}>
                <ImagePlus size={14} /> Anexar foto, print ou PDF
              </button>
              <HelpCampo campo="composicaoRecibo.foto" />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={lerArquivo} data-testid="recibo-camera" />
              <input ref={arquivoRef} type="file" accept="image/*,application/pdf,.pdf" className="hidden" onChange={lerArquivo} data-testid="recibo-arquivo" />
            </div>
            {lendo && <p className="text-xs text-texto-2 inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Lendo o recibo…</p>}
          </div>
        )}

        {leitura && (
          <p className="text-xs text-texto-2 bg-surface-2/60 rounded-lg px-3 py-2" data-testid="leitura-recibo">
            Lido do recibo: referência {leitura.referencia || '—'} · vencimento {leitura.vencimento ? fmtDate(leitura.vencimento) : '—'}
            {' '}· pago em {leitura.data_pagamento ? fmtDate(leitura.data_pagamento) : '—'} · valor {leitura.valor_pago != null ? fmt(leitura.valor_pago) : '—'} · {leitura.itens?.length || 0} item(ns). Confira os itens abaixo.
            {paga && leitura.valor_pago != null && Math.abs(leitura.valor_pago - alvo) > 0.005 && (
              <span className="block text-aviso">⚠ O valor do recibo ({fmt(leitura.valor_pago)}) é diferente do valor pago no lançamento ({fmt(alvo)}).</span>
            )}
          </p>
        )}

        {!paga && (
          <div className="max-w-xs" data-help-id="composicaoRecibo.total">
            <label className="label">Total do recibo<HelpCampo campo="composicaoRecibo.total" /></label>
            <CampoValor className="input py-1.5 text-sm" value={totalTexto} onChange={setTotalTexto} placeholder="Valor total a pagar do recibo" />
            <p className="text-[11px] text-texto-3 mt-0.5">Vazio: o total é a soma dos itens.</p>
          </div>
        )}

        {entrada === 'digitar' && (
          <div className="space-y-1.5">
            <p data-testid="legenda-itens-recibo" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-texto-3"><span>Descrição<HelpCampo campo="composicaoRecibo.itemDescricao" /></span><span>Valor<HelpCampo campo="composicaoRecibo.itemValor" /></span><span>Débito/crédito<HelpCampo campo="composicaoRecibo.itemNatureza" /></span><span>Tipo<HelpCampo campo="composicaoRecibo.itemTipo" /></span><span>Crédito do proprietário<HelpCampo campo="composicaoRecibo.credito" /></span><span>Tornar recorrente<HelpCampo campo="composicaoRecibo.recorrente" /></span></p>
            {itens.map((it, i) => {
              const destinoAtual = it.tipo === 'credito' && it.credito_id ? destinos.get(it.credito_id)?.parcela : null
              return (
                <div key={i} className="grid grid-cols-[1fr_110px] sm:grid-cols-[1fr_120px_120px_190px_28px] gap-2 items-start p-2 rounded-lg bg-surface-2/60" data-testid="item-recibo">
                  <input className="input py-1.5 text-sm" data-help-id="composicaoRecibo.itemDescricao" aria-label="Descrição do item" value={it.desc} onChange={e => setLinha(i, { desc: e.target.value })} placeholder="Descrição do item do recibo" />
                  <CampoValor className="input py-1.5 text-sm" helpId="composicaoRecibo.itemValor" aria-label="Valor do item" value={it.valorTexto} onChange={v => setLinha(i, { valorTexto: v })} placeholder="Valor do item" />
                  <select className="input py-1.5 text-sm" data-help-id="composicaoRecibo.itemNatureza" value={it.natureza} aria-label="Débito ou crédito" onChange={e => setLinha(i, { natureza: e.target.value })}>
                    <option value="debito">Débito (+)</option>
                    <option value="credito">Crédito (−)</option>
                  </select>
                  <div className="col-span-2 sm:col-span-1 space-y-1">
                    <select className="input py-1.5 text-sm" data-help-id="composicaoRecibo.itemTipo" value={it.tipo} aria-label="Tipo do item"
                      onChange={e => setLinha(i, { tipo: e.target.value, acao: e.target.value === 'credito' ? (it.credito_id ? 'ligar' : MANUAL) : null })}>
                      {Object.entries(TIPOS_ITEM_ALUGUEL).filter(([k]) => k !== 'ajuste').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    {it.difere && it.esperado != null && (
                      <div className="text-[11px] text-aviso">
                        Previsto {fmt(Math.abs(it.esperado))} — vale só nesta parcela.
                        {it.encargo_id && (
                          <label data-help-id="composicaoRecibo.seguir" className="flex items-center gap-1.5 text-texto-2 mt-0.5">
                            <input type="checkbox" className="accent-primary" checked={!!it.seguir} onChange={e => setLinha(i, { seguir: e.target.checked })} />
                            Usar {fmt(Math.abs(it.valor))} nas próximas parcelas
                          </label>
                        )}
                      </div>
                    )}
                    {it.tipo === 'credito' && (
                      <>
                        <select className="input py-1.5 text-xs" data-help-id="composicaoRecibo.credito" aria-label="Crédito do proprietário" value={it.acao === MANUAL ? MANUAL : (it.credito_id || '')}
                          onChange={e => setLinha(i, e.target.value === MANUAL ? { acao: MANUAL, credito_id: null } : { acao: 'ligar', credito_id: e.target.value || null })}>
                          <option value="">Escolha o crédito…</option>
                          {ligaveis.filter(c => c.id === it.credito_id || !usados.has(c.id)).map(c => <option key={c.id} value={c.id}>{rotuloCredito(c)}</option>)}
                          <option value={MANUAL}>Novo crédito manual (já abatido aqui)</option>
                        </select>
                        {destinoAtual && destinoAtual.id !== parcela?.id && (
                          <p className="text-[11px] text-texto-3">Sai do aluguel de {fmtDate(destinoAtual.startDate)}, que é recalculado.</p>
                        )}
                      </>
                    )}
                    {it.tipo === 'unico' && (
                      <label data-help-id="composicaoRecibo.recorrente" className="flex items-center gap-1.5 text-[11px] text-texto-2">
                        <input type="checkbox" className="accent-primary" checked={!!it.recorrente} onChange={e => setLinha(i, { recorrente: e.target.checked })} />
                        Tornar recorrente
                      </label>
                    )}
                    {it.tipo === 'unico' && it.recorrente && (
                      <div className="flex items-center gap-1 text-[11px] text-texto-2">
                        <span>nesta parcela é a</span>
                        <input type="number" min="1" className="input py-1 px-1.5 text-xs w-14" data-help-id="composicaoRecibo.parcelaAtual" value={it.parcelaAtual} aria-label="Parcela atual do item"
                          placeholder="nº" onChange={e => setLinha(i, { parcelaAtual: e.target.value })} />
                        <span>de</span>
                        <input type="number" min="1" className="input py-1 px-1.5 text-xs w-16" data-help-id="composicaoRecibo.parcelasTotal" value={it.parcelasTotal} aria-label="Total de parcelas do item"
                          placeholder="total" onChange={e => setLinha(i, { parcelasTotal: e.target.value })} />
                      </div>
                    )}
                  </div>
                  <button type="button" className="p-1 text-texto-3 hover:text-perigo" title="Remover item"
                    onClick={() => setLinhas(p => p.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                </div>
              )
            })}
            <button type="button" className="btn-secondary text-xs py-1 inline-flex items-center gap-1"
              onClick={() => setLinhas(p => [...p, comoLinha({ desc: '', valor: 0, tipo: 'unico' })])}><Plus size={12} /> Item</button>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-lg bg-surface-2/60 text-xs">
          <div><p className="text-texto-3">Soma dos itens</p><p className="text-texto-1 font-semibold" data-testid="soma-recibo">{fmt(soma)}</p></div>
          <div><p className="text-texto-3">{paga ? 'Valor pago' : 'Total do recibo'}</p><p className="text-texto-1">{alvo != null ? fmt(alvo) : '—'}</p></div>
          <div>
            <p className="text-texto-3">Diferença</p>
            <p className={Math.abs(diferenca) > 0.005 ? 'text-aviso font-semibold' : 'text-texto-1'} data-testid="diferenca-recibo">{fmt(diferenca)}</p>
          </div>
        </div>
        {!paga && itens.length > 0 && !pendencia && (
          <p className="text-xs text-texto-2" data-testid="previa-recibo">
            Parcela de {fmtDate(parcela.startDate)}: {fmt(parcela.amount)} → <strong className="text-texto-1">{fmt(alvo ?? soma)}</strong> (recibo informado). As próximas parcelas seguem a regra do contrato.
          </p>
        )}
        {pendencia && itens.length > 0 && <p className="text-xs text-aviso" data-testid="pendencia-recibo">⚠ {pendencia}</p>}
        {aviso && <p className="text-xs text-aviso">{aviso}</p>}

        <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-borda">
          <button type="button" className="btn-secondary" disabled={salvando} onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={!!pendencia || salvando || lendo} onClick={confirmar}>Confirmar composição</button>
        </div>
      </div>
    </Modal>
  )
}
