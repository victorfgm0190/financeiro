import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Send, ChevronRight, ExternalLink, Loader2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate, creditBillKey, creditBillStatus } from '../shared/utils'
import { saldosDaConta, contaRecalculavel, hojeStr } from '../../lib/saldos'
import { rotuloParcela } from '../../lib/numeroParcela'
import { buildScheduleGroups } from '../../lib/agendamentosGrupos'
import { ocorrenciasPendentes } from '../../lib/agendaCalendario'
import { periodoDoFiltro } from '../../lib/despesasPorCategoria'
import { useDespesasPorCategoria, useModoDespesas } from '../../hooks/useDespesasPorCategoria'
import { searchEntries } from '../../lib/db'
import { navegarPara, ABRIR_FATURA_KEY } from '../../lib/abrirTela'
import { configHash } from '../../lib/configRota'
import { candidatosValidos, sugestaoLancamentoDaBaixa } from '../../lib/assistente'
import { DESTINOS } from '../../lib/assistente/acoes'
import { intervaloVencimento, filtrarVencimentos, totaisVencimentos, ladoDoGrupo, gastoDaCategoria } from '../../lib/assistente/consultas'
import PreviaBaixa from './PreviaBaixa'
import PreviaAssistente from './PreviaAssistente'

// Respostas do Assistente IA por ferramenta (mapeadas em executores.jsx). Props comuns:
//   { parametros, extra, textoOriginal, onClose, onToast, onNovo, onResponder, onTrocar }
// CONSULTAS: os números saem das MESMAS funções das telas — nunca de valor dito pela IA.

const Caixa = ({ children }) => <div className="space-y-3 min-w-0 break-words">{children}</div>
const Titulo = ({ children }) => (
  <div className="flex items-start gap-2 text-sm text-texto-1">
    <Sparkles size={15} className="mt-0.5 shrink-0 text-primary-fg" />
    <p className="flex-1 min-w-0 whitespace-pre-wrap break-words">{children}</p>
  </div>
)
const Valor = ({ rotulo, valor, grande = false, span2 = false }) => (
  <div className={`rounded-lg border border-borda bg-surface-2 px-3 py-2 ${span2 ? 'col-span-2' : ''}`}>
    <p className="text-[11px] text-texto-3">{rotulo}</p>
    <p className={`${grande ? 'text-lg' : 'text-base'} font-semibold ${valor < 0 ? 'text-despesa' : 'text-texto-1'}`}>{fmt(valor)}</p>
  </div>
)
function Rodape({ onNovo, onClose, abrir }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-secondary flex-1" onClick={onNovo}>Novo pedido</button>
      {abrir && (
        <button type="button" className="btn-secondary flex-1 inline-flex items-center justify-center gap-1.5" onClick={() => { abrir.fn(); onClose() }}>
          <ExternalLink size={14} /> {abrir.rotulo}
        </button>
      )}
      <button type="button" className="btn-primary flex-1" onClick={onClose}>Fechar</button>
    </div>
  )
}

// ─── 🟡 criação: o formulário existente pré-preenchido (prévia + confirmar) ─────────────────────
export function PreviaCriacao({ ferramenta, parametros, textoOriginal, onClose, onToast }) {
  return <PreviaAssistente ferramenta={ferramenta} sugestao={parametros} textoOriginal={textoOriginal} onClose={onClose} onToast={onToast} />
}

