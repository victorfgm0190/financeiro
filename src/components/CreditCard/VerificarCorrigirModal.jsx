import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate, today } from '../shared/utils'
import { controleGerencialAtivo } from '../../lib/controleGerencial'
import { faturaDoLancamento } from '../../lib/faturaCartao'
import {
  verificarCartao, TITULO_SECAO, SECOES, SECOES_NAO_GERENCIAIS, ymParaRef,
} from '../../lib/verificarCartao'
import { acoesDoPlano, linhasHistoricoRevisao } from '../../lib/revisaoCompetencia'
import { linhasHistorico, novoLoteId } from '../../lib/historico'

const ROTULO_ACAO = {
  REMOVER_GERENCIAL: 'Remover etapa A', CRIAR_GERENCIAL: 'Criar etapa A', ATUALIZAR_GERENCIAL: 'Atualizar etapa A',
  CRIAR_RESGATE: 'Criar resgate de reserva', ATUALIZAR_RESGATE: 'Atualizar resgate de reserva', REMOVER_RESGATE: 'Remover resgate de reserva',
  ATUALIZAR_DEVOLUCAO: 'Atualizar devolução gerencial', ATUALIZAR_PAGAMENTO: 'Atualizar pagamento da fatura',
}
const ROTULO_COMPETENCIA = {
  excluir_duplicata: (it) => `Excluir duplicata — o mesmo gasto já está na fatura ${ymParaRef(it.equivalente?.fatura)}`,
  mover: (it) => `Mudar para a fatura ${ymParaRef(it.mover?.para)}`,
  excluir_reserva: () => 'Excluir a reserva gerencial (o gasto de origem fica)',
}
const valorAcao = (a) => (a.valor != null ? fmt(a.valor) : `${fmt(a.valor_anterior)} → ${fmt(a.valor_novo)}`)

