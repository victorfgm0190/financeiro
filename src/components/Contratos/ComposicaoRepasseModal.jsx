import { useMemo, useState } from 'react'
import { Plus, Trash2, RotateCcw } from 'lucide-react'
import Modal from '../shared/Modal'
import CategorySelect from '../shared/CategorySelect'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { parseValorBR, valorBRFormatado } from '../../lib/valorBR'
import CampoValor from './CampoValor'
import { fmtYm, hojeStr } from '../../lib/contratos/datas'
import { competenciasDoRepasse, confirmadosDe, repassesRegistrados } from '../../lib/contratos/parcelas'
import {
  TIPOS_ITEM_REPASSE, TIPOS_MANUAIS, NATUREZAS_DESPESA, resumoComposicao, taxaAdmCalculada, itensParaGravar, novoItemManual,
  dedutivelPadrao,
} from '../../lib/contratos/composicaoRepasse'

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100
const POSITIVO = 0.005

// Item → linha de edição: valor sempre positivo na tela (texto BR) + sinal.
const paraEdicao = (i) => ({ ...i, sinal: Number(i.valor) < 0 ? -1 : (i.tipo === 'aluguel' || (i.tipo === 'ajuste' && Number(i.valor) > 0) ? 1 : -1), texto: valorBRFormatado(Math.abs(Number(i.valor) || 0)) })
const valorDe = (l) => r2(l.sinal * (parseValorBR(l.texto) || 0))

// Taxa de administração não informada acompanha os outros itens (aluguel, tarifas, taxa única).
function comAdmRecalculada(contrato, linhas) {
  const itens = linhas.map(l => ({ ...l, valor: valorDe(l) }))
  const calc = taxaAdmCalculada(contrato, itens.filter(i => i.tipo !== 'taxa_adm'))
  return linhas.map(l => (l.tipo === 'taxa_adm' && l.origem === 'auto'
    ? { ...l, valor_calculado: calc, ...(l.informado || calc == null ? {} : { texto: valorBRFormatado(Math.abs(calc)) }) }
    : l))
}

