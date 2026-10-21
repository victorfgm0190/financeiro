import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Pencil, RefreshCw, Search, Ban, Trash2, Unlink, TrendingUp } from 'lucide-react'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { buscarContratoApi } from '../../lib/contratosApi'
import {
  PAPEIS, STATUS_CONTRATO, ehParcelaGerada, parcelaPaga, valorAtual, proximaParcela, rotuloContrato, r2,
  linhasDoContrato, textoProjecao,
} from '../../lib/contratos/parcelas'
import { candidatosVinculo } from '../../lib/contratos/vinculo'
import { pendentesForaDaVigencia } from '../../lib/contratos/estorno'
import { distribuirCreditos } from '../../lib/contratos/creditos'
import ComposicaoBoletoModal from './ComposicaoBoletoModal'
import { hojeStr, addMesesData, fmtYm } from '../../lib/contratos/datas'
import ContratoWizard from './ContratoWizard'
import VinculoModal from './VinculoModal'
import ConfirmarReajusteModal from './ConfirmarReajusteModal'

const ROTULO_EVENTO = {
  criacao: 'Criação', reajuste: 'Reajuste', confirmacao_valor: 'Valor confirmado', aditivo: 'Aditivo', renovacao: 'Renovação',
  rescisao: 'Rescisão', suspensao: 'Suspensão', vinculo: 'Vínculo', desvinculo: 'Desvínculo', edicao_parcela: 'Parcela editada',
}

function resumoEvento(e) {
  const d = e.detalhes || {}
  if (e.tipo === 'reajuste' || e.tipo === 'confirmacao_valor') {
    return `${e.valor_anterior != null ? fmt(e.valor_anterior) : '—'} → ${fmt(e.valor_novo)}${e.percentual != null ? ` (${String(e.percentual).replace('.', ',')}%)` : ''} · ${d.escopo === 'so_esta' ? 'só esta parcela' : `${(d.parcelas || []).length} parcela(s)`}`
  }
  if (e.tipo === 'vinculo' || e.tipo === 'desvinculo') return `${d.descricao || d.agendamento_id || ''}${d.papel ? ` (${PAPEIS[d.papel] || d.papel})` : ''}`
  if (e.tipo === 'edicao_parcela' && d.acao === 'exclusao') return `Parcela de ${fmtDate(d.vencimento)} excluída`
  if (e.tipo === 'edicao_parcela' && d.acao === 'estorno_reaberta') return `Pagamento de ${fmtDate(d.vencimento)} estornado — parcela reaberta${d.status_contrato && d.status_contrato !== 'ativo' ? ` (contrato ${d.status_contrato})` : ''}`
  if (e.tipo === 'edicao_parcela' && d.acao === 'estorno_cancelada') return `Pagamento de ${fmtDate(d.vencimento)} estornado — parcela cancelada`
  if (e.tipo === 'edicao_parcela' && d.acao === 'reversao_creditos') return `Lançamento estornado/excluído — créditos: ${(d.creditos_reabertos || []).length} reaberto(s), ${(d.creditos_removidos || []).length} removido(s)${(d.creditos_mantidos || []).length ? `, ${d.creditos_mantidos.length} já abatido(s) mantido(s)` : ''}`
  if (e.tipo === 'edicao_parcela' && d.acao === 'edicao') return `Parcela de ${fmtDate(d.vencimento)} editada: ${Object.keys(d.campos || {}).join(', ')}${d.escopo === 'proximas' ? ' (esta e as próximas)' : ''}`
  if (e.tipo === 'aditivo') return Object.keys(d.campos || {}).join(', ')
  if (e.tipo === 'renovacao') return `Fim ${fmtDate(d.de)} → ${fmtDate(d.para)}`
  if (e.tipo === 'rescisao') return `Saída ${fmtDate(d.data_saida)} · ${(d.canceladas || []).length} pendente(s) cancelada(s)${d.motivo ? ` · ${d.motivo}` : ''}`
  if (e.tipo === 'criacao') return `Vigência ${fmtDate(d.data_inicio)}${d.data_fim ? ` a ${fmtDate(d.data_fim)}` : ' sem fim'}`
  return ''
}

const Info = ({ rotulo, children }) => (
  <div className="min-w-0"><p className="text-[11px] text-texto-3">{rotulo}</p><p className="text-sm text-texto-1 break-words">{children}</p></div>
)

