import { useMemo, useRef, useState } from 'react'
import { Plus, Trash2, ClipboardPaste, Camera, ListPlus, Split, ImagePlus, Loader2 } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { parseValorBR, valorBRFormatado } from '../../lib/valorBR'
import {
  parsearTextoBoleto, classificarItens, resumoItens, itemDiferenca, RESP, composicaoCondominio, dividirItem, padraoDaRegra,
} from '../../lib/contratos/composicao'
import { regraAbatimento } from '../../lib/contratos/creditos'
import { LEITURA_DE_IMAGEM_DISPONIVEL, extrairItensDeImagem } from '../../lib/contratos/imagemBoleto'
import { rotuloContrato } from '../../lib/contratos/parcelas'
import { previsaoComComposicao, somaItensEventuais } from '../../lib/contratos/condominio'
import {
  composicaoDaParcela, creditoPrevistoDaParcela, creditoDaParcela, previaDoAbatimento, vencimentoParcela,
} from '../../lib/contratos/composicaoAberta'
import CampoValor from './CampoValor'
import ComposicaoReciboAluguel from './ComposicaoReciboAluguel'

const RESPONSAVEIS = [['inquilino', 'Inquilino (meu)'], ['proprietario', 'Proprietário (dono)']]
const comoLinha = (i) => ({ ...i, valorTexto: valorBRFormatado(i.valor) })

// "Composição do boleto" do condomínio: digitar itens, colar o texto do app do condomínio ou ler a
// FOTO/print/PDF pelo Assistente (extrairItensDeImagem — sempre com prévia; nada é gravado sem
// "Confirmar"). Cada item recebe o responsável pelas regras (mostra a que casou); item sem regra é
// destacado e pergunta "De quem é?" com "Lembrar para os próximos" (sem marcar, não vira regra).
// Item pode ser DIVIDIDO entre inquilino e proprietário. Qualquer item (de inquilino ou de
// proprietário) pode ser marcado "Só neste boleto": sai da previsão dos próximos condomínios e da
// estimativa, sem mudar o crédito gerado nem o valor do lançamento.
//   modo 'pagamento': logo depois de pagar — "Pular" usa a estimativa (última composição); soma = pago.
//   modo 'informar': pagamento já feito sem composição — soma = valor pago; o lançamento NÃO muda.
//   modo 'edicao': lançamento já pago — o total pode mudar (o valor do lançamento acompanha).
//   modo 'aberta': parcela PENDENTE (boleto chegou antes do pagamento) — o total do boleto vira o
//     valor pendente; com o total informado (ou lido), a soma dos itens tem de fechar com ele. Os
//     itens do proprietário viram crédito PREVISTO no aluguel de destino (a prévia mostra onde).
// Parcela PRINCIPAL (aluguel, papel 'aluguel'): o mesmo modal, com o corpo do recibo
// (ComposicaoReciboAluguel — débitos/créditos, encargos recorrentes, ligação com créditos a abater).
export default function ComposicaoBoletoModal(props) {
  if (props.papel === 'aluguel') return <ComposicaoReciboAluguel {...props} />
  return <ComposicaoBoletoCondominio {...props} />
}

