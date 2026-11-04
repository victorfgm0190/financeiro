import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Pencil, RefreshCw, Search, Ban, Trash2, Unlink, TrendingUp, Link2, Plus } from 'lucide-react'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { buscarContratoApi } from '../../lib/contratosApi'
import {
  STATUS_CONTRATO, ehParcelaGerada, parcelaPaga, valorAtual, proximaParcela, rotuloContrato, r2,
  linhasDoContrato, linhaReal, textoProjecao, gerarPlanoParcelas, confirmadosDe, ehParcelaDeVinculo,
} from '../../lib/contratos/parcelas'
import { candidatosVinculo, lancamentosCandidatosContrato } from '../../lib/contratos/vinculo'
import { pendentesForaDaVigencia } from '../../lib/contratos/estorno'
import { destinosCreditos, REGRAS_ABATIMENTO, regraAbatimento, creditoAAbater } from '../../lib/contratos/creditos'
import { ehCondominioAberto, temComposicaoInformada } from '../../lib/contratos/composicaoAberta'
import { diferencaDoPagamento, esperadoDoPagamento } from '../../lib/contratos/efetivacao'
import { rotuloPapel, rotulosContrato, rotuloModalidade, rotuloTipo, ehAluguel } from '../../lib/contratos/rotulos'
import ComposicaoBoletoModal from './ComposicaoBoletoModal'
import { hojeStr, addMesesData, fmtYm } from '../../lib/contratos/datas'
import ContratoWizard from './ContratoWizard'
import VinculoModal from './VinculoModal'
import ConfirmarReajusteModal from './ConfirmarReajusteModal'
import VincularPagamentoModal from './VincularPagamentoModal'
import { CreditoManualModal, TrocarDestinoModal, JustificarDiferencaModal } from './CreditosModais'

const ROTULO_EVENTO = {
  criacao: 'Criação', reajuste: 'Reajuste', confirmacao_valor: 'Valor confirmado', aditivo: 'Aditivo', renovacao: 'Renovação',
  rescisao: 'Rescisão', suspensao: 'Suspensão', vinculo: 'Vínculo', desvinculo: 'Desvínculo', edicao_parcela: 'Parcela editada',
}

const nParcela = (d) => (d.numero ? ` ${d.numero}${d.total ? `/${d.total}` : ''}` : '')