// Ficha do contrato: dados, parcelas (pagas/pendentes/projetadas), séries vinculadas, pagamentos,
// linha do tempo e as ações (Confirmar reajuste, Aditivo, Renovar, Buscar vínculos, Rescindir).
export default function ContratoFicha({ id, acaoInicial = null, onClose }) {
  const {
    contratoPorId, schedules, transactions, accounts, profiles, categories, indicesContratos, carregarIndice, pode,
    planejarParcelasContrato, aplicarParcelasContrato, atualizarContrato, desvincularDoContrato, rescindirContrato,
    excluirContrato, creditosContratos, adiarCreditoNaParcela, editarComposicaoLancamento,
  } = useApp()
  const contrato = contratoPorId(id)
  const [extra, setExtra] = useState({ itens: [], eventos: [] })
  const [aba, setAba] = useState('pendentes')
  const [revisar, setRevisar] = useState(null)
  const [modal, setModal] = useState(acaoInicial === 'rescindir' ? 'rescindir' : null)
  const [reajusteDe, setReajusteDe] = useState(null)
  const [vinculo, setVinculo] = useState(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const hoje = hojeStr()
  const podeEditar = pode('contratos', 'editar')

  const recarregar = useCallback(() => {
    buscarContratoApi(id).then(r => setExtra({ itens: r.itens || [], eventos: r.eventos || [] })).catch(e => setErro(e.message))
  }, [id])
  useEffect(() => { recarregar() }, [recarregar])
  useEffect(() => {
    if (contrato && (contrato.indice_reajuste === 'IPCA' || contrato.indice_reajuste === 'IGPM')) carregarIndice(contrato.indice_reajuste).catch(() => {})
  }, [contrato, carregarIndice])

  const doContrato = useMemo(() => (contrato ? schedules.filter(s => s.contratoId === contrato.id) : []), [schedules, contrato])
  const parcelas = useMemo(() => doContrato.filter(s => ehParcelaGerada(s, contrato.id))
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)) || String(a.contratoPapel).localeCompare(String(b.contratoPapel))), [doContrato, contrato])
  const linhas = useMemo(() => (contrato ? linhasDoContrato(contrato, doContrato, transactions) : []), [contrato, doContrato, transactions])
  const vinculadas = useMemo(() => doContrato.filter(s => !ehParcelaGerada(s, contrato.id)), [doContrato, contrato])
  // Pagamentos: lançamentos das parcelas do contrato e das séries vinculadas (só leitura).
  const pagamentos = useMemo(() => {
    const ids = new Set(doContrato.map(s => s.id))
    const porMeta = new Set(doContrato.flatMap(s => Object.values(s.registeredMeta || {}).map(m => m?.lancamento_id).filter(Boolean)))
    return transactions.filter(t => ids.has(t.scheduleId) || porMeta.has(t.id) || t.contratoId === id)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  }, [doContrato, transactions, id])

  if (!contrato) return <p className="text-sm text-texto-3">Contrato não encontrado (ou ainda carregando).</p>

  const creditos = (creditosContratos || []).filter(c => c.contrato_id === contrato.id)
    .sort((a, b) => String(b.data_origem).localeCompare(String(a.data_origem)))
  const destino = distribuirCreditos(contrato, schedules, creditos)
  const parcelaDoCredito = new Map()
  for (const [parcelaId, lista] of destino) for (const c of lista) parcelaDoCredito.set(c.id, schedules.find(s => s.id === parcelaId))
  const estimadas = pagamentos.filter(t => t.composicao?.estimada)

  const conta = accounts.find(a => a.id === contrato.conta_id)
  const perfil = profiles.find(p => p.id === contrato.perfil_id)
  const cat = categories.find(c => c.id === contrato.categoria_id)
  const prox = proximaParcela(contrato, schedules)
  const projetadas = parcelas.filter(s => s.valorStatus === 'projetado' && !parcelaPaga(s) && s.contratoPapel === 'aluguel')
  const indice = indicesContratos[contrato.indice_reajuste]
  const listas = {
    pendentes: linhas.filter(l => !l.paga),
    pagas: linhas.filter(l => l.paga),
    projetadas: linhas.filter(l => l.projetado),
    todas: linhas,
  }

  const buscarVinculos = () => {
    const c = candidatosVinculo(contrato, schedules)
    if (!c.length) { setAviso('Nenhum agendamento parecido sem contrato.'); return }
    setVinculo(c)
  }

  const renovar = async (novoFim) => {
    try {
      const salvo = await atualizarContrato(contrato.id, { data_fim: novoFim, status: 'ativo' }, {
        tipo: 'renovacao', data_evento: hoje, detalhes: { de: contrato.data_fim, para: novoFim },
      })
      const plano = await planejarParcelasContrato(salvo)
      await aplicarParcelasContrato(plano, { motivo: `Contrato ${rotuloContrato(salvo)}: renovação` })
      setAviso(`Renovado até ${fmtDate(novoFim)}: ${plano.criar.length} parcela(s) nova(s).`)
      recarregar()
    } catch (err) { setErro(err.message) }
  }

  const btn = 'btn-secondary text-xs py-1.5 flex items-center gap-1'
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-semibold text-texto-1">{rotuloContrato(contrato)}</p>
          <p className="text-xs text-texto-3">
            {contrato.tipo === 'receber' ? 'A receber' : 'A pagar'} · {contrato.favorecido || '—'}{contrato.numero ? ` · nº ${contrato.numero}` : ''}
          </p>
        </div>
        <span className={`badge ${contrato.status === 'ativo' ? 'bg-primary/15 text-primary-fg' : 'bg-surface-2 text-texto-2'}`}>{STATUS_CONTRATO[contrato.status]}</span>
      </div>

      {podeEditar && (
        <div className="flex flex-wrap gap-2">
          {projetadas.length > 0 && <button className={btn} onClick={() => setReajusteDe(projetadas[0])}><TrendingUp size={12} /> Confirmar reajuste</button>}
          <button className={btn} onClick={() => setModal('aditivo')}><Pencil size={12} /> Aditivo / editar</button>
          {contrato.data_fim && <button className={btn} onClick={() => setModal('renovar')}><RefreshCw size={12} /> Renovar</button>}
          <button className={btn} onClick={buscarVinculos}><Search size={12} /> Buscar agendamentos para vincular</button>
          {contrato.status === 'ativo' && <button className={btn} onClick={() => setModal('rescindir')}><Ban size={12} /> Rescindir</button>}
          {pode('contratos', 'excluir') && !parcelas.some(parcelaPaga) && <button className={`${btn} text-perigo`} onClick={() => setModal('excluir')}><Trash2 size={12} /> Excluir</button>}
        </div>
      )}
      {aviso && <p className="text-xs text-primary-fg">{aviso}</p>}
      {pendentesForaDaVigencia(contrato, linhas).length > 0 && (
        <p className="text-xs text-aviso bg-surface-2/60 rounded-lg px-3 py-2">
          ⚠ Contrato {STATUS_CONTRATO[contrato.status].toLowerCase()} com {pendentesForaDaVigencia(contrato, linhas).length} parcela(s) pendente(s)
          (reaberta(s) por estorno): {pendentesForaDaVigencia(contrato, linhas).map(l => `${PAPEIS[l.papel]} ${fmtDate(l.vencimento)}`).join(', ')}.
        </p>
      )}
      {erro && <p className="text-xs text-perigo">{erro}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-surface-2/60">
        <Info rotulo="Valor atual">{fmt(valorAtual(contrato, schedules))}</Info>
        <Info rotulo="Vigência">{fmtDate(contrato.data_inicio)} – {contrato.data_fim ? fmtDate(contrato.data_fim) : 'sem fim'}</Info>
        <Info rotulo="Próximo vencimento">{prox ? `${fmtDate(prox.startDate)} · ${fmt(prox.amount)}` : '—'}</Info>
        <Info rotulo="Próximo reajuste">{contrato.proximo_reajuste ? fmtDate(contrato.proximo_reajuste) : '—'}</Info>
        <Info rotulo="Índice">
          {contrato.indice_reajuste === 'FIXO' ? `Fixo ${String(contrato.percentual_fixo ?? 0).replace('.', ',')}%`
            : contrato.indice_reajuste === 'NENHUM' ? 'Sem reajuste'
              : `${contrato.indice_reajuste}${indice?.acumulado_12m != null ? ` ${String(indice.acumulado_12m).replace('.', ',')}% (12m até ${fmtYm(indice.competencia)})` : ''}`}
          {indice?.aviso && contrato.indice_reajuste !== 'FIXO' && <span className="block text-[11px] text-aviso">⚠ {indice.aviso}</span>}
        </Info>
        <Info rotulo="Bonificação">{contrato.bonificacao_valor > 0 ? `${fmt(contrato.bonificacao_valor)} × ${contrato.bonificacao_meses} meses` : '—'}</Info>
        <Info rotulo="Condomínio">{contrato.tem_condominio ? `${fmt(contrato.valor_condominio_previsto)} · ${contrato.favorecido_condominio || '—'}` : 'Não'}</Info>
        <Info rotulo="Aviso prévio">{contrato.aviso_previo_dias} dias{contrato.renovacao_automatica ? ' · renova sozinho' : ''}</Info>
        <Info rotulo="Conta">{conta ? conta.apelido || conta.name : '—'}</Info>
        <Info rotulo="Categoria">{cat?.name || '—'}</Info>
        <Info rotulo="Perfil">{perfil?.name || '—'}</Info>
        <Info rotulo="Anexo">
          {contrato.link_anexo
            ? <a href={contrato.link_anexo} target="_blank" rel="noopener noreferrer" className="text-primary-fg inline-flex items-center gap-1 hover:underline">Abrir <ExternalLink size={11} /></a>
            : '—'}
        </Info>
      </div>

      {extra.itens.length > 0 && (
        <div>
          <p className="label">Itens previstos</p>
          <ul className="text-xs text-texto-2 space-y-0.5">
            {extra.itens.map(i => <li key={i.id}>{i.descricao} · {i.responsavel === 'proprietario' ? 'proprietário' : 'inquilino'}{i.valor_previsto != null ? ` · ${fmt(i.valor_previsto)}` : ''}</li>)}
          </ul>
        </div>
      )}

      {vinculadas.length > 0 && (
        <div>
          <p className="label">Agendamentos vinculados</p>
          <ul className="space-y-1">
            {vinculadas.map(s => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-xs bg-surface-2/60 rounded px-2 py-1.5">
                <span className="text-texto-2 min-w-0 truncate">{s.description} · {PAPEIS[s.contratoPapel] || '—'} · {(s.registered || []).length} paga(s)</span>
                {podeEditar && <button className="text-texto-3 hover:text-perigo inline-flex items-center gap-1" onClick={() => desvincularDoContrato(contrato, s).then(recarregar).catch(e => setErro(e.message))}><Unlink size={12} /> Desvincular</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {estimadas.length > 0 && (
        <p className="text-xs text-aviso bg-surface-2/60 rounded-lg px-3 py-2">
          ⚠ {estimadas.length} composição(ões) do condomínio estimada(s) — revisar: {estimadas.map(t => (
            <button key={t.id} className="underline mr-2" onClick={() => setRevisar(t)}>{fmtDate(t.date)} {fmt(t.amount)}</button>
          ))}
        </p>
      )}

      <div>
        <div className="flex flex-wrap gap-1 mb-2">
          {[['pendentes', 'Pendentes'], ['projetadas', 'Projetadas'], ['pagas', 'Pagas'], ['todas', 'Todas']].map(([k, r]) => (
            <button key={k} onClick={() => setAba(k)} className={`text-xs px-2 py-1 rounded ${aba === k ? 'bg-primary/15 text-primary-fg font-semibold' : 'text-texto-2 hover:bg-surface-hover'}`}>
              {r} ({listas[k].length})
            </button>
          ))}
          <button onClick={() => setAba('creditos')} className={`text-xs px-2 py-1 rounded ${aba === 'creditos' ? 'bg-primary/15 text-primary-fg font-semibold' : 'text-texto-2 hover:bg-surface-hover'}`}>
            Créditos do proprietário ({creditos.filter(c => c.status === 'aberto').length} aberto(s))
          </button>
        </div>
        {aba === 'creditos' ? (
          <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-texto-3 border-b border-borda">
                  <th className="px-2 py-1.5 text-left">Origem</th><th className="px-2 py-1.5 text-left hidden sm:table-cell">Itens</th>
                  <th className="px-2 py-1.5 text-right">Valor</th><th className="px-2 py-1.5 text-left">Situação</th>
                </tr>
              </thead>
              <tbody>
                {creditos.map(c => {
                  const alvo = parcelaDoCredito.get(c.id)
                  return (
                    <tr key={c.id} className="border-b border-borda/50 align-top">
                      <td className="px-2 py-1.5 text-texto-2">{c.descricao || '—'}</td>
                      <td className="px-2 py-1.5 text-texto-3 hidden sm:table-cell">{(c.itens || []).map(i => `${i.desc} ${fmt(i.valor)}`).join(' · ')}</td>
                      <td className="px-2 py-1.5 text-right text-texto-1 font-medium whitespace-nowrap">{fmt(c.valor)}</td>
                      <td className="px-2 py-1.5">
                        {c.status === 'compensado'
                          ? <span className="text-primary-fg">Abatido no aluguel pago em {fmtDate(c.data_compensacao)}</span>
                          : alvo ? (
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              <span className="text-texto-2">Aberto — abate no aluguel de {fmtDate(alvo.startDate)}</span>
                              {podeEditar && <button className="text-primary-fg hover:underline" onClick={() => adiarCreditoNaParcela(alvo.id, c.id)}>Não abater neste mês</button>}
                            </span>
                          ) : <span className="text-aviso">Aberto — sem aluguel pendente para abater</span>}
                      </td>
                    </tr>
                  )
                })}
                {creditos.length === 0 && <tr><td colSpan={4} className="px-2 py-3 text-center text-texto-3">Nenhum crédito do proprietário.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
        <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-texto-3 border-b border-borda">
                <th className="px-2 py-1.5 text-left">Nº</th><th className="px-2 py-1.5 text-left">Papel</th>
                <th className="px-2 py-1.5 text-left">Vencimento</th><th className="px-2 py-1.5 text-left hidden sm:table-cell">Composição</th>
                <th className="px-2 py-1.5 text-right">Valor</th><th className="px-2 py-1.5 text-left">Situação</th>
              </tr>
            </thead>
            <tbody>
              {listas[aba].map(l => {
                const s = l.schedule
                const comp = [
                  ...(l.composicao?.itens || []).map(i => `${i.desc} ${fmt(i.valor)}`),
                  l.composicao?.projecao && l.projetado ? textoProjecao(l.composicao.projecao) : '',
                  l.vinculada ? `série vinculada: ${s.description}` : '',
                ].filter(Boolean).join(' · ')
                return (
                  <tr key={l.key} className="border-b border-borda/50">
                    <td className="px-2 py-1.5 text-texto-2">{l.numero ?? '—'}{l.total ? `/${l.total}` : ''}</td>
                    <td className="px-2 py-1.5 text-texto-2">{PAPEIS[l.papel]}</td>
                    <td className="px-2 py-1.5 text-texto-2 whitespace-nowrap">{fmtDate(l.vencimento)}</td>
                    <td className="px-2 py-1.5 text-texto-3 hidden sm:table-cell">{comp}</td>
                    <td className="px-2 py-1.5 text-right text-texto-1 font-medium whitespace-nowrap">{fmt(l.valor)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {l.paga ? <span className="text-primary-fg">Paga</span>
                        : l.projetado ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-aviso outline-dashed outline-1 outline-borda-forte rounded px-1">Projetado</span>
                            {podeEditar && l.papel === 'aluguel' && !l.vinculada && <button className="text-primary-fg hover:underline" onClick={() => setReajusteDe(s)}>Confirmar</button>}
                          </span>
                        ) : <span className="text-texto-2">{l.vencimento < hoje ? 'Em atraso' : 'Pendente'}</span>}
                    </td>
                  </tr>
                )
              })}
              {listas[aba].length === 0 && <tr><td colSpan={6} className="px-2 py-3 text-center text-texto-3">Nenhuma parcela.</td></tr>}
            </tbody>
          </table>
        </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="label">Pagamentos (somente leitura)</p>
          {pagamentos.length === 0 ? <p className="text-xs text-texto-3">Nenhum pagamento ainda.</p> : (
            <ul className="space-y-0.5 max-h-48 overflow-y-auto">
              {pagamentos.map(t => (
                <li key={t.id} className="flex justify-between gap-2 text-xs">
                  <span className="text-texto-2 truncate">
                    {fmtDate(t.date)} · {t.description}
                    {t.composicao?.estimada && <button className="ml-1.5 text-aviso underline" onClick={() => setRevisar(t)}>estimada — revisar</button>}
                  </span>
                  <span className="text-texto-1 whitespace-nowrap">{fmt(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="label">Linha do tempo</p>
          {extra.eventos.length === 0 ? <p className="text-xs text-texto-3">Sem eventos.</p> : (
            <ol className="space-y-1 max-h-48 overflow-y-auto">
              {extra.eventos.map(e => (
                <li key={e.id} className="text-xs">
                  <span className="text-texto-3">{fmtDate(e.data_evento)}</span>{' '}
                  <span className="text-texto-1 font-medium">{ROTULO_EVENTO[e.tipo] || e.tipo}</span>{' '}
                  <span className="text-texto-2">{resumoEvento(e)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {modal === 'aditivo' && (
        <Modal open onClose={() => setModal(null)} title="Aditivo / editar contrato" size="xl">
          <ContratoWizard contrato={contrato} onClose={() => setModal(null)} onSalvo={() => { setModal(null); recarregar() }} />
        </Modal>
      )}
      {modal === 'renovar' && <RenovarModal contrato={contrato} onClose={() => setModal(null)} onRenovar={(d) => { setModal(null); renovar(d) }} />}
      {modal === 'rescindir' && (
        <RescindirModal contrato={contrato} parcelas={parcelas} onClose={() => setModal(null)}
          onRescindir={async (data, motivo) => {
            try {
              const r = await rescindirContrato(contrato, data, { motivo })
              setAviso(`Contrato rescindido: ${r.canceladas} parcela(s) pendente(s) cancelada(s).`)
              setModal(null)
              recarregar()
            } catch (err) { setErro(err.message) }
          }} />
      )}
      <ConfirmDialog
        open={modal === 'excluir'} onClose={() => setModal(null)} danger confirmLabel="Excluir contrato" title="Excluir contrato"
        message="O contrato e as parcelas pendentes saem; agendamentos vinculados ficam, sem o contrato. Não pode ser desfeito."
        onConfirm={() => excluirContrato(contrato).then(onClose).catch(e => setErro(e.message))}
      />
      {revisar && (
        <ComposicaoBoletoModal contrato={contrato} tx={revisar} composicaoInicial={revisar.composicao} modo="edicao"
          onConfirmar={async ({ composicao }) => {
            const r = await editarComposicaoLancamento(revisar, composicao)
            if (!r.ok) throw new Error(r.aviso)
            setRevisar(null)
            setAviso('Composição revisada.')
          }}
          onClose={() => setRevisar(null)} />
      )}
      {reajusteDe && <ConfirmarReajusteModal contrato={contrato} parcela={reajusteDe} onClose={() => setReajusteDe(null)} onConfirmado={() => { setAviso('Reajuste confirmado.'); recarregar() }} />}
      {vinculo && (
        <VinculoModal contrato={contrato} candidatos={vinculo} onClose={() => setVinculo(null)}
          onConcluido={(r) => { setVinculo(null); setAviso(`${r.vinculados} agendamento(s) vinculado(s).`); recarregar() }} />
      )}
    </div>
  )
}

function RenovarModal({ contrato, onClose, onRenovar }) {
  const [data, setData] = useState(() => addMesesData(contrato.data_fim, 12))
  return (
    <Modal open onClose={onClose} title="Renovar contrato" size="sm">
      <div className="space-y-3 text-sm">
        <p className="text-texto-2">Fim atual: {fmtDate(contrato.data_fim)}. As parcelas do novo período são geradas com a projeção do reajuste.</p>
        <div><label className="label">Novo fim da vigência</label><input type="date" className="input" value={data} min={contrato.data_fim} onChange={e => setData(e.target.value)} /></div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={!data || data <= contrato.data_fim} onClick={() => onRenovar(data)}>Renovar</button>
        </div>
      </div>
    </Modal>
  )
}

function RescindirModal({ contrato, parcelas, onClose, onRescindir }) {
  const [data, setData] = useState(hojeStr())
  const [motivo, setMotivo] = useState('')
  const canceladas = parcelas.filter(s => !parcelaPaga(s) && s.startDate > data)
  return (
    <Modal open onClose={onClose} title={`Rescindir — ${rotuloContrato(contrato)}`} size="md">
      <div className="space-y-3 text-sm">
        <p className="text-texto-2">As parcelas pendentes com vencimento depois da data de saída são canceladas; as pagas ficam. A multa rescisória e o simulador chegam na próxima entrega.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="label">Data de saída</label><input type="date" className="input" value={data} onChange={e => setData(e.target.value)} /></div>
          <div><label className="label">Motivo (opcional)</label><input className="input" value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={200} /></div>
        </div>
        <p className="text-xs text-texto-2">
          Serão canceladas <strong className="text-texto-1">{canceladas.length}</strong> parcela(s) — {fmt(r2(canceladas.reduce((a, s) => a + Number(s.amount), 0)))}.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-danger" disabled={!data} onClick={() => onRescindir(data, motivo)}>Confirmar rescisão</button>
        </div>
      </div>
    </Modal>
  )
}
