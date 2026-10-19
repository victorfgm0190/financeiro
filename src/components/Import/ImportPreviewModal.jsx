import { useState } from 'react'
import { CheckCircle2, Info, AlertTriangle } from 'lucide-react'
import Modal from '../shared/Modal'
import { fmt, fmtDate } from '../shared/utils'
import { installmentSystemDate } from '../../lib/parcelas'

const round2 = (n) => Math.round(n * 100) / 100

// Preview exibido ANTES de confirmar a importação de uma fatura. Mostra, sem alterar nada:
//  • Grupo G: total da fatura G vs. saldo já na subconta Ger. e quanto será transferido.
//  • Grupos numerados: resgates por função e o status do agendamento de resgate da fatura
//    (já executado / já agendado / será criado).
// No topo, "Verificações": cada item ✅ OK | ℹ️ Informativo | ⚠️ Precisa de ação (`verificacoes`
// vêm do ImportPanel; o Grupo G é conferido aqui). Sem ⚠️ → "Confirmar importação" (verde). Com
// ⚠️ → "X pendências", "Resolver pendências" (abre a primeira) e "Confirmar mesmo assim".
// Sem nenhum item NOVO (só "já existe" / atualizações) e com a fatura projetada batendo com o
// arquivo (`faturaCompleta`), o aviso "Nenhum item gerencial" não se aplica: o modal diz que a
// fatura já está completa e oferece só "Concluir" (`onConcluir`).
export default function ImportPreviewModal({
  open, onConfirm, onCancel,
  resolvedRows, gerencialGroups, schedules, accounts, transactions, card, faturaMesAno, reserveFunctions,
  financialMonthStartDay = 1,
  mode = 'import', // 'import' | 'conciliar' — muda o título e o sufixo "não duplica" no status
  faturaCompleta = false,
  onConcluir,
  verificacoes = [],
  // Fatura FUTURA (fora do ciclo atual): o motor não cria a etapa A; a cobertura é do Executar
  // Gerenciais. onResolverGerencial(ids) abre esse modal com só as despesas sem cobertura marcadas.
  faturaFutura = false,
  onResolverGerencial = null,
}) {
  // Toggle local (não persiste): mostra a data em que a transferência gerencial (etapa A)
  // será criada, ao lado de cada item do Grupo G.
  const [showDates, setShowDates] = useState(false)
  if (!open || !card) return null

  // Data da etapa A (tx_gerA), mesma regra do sistema:
  //  • à vista / parcela 1 (num <= 1) → date_cartao (dia real da compra);
  //  • parcela 2..N → dia financialMonthStartDay do mês ANTERIOR à fatura da parcela.
  const gerItemDate = (item) => {
    const num = item?._installment?.num ?? item?.num ?? item?.installmentNum ?? 1
    const dateCartao = item?._dateCartao || item?.date || null
    const fatura = item?.faturaMonthYear || faturaMesAno || null
    return installmentSystemDate(fatura, num, dateCartao, financialMonthStartDay)
  }

  const isConciliar = mode === 'conciliar'
  const apelido = card.apelido || card.name || 'Cartão'
  // Em conciliação, os itens recebidos são os "Só no Itaú" (ausentes no sistema) → já não duplicam.
  const naoDuplica = isConciliar ? ' — não duplica' : ''
  // Itens que serão de fato importados (mesma base do toImport do handleImport).
  const toImport = (resolvedRows || []).filter(r => r.selected && !r._isDuplicate && !r._collisionTx)

  const grupoG = gerencialGroups.find(g => g.number === 1)
  const numberedGroups = gerencialGroups.filter(g => typeof g.number === 'number' && g.number !== 1)

  // ── Seção 1: Grupo G ──────────────────────────────────────────────────────
  const itemsG = grupoG ? toImport.filter(r => r.grupoGerencial === grupoG.id) : []
  const novosG = round2(itemsG.reduce((s, r) => s + (Number(r.amount) || 0), 0))
  const gerName = `Ger. ${apelido}`
  // "Já na conta Ger." DESTA fatura = soma das etapas A (tx_gerA_<expenseId>) já criadas para
  // as despesas G desta fatura específica. NÃO usar account.balance: ele mistura entradas/saídas
  // de outros períodos. A etapa A não tem faturaMonthYear, então escopamos pela despesa de origem
  // (que tem), buscando a etapa A determinística tx_gerA_<id> em transactions.
  const txIndex = new Map((transactions || []).map(t => [t.id, t]))
  // Projeção de parcela 2..N (sem date_cartao) fica de fora, como no motor: ela só ganha cobertura
  // quando a fatura dela for importada e a compra virar confirmada.
  const ehProjecaoParcela = (t) => (Number(t.installmentNum) > 1 || t.parentTxId != null) && !t.dateCartao
  const gGravadosNaFatura = (transactions || []).filter(t =>
    t.type === 'expense' && t.accountType === 'credit' &&
    t.accountId === card.id &&
    grupoG && t.grupoGerencial === grupoG.id &&
    t.faturaMonthYear === faturaMesAno && !ehProjecaoParcela(t))
  // Cobertura da despesa na Ger.: a etapa A (tx_gerA_<id>) ou, sem ela, a provisão gerencial
  // "manual" ligada ao gasto (transferência com parentTxId/sourceExpenseId) — a mesma regra do
  // motor, que pula a etapa A quando essa provisão existe.
  const provisaoPorGasto = new Map()
  for (const t of transactions || []) {
    if (t.type !== 'transfer') continue
    for (const ref of new Set([t.parentTxId, t.sourceExpenseId].filter(Boolean))) {
      provisaoPorGasto.set(ref, round2((provisaoPorGasto.get(ref) || 0) + (Number(t.amount) || 0)))
    }
  }
  const coberturaNaGer = (e) => {
    const a = txIndex.get(`tx_gerA_${e.id}`)
    return a ? (Number(a.amount) || 0) : (provisaoPorGasto.get(e.id) || 0)
  }
  const jaNaGer = round2(gGravadosNaFatura.reduce((s, e) => round2(s + coberturaNaGer(e)), 0))
  const gSemCobertura = gGravadosNaFatura.filter(e => Math.abs(coberturaNaGer(e) - (Number(e.amount) || 0)) > 0.01)
  // Fatura futura com despesas confirmadas sem cobertura: "Resolver" abre o Executar Gerenciais
  // (execução manual, como sempre); senão volta para a revisão.
  const resolverG = faturaFutura && onResolverGerencial && gSemCobertura.length
    ? () => onResolverGerencial(gSemCobertura.map(e => e.id))
    : onCancel
  const novasParcelasG = itemsG.filter(r => (Number(r._installment?.num) || 1) > 1)
  // Fatura G INTEIRA (as já gravadas + as novas) × o que a Ger. terá (já lá + o transferido
  // agora, uma etapa A por despesa nova). Antes o total G era só o das novas, e toda reimportação
  // parcial (fatura aberta de novo) acusava "Divergência" com tudo certo. Agora só diverge quando
  // falta a etapa A de alguma despesa G já gravada.
  const totalFaturaG = round2(gGravadosNaFatura.reduce((s, e) => s + (Number(e.amount) || 0), 0) + novosG)
  const aTransferir = novosG
  const saldoEsperado = round2(jaNaGer + aTransferir)
  const grupoGOk = Math.abs(saldoEsperado - totalFaturaG) < 0.01

  // ── Seção 2: grupos numerados (resgates por função) ───────────────────────
  const numberedSections = numberedGroups
    .map(g => {
      const items = toImport.filter(r => r.grupoGerencial === g.id)
      if (items.length === 0) return null
      // Soma por função (_reservaFuncaoId; null = sem função).
      const porFuncao = new Map()
      for (const r of items) {
        const fid = r._reservaFuncaoId || '__sem__'
        porFuncao.set(fid, round2((porFuncao.get(fid) || 0) + (Number(r.amount) || 0)))
      }
      // Agendamento de resgate desta fatura para a conta-origem do grupo.
      const resgate = (schedules || []).find(s =>
        s.tipo === 'resgate_reserva' &&
        s.cardId === card.id &&
        s.faturaMesAno === faturaMesAno &&
        s.accountId === g.defaultAccountId
      )
      let status
      if (resgate && ((resgate.registered || []).length > 0 || (resgate.skipped || []).length > 0)) {
        status = { icon: '✅', label: `Já pago/executado${naoDuplica}`, cls: 'text-reserva' }
      } else if (resgate) {
        status = { icon: '📅', label: `Agendado ${fmtDate(resgate.startDate)}${naoDuplica}`, cls: 'text-texto-2' }
      } else {
        status = { icon: '⏳', label: 'Será criado agendamento', cls: 'text-texto-2' }
      }
      const contaReserva = accounts.find(a => a.id === g.defaultAccountId)
      const contaNome = contaReserva?.apelido || contaReserva?.name || g.name
      // Quando a conta-origem do grupo tem uma ÚNICA função de reserva (ex.: PharmaLog →
      // PHARMALOG), os itens não recebem _reservaFuncaoId na classificação (o select só é
      // exigido com 2+ funções). Nesse caso o bucket "sem função" é, sem ambiguidade, essa
      // função única — exibimos o nome dela em vez de "— sem função —".
      const funcsDoGrupo = (reserveFunctions || []).filter(f => f.accountId === g.defaultAccountId)
      const funcUnica = funcsDoGrupo.length === 1 ? funcsDoGrupo[0] : null
      const rows = [...porFuncao.entries()].map(([fid, valor]) => ({
        nome: fid === '__sem__'
          ? (funcUnica ? funcUnica.name : '— sem função —')
          : (reserveFunctions.find(f => f.id === fid)?.name || 'Função'),
        valor,
      }))
      return { g, contaNome, rows, status }
    })
    .filter(Boolean)

  const hasContent = itemsG.length > 0 || numberedSections.length > 0
  const semNovos = toImport.length === 0
  const completa = semNovos && faturaCompleta

  const checks = [
    ...(itemsG.length > 0 ? [grupoGOk
      ? { id: 'grupoG', status: 'ok', titulo: `Saldo esperado do gerencial (${gerName}) confere` }
      : { id: 'grupoG', status: 'acao', titulo: `Saldo esperado do gerencial (${gerName}) não confere`, detalhe: `Esperado ${fmt(saldoEsperado)} × fatura G ${fmt(totalFaturaG)}.${gSemCobertura.length ? ` Sem cobertura na Ger.: ${gSemCobertura.slice(0, 3).map(e => e.description).join(', ')}${gSemCobertura.length > 3 ? ` e mais ${gSemCobertura.length - 3}` : ''}.` : ''}`, onResolver: resolverG }] : []),
    ...(faturaFutura && novasParcelasG.length ? [{ id: 'grupoGnovas', status: 'info', titulo: `${novasParcelasG.length} parcela(s) 2..N do Grupo G entram nesta fatura futura`, detalhe: 'Depois de importar, a cobertura delas na Ger. é pelo Executar Gerenciais (o próximo Resumo aponta as que faltarem).' }] : []),
    ...verificacoes,
  ]
  const pendencias = checks.filter(c => c.status === 'acao')
  const resolverPrimeira = () => (pendencias.find(c => c.onResolver)?.onResolver || onCancel)()
  const confirmar = semNovos ? (onConcluir || onConfirm) : onConfirm

  return (
    <Modal open={open} onClose={onCancel} title={`${isConciliar ? 'Resumo da Conciliação' : 'Resumo da Importação'} — ${apelido} ${faturaMesAno || ''}`} size="lg">
      <div className="space-y-5">
        {checks.length > 0 && (
          <div className="rounded-lg border border-borda-forte p-3 space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-texto-3">Verificações</p>
            <ul className="space-y-1.5">
              {checks.map(c => (
                <li key={c.id} className="flex items-start gap-2 text-sm">
                  {c.status === 'ok' ? <CheckCircle2 size={15} className="text-receita shrink-0 mt-0.5" aria-label="OK" />
                    : c.status === 'info' ? <Info size={15} className="text-aviso shrink-0 mt-0.5" aria-label="Informativo" />
                      : <AlertTriangle size={15} className="text-perigo shrink-0 mt-0.5" aria-label="Precisa de ação" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-texto-1">{c.titulo}</p>
                    {c.detalhe && <p className="text-xs text-texto-3">{c.detalhe}</p>}
                  </div>
                  {c.status === 'acao' && c.onResolver && (
                    <button type="button" className="btn-secondary text-xs py-1 px-2 shrink-0" onClick={c.onResolver}>Resolver</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {completa && (
          <p className="text-sm text-texto-2">Fatura já está completa no banco. Nada novo a importar.</p>
        )}
        {semNovos && !faturaCompleta && (
          <p className="text-sm text-aviso">
            Nada novo a importar, mas a fatura projetada não bate com o arquivo. Revise as diferenças antes de concluir.
          </p>
        )}
        {!semNovos && !hasContent && (
          <p className="text-sm text-texto-2">
            Nenhum item gerencial (Grupo G ou numerado) nesta importação. Os lançamentos entram apenas no pagamento da fatura.
          </p>
        )}

        {/* Seção 1 — Grupo G */}
        {itemsG.length > 0 && (
          <div className="rounded-lg border border-borda-forte bg-surface-2/40 p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-reserva">
                💳 Gerencial — {apelido}
              </div>
              <button
                type="button"
                onClick={() => setShowDates(v => !v)}
                aria-pressed={showDates}
                title="Mostrar a data em que a transferência gerencial será criada"
                className={`text-xs px-2 py-1 rounded-md border transition-colors ${showDates ? 'border-primary text-primary-fg bg-primary/10' : 'border-borda-forte text-texto-2 hover:text-texto-1 hover:border-borda-forte'}`}
              >
                📅 Datas
              </button>
            </div>
            <div className="text-sm text-texto-2 space-y-1">
              <div className="flex justify-between"><span>Fatura grupo G (gravados + {itemsG.length} {itemsG.length === 1 ? 'novo' : 'novos'}):</span><span className="font-semibold">{fmt(totalFaturaG)}</span></div>
              <div className="flex justify-between text-texto-2"><span>✅ Já na conta {gerName}:</span><span>{fmt(jaNaGer)}</span></div>
              <div className="flex justify-between text-texto-2"><span>⏳ {isConciliar ? 'Novos a transferir' : 'Será transferido agora'}:</span><span>{fmt(aTransferir)}</span></div>
              <div className="border-t border-borda-forte my-1" />
              <div className="flex justify-between items-center">
                <span>{isConciliar ? 'Total esperado' : 'Saldo esperado'}:</span>
                <span className="font-semibold flex items-center gap-1.5">
                  {fmt(saldoEsperado)}
                  {grupoGOk
                    ? <span className="text-reserva">✅ OK</span>
                    : <span className="text-aviso">⚠️ Divergência</span>}
                </span>
              </div>
            </div>
            {/* Itens do Grupo G — descrição + valor; a data (etapa A) aparece com o toggle "Datas". */}
            <ul className="text-sm border-t border-borda-forte pt-2 divide-y divide-borda/60">
              {itemsG.map((item, i) => {
                const d = showDates ? gerItemDate(item) : null
                return (
                  <li key={item._id ?? i} className="flex items-center gap-3 py-1">
                    <span className="flex-1 truncate text-texto-2">{item.description || '—'}</span>
                    <span className="text-right text-texto-1 font-medium whitespace-nowrap">{fmt(Number(item.amount) || 0)}</span>
                    {showDates && (
                      <span className="text-right text-xs text-texto-3 whitespace-nowrap w-24 tabular-nums">{d ? fmtDate(d) : '—'}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Seção 2 — Grupos numerados */}
        {numberedSections.map(({ g, contaNome, rows, status }) => (
          <div key={g.id} className="rounded-lg border border-borda-forte bg-surface-2/40 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-reserva">
              💜 Resgates de Reserva — {contaNome}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-texto-3 border-b border-borda-forte">
                  <th className="py-1.5 font-medium">Função</th>
                  <th className="py-1.5 font-medium text-right">Valor</th>
                  <th className="py-1.5 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-borda/50 last:border-0">
                    <td className="py-1.5 text-texto-2">{r.nome}</td>
                    <td className="py-1.5 text-right text-texto-2 font-medium whitespace-nowrap">{fmt(r.valor)}</td>
                    <td className={`py-1.5 text-right whitespace-nowrap ${status.cls}`}>{status.icon} {status.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-3 justify-end pt-2">
          {pendencias.length > 0 ? (
            <>
              <span className="text-xs text-perigo mr-auto">{pendencias.length} {pendencias.length === 1 ? 'pendência' : 'pendências'}</span>
              <button className="btn-secondary text-sm" onClick={confirmar}>Confirmar mesmo assim</button>
              <button className="btn-primary text-sm" onClick={resolverPrimeira}>Resolver pendências</button>
            </>
          ) : completa ? (
            <button className="btn-primary text-sm" onClick={onConcluir || onConfirm}>Concluir</button>
          ) : (
            <>
              <button className="btn-secondary text-sm" onClick={onCancel}>← Revisar</button>
              <button className="btn-primary text-sm" onClick={confirmar}>{isConciliar ? 'Confirmar conciliação' : 'Confirmar importação'}</button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
