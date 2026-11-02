import { useEffect, useMemo, useState } from 'react'
import { Sparkles, ChevronRight, ExternalLink, Search } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { hojeStr } from '../../lib/saldos'
import { navegarPara, ABRIR_AGENDAMENTO_KEY, ABRIR_AGENDAMENTOS_FILTRO_KEY } from '../../lib/abrirTela'
import { filtroInicial } from '../../lib/assistente/consultaMovimentos'
import { normalizarTermo } from '../../lib/assistente/texto'
import { ehPagamentoDeCartao } from '../../lib/rotuloMovimento'
import SeloPagamentoCartao from '../shared/SeloPagamentoCartao'
import { procurarAgendamentos, resumoAgendamento, textoDoResumo, rotuloFrequencia } from '../../lib/assistente/consultaAgendamento'

// consultar_agendamento 🟢 — situação de UM agendamento. SOMENTE LEITURA: nada aqui grava.
// Localiza entre os agendamentos do PERFIL ATIVO (profileSchedules, o mesmo recorte da tela de
// Agendamentos; o /api/load já trouxe só o que o usuário pode ver) e calcula com as funções do
// Editar Agendamento (lib/assistente/consultaAgendamento.js). A IA só passou o nome citado.
//   1 achado → card; empate → botões para o usuário escolher (nunca escolhe sozinho);
//   nenhum → pede mais um detalhe (nova busca local, sem gastar outro pedido à IA).

const MAX_LISTA = 24

function Titulo({ children }) {
  return (
    <div className="flex items-start gap-2 text-sm text-texto-1">
      <Sparkles size={15} className="mt-0.5 shrink-0 text-primary-fg" />
      <p className="flex-1 min-w-0 whitespace-pre-wrap break-words">{children}</p>
    </div>
  )
}

function Numero({ rotulo, children, destaque = false }) {
  return (
    <div className="min-w-0 rounded-lg border border-borda bg-surface-2 px-3 py-2">
      <p className="text-[11px] text-texto-3">{rotulo}</p>
      <p className={`${destaque ? 'text-lg' : 'text-base'} font-semibold text-texto-1 break-words`}>{children}</p>
    </div>
  )
}

export function CardAgendamento({ resumo: r, cartao = false }) {
  const finito = r.tipo !== 'recorrente'
  const proximas = r.proximas.slice(0, MAX_LISTA)
  return (
    <div className="space-y-2 rounded-xl border border-borda p-3" data-testid="card-agendamento">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-texto-1 break-words">{r.descricao || 'Sem descrição'}</p>
        <p className="text-xs text-texto-3 break-words">
          {r.favorecido || 'Sem favorecido'} · {r.tipo === 'parcelado' ? 'Parcelado' : r.tipo === 'unico' ? 'Único' : `Recorrente (${rotuloFrequencia(r.frequencia)})`}
          {r.receita ? ' · a receber' : ' · a pagar'}
        </p>
        {cartao && <SeloPagamentoCartao className="mt-1" />}
      </div>

      {r.tipo === 'parcelado' && (
        <div className="grid grid-cols-3 gap-2">
          <Numero rotulo={r.receita ? 'Recebidas' : 'Pagas'}>{r.pagas}</Numero>
          <Numero rotulo="Restantes">{r.restantes}</Numero>
          <Numero rotulo="Total">{r.total}</Numero>
        </div>
      )}
      {r.puladas > 0 && <p className="text-[11px] text-texto-3">{r.puladas} pulada{r.puladas > 1 ? 's' : ''} (contam na série, como no Editar Agendamento).</p>}

      {finito && !r.quitado && (
        <div className="grid grid-cols-2 gap-2">
          <Numero rotulo="Total restante" destaque>{fmt(r.totalRestante)}</Numero>
          <Numero rotulo={r.tipo === 'unico' ? 'Vencimento' : 'Última parcela'}>{fmtDate(r.ultimaParcela.data)}</Numero>
        </div>
      )}
      {r.atrasadas > 0 && <p className="text-xs text-aviso">{r.atrasadas} em atraso.</p>}

      {proximas.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-texto-3 mb-1">{r.tipo === 'recorrente' ? 'Próximas ocorrências' : r.tipo === 'unico' ? 'Pendente' : 'Parcelas restantes'}</p>
          <ul className="divide-y divide-borda rounded-lg border border-borda max-h-60 overflow-y-auto">
            {proximas.map(p => (
              <li key={p.base} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className={`shrink-0 text-xs ${p.atrasada ? 'text-aviso' : 'text-texto-2'}`}>{fmtDate(p.data)}</span>
                <span className="flex-1 min-w-0 text-[11px] text-texto-3">{p.numero ? `${p.numero}/${p.total}` : ''}{p.atrasada ? ' · em atraso' : ''}</span>
                <span className={`shrink-0 font-medium ${r.receita ? 'text-receita' : 'text-despesa'}`}>{fmt(p.valor)}</span>
              </li>
            ))}
          </ul>
          {r.proximas.length > MAX_LISTA && <p className="mt-1 text-[11px] text-texto-3">Mostrando {MAX_LISTA} de {r.proximas.length}.</p>}
        </div>
      )}

      {r.ultimaPaga && (
        <p className="text-xs text-texto-2">
          Última {r.receita ? 'recebida' : 'paga'}{r.ultimaPaga.numero && r.total ? ` (${r.ultimaPaga.numero}/${r.total})` : ''}: {fmtDate(r.ultimaPaga.data)} · {fmt(r.ultimaPaga.valor)}
        </p>
      )}
    </div>
  )
}

