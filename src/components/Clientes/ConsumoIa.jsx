import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, AlertTriangle, RefreshCw, Trash2, Pencil } from 'lucide-react'
import { consumoIa, salvarPrecoIa, excluirPrecoIa } from '../../lib/clientesApi'
import { consolidarConsumo, periodoDoFiltro, precoDigitado, rotuloFerramenta } from '../../lib/consumoIa'
import { fmt, fmtDate } from '../shared/utils'
import { hojeSP } from '../../lib/hoje'

// CONSUMO DE IA (Clientes Finup → aba "Consumo de IA", só o administrador da plataforma): o ia_uso de
// CADA ambiente, somado no servidor (api/admin/consumo-ia.js), com o custo estimado pelo preço
// vigente na data de cada chamada (src/lib/consumoIa.js). Preços: cadastro no central, nesta aba.

const n = (v) => Number(v || 0).toLocaleString('pt-BR')
const usd = (v, casas = 2) => (v == null ? '—' : `US$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`)
const brl = (v, cot) => (v == null || !cot ? '—' : fmt(v * cot))
const seg = (ms) => (ms == null ? '—' : `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`)
const PRECO_VAZIO = { id: null, modelo: '', vigencia: '', entrada: '', saida: '', cache_leitura: '', cache_criacao: '' }
const CAMPOS_PRECO = [['entrada', 'Entrada'], ['saida', 'Saída'], ['cache_leitura', 'Cache (leitura)'], ['cache_criacao', 'Cache (gravação)']]
const precoTxt = (v) => (v == null ? '' : String(v).replace('.', ','))

function Card({ titulo, valor, detalhe }) {
  return (
    <div className="card p-3 sm:p-4 min-w-0">
      <p className="text-xs text-texto-3">{titulo}</p>
      <p className="text-base sm:text-lg font-bold mt-1 truncate text-texto-1 tabular-nums">{valor}</p>
      {detalhe && <p className="text-[11px] text-texto-3 truncate">{detalhe}</p>}
    </div>
  )
}