function resumoEvento(e, contrato) {
  const d = e.detalhes || {}
  if (e.tipo === 'reajuste' || e.tipo === 'confirmacao_valor') {
    return `${e.valor_anterior != null ? fmt(e.valor_anterior) : '—'} → ${fmt(e.valor_novo)}${e.percentual != null ? ` (${String(e.percentual).replace('.', ',')}%)` : ''} · ${d.escopo === 'so_esta' ? 'só esta parcela' : `${(d.parcelas || []).length} parcela(s)`}`
  }
  // Vínculo/desvínculo de LANÇAMENTO a uma parcela (C2).
  if ((e.tipo === 'vinculo' || e.tipo === 'desvinculo') && d.acao === 'lancamento') {
    const valor = e.tipo === 'vinculo' ? e.valor_novo : e.valor_anterior
    const parcela = `${rotuloPapel(contrato, d.papel)}${nParcela(d)} de ${fmtYm(d.competencia)}`
    return e.tipo === 'vinculo'
      ? `Pagamento de ${fmtDate(d.data_pagamento)} (${fmt(valor)}) ligado a ${parcela}${d.criada ? ' — parcela criada para ele' : ''}`
      : `Pagamento de ${fmtDate(d.data_pagamento)} (${fmt(valor)}) desligado de ${parcela}${d.removida ? ' — parcela criada pelo vínculo removida' : ' — volta a pendente'}`
  }
  if (e.tipo === 'vinculo' || e.tipo === 'desvinculo') return `${d.descricao || d.agendamento_id || ''}${d.papel ? ` (${rotuloPapel(contrato, d.papel)})` : ''}`
  if (e.tipo === 'edicao_parcela' && d.acao === 'exclusao') return `Parcela de ${fmtDate(d.vencimento)} excluída`
  if (e.tipo === 'edicao_parcela' && d.acao === 'estorno_reaberta') return `Pagamento de ${fmtDate(d.vencimento)} estornado — parcela reaberta${d.status_contrato && d.status_contrato !== 'ativo' ? ` (contrato ${d.status_contrato})` : ''}`
  if (e.tipo === 'edicao_parcela' && d.acao === 'estorno_cancelada') return `Pagamento de ${fmtDate(d.vencimento)} estornado — parcela cancelada`
  if (e.tipo === 'edicao_parcela' && d.acao === 'reversao_creditos') return `Lançamento estornado/excluído — créditos: ${(d.creditos_reabertos || []).length} reaberto(s), ${(d.creditos_removidos || []).length} removido(s)${(d.creditos_mantidos || []).length ? `, ${d.creditos_mantidos.length} já abatido(s) mantido(s)` : ''}`
  if (e.tipo === 'edicao_parcela' && d.acao === 'edicao') return `Parcela de ${fmtDate(d.vencimento)} editada: ${Object.keys(d.campos || {}).join(', ')}${d.escopo === 'proximas' ? ' (esta e as próximas)' : ''}`
  if (e.tipo === 'edicao_parcela' && d.acao === 'credito_manual') return `Crédito manual "${d.descricao || ''}" de ${fmt(e.valor_novo)}${d.parcela_id ? ' com destino escolhido' : ''}`
  if (e.tipo === 'edicao_parcela' && d.acao === 'credito_destino') return `Crédito "${d.descricao || ''}" ${d.parcela_id ? 'com nova parcela de destino' : 'volta a seguir a regra do contrato'}`
  if (e.tipo === 'edicao_parcela' && (d.acao === 'composicao_informada' || d.acao === 'composicao_alterada')) return `Composição do boleto ${d.acao === 'composicao_informada' ? 'informada' : 'alterada'} na parcela de ${fmtDate(d.vencimento)}: ${fmt(e.valor_novo)}${d.credito > 0 ? ` · crédito previsto ${fmt(d.credito)}` : ''}`
  if (e.tipo === 'edicao_parcela' && d.acao === 'composicao_removida') return `Composição do boleto removida da parcela de ${fmtDate(d.vencimento)}: volta a ${fmt(e.valor_novo)}`
  if (e.tipo === 'edicao_parcela' && d.acao === 'justificativa') return `Diferença de ${fmt(e.valor_anterior)} justificada com ${fmt(e.valor_novo)} em créditos${d.restante > 0.005 ? ` · ${fmt(d.restante)} continua como diferença` : ''}`
  if (e.tipo === 'aditivo') return Object.keys(d.campos || {}).join(', ')
  if (e.tipo === 'renovacao') return `Fim ${fmtDate(d.de)} → ${fmtDate(d.para)}`
  if (e.tipo === 'rescisao') return `Saída ${fmtDate(d.data_saida)} · ${(d.canceladas || []).length} pendente(s) cancelada(s)${d.motivo ? ` · ${d.motivo}` : ''}`
  if (e.tipo === 'criacao') return `Vigência ${fmtDate(d.data_inicio)}${d.data_fim ? ` a ${fmtDate(d.data_fim)}` : ' sem fim'}`
  return ''
}

const Info = ({ rotulo, children }) => (
  <div className="min-w-0"><p className="text-[11px] text-texto-3">{rotulo}</p><p className="text-sm text-texto-1 break-words">{children}</p></div>
)
const acao = 'text-primary-fg hover:underline text-left'

