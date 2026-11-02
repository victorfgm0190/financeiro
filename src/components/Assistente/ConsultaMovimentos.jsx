import { useEffect, useMemo, useState } from 'react'
import { Sparkles, ChevronRight, ExternalLink, Search, SlidersHorizontal } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'
import DateInput from '../shared/DateInput'
import { hojeStr } from '../../lib/saldos'
import { GastosResposta } from './respostas'
import { useDadosConsulta, calcularConsulta, resolverFiltro, somaDias } from './useConsultaMovimentos'
import {
  navegarPara, abrirBusca, ABRIR_AGENDAMENTO_KEY, ABRIR_AGENDAMENTOS_FILTRO_KEY, ABRIR_EXTRATO_KEY,
} from '../../lib/abrirTela'
import {
  filtroInicial,
  textoPrincipal, textoComplemento, refinamentos, aplicarMudanca, MAX_ITENS, MAX_RELACIONADOS, MAX_BOTOES,
} from '../../lib/assistente/consultaMovimentos'

// consultar_movimentos 🟢 — consulta PROPOSITIVA. SOMENTE LEITURA.
// Responde o que foi perguntado, mostra o FILTRO usado, "Também encontrei" (o lado oposto, pela
// mesma relação) e até 4 botões de refinamento. Botões e continuação ("e no mês passado?") só trocam
// o filtro e recalculam AQUI, com os dados do perfil ativo (profileReportTransactions,
// profileSchedules — o mesmo recorte das telas), sem chamar a IA. Na dúvida que pode dar resultado
// errado (vários favorecidos/categorias, termo sem correspondência), pergunta UMA coisa, com botões.


function Titulo({ children }) {
  return (
    <div className="flex items-start gap-2 text-sm text-texto-1">
      <Sparkles size={15} className="mt-0.5 shrink-0 text-primary-fg" />
      <p className="flex-1 min-w-0 whitespace-pre-wrap break-words">{children}</p>
    </div>
  )
}

function Linha({ data, texto, sub, valor, cor, onClick }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="w-full flex items-center gap-2 px-3 py-2 min-h-[44px] text-left hover:bg-surface-hover/40">
        <span className="shrink-0 w-12 text-xs text-texto-3">{fmtDate(data).slice(0, 5)}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-texto-1 break-words">{texto}</span>
          {sub && <span className="block text-[11px] text-texto-3 break-words">{sub}</span>}
        </span>
        <span className={`shrink-0 text-sm font-medium ${cor}`}>{fmt(valor)}</span>
        <ChevronRight size={14} className="shrink-0 text-texto-3" />
      </button>
    </li>
  )
}