// Tabela de linhas consolidadas ({ chave, chamadas, entrada, saida, imagens, custo, custoMedio, duracaoMedia }).
function Tabela({ titulo, coluna, linhas, rotulo, cot }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-texto-1">{titulo}</h3>
      <div className="card !p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-xs text-texto-3 border-b border-borda text-right">
              <th className="font-medium px-3 py-2 text-left">{coluna}</th>
              <th className="font-medium px-3 py-2">Chamadas</th>
              <th className="font-medium px-3 py-2">Entrada</th>
              <th className="font-medium px-3 py-2">Saída</th>
              <th className="font-medium px-3 py-2">Imagens</th>
              <th className="font-medium px-3 py-2">Custo US$</th>
              <th className="font-medium px-3 py-2">Custo R$</th>
              <th className="font-medium px-3 py-2">Médio/chamada</th>
              <th className="font-medium px-3 py-2">Tempo médio</th>
            </tr>
          </thead>
          <tbody>
            {!linhas.length && <tr><td colSpan={9} className="px-3 py-4 text-center text-texto-3">Sem chamadas no período.</td></tr>}
            {linhas.map(l => (
              <tr key={l.chave} className="border-b border-borda/60 last:border-0 text-right tabular-nums">
                <td className="px-3 py-2 text-left text-texto-1">{rotulo(l.chave)}</td>
                <td className="px-3 py-2">{n(l.chamadas)}</td>
                <td className="px-3 py-2">{n(l.entrada)}</td>
                <td className="px-3 py-2">{n(l.saida)}</td>
                <td className="px-3 py-2">{n(l.imagens)}</td>
                <td className="px-3 py-2">{usd(l.custo, 4)}{l.custo != null && l.semPreco > 0 ? '*' : ''}</td>
                <td className="px-3 py-2">{brl(l.custo, cot)}</td>
                <td className="px-3 py-2">{usd(l.custoMedio, 4)}</td>
                <td className="px-3 py-2">{seg(l.duracaoMedia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Precos({ precos, modelos, semTabela, onMudou }) {
  const [f, setF] = useState(PRECO_VAZIO)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const salvar = async (e) => {
    e.preventDefault()
    const dados = { modelo: f.modelo.trim(), vigencia: f.vigencia }
    for (const [k] of CAMPOS_PRECO) {
      const v = precoDigitado(f[k])
      if (v === undefined) { setErro('Preço inválido: use um número (US$ por milhão de tokens) ou deixe vazio.'); return }
      dados[k] = v
    }
    setSalvando(true)
    setErro('')
    try {
      await salvarPrecoIa(dados)
      setF(PRECO_VAZIO)
      onMudou()
    } catch (err) { setErro(err.message) } finally { setSalvando(false) }
  }
  const excluir = async (id) => {
    if (!window.confirm('Excluir este preço?')) return
    try { await excluirPrecoIa(id); onMudou() } catch (err) { setErro(err.message) }
  }
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-texto-1">Preços (US$ por milhão de tokens)</h3>
      {semTabela && <p className="text-xs text-aviso">O central ainda não tem a tabela de preços: rode scripts/migrar-central.js.</p>}
      <div className="card !p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-xs text-texto-3 border-b border-borda text-right">
              <th className="font-medium px-3 py-2 text-left">Modelo</th>
              <th className="font-medium px-3 py-2 text-left">Vigência</th>
              {CAMPOS_PRECO.map(([k, r]) => <th key={k} className="font-medium px-3 py-2">{r}</th>)}
              <th className="w-20"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {!precos.length && <tr><td colSpan={7} className="px-3 py-4 text-center text-texto-3">Nenhum preço cadastrado.</td></tr>}
            {precos.map(p => (
              <tr key={p.id} className="border-b border-borda/60 last:border-0 text-right tabular-nums">
                <td className="px-3 py-2 text-left font-mono text-xs text-texto-1">{p.modelo}</td>
                <td className="px-3 py-2 text-left">{fmtDate(p.vigencia)}</td>
                {CAMPOS_PRECO.map(([k]) => <td key={k} className="px-3 py-2">{p[k] == null ? <span className="text-aviso">vazio</span> : precoTxt(p[k])}</td>)}
                <td className="px-1 py-1 text-right whitespace-nowrap">
                  <button type="button" aria-label={`Editar preço ${p.modelo} ${p.vigencia}`} className="p-2 min-h-[36px] text-texto-2 hover:text-texto-1"
                    onClick={() => setF({ ...p, ...Object.fromEntries(CAMPOS_PRECO.map(([k]) => [k, precoTxt(p[k])])) })}><Pencil size={14} /></button>
                  <button type="button" aria-label={`Excluir preço ${p.modelo} ${p.vigencia}`} className="p-2 min-h-[36px] text-texto-2 hover:text-perigo"
                    onClick={() => excluir(p.id)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={salvar} className="card p-3 grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
        <label className="col-span-2 text-xs text-texto-3">Modelo
          <input className="input mt-1 font-mono text-xs" list="modelos-ia" value={f.modelo} onChange={e => set('modelo', e.target.value)} required />
          <datalist id="modelos-ia">{modelos.map(m => <option key={m} value={m} />)}</datalist>
        </label>
        <label className="col-span-2 sm:col-span-1 text-xs text-texto-3">Vigência
          <input type="date" className="input mt-1" value={f.vigencia} onChange={e => set('vigencia', e.target.value)} required />
        </label>
        {CAMPOS_PRECO.map(([k, r]) => (
          <label key={k} className="text-xs text-texto-3">{r}
            <input className="input mt-1 text-right" inputMode="decimal" placeholder="vazio" value={f[k]} onChange={e => set(k, e.target.value.replace(/[^\d.,]/g, ''))} />
          </label>
        ))}
        <div className="col-span-2 sm:col-span-6 flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-primary min-h-[40px]" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar preço'}</button>
          {f.modelo && <button type="button" className="btn-secondary min-h-[40px]" onClick={() => setF(PRECO_VAZIO)}>Limpar</button>}
          <p className="text-[11px] text-texto-3">Mesmo modelo e vigência substitui o preço. Pela página de preços da Anthropic.</p>
        </div>
        {erro && <p className="col-span-2 sm:col-span-6 text-xs text-perigo">{erro}</p>}
      </form>
    </section>
  )
}

export default function ConsumoIa() {
  const hoje = hojeSP()
  const [tipo, setTipo] = useState('atual')
  const [livre, setLivre] = useState(() => periodoDoFiltro('atual', hoje))
  const [ambiente, setAmbiente] = useState('')
  const [versao, setVersao] = useState(0)
  // Resposta com a chave do pedido: "carregando" = a chave atual ainda não voltou (mostra a anterior).
  const [resposta, setResposta] = useState(null) // { chave, dados } | { chave, erro }
  const [dados, setDados] = useState(null)
  const periodo = tipo === 'livre' ? livre : periodoDoFiltro(tipo, hoje)
  const valido = !!periodo.inicio && !!periodo.fim && periodo.inicio <= periodo.fim
  const chave = `${periodo.inicio}|${periodo.fim}|${ambiente}|${versao}`

  useEffect(() => {
    if (!valido) return
    let vivo = true
    consumoIa(periodo.inicio, periodo.fim, ambiente)
      .then(r => { if (vivo) { setResposta({ chave, dados: r }); setDados(r) } })
      .catch(e => { if (vivo) setResposta({ chave, erro: e.message }) })
    return () => { vivo = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, valido])
  const carregar = useCallback(() => setVersao(v => v + 1), [])
  const carregando = valido && resposta?.chave !== chave
  const erro = !valido ? 'Período inválido: o início precisa ser antes do fim.' : !carregando ? resposta?.erro || '' : ''

  const c = useMemo(() => (dados ? consolidarConsumo(dados.grupos, dados.precos) : null), [dados])
  const cot = dados?.ptax?.venda || null
  const nomes = useMemo(() => new Map((dados?.ambientes || []).map(a => [a.sigla, a.nome])), [dados])
  const modelos = useMemo(() => [...new Set([...(dados?.grupos || []).map(g => g.modelo).filter(Boolean), ...(dados?.precos || []).map(p => p.modelo)])].sort(), [dados])
  const t = c?.totais

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
          {[['atual', 'Este mês'], ['anterior', 'Mês anterior'], ['livre', 'Intervalo']].map(([v, r]) => (
            <button key={v} type="button" onClick={() => setTipo(v)} aria-pressed={tipo === v}
              className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-medium border ${tipo === v ? 'border-primary text-primary-fg bg-primary/10' : 'border-borda text-texto-2 hover:bg-surface-hover'}`}>{r}</button>
          ))}
        </div>
        {tipo === 'livre' && (
          <div className="flex items-center gap-1.5 text-xs text-texto-3">
            <input type="date" aria-label="Início" className="input !py-1.5 w-[9.5rem]" value={livre.inicio} onChange={e => setLivre(p => ({ ...p, inicio: e.target.value }))} />
            até
            <input type="date" aria-label="Fim" className="input !py-1.5 w-[9.5rem]" value={livre.fim} onChange={e => setLivre(p => ({ ...p, fim: e.target.value }))} />
          </div>
        )}
        <select className="input !py-1.5 w-auto max-w-full" aria-label="Cliente" value={ambiente} onChange={e => setAmbiente(e.target.value)}>
          <option value="">Todos os clientes</option>
          {(dados?.ambientes || []).map(a => <option key={a.sigla} value={a.sigla}>{a.nome} ({a.sigla})</option>)}
        </select>
        <button type="button" className="btn-secondary ml-auto inline-flex items-center gap-1.5 min-h-[36px]" onClick={carregar} title="Recarregar" aria-label="Recarregar">
          {carregando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>
      <p className="text-xs text-texto-3">Período: {fmtDate(periodo.inicio)} a {fmtDate(periodo.fim)} (horário de Brasília).</p>

      {erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}
      {!dados && !erro && <p className="text-sm text-texto-3 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Lendo o consumo de cada ambiente…</p>}

      {c && (
        <>
          {c.modelosSemPreco.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-aviso bg-aviso/10 border border-aviso/30 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Cadastre o preço {c.modelosSemPreco.length > 1 ? 'dos modelos' : 'do modelo'} <span className="font-mono">{c.modelosSemPreco.join(', ')}</span> (abaixo).
                {t.custo == null ? ' Enquanto isso, só os tokens.' : ` O custo mostrado é parcial: ${n(t.semPreco)} chamada(s) sem preço ficaram de fora (*).`}
              </span>
            </p>
          )}
          {dados.falhas?.length > 0 && (
            <p className="text-xs text-perigo">Sem leitura: {dados.falhas.map(f => `${nomes.get(f.sigla) || f.sigla} (${f.erro})`).join('; ')}</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Card titulo="Chamadas" valor={n(t.chamadas)} />
            <Card titulo="Tokens de entrada" valor={n(t.entrada)} detalhe={t.leitura || t.criacao ? `cache: ${n(t.leitura)} lidos, ${n(t.criacao)} gravados` : null} />
            <Card titulo="Tokens de saída" valor={n(t.saida)} />
            <Card titulo="Imagens" valor={n(t.imagens)} />
            <Card titulo="Custo estimado (US$)" valor={usd(t.custo)} detalhe={t.custo != null && t.semPreco ? 'parcial' : null} />
            <Card titulo="Custo estimado (R$)" valor={brl(t.custo, cot)} detalhe={cot ? `PTAX ${cot.toLocaleString('pt-BR', { minimumFractionDigits: 4 })} de ${fmtDate(dados.ptax.data)}` : 'sem cotação do dólar'} />
            <Card titulo="Tempo médio de resposta" valor={seg(t.duracaoMedia)} detalhe={t.duracaoN < t.chamadas ? `de ${n(t.duracaoN)} chamada(s) com tempo` : null} />
            <Card titulo="Cortadas (max_tokens)" valor={n(t.cortadas)} />
          </div>

          <Tabela titulo="Por cliente" coluna="Cliente" linhas={c.porCliente} cot={cot} rotulo={(s) => `${nomes.get(s) || s} (${s})`} />
          <Tabela titulo="Por dia" coluna="Dia" linhas={c.porDia} cot={cot} rotulo={fmtDate} />
          <Tabela titulo="Por ferramenta" coluna="Ferramenta" linhas={c.porFerramenta} cot={cot} rotulo={rotuloFerramenta} />
        </>
      )}

      {dados && <Precos precos={dados.precos} modelos={modelos} semTabela={dados.semTabelaPrecos} onMudou={carregar} />}

      <p className="text-[11px] text-texto-3 border-t border-borda pt-2">
        Estimativa pelos tokens registrados. O valor cobrado está no Console da Anthropic.
        {cot && <> Dólar: PTAX venda de {fmtDate(dados.ptax.data)}, R$ {cot.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}.</>}
      </p>
    </div>
  )
}