// ─── perguntar ──────────────────────────────────────────────────────────────────────────────────
export function Pergunta({ parametros, textoOriginal, onResponder, onNovo }) {
  const [outra, setOutra] = useState('')
  const opcoes = parametros.opcoes || []
  return (
    <Caixa>
      <Titulo>{parametros.pergunta}</Titulo>
      {opcoes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {opcoes.map(o => (
            <button key={o} type="button" onClick={() => onResponder(o, parametros.pergunta)}
              className="btn-secondary text-xs min-h-[40px] px-3 py-2 h-auto max-w-full whitespace-normal break-words text-left">{o}</button>
          ))}
        </div>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (outra.trim()) onResponder(outra.trim(), parametros.pergunta) }}>
        <input className="input flex-1 min-w-0" value={outra} onChange={e => setOutra(e.target.value.slice(0, 300))} placeholder="Digite outra resposta" />
        <button className="btn-primary px-3 shrink-0" aria-label="Responder" disabled={!outra.trim()}><Send size={15} /></button>
      </form>
      {textoOriginal && <p className="text-[11px] text-texto-3 whitespace-pre-wrap break-words">Pedido: “{textoOriginal}”</p>}
      <button type="button" onClick={onNovo} className="text-xs text-texto-2 hover:text-texto-1 min-h-[40px]">Novo pedido</button>
    </Caixa>
  )
}

