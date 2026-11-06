import { useState, useRef, Fragment } from 'react'
import { AlertTriangle, CheckCircle, Loader2, Lock, Info } from 'lucide-react'
import Modal from '../shared/Modal'
import { fmt, fmtSinal, fmtDate } from '../shared/utils'
import { viradaReservaAcao } from '../../lib/db'
import { rotuloMes, somarDias, dataBR } from '../../lib/mesFinanceiro'

// ── Virada de saldo assistida ────────────────────────────────────────────────────────────────────
// Passos: pergunta (meses pendentes, em ordem) → prévia (do servidor, com os dados do banco) →
// resultado → próximo mês pendente, um por vez e sempre com confirmação. Nada é gravado antes de
// "Confirmar virada"; "Agora não" só fecha.
//
// Props:
//   status          GET /api/reserve-virada (pendentes, disponivel…)
//   bloqueiosTela   [{ codigo, texto }] — conferidos aqui (dados carregados, sincronização, conexão)
//   hoje            YYYY-MM-DD do aparelho (o servidor aceita ±1 dia do fuso de Brasília)
//   manual          aberto pelo botão "Virar Saldo" (sem "Agora não")
//   onVirou()       depois de cada mês fechado (recarregar períodos/snapshots)
//   onFechar()
const PASSO = { PERGUNTA: 'pergunta', PREVIA: 'previa', RESULTADO: 'resultado' }

const novaChave = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `vir_${Date.now()}_${Math.random().toString(36).slice(2)}`)
const msgErro = (err) => err?.dados?.error || err?.message || 'Não foi possível concluir.'

function Bloqueios({ itens }) {
  if (!itens?.length) return null
  return (
    <div className="rounded-lg border border-perigo/40 bg-perigo/10 p-3 space-y-1" role="alert" data-testid="virada-bloqueios">
      <p className="text-xs font-semibold text-perigo flex items-center gap-1.5"><Lock size={12} /> A virada não pode ser feita agora</p>
      {itens.map(b => <p key={b.codigo} className="text-xs text-texto-1">{b.texto}</p>)}
    </div>
  )
}