// COMPOSIÇÃO DO REPASSE de uma competência (contrato a receber por administradora). Grava em
// contrato_competencias (fonte da verdade); o valor do repasse e o saldo com a administradora são
// recalculados desta competência em diante (useContratos.salvarCompetenciaRepasse).
export default function ComposicaoRepasseModal({ contrato, competencia, onClose }) {
  const { categories, indicesContratos, schedules, transactions, salvarCompetenciaRepasse, pode, accounts } = useApp()
  const podeEditar = pode('contratos', 'editar')
  const doContrato = useMemo(() => schedules.filter(s => s.contratoId === contrato.id), [schedules, contrato.id])
  const linha = useMemo(() => competenciasDoRepasse(contrato, {
    hoje: hojeStr(), indices: indicesContratos, confirmados: confirmadosDe(contrato, doContrato),
    repassesReais: repassesRegistrados(contrato, doContrato, transactions),
  }).find(l => l.competencia === competencia) || null, [contrato, competencia, indicesContratos, doContrato, transactions])

  const [linhas, setLinhas] = useState(() => (linha?.itens || []).map(paraEdicao))
  const [fechada, setFechada] = useState(linha?.linha?.status === 'fechada')
  const [observacao, setObservacao] = useState(linha?.linha?.observacao || '')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const bem = contrato.bem_id ? accounts.find(a => a.id === contrato.bem_id) : null

  if (!linha) {
    return (
      <Modal open onClose={onClose} title={`Composição do repasse — ${fmtYm(competencia)}`} size="sm">
        <p className="text-sm text-texto-2">Competência fora da vigência do contrato.</p>
      </Modal>
    )
  }

  const itens = linhas.map(l => ({ ...l, valor: valorDe(l) }))
  const { bruto, deducoes, resultado } = resumoComposicao(itens)
  const saldoAnterior = linha.saldo_anterior
  const saldo = linha.foraDoSaldo ? null : r2(saldoAnterior + resultado)
  const repasse = saldo != null && saldo > POSITIVO ? saldo : 0

  const mudar = (i, campos) => { setErro(''); setLinhas(prev => comAdmRecalculada(contrato, prev.map((l, j) => (j === i ? { ...l, ...campos } : l)))) }
  const mudarValor = (i, texto) => mudar(i, { texto, ...(linhas[i].origem === 'auto' ? { informado: true } : {}) })
  const voltarCalculado = (i) => mudar(i, { informado: false, texto: valorBRFormatado(Math.abs(Number(linhas[i].valor_calculado) || 0)) })
  const incluir = (tipo) => setLinhas(prev => [...prev, paraEdicao({
    ...novoItemManual(tipo, { categoria_id: contrato.categoria_taxa_adm_id || null }), valor: tipo === 'ajuste' ? 0 : -0,
  })])
  const remover = (i) => setLinhas(prev => comAdmRecalculada(contrato, prev.filter((_, j) => j !== i)))

  const gravar = async (paraPadrao = false) => {
    const faltaDescricao = itens.find(i => i.origem !== 'auto' && !String(i.descricao || '').trim())
    if (!paraPadrao && faltaDescricao) return setErro(`Informe a descrição do item "${TIPOS_ITEM_REPASSE[faltaDescricao.tipo]}".`)
    setSalvando(true)
    setErro('')
    try {
      await salvarCompetenciaRepasse(contrato.id, {
        competencia, itens: itensParaGravar(itens), status: fechada ? 'fechada' : 'aberta', observacao: observacao.trim() || null,
      }, { remover: paraPadrao })
      onClose()
    } catch (e) {
      setErro(e?.message || 'Falha ao gravar.')
    } finally {
      setSalvando(false)
    }
  }

  const tipoCategoria = (l) => (l.sinal > 0 ? 'income' : 'expense')
  return (
    <Modal open onClose={onClose} title={`Composição do repasse — ${fmtYm(competencia)}`} size="lg">
      <div className="space-y-3 text-sm">
        <p className="text-xs text-texto-3">
          Aluguel do inquilino com vencimento em {fmtDate(linha.vencimentoInquilino)} · repasse da administradora em {fmtDate(linha.vencimento)}.
          {' '}Itens automáticos seguem o contrato; ao digitar outro valor, ele fica informado à mão (o calculado aparece ao lado).
        </p>
        <div className="space-y-2">
          {linhas.map((l, i) => {
            const auto = l.origem === 'auto'
            return (
              <div key={l.chave || i} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.6fr)_120px_minmax(0,1.2fr)_auto_28px] gap-2 items-center p-2 rounded-lg bg-surface-2/60">
                <div className="col-span-2 sm:col-span-1 min-w-0">
                  <p className="text-[11px] text-texto-3">{TIPOS_ITEM_REPASSE[l.tipo]}{auto ? ' · do contrato' : ''}</p>
                  {auto ? <p className="text-texto-1 truncate">{l.descricao}</p> : (
                    <div className="flex gap-1.5">
                      {l.tipo === 'despesa' && (
                        <select className="input py-1 text-xs w-auto" value={l.natureza || 'outra'} disabled={!podeEditar} aria-label="Natureza da despesa"
                          onChange={e => mudar(i, { natureza: e.target.value, dedutivel_ir: dedutivelPadrao('despesa', e.target.value) })}>
                          {Object.entries(NATUREZAS_DESPESA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      )}
                      <input className="input py-1 text-sm" value={l.descricao || ''} disabled={!podeEditar} placeholder="Descrição" aria-label="Descrição do item"
                        onChange={e => mudar(i, { descricao: e.target.value })} maxLength={200} />
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    {l.tipo === 'ajuste' ? (
                      <select className="input py-1 text-xs w-12 px-1" value={l.sinal} disabled={!podeEditar} aria-label="Sinal do ajuste" onChange={e => mudar(i, { sinal: Number(e.target.value) })}>
                        <option value={1}>+</option><option value={-1}>−</option>
                      </select>
                    ) : <span className={`text-xs ${l.sinal > 0 ? 'text-receita' : 'text-despesa'}`}>{l.sinal > 0 ? '+' : '−'}</span>}
                    <CampoValor className="input py-1 text-sm" value={l.texto} disabled={!podeEditar} onChange={v => mudarValor(i, v)} aria-label={`Valor de ${l.descricao || TIPOS_ITEM_REPASSE[l.tipo]}`} />
                  </div>
                  {auto && l.informado && l.valor_calculado != null && (
                    <button type="button" className="text-[11px] text-texto-3 hover:text-texto-1 inline-flex items-center gap-0.5 mt-0.5" onClick={() => voltarCalculado(i)} disabled={!podeEditar}>
                      <RotateCcw size={10} /> calculado {fmt(Math.abs(l.valor_calculado))}
                    </button>
                  )}
                </div>
                <div className="min-w-0">
                  <CategorySelect categories={categories} value={l.categoria_id || ''} onChange={e => mudar(i, { categoria_id: e.target.value || null })}
                    type={tipoCategoria(l)} perfilId={contrato.perfil_id || null} searchable />
                </div>
                <div className="flex flex-col gap-0.5 text-[11px] text-texto-2">
                  {l.tipo !== 'aluguel' && (
                    <label className="flex items-center gap-1 whitespace-nowrap">
                      <input type="checkbox" className="accent-primary" checked={!!l.dedutivel_ir} disabled={!podeEditar} onChange={e => mudar(i, { dedutivel_ir: e.target.checked })} />
                      Dedutível IR
                    </label>
                  )}
                  {l.tipo === 'benfeitoria' && bem && (
                    <label className="flex items-center gap-1 whitespace-nowrap" title="O custo entra no bem quando a ligação com o Patrimônio for ativada">
                      <input type="checkbox" className="accent-primary" checked={!!l.somar_ao_bem} disabled={!podeEditar} onChange={e => mudar(i, { somar_ao_bem: e.target.checked })} />
                      Somar ao custo do bem
                    </label>
                  )}
                </div>
                <div>
                  {!auto && podeEditar && (
                    <button type="button" className="p-1 text-texto-3 hover:text-perigo" title="Remover item" onClick={() => remover(i)}><Trash2 size={14} /></button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            {TIPOS_MANUAIS.map(t => (
              <button key={t} type="button" className="btn-secondary text-xs py-1 flex items-center gap-1" onClick={() => incluir(t)}>
                <Plus size={12} /> {TIPOS_ITEM_REPASSE[t]}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-lg bg-surface-2/60 text-xs">
          <p>Bruto <strong className="block text-sm text-texto-1">{fmt(bruto)}</strong></p>
          <p>Deduções <strong className="block text-sm text-texto-1">{fmt(-deducoes)}</strong></p>
          <p>Resultado do mês <strong className={`block text-sm ${resultado < 0 ? 'text-despesa' : 'text-texto-1'}`}>{fmt(resultado)}</strong></p>
          {linha.foraDoSaldo ? (
            <p className="col-span-2 sm:col-span-3 text-texto-3">Antes da competência do saldo inicial: fora da conta do saldo.</p>
          ) : (
            <>
              <p>Saldo anterior <strong className="block text-sm text-texto-1">{fmt(saldoAnterior)}</strong></p>
              <p>Saldo <strong className={`block text-sm ${saldo < 0 ? 'text-despesa' : 'text-texto-1'}`}>{fmt(saldo)}</strong></p>
              <p>Repasse <strong className="block text-sm text-texto-1">{repasse > 0 ? fmt(repasse) : 'Sem repasse — saldo transportado'}</strong></p>
            </>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs text-texto-2">
          <input type="checkbox" className="accent-primary" checked={fechada} disabled={!podeEditar} onChange={e => setFechada(e.target.checked)} />
          Competência conferida (fechada): a composição fica como está, mesmo se o contrato mudar
        </label>
        <textarea className="input min-h-[44px] text-xs" placeholder="Observação (opcional)" value={observacao} disabled={!podeEditar}
          onChange={e => setObservacao(e.target.value)} maxLength={2000} aria-label="Observação da competência" />

        {erro && <p className="text-xs text-perigo">{erro}</p>}
        <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-borda">
          <div>
            {podeEditar && linha.linha && (
              <button type="button" className="btn-secondary text-xs" disabled={salvando} onClick={() => gravar(true)}>Voltar ao padrão do contrato</button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>{podeEditar ? 'Cancelar' : 'Fechar'}</button>
            {podeEditar && <button type="button" className="btn-primary" disabled={salvando} onClick={() => gravar(false)}>Gravar</button>}
          </div>
        </div>
      </div>
    </Modal>
  )
}