// ─── baixar_agendamento: 1 candidato → prévia; vários → lista; nenhum → lançamento avulso ──────
export function BaixaResposta({ parametros, extra, textoOriginal, onClose, onToast, onNovo, onTrocar }) {
  const { schedules, getNextOccurrences } = useApp()
  const [candidatos] = useState(() => candidatosValidos(extra?.candidatos, schedules, getNextOccurrences))
  const [escolhido, setEscolhido] = useState(() => (candidatos.length === 1 ? candidatos[0] : null))
  if (escolhido) return <PreviaBaixa criterio={parametros} candidato={escolhido} textoOriginal={textoOriginal} onClose={onClose} onToast={onToast} />

  const porId = new Map((schedules || []).map(s => [s.id, s]))
  const quem = parametros.favorecido || parametros.descricao || 'esse pedido'
  return (
    <Caixa>
      {candidatos.length ? (
        <>
          <Titulo>Achei {candidatos.length} agendamentos pendentes para {quem}{parametros.valor_informado || parametros.valor_min ? ' (o de valor mais próximo primeiro)' : ''}. Qual recebe a baixa?</Titulo>
          <ul className="divide-y divide-borda rounded-lg border border-borda">
            {candidatos.map(c => {
              const s = porId.get(c.schedule_id)
              const parcela = s ? rotuloParcela(s, c.ocorrencia) : null
              return (
                <li key={`${c.schedule_id}@${c.ocorrencia}`}>
                  <button type="button" onClick={() => setEscolhido(c)} className="w-full flex items-center gap-2 px-3 py-2 min-h-[52px] text-left">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-texto-1 break-words">{c.descricao}{parcela ? ` · ${parcela}` : ''}</p>
                      <p className="text-[11px] text-texto-3 break-words">{c.favorecido || 'Sem favorecido'}</p>
                      <p className="text-[11px] break-words">
                        <span className={c.tipo === 'receita' ? 'text-receita' : 'text-despesa'}>{c.tipo === 'receita' ? 'Receita' : 'Despesa'} {fmt(c.valor)}</span>
                        <span className={c.atrasado ? 'text-aviso' : 'text-texto-3'}> · {c.atrasado ? 'venceu' : 'vence'} {fmtDate(c.data)}</span>
                      </p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-texto-3" />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <Titulo>
          Não achei agendamento pendente com “{quem}” no favorecido ou na descrição (vencimento entre 30 dias atrás e 15 dias à frente{parametros.valor_exato ? `, valor ${fmt(parametros.valor_informado)}` : ''}). Quer registrar como um lançamento avulso?
        </Titulo>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onNovo}>Novo pedido</button>
        <button type="button" className="btn-primary flex-1" onClick={() => onTrocar('registrar_lancamento', sugestaoLancamentoDaBaixa(parametros))}>Registrar como lançamento</button>
      </div>
    </Caixa>
  )
}

// ─── consultar_saldo: saldosDaConta (a do recalcularSaldo) + getAccountSaldos (final do ciclo) ───
export function SaldoResposta({ parametros, onClose, onNovo }) {
  const { accounts, transactions, getAccountSaldos } = useApp()
  const [contaId, setContaId] = useState(parametros.conta_id || '')
  const ativas = (accounts || []).filter(a => a.active !== false)
  const conta = ativas.find(a => a.id === contaId) || null
  const s = conta && contaRecalculavel(conta) ? saldosDaConta(conta.id, conta.initialBalance, transactions) : null
  const ciclo = conta ? getAccountSaldos(conta) : null
  return (
    <Caixa>
      <div>
        <label className="label">Conta{!parametros.conta_id && <span className="ml-1.5 text-[11px] font-medium text-aviso">● escolha</span>}</label>
        <select className="input" value={contaId} onChange={e => setContaId(e.target.value)}>
          <option value="">Selecione a conta...</option>
          {ativas.map(a => <option key={a.id} value={a.id}>{a.apelido || a.name}</option>)}
        </select>
      </div>
      {conta && (s ? (
        <div className="grid grid-cols-2 gap-2">
          <Valor rotulo="Saldo atual (hoje)" valor={s.balance} grande />
          <Valor rotulo="Saldo futuro (lançamentos à frente)" valor={s.projected} grande />
          {ciclo?.applicable && <Valor span2 rotulo={`Final do ciclo (com agendamentos pendentes até ${fmtDate(ciclo.cycleEnd)})`} valor={ciclo.saldoFinalCiclo} />}
        </div>
      ) : (
        <p className="text-xs text-texto-3">Esta conta não tem saldo de conta corrente ({conta.type === 'credit' ? 'é cartão de crédito — peça a fatura' : 'tipo sem saldo calculado'}).</p>
      ))}
      <Rodape onNovo={onNovo} onClose={onClose} />
    </Caixa>
  )
}

// ─── consultar_saldo_principal: getSaldoPrincipal (o mesmo do Início/Painel, perfil ativo) ──────
export function SaldoPrincipalResposta({ onClose, onNovo }) {
  const { getSaldoPrincipal, activeProfile } = useApp()
  const b = useMemo(() => getSaldoPrincipal(), [getSaldoPrincipal])
  const custom = b.mode === 'custom'
  return (
    <Caixa>
      <Titulo>Saldo Principal{activeProfile ? ` — perfil ${activeProfile.name}` : ''} (o mesmo do Início).</Titulo>
      <div className="grid grid-cols-2 gap-2">
        <Valor span2 grande rotulo="Atual" valor={b.saldoAtual.total} />
        <Valor rotulo="Final do ciclo" valor={b.finalCiclo.total} />
        <Valor rotulo="Projetado" valor={b.projetado.total} />
        {custom && b.atualCalendario && <Valor rotulo="Atual (mês calendário)" valor={b.atualCalendario.total} />}
        {custom && b.finalCalendario && <Valor rotulo="Final (mês calendário)" valor={b.finalCalendario.total} />}
      </div>
      {(b.saldoAtual.contas?.length ?? 0) === 0 && <p className="text-xs text-aviso">Nenhuma conta entra no Saldo Principal deste perfil.</p>}
      <Rodape onNovo={onNovo} onClose={onClose} abrir={{ rotulo: 'Abrir o Painel', fn: () => navegarPara('dashboard') }} />
    </Caixa>
  )
}

// ─── consultar_vencimentos: buildScheduleGroups + ocorrenciasPendentes (os da Agenda) ───────────
export function VencimentosResposta({ parametros, onClose, onNovo }) {
  const { profileSchedules, getNextOccurrences, accounts } = useApp()
  const hoje = hojeStr()
  const { ini, fim, rotulo } = intervaloVencimento(parametros.periodo, hoje)
  const rows = useMemo(() => buildScheduleGroups(profileSchedules || [], getNextOccurrences), [profileSchedules, getNextOccurrences])
  const itens = useMemo(() => filtrarVencimentos(ocorrenciasPendentes(rows, getNextOccurrences, { ini, fim, hoje, accounts }), parametros.tipo), [rows, getNextOccurrences, ini, fim, hoje, accounts, parametros.tipo])
  const atrasados = useMemo(() => (parametros.periodo === 'atrasados' ? [] : filtrarVencimentos(
    ocorrenciasPendentes(rows, getNextOccurrences, { ini: '0000-01-01', fim: intervaloVencimento('atrasados', hoje).fim, hoje, accounts }), parametros.tipo)),
  [rows, getNextOccurrences, hoje, accounts, parametros.periodo, parametros.tipo])
  const tot = totaisVencimentos(itens)
  const lado = { pagar: 'a pagar', receber: 'a receber', todos: '' }[parametros.tipo]
  return (
    <Caixa>
      <Titulo>{itens.length ? `${itens.length} vencimento${itens.length > 1 ? 's' : ''} ${lado} ${rotulo}.` : `Nada ${lado || 'pendente'} ${rotulo}.`}</Titulo>
      {itens.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {parametros.tipo !== 'receber' && <Valor rotulo="A pagar" valor={tot.pagar} />}
            {parametros.tipo !== 'pagar' && <Valor rotulo="A receber" valor={tot.receber} />}
          </div>
          <ul className="divide-y divide-borda rounded-lg border border-borda max-h-72 overflow-y-auto">
            {itens.slice(0, 30).map(i => (
              <li key={i.key} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className={`shrink-0 w-12 text-xs ${i.atrasado ? 'text-aviso' : 'text-texto-3'}`}>{fmtDate(i.data).slice(0, 5)}</span>
                <span className="flex-1 min-w-0 break-words text-texto-1">{i.schedule?.description}</span>
                <span className={`shrink-0 font-medium ${ladoDoGrupo(i.grupo) === 'receber' ? 'text-receita' : 'text-despesa'}`}>{fmt(i.amount)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {atrasados.length > 0 && <p className="text-xs text-aviso">E {atrasados.length} em atraso (vencidos antes de hoje).</p>}
      <Rodape onNovo={onNovo} onClose={onClose} abrir={{ rotulo: 'Abrir Agendamentos', fn: () => navegarPara('schedule') }} />
    </Caixa>
  )
}

// ─── consultar_fatura: creditBillStatus (o cálculo do CreditCardPanel) ──────────────────────────
export function FaturaResposta({ parametros, onClose, onNovo }) {
  const { accounts, transactions, schedules, isFaturaFechada } = useApp()
  const cartoes = (accounts || []).filter(a => a.type === 'credit' && a.active !== false)
  const [cardId, setCardId] = useState(parametros.cartao_id || (cartoes.length === 1 ? cartoes[0].id : ''))
  const card = cartoes.find(c => c.id === cardId) || null
  const key = card ? (parametros.mes || creditBillKey(hojeStr(), card)) : ''
  const st = card ? creditBillStatus(card, transactions, schedules, key) : null
  const fechada = card ? isFaturaFechada(card.id, key) : false
  const mmaaaa = key ? `${key.slice(5, 7)}/${key.slice(0, 4)}` : ''
  return (
    <Caixa>
      <div>
        <label className="label">Cartão{!parametros.cartao_id && <span className="ml-1.5 text-[11px] font-medium text-aviso">● escolha</span>}</label>
        <select className="input" value={cardId} onChange={e => setCardId(e.target.value)}>
          <option value="">Selecione o cartão...</option>
          {cartoes.map(a => <option key={a.id} value={a.id}>{a.apelido || a.name}</option>)}
        </select>
      </div>
      {st && (
        <>
          <Titulo>Fatura {mmaaaa} do {card.apelido || card.name} — {fechada ? 'fechada' : 'aberta'}{st.isFaturaPaga ? ', paga' : st.isFaturaParcial ? ', paga em parte' : ''}.</Titulo>
          <div className="grid grid-cols-2 gap-2">
            <Valor span2 grande rotulo="Total da fatura" valor={st.billTotal} />
            <Valor rotulo="Pago" valor={st.totalPago} />
            <Valor rotulo="Falta pagar" valor={st.saldoRestante} />
          </div>
        </>
      )}
      <Rodape onNovo={onNovo} onClose={onClose}
        abrir={card ? { rotulo: 'Abrir a fatura', fn: () => navegarPara('credit', { handoff: { key: ABRIR_FATURA_KEY, valor: { cardId: card.id, faturaMesAno: key } } }) } : null} />
    </Caixa>
  )
}

// ─── consultar_gastos_categoria: useDespesasPorCategoria (o mesmo do Painel/Maiores despesas) ──
export function GastosResposta({ parametros, onClose, onNovo }) {
  const { categories, getFinancialPeriod } = useApp()
  const [modo] = useModoDespesas()
  const periodo = useMemo(() => periodoDoFiltro(parametros.periodo, getFinancialPeriod), [parametros.periodo, getFinancialPeriod])
  const resultado = useDespesasPorCategoria(periodo, modo)
  const nomeCat = (id) => { const c = categories.find(x => x.id === id); return c ? `${c.icon || ''} ${c.name}`.trim() : 'Sem categoria' }
  const quando = { current: 'neste mês financeiro', prev: 'no mês financeiro passado', '3m': 'nos últimos 3 meses' }[parametros.periodo]
  const faixa = `${fmtDate(periodo.start)} a ${fmtDate(periodo.end)}`
  const cat = parametros.categoria_id ? gastoDaCategoria(resultado, parametros.categoria_id) : null
  return (
    <Caixa>
      {cat ? (
        <>
          <Titulo>{nomeCat(parametros.categoria_id)}: {fmt(cat.valor)} {quando} ({faixa}){cat.pct ? ` — ${Math.round(cat.pct)}% das despesas` : ''}.</Titulo>
          <div className="grid grid-cols-2 gap-2">
            <Valor rotulo={nomeCat(parametros.categoria_id)} valor={cat.valor} grande />
            <Valor rotulo="Todas as despesas" valor={resultado.totalDespesas} />
          </div>
        </>
      ) : (
        <>
          <Titulo>Maiores despesas {quando} ({faixa}): total {fmt(resultado.totalDespesas)}.</Titulo>
          <ul className="divide-y divide-borda rounded-lg border border-borda">
            {resultado.categorias.slice(0, 5).map(c => (
              <li key={c.categoryId} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="flex-1 min-w-0 break-words text-texto-1">{nomeCat(c.categoryId)}</span>
                <span className="shrink-0 text-xs text-texto-3">{Math.round(c.pct)}%</span>
                <span className="shrink-0 font-medium text-despesa">{fmt(c.valor)}</span>
              </li>
            ))}
            {!resultado.categorias.length && <li className="px-3 py-3 text-center text-xs text-texto-3">Sem despesas no período.</li>}
          </ul>
        </>
      )}
      <p className="text-[11px] text-texto-3">Modo {modo === 'liquido' ? 'líquido (descontando resgates de reserva)' : 'cheio'}, como no Painel.</p>
      <Rodape onNovo={onNovo} onClose={onClose} abrir={{ rotulo: 'Abrir o Painel', fn: () => navegarPara('dashboard') }} />
    </Caixa>
  )
}

// ─── buscar_lancamentos: /api/search (a mesma Busca global) ─────────────────────────────────────
export function BuscaResposta({ parametros, onClose, onNovo }) {
  const { transactions, schedules, activeProfileId } = useApp()
  const [estado, setEstado] = useState({ carregando: true })
  useEffect(() => {
    let vivo = true
    searchEntries({
      value: parametros.valor, valueMode: parametros.modo_valor, text: parametros.texto || '',
      from: parametros.de, to: parametros.ate, profileId: activeProfileId || null,
    }).then(r => {
      if (!vivo) return
      const txIds = new Set((r?.transactions || []).map(x => x.id))
      const scIds = new Set((r?.schedules || []).map(x => x.id))
      setEstado({
        txs: transactions.filter(t => txIds.has(t.id)).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
        scs: schedules.filter(s => scIds.has(s.id)),
      })
    }).catch(err => { if (vivo) setEstado({ erro: err.message }) })
    return () => { vivo = false }
    // Busca uma vez por pedido (os parâmetros não mudam nesta resposta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const filtro = [parametros.texto && `“${parametros.texto}”`, parametros.valor && `${parametros.modo_valor === 'aproximado' ? 'cerca de ' : ''}${fmt(parametros.valor)}`].filter(Boolean).join(' e ')
  return (
    <Caixa>
      {estado.carregando && <p className="text-sm text-texto-2 inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Procurando {filtro}…</p>}
      {estado.erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">Não consegui buscar: {estado.erro}</p>}
      {estado.txs && (
        <>
          <Titulo>{estado.txs.length + estado.scs.length ? `Achei ${estado.txs.length} lançamento${estado.txs.length !== 1 ? 's' : ''}${estado.scs.length ? ` e ${estado.scs.length} agendamento${estado.scs.length !== 1 ? 's' : ''}` : ''} com ${filtro}.` : `Nada encontrado com ${filtro}.`}</Titulo>
          {estado.txs.length > 0 && (
            <ul className="divide-y divide-borda rounded-lg border border-borda max-h-72 overflow-y-auto">
              {estado.txs.slice(0, 15).map(t => (
                <li key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="shrink-0 w-12 text-xs text-texto-3">{fmtDate(t.date).slice(0, 5)}</span>
                  <span className="flex-1 min-w-0 break-words text-texto-1">{t.description || t.payee || 'Sem descrição'}</span>
                  <span className={`shrink-0 font-medium ${t.type === 'income' ? 'text-receita' : 'text-despesa'}`}>{fmt(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {estado.txs.length > 15 && <p className="text-[11px] text-texto-3">Mostrando os 15 mais recentes. Use a busca 🔍 para ver todos.</p>}
        </>
      )}
      <Rodape onNovo={onNovo} onClose={onClose} />
    </Caixa>
  )
}

// ─── abrir_tela: ações 🔴 e edições — a IA não executa, só leva à tela ──────────────────────────
export function AbrirTelaResposta({ parametros, onClose, onNovo }) {
  const d = DESTINOS[parametros.destino] || DESTINOS.tela_lancamentos
  const estorno = parametros.destino === 'estornar'
  const abrir = () => {
    if (d.config) return navegarPara('settings', { hash: configHash(d.config[0], d.config[1]) })
    if (d.page === 'credit' && parametros.cartao_id) {
      return navegarPara('credit', { handoff: { key: ABRIR_FATURA_KEY, valor: { cardId: parametros.cartao_id, faturaMesAno: parametros.mes } } })
    }
    navegarPara(d.page)
  }
  return (
    <Caixa>
      <Titulo>
        {estorno
          ? 'Eu não estorno lançamentos. Abra a tela de Lançamentos, encontre o lançamento e use o estorno por lá — você confere tudo antes.'
          : d.critica
            ? `Isso eu não faço por aqui: é uma operação que você confere e confirma na tela ${d.rotulo}.`
            : `Para isso, abra a tela ${d.rotulo} e decida por lá.`}
      </Titulo>
      {parametros.filtro && <p className="text-xs text-texto-3">Procure por: “{parametros.filtro}” (a busca 🔍 também ajuda).</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onNovo}>Novo pedido</button>
        <button type="button" className="btn-primary flex-1 inline-flex items-center justify-center gap-1.5" onClick={() => { abrir(); onClose() }}>
          <ExternalLink size={14} /> Abrir {d.rotulo}
        </button>
      </div>
    </Caixa>
  )
}
