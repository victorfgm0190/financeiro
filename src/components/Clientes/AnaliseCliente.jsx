import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { analiseCliente } from '../../lib/clientesApi'
import { fmt, fmtDate } from '../shared/utils'

// ANÁLISE DO CLIENTE (admin da plataforma): visão gerencial AGREGADA do ambiente de um cliente —
// a API (api/admin/analise-cliente.js) só devolve totais, nunca lançamentos. Cada abertura e cada
// troca de mês ficam no histórico do cliente. O mês é o financeiro DO CLIENTE (dia de início dele).

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const rotuloMes = (mes) => { const [a, m] = mes.split('-').map(Number); const n = MESES[m - 1]; return `${n[0].toUpperCase()}${n.slice(1)} de ${a}` }
const somarMes = (mes, d) => {
  const [a, m] = mes.split('-').map(Number)
  const dt = new Date(a, m - 1 + d, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}
const pctTxt = (p) => `${Number(p).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
// Data de um timestamp no fuso de São Paulo (DD/MM/AAAA).
const dataSP = (v) => (v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null)

function Card({ titulo, valor, cor }) {
  return (
    <div className="card p-4 min-w-0">
      <p className="text-xs text-texto-3">{titulo}</p>
      <p className={`text-lg sm:text-xl font-bold mt-1 truncate ${cor}`}>{fmt(valor)}</p>
    </div>
  )
}

function Secao({ titulo, children, extra }) {
  return (
    <section className="card p-4 min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-texto-1">{titulo}</h3>
        {extra}
      </div>
      {children}
    </section>
  )
}

// Lista com barra horizontal de percentual (favorecidos e categorias).
function ListaBarras({ itens, cor, vazio }) {
  if (!itens.length) return <p className="text-sm text-texto-3">{vazio}</p>
  return (
    <ul className="space-y-2.5">
      {itens.map((it, i) => (
        <li key={`${it.nome}-${i}`} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-texto-1 truncate min-w-0">{it.icone ? `${it.icone} ` : ''}{it.nome}</span>
            <span className="shrink-0 text-texto-1 font-medium tabular-nums">
              {fmt(it.total)} <span className="text-xs text-texto-3 font-normal">{pctTxt(it.pct)}</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2 mt-1 overflow-hidden" aria-hidden="true">
            <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.max(Math.min(it.pct, 100), it.pct > 0 ? 1 : 0)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

const NotaSemFavorecido = ({ valor, total }) => (valor > 0
  ? <p className="text-[11px] text-texto-3 mt-3">Sem favorecido informado: {fmt(valor)} ({pctTxt(total > 0 ? (valor / total) * 100 : 0)})</p>
  : null)

export default function AnaliseCliente({ sigla, nome }) {
  // Mês PEDIDO à API (null = mês financeiro atual do cliente, que a API resolve) — separado do
  // exibido para a primeira resposta não disparar outra consulta (cada uma vai para o histórico).
  const [mesPedido, setMesPedido] = useState(null)
  const [tentativa, setTentativa] = useState(0)
  // Resposta da última consulta, com a chave do pedido: "carregando" = a chave atual ainda não voltou.
  const [resposta, setResposta] = useState(null) // { chave, dados } | { chave, erro }
  const [ultimosDados, setUltimosDados] = useState(null)
  const chave = `${sigla}|${mesPedido || ''}|${tentativa}`

  useEffect(() => {
    let vivo = true
    analiseCliente(sigla, mesPedido)
      .then(dados => { if (vivo) { setResposta({ chave, dados }); setUltimosDados(dados) } })
      .catch(erro => { if (vivo) setResposta({ chave, erro }) })
    return () => { vivo = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])
  const tentarDeNovo = useCallback(() => setTentativa(t => t + 1), [])

  // Trocar mês: a chave muda; até voltar, mostra os últimos dados apagados.
  const carregando = resposta?.chave !== chave
  const estado = carregando ? { fase: 'carregando' } : resposta?.erro ? { fase: 'erro', erro: resposta.erro } : { fase: 'ok' }
  const d = estado.fase === 'ok' ? resposta.dados : ultimosDados
  const mes = mesPedido || ultimosDados?.mes || null
  const setMes = setMesPedido
  const semMovimento = d && d.receita === 0 && d.despesa === 0

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-texto-1 truncate">{d?.cliente?.nome || nome}</p>
          <p className="text-xs text-texto-3 font-mono">{sigla}</p>
        </div>
        <div className="flex items-center gap-1 max-md:w-full">
          <button type="button" className="btn-secondary !p-0 w-11 h-11 md:w-9 md:h-9 flex items-center justify-center shrink-0" aria-label="Mês anterior"
            disabled={!mes || carregando} onClick={() => setMes(somarMes(mes, -1))}>
            <ChevronLeft size={16} />
          </button>
          <div className="text-center px-2 min-w-[10rem] max-md:flex-1">
            <p className="text-sm font-medium text-texto-1">{mes ? rotuloMes(mes) : '—'}</p>
            {d?.periodo && d.mes === mes && <p className="text-[11px] text-texto-3">{fmtDate(d.periodo.inicio)} a {fmtDate(d.periodo.fim)}</p>}
          </div>
          <button type="button" className="btn-secondary !p-0 w-11 h-11 md:w-9 md:h-9 flex items-center justify-center shrink-0" aria-label="Próximo mês"
            disabled={!mes || carregando} onClick={() => setMes(somarMes(mes, 1))}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {estado.fase === 'erro' && (
        <div className="card p-4 border-perigo/40 bg-perigo-bg flex flex-wrap items-start gap-3" role="alert">
          <AlertTriangle size={18} className="text-perigo shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-sm font-medium text-perigo">
              {estado.erro?.dados?.codigo === 'banco_cliente' ? 'Não foi possível conectar ao banco do cliente.' : (estado.erro?.message || 'Falha ao carregar a análise.')}
            </p>
            <p className="text-xs text-texto-2 mt-1">Tente novamente em instantes. O acesso foi registrado no histórico do cliente.</p>
          </div>
          <button type="button" className="btn-secondary inline-flex items-center justify-center gap-1.5 shrink-0 max-md:w-full max-md:min-h-[44px]" onClick={tentarDeNovo}><RefreshCw size={14} /> Tentar de novo</button>
        </div>
      )}

      {carregando && !d && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-texto-3"><Loader2 size={16} className="animate-spin" /> Carregando análise…</div>
      )}

      {d && estado.fase !== 'erro' && (
        <div className={`space-y-4 transition-opacity ${carregando ? 'opacity-50 pointer-events-none' : ''}`} aria-busy={carregando}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card titulo="Receita do mês" valor={d.receita} cor="text-receita" />
            <Card titulo="Despesa do mês" valor={d.despesa} cor="text-despesa" />
            <Card titulo="Resultado" valor={d.resultado} cor={d.resultado < 0 ? 'text-despesa' : 'text-receita'} />
          </div>
          {semMovimento && <p className="text-sm text-texto-3 text-center">Nenhuma receita ou despesa neste mês.</p>}

          <Secao titulo="Principais contas">
            {d.contas.length === 0 ? <p className="text-sm text-texto-3">Nenhuma conta bancária ativa.</p> : (
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="text-xs text-texto-3 text-left border-b border-borda">
                    <th className="font-medium py-2 pr-3">Conta</th>
                    <th className="font-medium py-2 pr-3 hidden md:table-cell w-[22%]">Banco</th>
                    <th className="font-medium py-2 pr-3 hidden md:table-cell w-[24%]">Perfil</th>
                    <th className="font-medium py-2 text-right w-[42%] md:w-[24%]">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {d.contas.map((c, i) => {
                    // Tipo (CPF/CNPJ) fora do corte: só o nome do perfil é truncado.
                    const perfil = c.perfil
                      ? <span className="flex min-w-0 gap-1"><span className="truncate">{c.perfil}</span><span className="shrink-0 text-texto-3">({c.perfilTipo})</span></span>
                      : '—'
                    return (
                      <tr key={i} className="border-b border-borda/60 align-top">
                        <td className="py-2 pr-3 min-w-0">
                          <p className="text-texto-1 truncate">{c.nome}</p>
                          <div className="text-xs text-texto-3 md:hidden min-w-0">
                            {c.banco && <p className="truncate">{c.banco}</p>}
                            {perfil}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-texto-2 truncate hidden md:table-cell">{c.banco || '—'}</td>
                        <td className="py-2 pr-3 text-texto-2 hidden md:table-cell">{perfil}</td>
                        <td className="py-2 text-right">
                          <p className={`font-medium tabular-nums ${c.saldo < 0 ? 'text-despesa' : 'text-texto-1'}`}>{fmt(c.saldo)}</p>
                          <p className="text-[11px] text-texto-3">saldo registrado em {dataSP(c.atualizadoEm || d.saldoReferencia) || '—'}</p>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="pt-2.5 font-semibold text-texto-1" colSpan={1}>Total</td>
                    <td className="hidden md:table-cell" colSpan={2} />
                    <td className={`pt-2.5 text-right font-bold tabular-nums ${d.totalContas < 0 ? 'text-despesa' : 'text-texto-1'}`}>{fmt(d.totalContas)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Secao>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Secao titulo="Top 5 favorecidos de receita">
              <ListaBarras itens={d.favorecidosReceita} cor="bg-receita" vazio="Nenhuma receita com favorecido neste mês." />
              <NotaSemFavorecido valor={d.semFavorecido.receita} total={d.receita} />
            </Secao>
            <Secao titulo="Top 10 favorecidos de despesa">
              <ListaBarras itens={d.favorecidosDespesa} cor="bg-despesa" vazio="Nenhuma despesa com favorecido neste mês." />
              <NotaSemFavorecido valor={d.semFavorecido.despesa} total={d.despesa} />
            </Secao>
          </div>

          <Secao titulo="Gasto por categoria" extra={d.categorias.length > 0 && <span className="text-xs text-texto-3">{d.categorias.length} categoria{d.categorias.length > 1 ? 's' : ''}</span>}>
            <ListaBarras itens={d.categorias} cor="bg-primary" vazio="Nenhuma despesa neste mês." />
          </Secao>

          <p className="text-[11px] text-texto-3">
            Valores agregados, pela mesma regra do Painel do cliente (visão de todos os perfis). Transferências entre contas e entre perfis e pagamentos de fatura não entram. Mês financeiro do cliente: {d.inicioMes.modo === 'calendar' ? 'mês do calendário' : `começa no dia ${d.inicioMes.dia}`}.
          </p>
        </div>
      )}
    </div>
  )
}