// VERIFICAR E CORRIGIR — substitui "Atualizar", "Revisar Movimentos Automáticos" e "Reconciliar
// Gerenciais". Prévia por seção (lib/verificarCartao), cada item com caixa de seleção; só aplica o que
// o usuário confirmar, com as ações normais do app e as funções do motor (só chamadas), e grava o
// histórico de alterações com o motivo de cada correção.
// Escopo: o cartão e a fatura da tela; opção "todas as faturas deste cartão". Controle gerencial
// desligado: só as seções não gerenciais (a, d, g).
export default function VerificarCorrigirModal({ card, billKey, secaoInicial = null, onClose }) {
  const {
    profileTransactions: transactions = [], profileAccounts: accounts = [], profileSchedules: schedules = [],
    scheduleReservaFuncoes = [], gerencialGroups = [], settings,
    revisarMovimentosFatura, recalcularAgendamentosFatura, reconciliarGerencial, ensureGerencialState,
    updateTransaction, deleteTransaction, fecharFatura, registrarEdicao,
  } = useApp()
  const gerencialLigado = controleGerencialAtivo(settings)
  const [todas, setTodas] = useState(false)
  const [sel, setSel] = useState(() => new Set())
  const [revisao, setRevisao] = useState([]) // [{ fatura, acoes }]
  const [etapa, setEtapa] = useState('previa') // previa | confirmar | aplicando | feito
  const [resultado, setResultado] = useState(null)
  const hoje = today()

  const faturas = useMemo(() => (todas
    ? [...new Set(transactions.filter(t => t.accountId === card.id && (t.type === 'expense' || t.type === 'income')).map(t => faturaDoLancamento(t, card)))].filter(Boolean).sort()
    : [billKey]), [todas, transactions, card, billKey])

  const v = useMemo(() => verificarCartao({
    transactions, accounts, schedules, scheduleReservaFuncoes, gerencialGroups,
    faturasFechadas: settings?.faturasFechadas || {}, card, faturas, hoje, gerencialLigado,
  }), [transactions, accounts, schedules, scheduleReservaFuncoes, gerencialGroups, settings, card, faturas, hoje, gerencialLigado])

  // (b) Prévia do motor por fatura (o antigo Revisar, dryRun): o que o recálculo mudaria.
  useEffect(() => {
    if (!gerencialLigado || typeof revisarMovimentosFatura !== 'function') return
    let vivo = true
    Promise.all(faturas.map(f => revisarMovimentosFatura({ cardId: card.id, faturaRef: ymParaRef(f), dryRun: true })
      .then(r => ({ fatura: f, acoes: r?.acoes || [] })).catch(() => ({ fatura: f, acoes: [] }))))
      .then(lista => { if (vivo) setRevisao(lista.filter(x => x.acoes.length)) })
    return () => { vivo = false }
  }, [faturas, card, gerencialLigado, revisarMovimentosFatura, transactions, schedules])

  // Itens por seção: { chave, secao, titulo, detalhe, valor, destaque }.
  const itens = useMemo(() => {
    const out = []
    for (const t of v.a || []) out.push({ chave: `a:${t.id}`, secao: 'a', tx: t, titulo: t.description || '(sem descrição)', detalhe: `${fmtDate(t.date)} · fatura ${ymParaRef(faturaDoLancamento(t, card))} · corrigir para cartão de crédito${t.grupoGerencial ? ' (o motor cria a etapa A em seguida)' : ''}`, valor: t.amount })
    for (const f of v.b?.semEtapa || []) {
      for (const t of f.itens) out.push({ chave: `b:etapa:${t.id}`, secao: 'b', tx: t, fatura: f.fatura, titulo: t.description || '(sem descrição)', detalhe: `${fmtDate(t.date)} · fatura ${ymParaRef(f.fatura)} · sem etapa A${t.accountType !== 'credit' ? ' (corrija antes o tipo da conta — seção a)' : ''}`, valor: t.amount })
    }
    for (const r of revisao) {
      out.push({ chave: `b:motor:${r.fatura}`, secao: 'b', fatura: r.fatura, acoes: r.acoes,
        titulo: `Recalcular a fatura ${ymParaRef(r.fatura)} pelo motor (${r.acoes.length} ${r.acoes.length === 1 ? 'mudança' : 'mudanças'})`,
        detalhe: r.acoes.map(a => `${ROTULO_ACAO[a.tipo] || a.tipo}: ${a.descricao || a.grupo || ''} ${valorAcao(a)}`).join(' · ') })
    }
    for (const t of v.c?.fantasmas || []) out.push({ chave: `c:fant:${t.id}`, secao: 'c', tx: t, titulo: `Excluir lançamento "fantasma": ${t.description || t.id}`, detalhe: `${fmtDate(t.date)} · entrada na conta Ger. sem fatura e sem origem conhecida`, valor: t.amount })
    for (const s of v.c?.detalhamento || []) out.push({ chave: `c:det:${s.id}`, secao: 'c', fatura: s.fatura, titulo: `Refazer o detalhamento: ${s.descricao || s.tipo}`, detalhe: `valor ${fmt(s.valor)} × soma das funções ${fmt(s.soma)} · fatura ${ymParaRef(s.fatura)}` })
    for (const it of v.d || []) out.push({ chave: `d:${it.chave}`, secao: 'd', plano: it, titulo: it.detalhe || it.descricao, detalhe: `${(ROTULO_COMPETENCIA[it.tipo] || (() => it.tipo))(it)}${it.fatura ? ` · hoje na fatura ${ymParaRef(it.fatura)}` : ''}`, valor: it.valor })
    for (const g of v.e || []) out.push({ chave: `e:${g.id}`, secao: 'e', conta: g, titulo: `${g.nome}: regravar o saldo`, detalhe: `gravado ${fmt(g.gravado)} → pelas transferências ${fmt(g.real)} (diferença ${fmt(g.diferenca)})` })
    for (const s of v.f || []) out.push({ chave: `f:${s.id}`, secao: 'f', ag: s, fatura: s.fatura, titulo: `Remover: ${s.descricao || s.tipo}`, detalhe: `fatura ${ymParaRef(s.fatura)} não tem nenhum gasto`, valor: s.valor })
    for (const g of v.g || []) out.push({ chave: `g:${g.fatura}`, secao: 'g', antiga: g, titulo: `Fechar a fatura ${ymParaRef(g.fatura)}`, detalhe: `${g.lancamentos.length} ${g.lancamentos.length === 1 ? 'lançamento' : 'lançamentos'} sem pagamento, anterior à última fatura paga (nada é excluído): ${g.lancamentos.map(t => `${t.description} ${fmt(t.amount)}`).join(' · ')}`, valor: g.total })
    return out
  }, [v, revisao, card])
  const secoesVisiveis = SECOES.filter(s => gerencialLigado || SECOES_NAO_GERENCIAIS.has(s))
  const porSecao = (s) => itens.filter(i => i.secao === s)
  const selecionados = itens.filter(i => sel.has(i.chave))
  const alternar = (k) => setSel(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const alternarSecao = (s) => setSel(p => {
    const ks = porSecao(s).map(i => i.chave)
    const todosMarcados = ks.every(k => p.has(k))
    const n = new Set(p)
    ks.forEach(k => (todosMarcados ? n.delete(k) : n.add(k)))
    return n
  })
  const diferencaB = v.b?.diferenca || 0

  // Aplica SÓ o selecionado, na ordem: tipo da conta → fatura errada → fantasmas → etapas A →
  // recálculo das faturas tocadas → saldo Ger. → fechar faturas. Histórico antes de alterar.
  const aplicar = async () => {
    setEtapa('aplicando')
    const loteId = novoLoteId()
    const motivoDe = { a: 'Lançamento de cartão sem tipo de conta: corrigido para cartão de crédito', b: 'Etapa A que faltava criada', c: 'Lançamento fantasma excluído', f: 'Agendamento de fatura sem gasto removido', g: 'Fatura antiga sem pagamento fechada (anterior à última fatura paga)' }
    const linhas = (secao, id, campo, de, para, ent = 'lancamento') => linhasHistorico({ entidade: ent, loteId, motivo: `Verificar e corrigir: ${motivoDe[secao]}`, itens: [{ id, mudancas: [{ campo, de, para }] }] })
    const sec = (s) => selecionados.filter(i => i.secao === s)
    const txById = new Map(transactions.map(t => [t.id, t]))
    const historico = [
      ...sec('a').flatMap(i => linhas('a', i.tx.id, 'accountType', i.tx.accountType || '', 'credit')),
      ...(sec('d').length ? linhasHistoricoRevisao(sec('d').map(i => i.plano), txById, { loteId }) : []),
      ...sec('c').filter(i => i.tx).flatMap(i => linhas('c', i.tx.id, 'excluido', Number(i.tx.amount) || 0, null)),
      ...sec('b').filter(i => i.tx).flatMap(i => linhas('b', i.tx.id, 'etapa_a', null, Number(i.tx.amount) || 0)),
      ...sec('f').flatMap(i => linhas('f', i.ag.id, 'removido', i.ag.valor, null, 'agendamento')),
      ...sec('g').flatMap(i => i.antiga.lancamentos.flatMap(t => linhas('g', t.id, 'fatura_fechada', false, true))),
    ]
    try {
      if (historico.length) await registrarEdicao({ historico, loteId, motivo: 'Verificar e corrigir (cartão)' })
      const recalcular = new Set()
      const garantirEtapa = new Set()
      // a) tipo da conta (depois, a etapa A dos gastos com grupo)
      for (const i of sec('a')) {
        updateTransaction(i.tx.id, { accountType: 'credit' })
        recalcular.add(faturaDoLancamento(i.tx, card))
        if (i.tx.grupoGerencial) garantirEtapa.add(i.tx.id)
      }
      // d) fatura errada / duplicata (as ações normais do app)
      if (sec('d').length) {
        const { excluir, mover } = acoesDoPlano(sec('d').map(i => i.plano))
        for (const id of excluir) deleteTransaction(id)
        for (const m of mover) updateTransaction(m.id, { faturaMonthYear: m.para })
        for (const i of sec('d')) [i.plano.fatura, i.plano.faturaGasto, i.plano.mover?.para].filter(Boolean).forEach(f => recalcular.add(f))
      }
      // c) fantasmas e detalhamento
      for (const i of sec('c')) {
        if (i.tx) deleteTransaction(i.tx.id)
        else if (i.fatura) recalcular.add(i.fatura)
      }
      // b) etapas A que faltavam (ensure por gasto) e o recálculo do motor por fatura
      for (const i of sec('b')) {
        if (i.tx) { garantirEtapa.add(i.tx.id); recalcular.add(i.fatura) }
        else if (i.fatura) recalcular.add(i.fatura)
      }
      // f) agendamentos de fatura sem gasto: o recálculo daquela fatura os remove
      for (const i of sec('f')) recalcular.add(i.fatura)
      for (const id of garantirEtapa) ensureGerencialState(id)
      for (const f of recalcular) { const [y, m] = f.split('-'); recalcularAgendamentosFatura(card.id, y, m) }
      // e) saldo das contas Ger. — o passo B do reconciliador (regrava as contas listadas)
      if (sec('e').length) await reconciliarGerencial(card.id, [...recalcular].length ? [...recalcular] : [billKey])
      // g) fechar faturas antigas (a ação de sempre; nada é excluído)
      for (const i of sec('g')) fecharFatura(card.id, i.antiga.fatura)
      setResultado({ n: selecionados.length, porSecao: Object.fromEntries(secoesVisiveis.map(s => [s, sec(s).length]).filter(([, n]) => n)) })
      setEtapa('feito')
    } catch (e) {
      setResultado({ erro: e?.message || String(e) })
      setEtapa('feito')
    }
  }

  const titulo = `Verificar e corrigir — ${card.apelido || card.name} · ${todas ? 'todas as faturas' : `fatura ${ymParaRef(billKey)}`}`
  return (
    <Modal open onClose={() => { if (etapa !== 'aplicando') onClose() }} title={titulo} size="xl">
      {etapa === 'feito' ? (
        <div className="space-y-4" data-testid="verificar-resultado">
          {resultado?.erro
            ? <p role="alert" className="text-sm text-perigo">Não consegui aplicar tudo: {resultado.erro}</p>
            : <p className="flex items-center gap-2 text-sm text-texto-1"><CheckCircle2 size={16} className="text-primary-fg" /> {resultado.n} {resultado.n === 1 ? 'item corrigido' : 'itens corrigidos'}.</p>}
          <p className="text-xs text-texto-3">Tudo ficou no histórico de alterações, com o motivo de cada correção (o saldo das contas Ger. não tem histórico próprio: fica neste resumo).</p>
          <div className="flex justify-end"><button className="btn-primary" onClick={onClose}>Fechar</button></div>
        </div>
      ) : etapa === 'confirmar' || etapa === 'aplicando' ? (
        <div className="space-y-3" data-testid="verificar-confirmar">
          <p className="text-sm text-texto-2">Confira o que será aplicado:</p>
          <ul className="space-y-1 text-xs">
            {selecionados.map(i => <li key={i.chave} className="text-texto-1">· {TITULO_SECAO[i.secao]} — {i.titulo}{i.valor != null ? ` (${fmt(i.valor)})` : ''}</li>)}
          </ul>
          <div className="flex gap-2 pt-3 border-t border-borda">
            <button className="btn-secondary flex-1" disabled={etapa === 'aplicando'} onClick={() => setEtapa('previa')}>Voltar</button>
            <button className="btn-primary flex-1" disabled={etapa === 'aplicando'} onClick={aplicar}>{etapa === 'aplicando' ? 'Aplicando…' : `Confirmar e aplicar (${selecionados.length})`}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4" data-testid="verificar-previa">
          <label className="flex items-center gap-2 text-xs text-texto-2 cursor-pointer">
            <input type="checkbox" checked={todas} onChange={e => { setTodas(e.target.checked); setSel(new Set()) }} />
            Verificar todas as faturas deste cartão
          </label>
          {itens.length === 0 && <p className="text-sm text-texto-2 flex items-center gap-2"><CheckCircle2 size={16} className="text-primary-fg" /> Nada diferente encontrado.</p>}
          {secoesVisiveis.map(s => {
            const lista = porSecao(s)
            if (!lista.length) return null
            return (
              <section key={s} className={`space-y-2 rounded-lg border p-3 ${secaoInicial === s ? 'border-primary' : 'border-borda'}`} data-testid={`secao-${s}`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-texto-1">
                    {s.toUpperCase()}) {TITULO_SECAO[s]} <span className="text-texto-3 font-normal">({lista.length})</span>
                    {s === 'b' && diferencaB > 0.005 && <span className="ml-2 text-aviso">{fmt(diferencaB)} sem etapa A</span>}
                  </h3>
                  <button type="button" className="text-xs text-texto-2 underline" onClick={() => alternarSecao(s)}>marcar/desmarcar todos</button>
                </div>
                {s === 'b' && <p className="text-[11px] text-texto-3">O recálculo do motor aplica de uma vez as mudanças daquela fatura (etapas A das parcelas, resgates, devolução e pagamento).</p>}
                {s === 'e' && <p className="text-[11px] text-texto-3">Regravar refaz o saldo de todas as contas Ger. listadas pelas transferências (antes o "Reconciliar Gerenciais" fazia isso sem mostrar).</p>}
                <ul className="space-y-1.5">
                  {lista.map(i => (
                    <li key={i.chave}>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" className="mt-1" checked={sel.has(i.chave)} onChange={() => alternar(i.chave)} aria-label={i.titulo} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-texto-1">{i.titulo}{i.valor != null && <span className="text-texto-2"> · {fmt(i.valor)}</span>}</span>
                          <span className="block text-xs text-texto-3">{i.detalhe}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
          {!gerencialLigado && <p className="text-[11px] text-texto-3 flex items-center gap-1"><AlertTriangle size={12} /> Controle gerencial desligado: só as verificações que não são gerenciais.</p>}
          <div className="flex gap-2 pt-3 border-t border-borda">
            <button className="btn-secondary flex-1" onClick={onClose}>Fechar</button>
            <button className="btn-primary flex-1" disabled={!selecionados.length} onClick={() => setEtapa('confirmar')}>Corrigir selecionados ({selecionados.length})</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