export default function ConsultaMovimentos({ parametros, textoOriginal, onClose, onNovo, onContexto }) {
  const d = useDadosConsulta()
  const hoje = hojeStr()
  const [filtro, setFiltro] = useState(() => parametros?._filtro || filtroInicial(parametros))
  const [datas, setDatas] = useState(null) // { de, ate } enquanto escolhe o intervalo
  const [verTodos, setVerTodos] = useState(false)
  const [outro, setOutro] = useState('')
  const resolvido = useMemo(() => resolverFiltro(filtro, d), [filtro, d])
  const f = resolvido.f || null
  const res = useMemo(() => (f ? calcularConsulta(f, d, hoje) : null), [f, d, hoje])
  // O contexto (filtro resolvido) vai para o Assistente: "e no mês passado?" continua daqui.
  useEffect(() => { if (f) onContexto?.({ ferramenta: 'consultar_movimentos', filtro: f }) }, [f, onContexto])

  const mudar = (mudanca) => { setVerTodos(false); setDatas(null); setFiltro(prev => aplicarMudanca(prev, mudanca)) }
  const nomeCategoria = (id) => { const c = d.categories.find(x => x.id === id); return c ? c.name : 'Sem categoria' }
  const nomeConta = (id) => { const a = d.accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : '—' }

  // ── Pergunta (uma por vez) ou não achou ──
  if (!f) {
    const p = resolvido.pergunta
    return (
      <div className="space-y-3 min-w-0 break-words">
        <Titulo>{p ? p.texto : `Não encontrei ${resolvido.campo === 'categoria' ? 'categoria' : 'favorecido, categoria ou descrição'} com “${resolvido.naoAchou}”. Pode escrever de outro jeito?`}</Titulo>
        {p && (
          <div className="flex flex-wrap gap-2">
            {p.opcoes.slice(0, MAX_BOTOES).map(o => (
              <button key={o.rotulo} type="button" onClick={() => mudar(o.mudanca)} className="btn-secondary text-xs min-h-[40px] px-3 py-2 h-auto max-w-full whitespace-normal break-words text-left">{o.rotulo}</button>
            ))}
          </div>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = outro.trim(); if (t) { mudar(resolvido.campo === 'categoria' ? { categoriaTermo: t, categoriaId: null } : { favorecido: t }); setOutro('') } }}>
          <input className="input flex-1 min-w-0" value={outro} onChange={e => setOutro(e.target.value.slice(0, 80))} placeholder={p ? 'Outro nome' : 'Nome, categoria ou descrição'} aria-label="Outro nome" />
          <button className="btn-primary px-3 shrink-0" aria-label="Procurar" disabled={!outro.trim()}><Search size={15} /></button>
        </form>
        {textoOriginal && <p className="text-[11px] text-texto-3 whitespace-pre-wrap break-words">Pedido: “{textoOriginal}”</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onNovo}>Novo pedido</button>
          <button type="button" className="btn-primary flex-1" onClick={onClose}>Fechar</button>
        </div>
      </div>
    )
  }

  const lado = f.tipo === 'receita' ? 'text-receita' : 'text-despesa'
  const fechar = (fn) => () => { fn(); onClose() }
  const abrirAgendamentos = () => navegarPara('schedule', { handoff: { key: ABRIR_AGENDAMENTOS_FILTRO_KEY, valor: { status: 'apagar', payee: f.favorecido || '', desc: f.descricao || '', cat: f.categoriaId || '' } } })
  const abrirPagos = (p) => abrirBusca({ payee: f.favorecido || '', description: f.descricao || '', from: p.ini > '0000-01-01' ? p.ini : '', to: p.fim })
  // Categoria: a busca global não filtra por categoria → "Ver todos" abre a lista aqui mesmo.
  const buscaServe = !!(f.favorecido || f.descricao)
  const listaPagos = (pagos, p, max) => (
    <ul className="divide-y divide-borda rounded-lg border border-borda">
      {pagos.itens.slice(0, max).map(t => (
        <Linha key={t.id} data={t.date} texto={t.description || t.payee || 'Sem descrição'} sub={[t.payee !== t.description ? t.payee : null, nomeConta(t.accountId)].filter(Boolean).join(' · ')}
          valor={t.amount} cor={t.type === 'income' ? 'text-receita' : 'text-despesa'}
          onClick={fechar(() => navegarPara('accounts', { handoff: { key: ABRIR_EXTRATO_KEY, valor: { accountId: t.accountId } } }))} />
      ))}
      {pagos.itens.length > max && (
        <li><button type="button" className="w-full px-3 py-2 text-xs text-primary-fg text-left inline-flex items-center gap-1"
          onClick={buscaServe ? fechar(() => abrirPagos(p)) : () => setVerTodos(true)}>
          <ExternalLink size={12} /> Ver todos ({pagos.itens.length})
        </button></li>
      )}
    </ul>
  )
  const listaAbertos = (abertos, max) => (
    <ul className="divide-y divide-borda rounded-lg border border-borda">
      {abertos.itens.slice(0, max).map(i => (
        <Linha key={i.key} data={i.data} texto={i.schedule?.description || 'Sem descrição'} sub={[i.schedule?.payee, i.atrasado ? 'vencido' : null].filter(Boolean).join(' · ')}
          valor={i.amount} cor={i.atrasado ? 'text-aviso' : lado}
          onClick={fechar(() => navegarPara('schedule', { handoff: { key: ABRIR_AGENDAMENTO_KEY, valor: { scheduleId: i.schedule.id } } }))} />
      ))}
      {abertos.itens.length > max && (
        <li><button type="button" className="w-full px-3 py-2 text-xs text-primary-fg text-left inline-flex items-center gap-1" onClick={fechar(abrirAgendamentos)}>
          <ExternalLink size={12} /> Ver todos ({abertos.itens.length})
        </button></li>
      )}
    </ul>
  )

  const filtroUsado = [
    f.tipo === 'receita' ? 'Receitas' : f.tipo === 'todos' ? 'Despesas e receitas' : 'Despesas',
    { pago: f.tipo === 'receita' ? 'Recebidos' : 'Pagos', em_aberto: 'Em aberto', vencido: 'Vencidos', todos: 'Pagos e em aberto' }[f.status],
    f.favorecido && `Favorecido: ${f.favorecido}`,
    f.categoriaId && `Categoria: ${nomeCategoria(f.categoriaId)}`,
    f.descricao && `Descrição: ${f.descricao}`,
    f.contaId && `Conta: ${nomeConta(f.contaId)}`,
    f.status === 'vencido' ? 'Até ontem' : res.periodo.rotulo,
  ].filter(Boolean)
  const complemento = textoComplemento(f, res.complemento)
  const botoes = refinamentos(f)
  const max = verTodos ? 500 : MAX_ITENS

  return (
    <div className="space-y-3 min-w-0 break-words" data-testid="consulta-movimentos">
      <Titulo>{textoPrincipal(f, res, { nomeCategoria, nomeConta })}</Titulo>
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtro usado">
        <SlidersHorizontal size={12} className="text-texto-3" />
        {filtroUsado.map(c => <span key={c} className="text-[11px] bg-surface-2 text-texto-2 px-1.5 py-0.5 rounded">{c}</span>)}
      </div>
      {res.pagos?.painel && <p className="text-[11px] text-texto-3">Mesmo número do Painel (Maiores despesas, modo {d.modo === 'liquido' ? 'líquido' : 'cheio'}).</p>}

      {res.pagos && res.pagos.itens.length > 0 && listaPagos(res.pagos, res.periodo, max)}
      {res.abertos && res.abertos.itens.length > 0 && listaAbertos(res.abertos, max)}

      {complemento && (
        <section className="rounded-xl border border-borda p-3 space-y-2" aria-label="Também encontrei">
          <p className="text-[10px] uppercase tracking-wide text-texto-3">Também encontrei</p>
          <p className="text-sm text-texto-2">{complemento}</p>
          {res.complemento.tipo === 'abertos'
            ? listaAbertos(res.complemento.dados, MAX_RELACIONADOS)
            : listaPagos(res.complemento.dados, { ini: somaDias(hoje, -365), fim: hoje }, MAX_RELACIONADOS)}
        </section>
      )}

      {botoes.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Refinar">
          {botoes.map(b => (
            <button key={b.id} type="button" onClick={() => (b.datas ? setDatas({ de: res.periodo.ini > '0000-01-01' ? res.periodo.ini : '', ate: res.periodo.fim }) : mudar(b.mudanca))}
              className="btn-secondary text-xs min-h-[36px] px-3 py-1.5 h-auto">{b.rotulo}</button>
          ))}
        </div>
      )}
      {datas && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (datas.de && datas.ate && datas.de <= datas.ate) mudar({ periodo: 'intervalo', de: datas.de, ate: datas.ate }) }}>
          <div className="w-36"><label className="label">De</label><DateInput className="input" value={datas.de} onChange={e => setDatas(x => ({ ...x, de: e.target.value }))} aria-label="De" /></div>
          <div className="w-36"><label className="label">Até</label><DateInput className="input" value={datas.ate} onChange={e => setDatas(x => ({ ...x, ate: e.target.value }))} aria-label="Até" /></div>
          <button className="btn-primary px-3" disabled={!(datas.de && datas.ate && datas.de <= datas.ate)}>Aplicar</button>
        </form>
      )}
      <p className="text-[11px] text-texto-3">Continue por texto ou voz: “e no mês passado?”, “e em aberto?”, “e do {f.favorecido ? 'outro favorecido' : 'Fulano'}?”</p>
      {textoOriginal && <p className="text-[11px] text-texto-3 whitespace-pre-wrap break-words">Pedido: “{textoOriginal}”</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onNovo}>Novo pedido</button>
        <button type="button" className="btn-primary flex-1" onClick={onClose}>Fechar</button>
      </div>
    </div>
  )
}

// "Quanto gastei em X?" (consultar_gastos_categoria com categoria) vira a consulta propositiva (mesmo
// número do Painel + período visível + refinamentos); sem categoria ("maiores despesas") segue a
// resposta de sempre.
const PERIODO_GASTO = { current: 'mes_atual', prev: 'mes_passado', '3m': 'ultimos_3_meses' }
export function GastosOuConsulta(props) {
  const p = props.parametros || {}
  if (!p.categoria_id) return <GastosResposta {...props} />
  return <ConsultaMovimentos {...props} parametros={{ assunto: 'categoria', status: 'pago', tipo: 'despesa', categoria_id: p.categoria_id, periodo: PERIODO_GASTO[p.periodo] || 'mes_atual' }} />
}