// Ficha do contrato: dados, parcelas (pagas/pendentes/projetadas/sem pagamento), séries vinculadas,
// pagamentos, créditos a abater, linha do tempo e as ações (Confirmar reajuste, Aditivo, Renovar,
// Buscar vínculos, Vincular pagamento, Rescindir).
export default function ContratoFicha({ id, acaoInicial = null, onClose }) {
  const {
    contratoPorId, schedules, transactions, accounts, profiles, categories, indicesContratos, carregarIndice, pode,
    planejarParcelasContrato, aplicarParcelasContrato, atualizarContrato, desvincularDoContrato, rescindirContrato,
    excluirContrato, creditosContratos, adiarCreditoNaParcela, editarComposicaoLancamento, aplicarCreditosEmValorManual,
    desfazerVinculoLancamento, desvincularLancamento, informarComposicao, abrirComposicaoParcela,
  } = useApp()
  const contrato = contratoPorId(id)
  const [extra, setExtra] = useState({ itens: [], eventos: [] })
  const [aba, setAba] = useState('pendentes')
  const [revisar, setRevisar] = useState(null)
  const [modal, setModal] = useState(acaoInicial === 'rescindir' ? 'rescindir' : null)
  const [reajusteDe, setReajusteDe] = useState(null)
  const [vinculo, setVinculo] = useState(null)
  const [vincularLinha, setVincularLinha] = useState(null)
  const [associarTx, setAssociarTx] = useState(null)
  const [informar, setInformar] = useState(null)
  const [justificar, setJustificar] = useState(null)
  const [desfazer, setDesfazer] = useState(null)
  const [trocarDestino, setTrocarDestino] = useState(null)
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
  // Valor esperado de cada competência (inclusive as sem parcela) = o plano do contrato inteiro.
  const plano = useMemo(() => (contrato
    ? gerarPlanoParcelas(contrato, { hoje, indices: indicesContratos, confirmados: confirmadosDe(contrato, doContrato) })
    : []), [contrato, hoje, indicesContratos, doContrato])
  const linhas = useMemo(() => (contrato ? linhasDoContrato(contrato, doContrato, transactions, { hoje, plano }) : []), [contrato, doContrato, transactions, hoje, plano])
  const vinculadas = useMemo(() => doContrato.filter(s => !ehParcelaGerada(s, contrato.id)), [doContrato, contrato])
  // Pagamentos: lançamentos das parcelas do contrato e das séries vinculadas (só leitura).
  const pagamentos = useMemo(() => {
    const ids = new Set(doContrato.map(s => s.id))
    const porMeta = new Set(doContrato.flatMap(s => Object.values(s.registeredMeta || {}).map(m => m?.lancamento_id).filter(Boolean)))
    return transactions.filter(t => ids.has(t.scheduleId) || porMeta.has(t.id) || t.contratoId === id)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  }, [doContrato, transactions, id])

  if (!contrato) return <p className="text-sm text-texto-3">Contrato não encontrado (ou ainda carregando).</p>

  const rot = rotulosContrato(contrato)
  const aluguel = ehAluguel(contrato)
  const creditos = (creditosContratos || []).filter(c => c.contrato_id === contrato.id)
    .sort((a, b) => String(b.data_origem).localeCompare(String(a.data_origem)))
  const destinos = destinosCreditos(contrato, schedules, creditos)
  const estimadas = pagamentos.filter(t => t.composicao?.estimada)
  const txComLinha = new Set(linhas.map(l => l.tx?.id).filter(Boolean))
  const linhasAbertas = linhas.filter(l => !l.paga && !l.semCobranca)

  const conta = accounts.find(a => a.id === contrato.conta_id)
  const perfil = profiles.find(p => p.id === contrato.perfil_id)
  const cat = categories.find(c => c.id === contrato.categoria_id)
  const prox = proximaParcela(contrato, schedules)
  const projetadas = parcelas.filter(s => s.valorStatus === 'projetado' && !parcelaPaga(s) && s.contratoPapel === 'aluguel')
  const indice = indicesContratos[contrato.indice_reajuste]
  // "Sem pagamento vinculado" e "Sem cobrança" não são parcelas: fora de Pendentes e do atraso.
  const listas = {
    pendentes: linhas.filter(l => linhaReal(l) && !l.paga),
    passado: linhas.filter(l => !l.paga && !l.semCobranca && l.vencimento < hoje),
    projetadas: linhas.filter(l => l.projetado),
    pagas: linhas.filter(l => l.paga),
    todas: linhas,
  }
  const foraDaVigencia = pendentesForaDaVigencia(contrato, linhas.filter(linhaReal))

  const buscarVinculos = () => {
    const c = candidatosVinculo(contrato, schedules)
    const contasDoPerfil = new Set(accounts.filter(a => a.type !== 'credit' && contrato.perfil_id && a.profileId === contrato.perfil_id).map(a => a.id))
    const lancs = lancamentosCandidatosContrato(contrato, transactions, schedules, linhasAbertas, { contasDoPerfil })
    if (!c.length && !lancs.length) { setAviso('Nenhum agendamento ou lançamento parecido sem contrato.'); return }
    setVinculo({ candidatos: c, lancamentos: lancs })
  }

  const renovar = async (novoFim) => {
    try {
      const salvo = await atualizarContrato(contrato.id, { data_fim: novoFim, status: 'ativo' }, {
        tipo: 'renovacao', data_evento: hoje, detalhes: { de: contrato.data_fim, para: novoFim },
      })
      const p = await planejarParcelasContrato(salvo)
      await aplicarParcelasContrato(p, { motivo: `Contrato ${rotuloContrato(salvo)}: renovação` })
      setAviso(`Renovado até ${fmtDate(novoFim)}: ${p.criar.length} parcela(s) nova(s).`)
      recarregar()
    } catch (err) { setErro(err.message) }
  }
  const concluido = (msg) => {
    setVincularLinha(null); setAssociarTx(null); setInformar(null); setJustificar(null); setTrocarDestino(null); setModal(null)
    setAviso(msg)
    recarregar()
  }
  const executarDesfazer = async () => {
    const l = desfazer
    setDesfazer(null)
    try {
      await desfazerVinculoLancamento(contrato, l, { desvincular: desvincularLancamento })
      concluido('Vínculo desfeito: o lançamento continua, sem o contrato.')
    } catch (err) { setErro(err.message) }
  }

  // Ações de cada linha (só com permissão de editar o contrato).
  const acoesDaLinha = (l) => {
    if (!podeEditar || l.semCobranca) return null
    const out = []
    if (!l.paga) {
      out.push(<button key="vinc" className={acao} onClick={() => setVincularLinha(l)}>Vincular pagamento</button>)
      // Boleto do condomínio chegou antes do pagamento: os itens já entram na parcela aberta.
      if (l.papel === 'condominio' && ehCondominioAberto(l.schedule, contrato)) {
        out.push(<button key="comp" className={acao} onClick={() => abrirComposicaoParcela(l.schedule.id)}>{temComposicaoInformada(l.schedule) ? 'Ver/editar composição' : 'Informar composição'}</button>)
      }
      // Recibo do aluguel antes do pagamento: os itens dele passam a ser os da parcela (só esta).
      if (l.papel === 'aluguel' && !l.vinculada && l.schedule) {
        out.push(<button key="recibo" className={acao} onClick={() => abrirComposicaoParcela(l.schedule.id)}>{l.schedule.composicao?.informada ? 'Ver/editar recibo' : 'Informar composição'}</button>)
      }
      if (l.projetado && l.papel === 'aluguel' && !l.vinculada) out.push(<button key="reaj" className={acao} onClick={() => setReajusteDe(l.schedule)}>Confirmar</button>)
      return out
    }
    if (l.tx && (l.meta?.vinculo === 'manual' || ehParcelaDeVinculo(l.schedule))) {
      out.push(<button key="desf" className={acao} onClick={() => setDesfazer(l)}>Desfazer vínculo</button>)
    }
    if (l.tx && l.papel === 'condominio' && !l.tx.composicao?.itens?.length) {
      out.push(<button key="comp" className={acao} onClick={() => setInformar(l)}>Informar composição</button>)
    }
    // Aluguel pago: composição pelo recibo (o lançamento não muda).
    if (l.tx && l.papel === 'aluguel' && l.schedule) {
      out.push(<button key="recibo" className={acao} onClick={() => abrirComposicaoParcela(l.schedule.id, { txId: l.tx.id })}>{l.tx.composicao?.informada ? 'Ver/editar recibo' : 'Informar composição'}</button>)
    }
    if (l.tx && l.papel === 'aluguel' && diferencaDoPagamento(l.tx, esperadoDoPagamento(l, plano)).diferenca > 0.005) {
      out.push(<button key="just" className={acao} onClick={() => setJustificar(l)}>Justificar diferença</button>)
    }
    return out
  }

  const situacao = (l) => {
    if (l.semCobranca) return <span className="text-texto-3">Sem cobrança</span>
    if (l.semParcela) return <span className="text-aviso">Sem pagamento vinculado</span>
    if (l.paga) return <span className="text-primary-fg">Paga</span>
    if (l.projetado) return <span className="text-aviso outline-dashed outline-1 outline-borda-forte rounded px-1">Projetado</span>
    return <span className="text-texto-2">{l.vencimento < hoje ? 'Em atraso' : 'Pendente'}</span>
  }

  const btn = 'btn-secondary text-xs py-1.5 flex items-center gap-1'
  const ABAS = [['pendentes', 'Pendentes'], ['passado', 'Em aberto do passado'], ['projetadas', 'Projetadas'], ['pagas', 'Pagas'], ['todas', 'Todas']]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-semibold text-texto-1">{rotuloContrato(contrato)}</p>
          <p className="text-xs text-texto-3">
            {rotuloModalidade(contrato)} · {rotuloTipo(contrato)} · {contrato.favorecido || '—'}{contrato.numero ? ` · nº ${contrato.numero}` : ''}
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
      {foraDaVigencia.length > 0 && (
        <p className="text-xs text-aviso bg-surface-2/60 rounded-lg px-3 py-2">
          ⚠ Contrato {STATUS_CONTRATO[contrato.status].toLowerCase()} com {foraDaVigencia.length} parcela(s) pendente(s)
          (reaberta(s) por estorno): {foraDaVigencia.map(l => `${rotuloPapel(contrato, l.papel)} ${fmtDate(l.vencimento)}`).join(', ')}.
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
        <Info rotulo={rot.desconto}>{contrato.bonificacao_valor > 0 ? `${fmt(contrato.bonificacao_valor)} × ${contrato.bonificacao_meses} parcelas` : '—'}</Info>
        {aluguel && <Info rotulo="Condomínio">{contrato.tem_condominio ? `${fmt(contrato.valor_condominio_previsto)} · ${contrato.favorecido_condominio || '—'}` : 'Não'}</Info>}
        <Info rotulo="Aviso prévio">{contrato.aviso_previo_dias} dias{contrato.renovacao_automatica ? ' · renova sozinho' : ''}</Info>
        <Info rotulo="Conta">{conta ? conta.apelido || conta.name : '—'}</Info>
        <Info rotulo="Categoria">{cat?.name || '—'}</Info>
        <Info rotulo="Perfil">{perfil?.name || '—'}</Info>
        <Info rotulo="Meses sem cobrança">{(contrato.meses_sem_cobranca || []).length ? contrato.meses_sem_cobranca.map(fmtYm).join(', ') : '—'}</Info>
        <Info rotulo="Anexo">
          {contrato.link_anexo
            ? <a href={contrato.link_anexo} target="_blank" rel="noopener noreferrer" className="text-primary-fg inline-flex items-center gap-1 hover:underline">Abrir <ExternalLink size={11} /></a>
            : '—'}
        </Info>
      </div>

      {(contrato.encargos || []).length > 0 && (
        <div data-testid="ficha-encargos">
          <p className="label">Encargos e descontos na parcela</p>
          <ul className="text-xs text-texto-2 space-y-0.5">
            {contrato.encargos.map(e => (
              <li key={e.id || e.descricao}>
                {e.descricao} · {e.sinal === 'desconto' ? '−' : '+'}{fmt(e.valor)} · {e.parcelas_total}x · {e.parcela_inicio >= 1
                  ? `parcelas ${e.parcela_inicio} a ${e.parcela_inicio + e.parcelas_total - 1} do contrato`
                  : `começou antes do contrato; vai até a parcela ${e.parcela_inicio + e.parcelas_total - 1}`}{e.ativo === false ? ' · inativo' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {aluguel && extra.itens.filter(i => !i.na_parcela).length > 0 && (
        <div>
          <p className="label">Itens previstos</p>
          <ul className="text-xs text-texto-2 space-y-0.5">
            {extra.itens.filter(i => !i.na_parcela).map(i => <li key={i.id}>{i.descricao} · {i.responsavel === 'proprietario' ? 'proprietário' : 'inquilino'}{i.valor_previsto != null ? ` · ${fmt(i.valor_previsto)}` : ''}</li>)}
          </ul>
        </div>
      )}

      {vinculadas.length > 0 && (
        <div>
          <p className="label">Agendamentos vinculados</p>
          <ul className="space-y-1">
            {vinculadas.map(s => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-xs bg-surface-2/60 rounded px-2 py-1.5">
                <span className="text-texto-2 min-w-0 truncate">{s.description} · {rotuloPapel(contrato, s.contratoPapel)} · {(s.registered || []).length} paga(s)</span>
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
          {ABAS.map(([k, r]) => (
            <button key={k} onClick={() => setAba(k)} className={`text-xs px-2 py-1 rounded ${aba === k ? 'bg-primary/15 text-primary-fg font-semibold' : 'text-texto-2 hover:bg-surface-hover'}`}>
              {r} ({listas[k].length})
            </button>
          ))}
          <button onClick={() => setAba('creditos')} className={`text-xs px-2 py-1 rounded ${aba === 'creditos' ? 'bg-primary/15 text-primary-fg font-semibold' : 'text-texto-2 hover:bg-surface-hover'}`}>
            {rot.abaCreditos} ({creditos.filter(creditoAAbater).length} a abater)
          </button>
        </div>
        {aba === 'creditos' ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-texto-3">Regra: {REGRAS_ABATIMENTO[regraAbatimento(contrato)].toLowerCase()} (muda no Aditivo).</p>
              {podeEditar && <button className={btn} onClick={() => setModal('credito')}><Plus size={12} /> Novo crédito manual</button>}
            </div>
            <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-texto-3 border-b border-borda">
                    <th className="px-2 py-1.5 text-left">Origem</th><th className="px-2 py-1.5 text-left hidden sm:table-cell">Itens</th>
                    <th className="px-2 py-1.5 text-right">Valor</th><th className="px-2 py-1.5 text-left">Destino e situação</th>
                  </tr>
                </thead>
                <tbody>
                  {creditos.map(c => {
                    const d = destinos.get(c.id)
                    return (
                      <tr key={c.id} className="border-b border-borda/50 align-top">
                        <td className="px-2 py-1.5 text-texto-2">{c.descricao || '—'}<span className="block text-[11px] text-texto-3">{fmtDate(c.data_origem)}{c.origem_lancamento_id ? '' : c.origem_agendamento_id ? ' · boleto informado' : ' · manual'}</span></td>
                        <td className="px-2 py-1.5 text-texto-3 hidden sm:table-cell">{(c.itens || []).map(i => `${i.desc} ${fmt(i.valor)}`).join(' · ')}</td>
                        <td className="px-2 py-1.5 text-right text-texto-1 font-medium whitespace-nowrap">{fmt(c.valor)}</td>
                        <td className="px-2 py-1.5">
                          {c.status === 'compensado'
                            ? <span className="text-primary-fg">Abatido no pagamento de {fmtDate(c.data_compensacao)}</span>
                            : (
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                {d ? (
                                  d.bloqueado ? (
                                    <span className="text-aviso">
                                      ⚠ A parcela de {fmtDate(d.parcela.startDate)} tem valor digitado à mão: o crédito não entra sozinho.
                                      {podeEditar && <button className={`${acao} ml-1`} onClick={() => aplicarCreditosEmValorManual(d.parcela.id)}>Aplicar mesmo assim</button>}
                                    </span>
                                  ) : (
                                    <span className="text-texto-2">{c.status === 'previsto' ? 'Previsto (condomínio ainda não pago)' : 'Aberto'} — abate na parcela de {fmtDate(d.parcela.startDate)}{d.fixo ? ' (escolhida)' : ''}</span>
                                  )
                                ) : <span className="text-aviso">{c.status === 'previsto' ? 'Previsto' : 'Aberto'} — sem parcela pendente para abater</span>}
                                {podeEditar && d && !d.bloqueado && <button className={acao} onClick={() => adiarCreditoNaParcela(d.parcela.id, c.id)}>Não abater neste mês</button>}
                                {podeEditar && <button className={acao} onClick={() => setTrocarDestino(c)}>Trocar parcela de destino</button>}
                              </span>
                            )}
                        </td>
                      </tr>
                    )
                  })}
                  {creditos.length === 0 && <tr><td colSpan={4} className="px-2 py-3 text-center text-texto-3">Nenhum crédito.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
            {aba === 'passado' && listas.passado.some(l => l.semParcela) && (
              <p className="text-[11px] text-aviso mb-1">Competências sem pagamento vinculado: ligue o pagamento que você já lançou em "Vincular pagamento". Elas não entram em saldo, Fluxo nem Agendamentos.</p>
            )}
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
                    ...((l.paga ? l.tx?.composicao?.itens : null) || l.composicao?.itens || []).map(i => `${i.desc} ${fmt(i.valor)}`),
                    l.composicao?.projecao && l.projetado ? textoProjecao(l.composicao.projecao) : '',
                    l.vinculada ? `série vinculada: ${s.description}` : '',
                  ].filter(Boolean).join(' · ')
                  const acoes = acoesDaLinha(l)
                  const destaque = l.semParcela ? 'bg-aviso/5' : l.semCobranca ? 'opacity-70' : ''
                  return (
                    <tr key={l.key} className={`border-b border-borda/50 align-top ${destaque}`}>
                      <td className="px-2 py-1.5 text-texto-2 whitespace-nowrap">{l.numero ?? '—'}{l.numero && l.total ? `/${l.total}` : ''}</td>
                      <td className="px-2 py-1.5 text-texto-2">{rotuloPapel(contrato, l.papel)}</td>
                      <td className="px-2 py-1.5 text-texto-2 whitespace-nowrap">{fmtDate(l.vencimento)}<span className="block text-[11px] text-texto-3">{fmtYm(l.competencia)}</span></td>
                      <td className="px-2 py-1.5 text-texto-3 hidden sm:table-cell">{comp}</td>
                      <td className="px-2 py-1.5 text-right text-texto-1 font-medium whitespace-nowrap">{l.semCobranca ? '—' : fmt(l.valor)}</td>
                      <td className="px-2 py-1.5">
                        <span className="flex flex-col gap-0.5 items-start">{situacao(l)}{acoes}</span>
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
          <p className="label">Pagamentos</p>
          {pagamentos.length === 0 ? <p className="text-xs text-texto-3">Nenhum pagamento ainda.</p> : (
            <ul className="space-y-0.5 max-h-48 overflow-y-auto">
              {pagamentos.map(t => (
                <li key={t.id} className="flex justify-between gap-2 text-xs">
                  <span className="text-texto-2 min-w-0">
                    {fmtDate(t.date)} · {t.description}
                    {t.composicao?.estimada && <button className="ml-1.5 text-aviso underline" onClick={() => setRevisar(t)}>estimada — revisar</button>}
                    {podeEditar && !txComLinha.has(t.id) && (
                      <button className="ml-1.5 text-primary-fg hover:underline inline-flex items-center gap-0.5" onClick={() => setAssociarTx(t)}>
                        <Link2 size={11} /> Associar a uma parcela
                      </button>
                    )}
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
                  <span className="text-texto-2">{resumoEvento(e, contrato)}</span>
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
      {modal === 'credito' && <CreditoManualModal contrato={contrato} onClose={() => setModal(null)} onConcluido={concluido} />}
      <ConfirmDialog
        open={modal === 'excluir'} onClose={() => setModal(null)} danger confirmLabel="Excluir contrato" title="Excluir contrato"
        message="O contrato e as parcelas pendentes saem; agendamentos vinculados ficam, sem o contrato. Não pode ser desfeito."
        onConfirm={() => excluirContrato(contrato).then(onClose).catch(e => setErro(e.message))}
      />
      <ConfirmDialog
        open={!!desfazer} onClose={() => setDesfazer(null)} confirmLabel="Desfazer vínculo" title="Desfazer vínculo"
        message={desfazer ? `O pagamento de ${fmtDate(desfazer.tx?.date)} (${fmt(desfazer.tx?.amount)}) deixa de pagar ${rotuloPapel(contrato, desfazer.papel)} de ${fmtYm(desfazer.competencia)}. O lançamento continua no extrato, sem contrato.${ehParcelaDeVinculo(desfazer.schedule) ? ' A parcela criada para ele sai.' : ' A parcela volta a pendente.'}` : ''}
        onConfirm={executarDesfazer}
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
      {informar && (
        <ComposicaoBoletoModal contrato={contrato} tx={informar.tx} modo="informar"
          onConfirmar={async ({ itens, lembrar }) => {
            const ok = await informarComposicao(contrato, informar, { itens, lembrar })
            concluido(ok === false ? 'Composição gravada; o crédito deste boleto já tinha sido abatido e ficou como estava.' : 'Composição informada.')
          }}
          onClose={() => setInformar(null)} />
      )}
      {reajusteDe && <ConfirmarReajusteModal contrato={contrato} parcela={reajusteDe} onClose={() => setReajusteDe(null)} onConfirmado={() => { setAviso('Reajuste confirmado.'); recarregar() }} />}
      {vinculo && (
        <VinculoModal contrato={contrato} candidatos={vinculo.candidatos} lancamentos={vinculo.lancamentos} onClose={() => setVinculo(null)}
          onConcluido={(r) => { setVinculo(null); setAviso(r.mensagem || `${r.vinculados} agendamento(s) vinculado(s).`); recarregar() }} />
      )}
      {vincularLinha && <VincularPagamentoModal contrato={contrato} linha={vincularLinha} onClose={() => setVincularLinha(null)} onConcluido={concluido} />}
      {associarTx && <VincularPagamentoModal contrato={contrato} tx={associarTx} linhasAbertas={linhasAbertas} onClose={() => setAssociarTx(null)} onConcluido={concluido} />}
      {justificar && <JustificarDiferencaModal contrato={contrato} linha={justificar} esperado={esperadoDoPagamento(justificar, plano)} onClose={() => setJustificar(null)} onConcluido={concluido} />}
      {trocarDestino && <TrocarDestinoModal contrato={contrato} credito={trocarDestino} onClose={() => setTrocarDestino(null)} onConcluido={concluido} />}
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
          <div><label className="label">Motivo (opcional)</label><input className="input" value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={200} placeholder="Por que o contrato foi encerrado" /></div>
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