function Avisos({ itens }) {
  const [aberto, setAberto] = useState(null)
  if (!itens?.length) return null
  return (
    <div className="rounded-lg border border-aviso/40 bg-aviso/10 p-3 space-y-1.5" data-testid="virada-avisos">
      <p className="text-xs font-semibold text-aviso flex items-center gap-1.5"><AlertTriangle size={12} /> Confira antes de confirmar (não impedem a virada)</p>
      {itens.map(a => (
        <div key={a.codigo + (a.accountId || '')}>
          <p className="text-xs text-texto-1">
            {a.texto}
            {a.itens?.length ? (
              <button type="button" className="ml-1 underline text-texto-2" onClick={() => setAberto(aberto === a.codigo ? null : a.codigo)}>
                {aberto === a.codigo ? 'ocultar' : 'ver'}
              </button>
            ) : null}
          </p>
          {aberto === a.codigo && (
            <ul className="mt-1 ml-3 space-y-0.5">
              {a.itens.map((it, i) => (
                <li key={it.id || it.functionId || it.scheduleId || i} className="text-[11px] text-texto-2">
                  {it.date ? `${fmtDate(it.date)} · ` : ''}{it.nome || it.description || it.id}{it.conta ? ` (${it.conta})` : ''}
                  {it.valor !== undefined ? ` · ${fmtSinal(it.valor)}` : ''}{it.saldo !== undefined ? ` · saldo ${fmtSinal(it.saldo)}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

const temResto = (c) => Math.abs(c.resto || 0) > 0.005
const decisaoValida = (d) => d?.tipo === 'a_distribuir' || (d?.tipo === 'ajuste' && d.functionId && String(d.observacao || '').trim())

// A soma das funções não bate com o saldo e o rendimento não explica: a virada para até o usuário escolher.
function DecisaoDiferenca({ conta, decisao, onChange }) {
  const d = decisao || {}
  return (
    <div className="rounded-lg border border-perigo/40 bg-perigo/5 p-3 space-y-2" role="alert" data-testid={`virada-decisao-${conta.accountId}`}>
      <p className="text-xs font-semibold text-perigo flex items-center gap-1.5"><Lock size={12} /> {conta.nome}: {fmtSinal(conta.resto)} sem explicação por rendimento. A virada para aqui.</p>
      <ul className="text-[11px] text-texto-2 space-y-0.5">
        <li>Diferença total entre o saldo da conta e a soma das funções: <b>{fmtSinal(conta.diferenca)}</b></li>
        {Math.abs(conta.rendimentoARatear) > 0.005 && <li>Rendimento real rateado nesta virada, entre as funções positivas: {fmtSinal(conta.rendimentoARatear)}</li>}
        {Math.abs(conta.rendimentoSemBase) > 0.005 && <li>Rendimento sem função positiva, fica a distribuir: {fmtSinal(conta.rendimentoSemBase)}</li>}
        {Math.abs(conta.pendenciasFechado) > 0.005 && <li>Lançamentos em período fechado, pendentes em Reservas: {fmtSinal(conta.pendenciasFechado)}</li>}
        {Math.abs(conta.aceitoAntes) > 0.005 && <li>Já estava a distribuir na virada anterior: {fmtSinal(conta.aceitoAntes)}</li>}
        {Math.abs(conta.lancamentosSemFuncao) > 0.005 && <li>Lançamentos do mês sem função, dentro do valor acima: {fmtSinal(conta.lancamentosSemFuncao)}</li>}
      </ul>
      <div className="flex flex-wrap gap-3 text-xs text-texto-1">
        <label className="flex items-center gap-1.5"><input type="radio" className="accent-primary" checked={d.tipo === 'ajuste'} onChange={() => onChange({ tipo: 'ajuste', functionId: '', observacao: '' })} /> Lançar como Ajuste</label>
        <label className="flex items-center gap-1.5"><input type="radio" className="accent-primary" checked={d.tipo === 'a_distribuir'} onChange={() => onChange({ tipo: 'a_distribuir' })} /> Deixar a distribuir</label>
      </div>
      {d.tipo === 'ajuste' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-[11px] text-texto-2">Função
            <select className="input mt-1 w-full" value={d.functionId || ''} onChange={e => onChange({ ...d, functionId: e.target.value })}>
              <option value="">Escolha…</option>
              {conta.funcoes.map(f => <option key={f.functionId} value={f.functionId}>{f.nome}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-texto-2">Observação
            <input className="input mt-1 w-full" value={d.observacao || ''} onChange={e => onChange({ ...d, observacao: e.target.value })} />
          </label>
        </div>
      )}
    </div>
  )
}

function TabelaConta({ conta, fim }) {
  const th = 'text-right px-2 py-1.5 text-[11px] font-medium text-texto-2 whitespace-nowrap'
  const td = 'text-right px-2 py-1 text-xs whitespace-nowrap'
  return (
    <div className="card p-0 overflow-hidden" data-testid={`virada-conta-${conta.accountId}`}>
      <div className="px-3 py-2 border-b border-borda bg-surface-2/30 text-sm font-semibold text-texto-1">{conta.nome}</div>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ minWidth: 640 }}>
          <thead>
            <tr className="border-b border-borda">
              <th className="text-left px-2 py-1.5 text-[11px] font-medium text-texto-2">Função</th>
              <th className={th}>Saldo Inicial</th><th className={th}>Entradas</th><th className={th}>Saídas</th>
              <th className={th}>Ajuste</th><th className={th}>Rendimentos</th><th className={th}>Saldo Final</th>
            </tr>
          </thead>
          <tbody>
            {conta.funcoes.map(l => (
              <tr key={l.functionId} className="border-b border-borda/40">
                <td className="px-2 py-1 text-xs text-texto-1">{l.nome}</td>
                <td className={`${td} text-texto-2`}>{fmt(l.saldoInicial)}</td>
                <td className={`${td} text-receita`}>{fmt(l.entradas)}</td>
                <td className={`${td} text-despesa`}>{fmt(l.saidas)}</td>
                <td className={td}>{fmt(l.ajuste)}</td>
                <td className={`${td} text-receita`}>{fmt(l.rendimentos)}</td>
                <td className={`${td} font-semibold ${l.saldoFinal < -0.005 ? 'text-despesa' : 'text-texto-1'}`}>{fmt(l.saldoFinal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs border-t border-borda">
        <span className="text-texto-2">Soma das funções: <b className="text-texto-1">{fmt(conta.somaFuncoes)}</b></span>
        <span className="text-texto-2">Saldo da conta em {fmtDate(fim)}: <b className="text-texto-1">{conta.saldoConta == null ? '—' : fmt(conta.saldoConta)}</b></span>
        <span className="text-texto-2">Diferença: <b className={conta.diferenca && Math.abs(conta.diferenca) > 0.005 ? 'text-aviso' : 'text-texto-1'}>{conta.diferenca == null ? '—' : fmtSinal(conta.diferenca)}</b></span>
        <span className="text-texto-2">Rendimentos rateados no mês: <b className="text-receita">{fmt(conta.rendimentosMes)}</b></span>
        {conta.semExplicacao != null && (
          <span className="text-texto-2 sm:col-span-2">
            Diferença que já vinha de antes: <b>{fmtSinal(conta.diferencaAnterior)}</b> · explicada por lançamentos sem função no mês: <b>{fmtSinal(conta.explicadoNoMes)}</b> · <span className={Math.abs(conta.semExplicacao) > 0.005 ? 'text-aviso font-semibold' : ''}>sem explicação: {fmtSinal(conta.semExplicacao)}</span>
          </span>
        )}
      </div>
    </div>
  )
}

export default function ViradaAssistidaModal({ status, bloqueiosTela = [], hoje, manual = false, onVirou, onAgoraNao, onFechar }) {
  // A sequência de meses é CONGELADA quando a virada começa. O painel recarrega o status depois de
  // cada mês fechado (onVirou) e a lista dele perde o mês recém-fechado: ler por posição dessa lista
  // viva fazia o resultado mostrar o mês SEGUINTE como fechado e o "próximo" pular um mês.
  const [fila, setFila] = useState(null)
  const pendentes = fila ?? status?.pendentes ?? []
  const [passo, setPasso] = useState(PASSO.PERGUNTA)
  const [indice, setIndice] = useState(0)               // mês pendente da vez
  const [dados, setDados] = useState(null)              // resposta da prévia
  const [resultado, setResultado] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [decisoes, setDecisoes] = useState({})          // por conta: Ajuste ou a distribuir
  const chaveRef = useRef(null)                          // idempotência do "Confirmar" (clique duplo)
  const enviandoRef = useRef(false)

  const mes = pendentes[indice] || null
  const bloqueado = bloqueiosTela.length > 0

  const verPrevia = async (i = indice) => {
    const m = pendentes[i]
    if (!m || bloqueado) return
    if (!fila) setFila(pendentes)
    setIndice(i)
    setPasso(PASSO.PREVIA)
    setCarregando(true)
    setErro('')
    setDados(null)
    setDecisoes({})
    chaveRef.current = novaChave()
    try {
      setDados(await viradaReservaAcao({ acao: 'previa', fim: m.fim, hoje }))
    } catch (err) {
      setErro(msgErro(err))
    } finally {
      setCarregando(false)
    }
  }

  const confirmar = async () => {
    if (enviandoRef.current || !mes || bloqueado || dados?.bloqueios?.length) return
    enviandoRef.current = true
    setCarregando(true)
    setErro('')
    try {
      const r = await viradaReservaAcao({ acao: 'confirmar', fim: mes.fim, chave: chaveRef.current, hoje, decisoes })
      setResultado({ ...r, mes })
      setPasso(PASSO.RESULTADO)
      await onVirou?.()
    } catch (err) {
      setErro(msgErro(err))
    } finally {
      enviandoRef.current = false
      setCarregando(false)
    }
  }

  const contasComResto = (dados?.previa?.contas || []).filter(temResto)
  const faltaDecidir = contasComResto.some(c => !decisaoValida(decisoes[c.accountId]))
  const proximo = pendentes[indice + 1] || null
  const mesFechado = resultado?.virada?.data_corte
    ? { inicio: resultado.virada.data_inicio || resultado.mes?.inicio, fim: resultado.virada.data_corte }
    : (resultado?.mes || mes)
  const titulo = 'Virada de saldo'

  if (status && status.disponivel === false) {
    return (
      <Modal open onClose={onFechar} title={titulo} size="sm">
        <p className="text-sm text-texto-2">O banco deste ambiente ainda não tem a atualização da virada assistida. Avise o suporte para atualizar o banco.</p>
        <div className="flex justify-end mt-4"><button className="btn-secondary" onClick={onFechar}>Fechar</button></div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={passo === PASSO.RESULTADO ? onFechar : (manual ? onFechar : onAgoraNao)} title={titulo} size={passo === PASSO.PERGUNTA ? 'sm' : 'xl'}>
      <div className="space-y-3" data-testid="virada-modal">
        {passo === PASSO.PERGUNTA && (
          <>
            {pendentes.length ? (
              <>
                <p className="text-sm text-texto-1 font-medium">Deseja fazer a virada de saldo?</p>
                <p className="text-xs text-texto-2">
                  {pendentes.length === 1 ? 'Este mês financeiro já terminou e ainda não foi fechado:' : `Estes ${pendentes.length} meses financeiros já terminaram e ainda não foram fechados. Eles serão fechados um a um, em ordem, sempre com a sua confirmação:`}
                </p>
                <ul className="space-y-1" data-testid="virada-pendentes">
                  {pendentes.map(m => <li key={m.fim} className="text-xs text-texto-1 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-primary" />{rotuloMes(m)}</li>)}
                </ul>
                <p className="text-[11px] text-texto-3 flex gap-1.5"><Info size={12} className="shrink-0 mt-0.5" />A virada fecha o período, guarda o fechamento no Histórico e recomeça Entradas, Saídas, Ajuste e Rendimentos no mês seguinte. O Saldo só muda se houver rendimento a ratear ou um Ajuste escolhido por você.</p>
              </>
            ) : (
              <p className="text-sm text-texto-2">Não há virada pendente. {status?.ultimoCorte ? `O último fechamento foi em ${dataBR(status.ultimoCorte)}.` : ''}</p>
            )}
            <Bloqueios itens={bloqueiosTela} />
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-secondary" onClick={manual ? onFechar : onAgoraNao}>{manual ? 'Cancelar' : 'Agora não'}</button>
              {pendentes.length > 0 && (
                <button className="btn-primary" disabled={bloqueado} onClick={() => verPrevia(0)}>Ver prévia e continuar</button>
              )}
            </div>
          </>
        )}

        {passo === PASSO.PREVIA && mes && (
          <>
            <p className="text-sm text-texto-1">Prévia da virada de <b>{rotuloMes(mes)}</b>{pendentes.length > 1 ? ` (${indice + 1} de ${pendentes.length})` : ''}</p>
            <p className="text-[11px] text-texto-3">Calculada agora com os dados gravados no banco, até {fmtDate(mes.fim)}. O Razão Diário do período foi recalculado antes desta prévia.</p>
            {carregando && !dados && <p className="text-xs text-texto-3 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Calculando a prévia…</p>}
            <Bloqueios itens={[...bloqueiosTela, ...(dados?.bloqueios || [])]} />
            {dados?.previa && (
              <>
                {contasComResto.map(c => (
                  <DecisaoDiferenca key={c.accountId} conta={c} decisao={decisoes[c.accountId]} onChange={d => setDecisoes(prev => ({ ...prev, [c.accountId]: d }))} />
                ))}
                <Avisos itens={dados.previa.avisos} />
                {dados.previa.contas.map(c => <TabelaConta key={c.accountId} conta={c} fim={mes.fim} />)}
                {dados.previa.semConta.length > 0 && (
                  <div className="card p-3 text-xs text-texto-2">
                    <p className="font-semibold text-texto-1 mb-1">Funções sem conta vinculada</p>
                    {dados.previa.semConta.map(l => <p key={l.functionId}>{l.nome}: saldo final {fmt(l.saldoFinal)}</p>)}
                  </div>
                )}
                <p className="text-xs text-texto-2">Ao confirmar, o Saldo Final de cada função vira o Saldo Inicial a partir de {fmtDate(somarDias(mes.fim, 1))}. Nenhum dinheiro é movido. Rendimento real ainda sem rateio é dividido só entre as funções positivas; outra diferença nunca vai para Rendimentos.</p>
              </>
            )}
            {erro && <p className="text-xs text-perigo" role="alert">{erro}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-secondary" disabled={carregando && !!dados} onClick={onFechar}>Cancelar</button>
              <button
                className="btn-primary flex items-center gap-1.5"
                disabled={carregando || !dados?.previa || bloqueado || !!dados?.bloqueios?.length || faltaDecidir}
                onClick={confirmar}
              >
                {carregando && dados ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                Confirmar virada de {rotuloMes(mes)}
              </button>
            </div>
          </>
        )}

        {passo === PASSO.RESULTADO && mes && (
          <>
            {/* O mês fechado é o que o SERVIDOR gravou (virada.data_inicio/data_corte). */}
            <p className="text-sm text-receita font-semibold flex items-center gap-1.5" data-testid="virada-resultado"><CheckCircle size={16} /> Mês {rotuloMes(mesFechado)} fechado{pendentes.length > 1 ? ` (${indice + 1} de ${pendentes.length})` : ''}{resultado?.repetida ? ' (já estava gravado)' : ''}.</p>
            <p className="text-xs text-texto-2">O período foi fechado. O fechamento está na aba Histórico, e Entradas, Saídas, Ajuste e Rendimentos recomeçam em {fmtDate(somarDias(mesFechado.fim, 1))}.</p>
            {resultado?.resumo?.contas?.map(c => (
              <Fragment key={c.accountId}>
                <p className="text-xs text-texto-2">{c.nome}: soma das funções {fmt(c.somaFuncoes)} · saldo da conta {c.saldoConta == null ? '—' : fmt(c.saldoConta)} · diferença {c.diferenca == null ? '—' : fmtSinal(c.diferenca)}{c.diferenca && Math.abs(c.diferenca) > 0.005 ? ' (pode ser distribuída pela coluna Distribuir do Resumo)' : ''}</p>
              </Fragment>
            ))}
            <div className="flex justify-end gap-2 pt-1">
              {proximo ? (
                <>
                  <button className="btn-secondary" onClick={onFechar}>Parar aqui</button>
                  <button className="btn-primary" disabled={bloqueado} onClick={() => verPrevia(indice + 1)}>Ver prévia de {rotuloMes(proximo)}</button>
                </>
              ) : (
                <button className="btn-primary" onClick={onFechar}>Concluir</button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
