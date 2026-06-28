import Modal from '../shared/Modal'
import { fmt, fmtDate } from '../shared/utils'

const round2 = (n) => Math.round(n * 100) / 100

// Preview exibido ANTES de confirmar a importação de uma fatura. Mostra, sem alterar nada:
//  • Grupo G: total da fatura G vs. saldo já na subconta Ger. e quanto será transferido.
//  • Grupos numerados: resgates por função e o status do agendamento de resgate da fatura
//    (já executado / já agendado / será criado).
// O botão de destaque é "Revisar" (volta sem confirmar); "Confirmar mesmo assim" é discreto.
export default function ImportPreviewModal({
  open, onConfirm, onCancel,
  resolvedRows, gerencialGroups, schedules, accounts, transactions, card, faturaMesAno, reserveFunctions,
  mode = 'import', // 'import' | 'conciliar' — muda o título e o sufixo "não duplica" no status
}) {
  if (!open || !card) return null

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
  const totalFaturaG = round2(itemsG.reduce((s, r) => s + (Number(r.amount) || 0), 0))
  const gerName = `Ger. ${apelido}`
  // "Já na conta Ger." DESTA fatura = soma das etapas A (tx_gerA_<expenseId>) já criadas para
  // as despesas G desta fatura específica. NÃO usar account.balance: ele mistura entradas/saídas
  // de outros períodos. A etapa A não tem faturaMonthYear, então escopamos pela despesa de origem
  // (que tem), buscando a etapa A determinística tx_gerA_<id> em transactions.
  const txIndex = new Map((transactions || []).map(t => [t.id, t]))
  const jaNaGer = round2((transactions || [])
    .filter(t =>
      t.type === 'expense' && t.accountType === 'credit' &&
      t.accountId === card.id &&
      grupoG && t.grupoGerencial === grupoG.id &&
      t.faturaMonthYear === faturaMesAno)
    .reduce((s, e) => {
      const a = txIndex.get(`tx_gerA_${e.id}`)
      return a ? round2(s + (Number(a.amount) || 0)) : s
    }, 0))
  const aTransferir = round2(Math.max(0, totalFaturaG - jaNaGer))
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
        status = { icon: '📅', label: `Agendado ${fmtDate(resgate.startDate)}${naoDuplica}`, cls: 'text-blue-400' }
      } else {
        status = { icon: '⏳', label: 'Será criado agendamento', cls: 'text-orange-500' }
      }
      const contaReserva = accounts.find(a => a.id === g.defaultAccountId)
      const contaNome = contaReserva?.apelido || contaReserva?.name || g.name
      const rows = [...porFuncao.entries()].map(([fid, valor]) => ({
        nome: fid === '__sem__' ? '— sem função —' : (reserveFunctions.find(f => f.id === fid)?.name || 'Função'),
        valor,
      }))
      return { g, contaNome, rows, status }
    })
    .filter(Boolean)

  const hasContent = itemsG.length > 0 || numberedSections.length > 0

  return (
    <Modal open={open} onClose={onCancel} title={`${isConciliar ? 'Resumo da Conciliação' : 'Resumo da Importação'} — ${apelido} ${faturaMesAno || ''}`} size="lg">
      <div className="space-y-5">
        {!hasContent && (
          <p className="text-sm text-gray-400">
            Nenhum item gerencial (Grupo G ou numerado) nesta importação. Os lançamentos entram apenas no pagamento da fatura.
          </p>
        )}

        {/* Seção 1 — Grupo G */}
        {itemsG.length > 0 && (
          <div className="rounded-lg border border-gray-700 bg-gray-800/40 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-reserva">
              💳 Gerencial — {apelido}
            </div>
            <div className="text-sm text-gray-300 space-y-1">
              <div className="flex justify-between"><span>{isConciliar ? `Fatura grupo G (${itemsG.length} ${itemsG.length === 1 ? 'novo' : 'novos'})` : 'Fatura grupo G'}:</span><span className="font-semibold">{fmt(totalFaturaG)}</span></div>
              <div className="flex justify-between text-gray-400"><span>✅ Já na conta {gerName}:</span><span>{fmt(jaNaGer)}</span></div>
              <div className="flex justify-between text-gray-400"><span>⏳ {isConciliar ? 'Novos a transferir' : 'Será transferido agora'}:</span><span>{fmt(aTransferir)}</span></div>
              <div className="border-t border-gray-700 my-1" />
              <div className="flex justify-between items-center">
                <span>{isConciliar ? 'Total esperado' : 'Saldo esperado'}:</span>
                <span className="font-semibold flex items-center gap-1.5">
                  {fmt(saldoEsperado)}
                  {grupoGOk
                    ? <span className="text-reserva">✅ OK</span>
                    : <span className="text-orange-500">⚠️ Divergência</span>}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Seção 2 — Grupos numerados */}
        {numberedSections.map(({ g, contaNome, rows, status }) => (
          <div key={g.id} className="rounded-lg border border-gray-700 bg-gray-800/40 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-purple-400">
              💜 Resgates de Reserva — {contaNome}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-700">
                  <th className="py-1.5 font-medium">Função</th>
                  <th className="py-1.5 font-medium text-right">Valor</th>
                  <th className="py-1.5 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-800/50 last:border-0">
                    <td className="py-1.5 text-gray-300">{r.nome}</td>
                    <td className="py-1.5 text-right text-gray-300 font-medium whitespace-nowrap">{fmt(r.valor)}</td>
                    <td className={`py-1.5 text-right whitespace-nowrap ${status.cls}`}>{status.icon} {status.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div className="flex gap-3 justify-end pt-2">
          <button className="btn-secondary text-sm" onClick={onConfirm}>Confirmar mesmo assim</button>
          <button className="btn-primary text-sm" onClick={onCancel}>← Revisar</button>
        </div>
      </div>
    </Modal>
  )
}