export default function ConsultaAgendamento({ parametros, textoOriginal, onClose, onNovo, onTrocar, onContexto }) {
  const { profileSchedules, transactions, accounts } = useApp()
  const hoje = hojeStr()
  const [detalhe, setDetalhe] = useState('')
  const [criterio, setCriterio] = useState({ descricao: parametros.descricao, favorecido: parametros.favorecido, texto: textoOriginal || '' })
  const busca = useMemo(() => procurarAgendamentos(profileSchedules || [], criterio), [profileSchedules, criterio])
  const [escolhidoId, setEscolhidoId] = useState(null)
  const escolhido = (escolhidoId && (profileSchedules || []).find(s => s.id === escolhidoId)) || busca.escolhido
  const resumo = useMemo(() => (escolhido ? resumoAgendamento(escolhido, { hoje, transactions }) : null), [escolhido, hoje, transactions])

  // Contexto para continuar por texto/voz ("e os pagos?"): o mesmo agendamento (descrição + favorecido).
  const filtroDoAgendamento = (mudanca = {}) => escolhido ? filtroInicial({
    assunto: 'agendamento', status: 'em_aberto', tipo: escolhido.transactionType === 'income' ? 'receita' : 'despesa',
    favorecido: escolhido.payee || null, descricao: escolhido.description || null, ...mudanca,
  }) : null
  useEffect(() => {
    if (escolhido) onContexto?.({ ferramenta: 'consultar_movimentos', filtro: filtroDoAgendamento() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escolhido, onContexto])
  // "Também encontrei": outros agendamentos EM ABERTO do MESMO favorecido (nome igual; nada de
  // coincidência de palavra solta). Próxima pendente de cada um (data e valor efetivos).
  const relacionados = useMemo(() => {
    const fav = normalizarTermo(escolhido?.payee)
    if (!fav) return []
    return (profileSchedules || [])
      .filter(s => s.id !== escolhido.id && !s.isProvisao && s.transactionType === escolhido.transactionType && normalizarTermo(s.payee) === fav)
      .map(s => ({ s, r: resumoAgendamento(s, { hoje, transactions, recorrentesAMostrar: 1 }) }))
      .filter(x => x.r.proximas.length)
      .sort((a, b) => a.r.proximas[0].data.localeCompare(b.r.proximas[0].data))
  }, [escolhido, profileSchedules, hoje, transactions])
  const abrirDoFavorecido = () => { navegarPara('schedule', { handoff: { key: ABRIR_AGENDAMENTOS_FILTRO_KEY, valor: { status: 'apagar', payee: escolhido.payee } } }); onClose() }

  const abrir = () => { navegarPara('schedule', { handoff: { key: ABRIR_AGENDAMENTO_KEY, valor: { scheduleId: escolhido.id } } }); onClose() }
  const refinar = (e) => {
    e.preventDefault()
    const t = detalhe.trim()
    if (!t) return
    setEscolhidoId(null)
    setCriterio({ descricao: t, favorecido: null, texto: t })
    setDetalhe('')
  }
  const citado = [criterio.descricao, criterio.favorecido].filter(Boolean).join(' / ') || textoOriginal || 'esse nome'

  return (
    <div className="space-y-3 min-w-0 break-words">
      {resumo ? (
        <>
          <Titulo>{textoDoResumo(resumo)}</Titulo>
          <CardAgendamento resumo={resumo} cartao={ehPagamentoDeCartao(escolhido, accounts)} />
          {relacionados.length > 0 && (
            <section className="rounded-xl border border-borda p-3 space-y-2" aria-label="Também encontrei">
              <p className="text-[10px] uppercase tracking-wide text-texto-3">Também encontrei</p>
              <p className="text-sm text-texto-2">
                {relacionados.length} outro{relacionados.length > 1 ? 's' : ''} em aberto com {escolhido.payee}; próximo vencimento {fmtDate(relacionados[0].r.proximas[0].data)}.
              </p>
              <ul className="divide-y divide-borda rounded-lg border border-borda">
                {relacionados.slice(0, 3).map(({ s, r }) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => setEscolhidoId(s.id)} className="w-full flex items-center gap-2 px-3 py-2 min-h-[44px] text-left">
                      <span className="shrink-0 w-12 text-xs text-texto-3">{fmtDate(r.proximas[0].data).slice(0, 5)}</span>
                      <span className="flex-1 min-w-0 text-sm text-texto-1 break-words">{s.description || 'Sem descrição'}</span>
                      <span className="shrink-0 text-sm font-medium text-texto-2">{fmt(r.proximas[0].valor)}</span>
                      <ChevronRight size={14} className="shrink-0 text-texto-3" />
                    </button>
                  </li>
                ))}
                {relacionados.length > 3 && (
                  <li><button type="button" className="w-full px-3 py-2 text-xs text-primary-fg text-left inline-flex items-center gap-1" onClick={abrirDoFavorecido}>
                    <ExternalLink size={12} /> Ver todos ({relacionados.length})
                  </button></li>
                )}
              </ul>
            </section>
          )}
          {escolhido?.payee && onTrocar && (
            <div className="flex flex-wrap gap-2" aria-label="Refinar">
              <button type="button" className="btn-secondary text-xs min-h-[36px] px-3 py-1.5 h-auto"
                onClick={() => onTrocar('consultar_movimentos', { _filtro: filtroDoAgendamento({ status: 'pago', descricao: null, periodo: 'historico' }) })}>
                {escolhido.transactionType === 'income' ? 'Recebidos de' : 'Pagos a'} {escolhido.payee}
              </button>
              <button type="button" className="btn-secondary text-xs min-h-[36px] px-3 py-1.5 h-auto"
                onClick={() => onTrocar('consultar_movimentos', { _filtro: filtroDoAgendamento({ descricao: null }) })}>
                Tudo em aberto com {escolhido.payee}
              </button>
            </div>
          )}
        </>
      ) : busca.candidatos.length ? (
        <>
          <Titulo>Achei {busca.candidatos.length} agendamentos parecidos com “{citado}”. Qual deles?</Titulo>
          <ul className="divide-y divide-borda rounded-lg border border-borda">
            {busca.candidatos.map(({ schedule: s }) => {
              const r = resumoAgendamento(s, { hoje, transactions })
              const situacao = r.tipo === 'recorrente' ? `recorrente${r.proximas[0] ? ` · próxima ${fmtDate(r.proximas[0].data)}` : ''}`
                : r.quitado ? 'quitado' : r.tipo === 'unico' ? `vence ${fmtDate(r.proximas[0].data)}` : `${r.pagas} de ${r.total} pagas`
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => setEscolhidoId(s.id)} className="w-full flex items-center gap-2 px-3 py-2 min-h-[52px] text-left">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-texto-1 break-words">{s.description || 'Sem descrição'}</p>
                      <p className="text-[11px] text-texto-3 break-words">{s.payee || 'Sem favorecido'} · {situacao}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-texto-2">{fmt(r.proximas[0]?.valor ?? s.amount)}</span>
                    <ChevronRight size={16} className="shrink-0 text-texto-3" />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <>
          <Titulo>Não achei agendamento com “{citado}” na descrição ou no favorecido{(profileSchedules || []).length ? '' : ' (nenhum agendamento neste perfil)'}. Pode dar mais um detalhe — outra palavra da descrição ou o nome de quem recebe/paga?</Titulo>
          <form className="flex gap-2" onSubmit={refinar}>
            <input className="input flex-1 min-w-0" value={detalhe} onChange={e => setDetalhe(e.target.value.slice(0, 80))} placeholder="Ex.: parte do nome ou o favorecido" aria-label="Detalhe do agendamento" />
            <button className="btn-primary px-3 shrink-0" aria-label="Procurar" disabled={!detalhe.trim()}><Search size={15} /></button>
          </form>
        </>
      )}
      {textoOriginal && <p className="text-[11px] text-texto-3 whitespace-pre-wrap break-words">Pedido: “{textoOriginal}”</p>}
      <div className="flex flex-wrap gap-2">
        {escolhidoId && !busca.escolhido && <button type="button" className="btn-secondary flex-1" onClick={() => setEscolhidoId(null)}>Voltar à lista</button>}
        <button type="button" className="btn-secondary flex-1" onClick={onNovo}>Novo pedido</button>
        {resumo && (
          <button type="button" className="btn-secondary flex-1 inline-flex items-center justify-center gap-1.5" onClick={abrir}>
            <ExternalLink size={14} /> Abrir o agendamento
          </button>
        )}
        <button type="button" className="btn-primary flex-1" onClick={onClose}>Fechar</button>
      </div>
    </div>
  )
}
