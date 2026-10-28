import { useMemo, useState } from 'react'
import { Plus, Trash2, ClipboardPaste, Camera, ListPlus } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { parseValorBR, valorBRFormatado } from '../../lib/valorBR'
import {
  parsearTextoBoleto, classificarItens, resumoItens, itemDiferenca, RESP, composicaoCondominio,
} from '../../lib/contratos/composicao'
import { LEITURA_DE_IMAGEM_DISPONIVEL } from '../../lib/contratos/imagemBoleto'
import { rotuloContrato } from '../../lib/contratos/parcelas'
import CampoValor from './CampoValor'

const RESPONSAVEIS = [['inquilino', 'Inquilino (meu)'], ['proprietario', 'Proprietário (dono)']]
const comoLinha = (i) => ({ ...i, valorTexto: valorBRFormatado(i.valor) })

// "Composição do boleto" do condomínio: digitar itens, colar o texto do app do condomínio ou (em
// breve) foto. Cada item recebe o responsável pelas regras (mostra a que casou); item sem regra é
// destacado e pergunta "De quem é?" com "Lembrar para os próximos". Soma dos itens = valor pago.
//   modo 'pagamento': logo depois de pagar — "Pular" usa a estimativa (última composição).
//   modo 'edicao': lançamento já pago — o total pode mudar (o valor do lançamento acompanha).
export default function ComposicaoBoletoModal({ contrato, tx, composicaoInicial = null, modo = 'pagamento', onConfirmar, onPular, onClose }) {
  const { regrasContratos } = useApp()
  const [linhas, setLinhas] = useState(() => (composicaoInicial?.itens || []).map(i => comoLinha({ ...i, manual: true })))
  const [entrada, setEntrada] = useState(linhas.length ? 'digitar' : 'colar')
  const [texto, setTexto] = useState('')
  const [lembrar, setLembrar] = useState({})
  const [aviso, setAviso] = useState('')
  const [salvando, setSalvando] = useState(false)
  const valorPago = modo === 'pagamento' ? Number(tx.amount) : null

  const itens = useMemo(() => classificarItens(
    linhas.map(l => ({ ...l, valor: parseValorBR(l.valorTexto) || 0 })),
    regrasContratos, contrato.id,
  ), [linhas, regrasContratos, contrato.id])
  const res = resumoItens(itens, valorPago)
  const fechaSoma = modo === 'edicao' || Math.abs(res.diferenca) < 0.005
  const pronto = itens.length > 0 && res.semDono === 0 && fechaSoma

  const setLinha = (i, campos) => setLinhas(prev => prev.map((l, j) => (j === i ? { ...l, ...campos } : l)))
  const lerTexto = () => {
    const r = parsearTextoBoleto(texto)
    if (!r.itens.length) { setAviso('Nenhum item com valor no texto. Cada linha precisa terminar com o valor (ex.: "Fundo de Reserva 79,10").'); return }
    setLinhas(r.itens.map(comoLinha))
    setAviso([
      r.total != null && Math.abs(r.total - resumoItens(r.itens).total) > 0.005 ? `O total do texto (${fmt(r.total)}) difere da soma dos itens.` : '',
      r.ignoradas.length ? `Linha sem valor ignorada: ${r.ignoradas.join(' / ')}` : '',
    ].filter(Boolean).join(' '))
    setEntrada('digitar')
  }
  const confirmar = async () => {
    setSalvando(true)
    try {
      const lista = itens.map(i => ({ desc: i.desc, valor: i.valor, responsavel: i.responsavel, regra: i.regra || undefined }))
      const regrasNovas = itens.filter((i, j) => !i.regra_id && lembrar[j]).map(i => ({ padrao: i.desc, responsavel: i.responsavel }))
      await onConfirmar({ itens: lista, lembrar: regrasNovas, composicao: composicaoCondominio(lista) })
    } catch (err) {
      setAviso(err?.message || 'Falha ao salvar.')
      setSalvando(false)
    }
  }

  const tab = (id, rotulo, Icone, desabilitado = false) => (
    <button type="button" disabled={desabilitado} onClick={() => setEntrada(id)}
      className={`text-xs px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 ${entrada === id ? 'bg-primary/15 text-primary-fg font-semibold' : 'text-texto-2 hover:bg-surface-hover'} disabled:opacity-50 disabled:cursor-not-allowed`}>
      <Icone size={12} /> {rotulo}
    </button>
  )

  return (
    <Modal open onClose={salvando ? () => {} : onClose} title="Composição do boleto do condomínio" size="xl">
      <div className="space-y-3 text-sm">
        <p className="text-texto-2">
          {rotuloContrato(contrato)} · pagamento de {fmtDate(tx.date)}
          {valorPago != null && <> · valor pago <strong className="text-texto-1">{fmt(valorPago)}</strong></>}.
          Itens do proprietário viram crédito a abater no próximo aluguel.
        </p>
        <div className="flex flex-wrap gap-1">
          {tab('digitar', 'Digitar itens', ListPlus)}
          {tab('colar', 'Colar texto', ClipboardPaste)}
          {tab('foto', LEITURA_DE_IMAGEM_DISPONIVEL ? 'Foto' : 'Foto (em breve)', Camera, !LEITURA_DE_IMAGEM_DISPONIVEL)}
        </div>

        {entrada === 'colar' && (
          <div className="space-y-2">
            <textarea className="input min-h-[140px] font-mono text-xs" value={texto} onChange={e => setTexto(e.target.value)}
              placeholder={'Cole aqui o texto do app do condomínio, um item por linha:\nTaxa de Condomínio 795,11\nFundo de Reserva 79,10'} />
            <button type="button" className="btn-primary text-xs" onClick={lerTexto} disabled={!texto.trim()}>Ler texto</button>
          </div>
        )}
        {entrada === 'foto' && <p className="text-xs text-texto-3">Leitura da foto do boleto: em breve.</p>}

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
                <CampoValor className="input py-1.5 text-sm" value={linhas[i].valorTexto} onChange={v => setLinha(i, { valorTexto: v })} placeholder="0,00" />
                <div className="col-span-2 sm:col-span-1">
                  <select className="input py-1.5 text-sm" value={it.responsavel || ''} onChange={e => setLinha(i, { responsavel: e.target.value || null, manual: !!e.target.value })}>
                    <option value="">De quem é?</option>
                    {RESPONSAVEIS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {!it.regra_id && it.responsavel && (
                    <label className="flex items-center gap-1.5 text-[11px] text-texto-2 mt-1">
                      <input type="checkbox" className="accent-primary" checked={!!lembrar[i]} onChange={e => setLembrar(p => ({ ...p, [i]: e.target.checked }))} />
                      Lembrar para os próximos
                    </label>
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
          <div><p className="text-texto-3">Do proprietário (crédito)</p><p className="text-texto-1">{fmt(res.proprietario)}</p></div>
          <div>
            <p className="text-texto-3">{modo === 'pagamento' ? 'Diferença p/ o pago' : 'Novo valor do lançamento'}</p>
            <p className={modo === 'pagamento' && !fechaSoma ? 'text-aviso font-semibold' : 'text-texto-1'}>{modo === 'pagamento' ? fmt(res.diferenca) : fmt(res.total)}</p>
          </div>
        </div>
        {modo === 'pagamento' && !fechaSoma && itens.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-aviso">
            ⚠ A soma dos itens precisa ser igual ao valor pago.
            <button type="button" className="btn-secondary text-xs py-1" onClick={() => setLinhas(p => [...p, comoLinha(itemDiferenca(res.diferenca))])}>
              Criar item "Diferença/arredondamento" ({fmt(res.diferenca)})
            </button>
          </div>
        )}
        {aviso && <p className="text-xs text-aviso">{aviso}</p>}

        <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-borda">
          {modo === 'pagamento' && onPular
            ? <button type="button" className="btn-secondary" disabled={salvando} onClick={onPular} title="Usa a última composição conhecida para os itens do proprietário e marca para revisar">Pular (estimar)</button>
            : <button type="button" className="btn-secondary" disabled={salvando} onClick={onClose}>Cancelar</button>}
          <button type="button" className="btn-primary" disabled={!pronto || salvando} onClick={confirmar}>Confirmar composição</button>
        </div>
      </div>
    </Modal>
  )
}