function ComposicaoBoletoCondominio({
  contrato, tx = null, parcela = null, composicaoInicial = null, leituraInicial = null, modo = 'pagamento',
  onConfirmar, onPular, onRemover = null, onClose,
}) {
  const { regrasContratos, schedules, transactions, creditosContratos } = useApp()
  const aberta = modo === 'aberta'
  const [linhas, setLinhas] = useState(() => (leituraInicial?.itens || composicaoInicial?.itens || [])
    .map(i => comoLinha({ ...i, ...(leituraInicial ? {} : { manual: true }) })))
  const [entrada, setEntrada] = useState(linhas.length ? 'digitar' : (aberta ? 'foto' : 'colar'))
  const [texto, setTexto] = useState('')
  const [lembrar, setLembrar] = useState({})
  const [aviso, setAviso] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [dividindo, setDividindo] = useState({})
  const [leitura, setLeitura] = useState(leituraInicial)
  const [lendo, setLendo] = useState(false)
  const [totalTexto, setTotalTexto] = useState(() => {
    const t = leituraInicial?.total ?? (aberta && composicaoInicial?.total)
    return t ? valorBRFormatado(t) : ''
  })
  const cameraRef = useRef(null)
  const arquivoRef = useRef(null)
  const somaFixa = modo === 'pagamento' || modo === 'informar'
  const totalBoleto = aberta ? parseValorBR(totalTexto) : null
  // Valor que a soma dos itens tem de dar: o pago (pagamento/informar) ou o total do boleto (aberta,
  // quando informado). Sem alvo (edição, ou aberta sem total), o total é a própria soma.
  const alvo = somaFixa ? Number(tx.amount) : (aberta && totalBoleto > 0 ? totalBoleto : null)

  const itens = useMemo(() => classificarItens(
    linhas.map(l => ({ ...l, valor: parseValorBR(l.valorTexto) || 0 })),
    regrasContratos, contrato.id,
  ), [linhas, regrasContratos, contrato.id])
  const res = resumoItens(itens, alvo)
  const fechaSoma = alvo == null || Math.abs(res.diferenca) < 0.005
  const pronto = itens.length > 0 && res.semDono === 0 && fechaSoma && !lendo
  const eventuais = somaItensEventuais({ itens })
  const valorDoBoleto = alvo ?? res.total
  const previsao = itens.length && tx && !aberta
    ? previsaoComComposicao(contrato, schedules || [], transactions || [], tx, { composicao: { tipo: 'condominio', itens }, valor: valorDoBoleto })
    : null
  // Parcela aberta: em qual aluguel o crédito previsto entra e como ele fica.
  const abatimento = useMemo(() => {
    if (!aberta || !parcela || !itens.length) return null
    const novo = creditoPrevistoDaParcela(composicaoDaParcela(itens), { contratoId: contrato.id, parcela })
    if (!novo) return null
    const atual = creditoDaParcela((creditosContratos || []).filter(c => c.contrato_id === contrato.id), parcela.id)
    if (atual?.status === 'compensado') return { valor: novo.valor, compensado: atual }
    return { valor: novo.valor, ...(previaDoAbatimento(contrato, schedules || [], creditosContratos || [], novo, { substituirId: atual?.id }) || {}) }
  }, [aberta, parcela, itens, contrato, schedules, creditosContratos])

  const setLinha = (i, campos) => setLinhas(prev => prev.map((l, j) => (j === i ? { ...l, ...campos } : l)))
  const lerTexto = () => {
    const r = parsearTextoBoleto(texto)
    if (!r.itens.length) { setAviso('Nenhum item com valor no texto. Cada linha precisa terminar com o valor (ex.: "Fundo de Reserva 79,10").'); return }
    setLinhas(r.itens.map(comoLinha))
    if (aberta && r.total != null && !totalTexto) setTotalTexto(valorBRFormatado(r.total))
    setAviso([
      r.total != null && Math.abs(r.total - resumoItens(r.itens).total) > 0.005 ? `O total do texto (${fmt(r.total)}) difere da soma dos itens.` : '',
      r.ignoradas.length ? `Linha sem valor ignorada: ${r.ignoradas.join(' / ')}` : '',
    ].filter(Boolean).join(' '))
    setEntrada('digitar')
  }
  // Foto, print ou PDF → a leitura do Assistente preenche a prévia (o usuário confere e confirma).
  const lerArquivo = async (e) => {
    const arq = e.target.files?.[0]
    e.target.value = ''
    if (!arq) return
    setLendo(true)
    setAviso('')
    try {
      const l = await extrairItensDeImagem(arq)
      setLeitura(l)
      setLinhas(l.itens.map(comoLinha))
      setLembrar({})
      if (aberta && l.total) setTotalTexto(valorBRFormatado(l.total))
      setEntrada('digitar')
    } catch (err) {
      setAviso(err?.message || 'Não consegui ler o boleto.')
    } finally {
      setLendo(false)
    }
  }
  const confirmar = async () => {
    setSalvando(true)
    try {
      const lista = itens.map(i => ({
        desc: i.desc, valor: i.valor, responsavel: i.responsavel, regra: i.regra || undefined,
        ...(i.so_neste_boleto ? { so_neste_boleto: true } : {}),
      }))
      // Padrão estável (nome do item, sem datas/quantidades/sinais): casa no boleto do mês seguinte.
      // Dois itens com o mesmo nome viram uma regra só.
      const vistos = new Set()
      const regrasNovas = itens.filter((i, j) => !i.regra_id && lembrar[j])
        .map(i => ({ padrao: padraoDaRegra(i.desc), responsavel: i.responsavel }))
        .filter(r => r.padrao && !vistos.has(r.padrao.toLowerCase()) && vistos.add(r.padrao.toLowerCase()))
      await onConfirmar({ itens: lista, lembrar: regrasNovas, composicao: composicaoCondominio(lista) })
    } catch (err) {
      setAviso(err?.message || 'Falha ao salvar.')
      setSalvando(false)
    }
  }
  const remover = async () => {
    setSalvando(true)
    try { await onRemover() } catch (err) {
      setAviso(err?.message || 'Falha ao remover.')
      setSalvando(false)
    }
  }

  const tab = (id, rotulo, Icone, desabilitado = false) => (
    <button type="button" disabled={desabilitado} onClick={() => setEntrada(id)}
      className={`text-xs px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 ${entrada === id ? 'bg-primary/15 text-primary-fg font-semibold' : 'text-texto-2 hover:bg-surface-hover'} disabled:opacity-50 disabled:cursor-not-allowed`}>
      <Icone size={12} /> {rotulo}
    </button>
  )
  const vencParcela = parcela ? vencimentoParcela(parcela) : null
  const rotuloAlvo = somaFixa ? 'Diferença p/ o pago' : aberta ? (alvo != null ? 'Diferença p/ o total' : 'Total do boleto') : 'Novo valor do lançamento'

  return (
    <Modal open onClose={salvando ? () => {} : onClose} title="Composição do boleto do condomínio" size="xl">
      <div className="space-y-3 text-sm">
        <p className="text-texto-2">
          {rotuloContrato(contrato)}
          {aberta
            ? <> · parcela de {fmtDate(vencParcela)} (pendente) · valor atual <strong className="text-texto-1">{fmt(parcela.amount)}</strong>. O valor pendente passa a ser o total do boleto.</>
            : <> · pagamento de {fmtDate(tx.date)}{alvo != null && <> · valor pago <strong className="text-texto-1">{fmt(alvo)}</strong></>}.</>}
          {' '}Itens do proprietário viram crédito {aberta ? 'previsto ' : ''}a abater {regraAbatimento(contrato) === 'mes_seguinte' ? 'no aluguel do mês seguinte' : 'no próximo aluguel pendente'}.
          {modo === 'informar' && ' O valor do lançamento não muda.'}
        </p>
        <div className="flex flex-wrap gap-1">
          {tab('digitar', 'Digitar itens', ListPlus)}
          {tab('colar', 'Colar texto', ClipboardPaste)}
          {tab('foto', LEITURA_DE_IMAGEM_DISPONIVEL ? 'Foto ou PDF' : 'Foto (em breve)', Camera, !LEITURA_DE_IMAGEM_DISPONIVEL)}
        </div>

        {entrada === 'colar' && (
          <div className="space-y-2">
            <textarea className="input min-h-[140px] font-mono text-xs" value={texto} onChange={e => setTexto(e.target.value)}
              placeholder={'Cole aqui o texto do app do condomínio, um item por linha:\nTaxa de Condomínio 795,11\nFundo de Reserva 79,10'} />
            <button type="button" className="btn-primary text-xs" onClick={lerTexto} disabled={!texto.trim()}>Ler texto</button>
          </div>
        )}
        {entrada === 'foto' && (
          <div className="space-y-2">
            <p className="text-xs text-texto-2">Tire uma foto do boleto ou anexe uma foto, um print ou o PDF. O Assistente lê o vencimento, o total e os itens; você confere antes de gravar. O arquivo não fica guardado.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-xs inline-flex items-center gap-1.5 min-h-[40px]" disabled={lendo} onClick={() => cameraRef.current?.click()}>
                <Camera size={14} /> Tirar foto
              </button>
              <button type="button" className="btn-secondary text-xs inline-flex items-center gap-1.5 min-h-[40px]" disabled={lendo} onClick={() => arquivoRef.current?.click()}>
                <ImagePlus size={14} /> Anexar foto, print ou PDF
              </button>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={lerArquivo} data-testid="foto-camera" />
              <input ref={arquivoRef} type="file" accept="image/*,application/pdf,.pdf" className="hidden" onChange={lerArquivo} data-testid="foto-arquivo" />
            </div>
            {lendo && <p className="text-xs text-texto-2 inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Lendo o boleto…</p>}
          </div>
        )}

        {leitura && (
          <p className="text-xs text-texto-2 bg-surface-2/60 rounded-lg px-3 py-2" data-testid="leitura-boleto">
            Lido do boleto{leitura.beneficiario ? ` (${leitura.beneficiario})` : ''}: vencimento {leitura.vencimento ? fmtDate(leitura.vencimento) : '—'}
            {' '}· total {leitura.total != null ? fmt(leitura.total) : '—'} · {leitura.itens?.length || 0} item(ns). Confira os itens abaixo.
            {aberta && leitura.vencimento && vencParcela && leitura.vencimento !== vencParcela && (
              <span className="block text-aviso">⚠ O vencimento do boleto ({fmtDate(leitura.vencimento)}) é diferente do da parcela ({fmtDate(vencParcela)}). Se precisar, ajuste a data da parcela em Agendamentos.</span>
            )}
            {somaFixa && leitura.total != null && Math.abs(leitura.total - alvo) > 0.005 && (
              <span className="block text-aviso">⚠ O total lido ({fmt(leitura.total)}) é diferente do valor pago ({fmt(alvo)}).</span>
            )}
          </p>
        )}

        {aberta && (
          <div className="max-w-xs">
            <label className="label">Total do boleto</label>
            <CampoValor className="input py-1.5 text-sm" value={totalTexto} onChange={setTotalTexto} placeholder="Valor a pagar do boleto" />
            <p className="text-[11px] text-texto-3 mt-0.5">Vazio: o total é a soma dos itens.</p>
          </div>
        )}

        {entrada === 'digitar' && (
          <div className="space-y-1.5">
            {itens.map((it, i) => (
              <div key={i} className={`grid grid-cols-[1fr_110px] sm:grid-cols-[1fr_120px_170px_28px] gap-2 items-start p-2 rounded-lg ${it.responsavel ? 'bg-surface-2/60' : 'bg-surface-2/60 outline outline-1 outline-aviso'}`}>
                <div className="min-w-0">
                  <input className="input py-1.5 text-sm" value={linhas[i].desc} onChange={e => setLinha(i, { desc: e.target.value })} placeholder="Descrição do item" />
                  <p className="text-[11px] mt-0.5 text-texto-3 truncate">
                    {it.regra ? `regra: ${it.regra}` : it.responsavel ? 'marcado à mão' : <span className="text-aviso">⚠ Sem regra — de quem é?</span>}
                  </p>
                </div>
                <CampoValor className="input py-1.5 text-sm" value={linhas[i].valorTexto} onChange={v => setLinha(i, { valorTexto: v })} placeholder="Valor do item" />
                <div className="col-span-2 sm:col-span-1">
                  <select className="input py-1.5 text-sm" value={it.responsavel || ''} onChange={e => setLinha(i, { responsavel: e.target.value || null, manual: !!e.target.value })}>
                    <option value="">De quem é?</option>
                    {RESPONSAVEIS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {!it.regra_id && it.responsavel && (
                    <label className="flex items-center gap-1.5 text-[11px] text-texto-2 mt-1">
                      <input type="checkbox" className="accent-primary" checked={!!lembrar[i]} onChange={e => setLembrar(p => ({ ...p, [i]: e.target.checked }))} />
                      <span className="min-w-0 truncate">Lembrar para os próximos{padraoDaRegra(it.desc) ? <> (itens que começam com "<span data-testid="padrao-regra">{padraoDaRegra(it.desc)}</span>")</> : null}</span>
                    </label>
                  )}
                  <label className="flex items-center gap-1.5 text-[11px] text-texto-2 mt-1" title="Item eventual: fica fora da previsão dos próximos condomínios. Não muda o crédito nem o valor do lançamento">
                    <input type="checkbox" className="accent-primary" checked={!!linhas[i].so_neste_boleto} onChange={e => setLinha(i, { so_neste_boleto: e.target.checked })} />
                    Só neste boleto
                  </label>
                  {dividindo[i] != null ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <CampoValor className="input py-1 text-xs" value={dividindo[i]} onChange={v => setDividindo(p => ({ ...p, [i]: v }))} placeholder="Parte do proprietário" />
                      <button type="button" className="btn-secondary text-[11px] py-1" onClick={() => {
                        const partes = dividirItem({ desc: linhas[i].desc, valor: it.valor }, parseValorBR(dividindo[i]) || 0).map(comoLinha)
                        setLinhas(p => [...p.slice(0, i), ...partes, ...p.slice(i + 1)])
                        setDividindo({})
                        setLembrar({})
                      }}>OK</button>
                    </div>
                  ) : (
                    <button type="button" className="text-[11px] text-primary-fg hover:underline mt-1 inline-flex items-center gap-1"
                      title="Separar a parte do proprietário e a do inquilino neste item" onClick={() => setDividindo(p => ({ ...p, [i]: '' }))}>
                      <Split size={11} /> Dividir entre inquilino e proprietário
                    </button>
                  )}
                </div>
                <button type="button" className="p-1 text-texto-3 hover:text-perigo" title="Remover item"
                  onClick={() => { setLinhas(p => p.filter((_, j) => j !== i)); setLembrar({}) }}><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-xs py-1 inline-flex items-center gap-1"
                onClick={() => setLinhas(p => [...p, { desc: '', valorTexto: '', responsavel: null }])}><Plus size={12} /> Item</button>
              {res.semDono > 0 && (
                <button type="button" className="btn-secondary text-xs py-1"
                  onClick={() => setLinhas(p => p.map((l, j) => (itens[j].responsavel ? l : { ...l, responsavel: RESP.INQUILINO, manual: true })))}>
                  Itens sem regra são do inquilino
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-lg bg-surface-2/60 text-xs">
          <div><p className="text-texto-3">Soma dos itens</p><p className="text-texto-1 font-semibold">{fmt(res.total)}</p></div>
          <div><p className="text-texto-3">Meu (inquilino)</p><p className="text-texto-1">{fmt(res.inquilino)}</p></div>
          <div><p className="text-texto-3">Do proprietário (crédito{aberta ? ' previsto' : ''})</p><p className="text-texto-1">{fmt(res.proprietario)}</p></div>
          <div>
            <p className="text-texto-3">{rotuloAlvo}</p>
            <p className={alvo != null && !fechaSoma ? 'text-aviso font-semibold' : 'text-texto-1'} data-testid="diferenca">{alvo != null ? fmt(res.diferenca) : fmt(res.total)}</p>
          </div>
        </div>
        {alvo != null && !fechaSoma && itens.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-aviso">
            ⚠ A soma dos itens precisa ser igual ao {somaFixa ? 'valor pago' : 'total do boleto'} (diferença de {fmt(res.diferenca)}).
            <button type="button" className="btn-secondary text-xs py-1" onClick={() => setLinhas(p => [...p, comoLinha(itemDiferenca(res.diferenca))])}>
              Criar item "Diferença/arredondamento" ({fmt(res.diferenca)})
            </button>
          </div>
        )}
        {previsao && (
          <p className="text-xs text-texto-2" data-testid="previsao-condominio">
            {previsao.ultimo
              ? <>Previsão dos próximos condomínios pendentes: <strong className="text-texto-1">{fmt(previsao.valor)}</strong>
                {eventuais > 0 ? ` (${fmt(valorDoBoleto)} menos ${fmt(eventuais)} de itens "Só neste boleto")` : ' (o valor deste boleto)'}.
                {' '}Parcelas com valor digitado à mão não mudam.</>
              : <>Há um condomínio pago mais recente: a previsão continua em <strong className="text-texto-1">{fmt(previsao.valor)}</strong>.</>}
          </p>
        )}
        {aberta && itens.length > 0 && (
          <p className="text-xs text-texto-2" data-testid="previa-abatimento">
            {!abatimento
              ? 'Sem itens do proprietário: nenhum crédito previsto.'
              : abatimento.compensado
                ? <span className="text-aviso">⚠ O crédito deste boleto ({fmt(abatimento.compensado.valor)}) já foi abatido num aluguel pago. Ao confirmar com outro valor, você decide o que fazer.</span>
                : abatimento.parcela
                  ? abatimento.bloqueado
                    ? <>Crédito previsto de <strong className="text-texto-1">{fmt(abatimento.valor)}</strong>: o aluguel de {fmtDate(abatimento.parcela.startDate)} tem valor digitado à mão (aplique pela aba de créditos da ficha).</>
                    : <>Crédito previsto de <strong className="text-texto-1">{fmt(abatimento.valor)}</strong> abate no aluguel de {fmtDate(abatimento.parcela.startDate)}: {fmt(abatimento.antes)} → <strong className="text-texto-1">{fmt(abatimento.depois)}</strong>.</>
                  : <>Crédito previsto de <strong className="text-texto-1">{fmt(abatimento.valor)}</strong>: sem aluguel pendente para abater por enquanto.</>}
            {' '}As próximas parcelas de condomínio seguem a regra de sempre.
          </p>
        )}
        {aviso && <p className="text-xs text-aviso">{aviso}</p>}

        <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-borda">
          <div className="flex flex-wrap gap-2">
            {modo === 'pagamento' && onPular
              ? <button type="button" className="btn-secondary" disabled={salvando} onClick={onPular} title="Usa a última composição conhecida para os itens do proprietário e marca para revisar">Pular (estimar)</button>
              : <button type="button" className="btn-secondary" disabled={salvando} onClick={onClose}>Cancelar</button>}
            {aberta && onRemover && (
              <button type="button" className="btn-secondary text-perigo" disabled={salvando} onClick={remover} title="A parcela volta ao condomínio previsto e o crédito previsto sai">Remover composição</button>
            )}
          </div>
          <button type="button" className="btn-primary" disabled={!pronto || salvando} onClick={confirmar}>Confirmar composição</button>
        </div>
      </div>
    </Modal>
  )
}
