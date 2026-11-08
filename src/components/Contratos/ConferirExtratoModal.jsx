import { useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Upload, Pencil, Loader2, AlertTriangle, CheckCircle } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'
import { parseValorBR, valorBRFormatado } from '../../lib/valorBR'
import CampoValor from './CampoValor'
import { fmtYm, hojeStr } from '../../lib/contratos/datas'
import { competenciasDoRepasse, confirmadosDe, repassesRegistrados } from '../../lib/contratos/parcelas'
import { NATUREZAS_DESPESA } from '../../lib/contratos/composicaoRepasse'
import { saldoTaxasUnicas } from '../../lib/contratos/taxaUnica'
import {
  TIPOS_EXTRATO, ROTULOS_TIPO_EXTRATO, linhasDaLeitura, linhasDoProjetado, compararComProjetado, conferirSaldoAnterior,
  linhaAjusteSaldo, avisosTaxasUnicas, montarConferencia, taxasUnicasDo, conferirRepasse, linhaAjusteRepasse,
  periodoDeOutroMes,
} from '../../lib/contratos/conferenciaExtrato'
import { extrairExtratoDeImagem } from '../../lib/contratos/imagemBoleto'

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100
// Linha da tela: valor com sinal ↔ sinal + texto positivo (padrão BR).
const paraTela = (l) => ({ ...l, sinal: Number(l.valor) > 0 ? 1 : -1, texto: valorBRFormatado(Math.abs(Number(l.valor) || 0)) })
const valorDe = (l) => r2(l.sinal * (parseValorBR(l.texto) || 0))
const numOuNull = (t) => { const n = parseValorBR(t); return String(t ?? '').trim() && Number.isFinite(n) ? n : null }

// CONFERIR EXTRATO da administradora numa competência do contrato de repasse: o extrato (lido por IA
// de um PDF/foto, ou digitado) fica ao lado do que o Finup projetou, com a diferença. Ao confirmar, a
// competência fica "Conferida": a composição real é gravada, o repasse passa a ser o líquido do
// extrato e as seguintes reprojetam a partir dela. O arquivo não é guardado.
//   ler: leitura do arquivo (testes); padrão = /api/assistente (leitura 'extrato_administradora').
export default function ConferirExtratoModal({ contrato, competencia, onClose, ler = extrairExtratoDeImagem }) {
  const { indicesContratos, schedules, transactions, salvarCompetenciaRepasse, pode } = useApp()
  const podeEditar = pode('contratos', 'editar')
  const doContrato = useMemo(() => schedules.filter(s => s.contratoId === contrato.id), [schedules, contrato.id])
  const linhasRepasse = useMemo(() => competenciasDoRepasse(contrato, {
    hoje: hojeStr(), indices: indicesContratos, confirmados: confirmadosDe(contrato, doContrato),
    repassesReais: repassesRegistrados(contrato, doContrato, transactions),
  }), [contrato, indicesContratos, doContrato, transactions])
  const linha = linhasRepasse.find(l => l.competencia === competencia) || null
  // Projeção SEM a conferência desta competência (o que o Finup calcula sozinho), para comparar.
  const projetada = useMemo(() => {
    if (!linha?.linha?.conferencia) return linha
    const sem = { ...contrato, competencias: (contrato.competencias || []).filter(c => c.competencia !== competencia) }
    return competenciasDoRepasse(sem, { hoje: hojeStr(), indices: indicesContratos }).find(l => l.competencia === competencia) || linha
  }, [linha, contrato, competencia, indicesContratos])
  const saldosTaxa = useMemo(() => saldoTaxasUnicas(contrato,
    linhasRepasse.map(l => ({ competencia: l.competencia, cobrada: !l.semCobranca, linha: l.linha })), competencia), [contrato, linhasRepasse, competencia])

  const [linhas, setLinhas] = useState(null)
  const [origem, setOrigem] = useState('manual')
  const [cab, setCab] = useState({ periodo: '', saldoSinal: 1, saldoTexto: '', totalSinal: 1, total: '', repasse: '' })
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  // Líquido do extrato ≠ itens conferidos: o usuário escolhe (ajuste aqui ou passar adiante) antes de confirmar.
  const [passarDif, setPassarDif] = useState(null)
  const arquivoRef = useRef(null)

  if (!linha) {
    return (
      <Modal open onClose={onClose} title={`Conferir extrato — ${fmtYm(competencia)}`} size="sm">
        <p className="text-sm text-texto-2">Competência fora da vigência do contrato.</p>
      </Modal>
    )
  }

  const unicas = taxasUnicasDo(contrato)
  const comecarDigitando = () => { setOrigem('manual'); setLinhas(linhasDoProjetado(projetada.itens).map(paraTela)) }
  const lerArquivo = async (arquivo) => {
    if (!arquivo) return
    setErro('')
    setLendo(true)
    try {
      const l = await ler(arquivo)
      setOrigem('ia')
      setLinhas(linhasDaLeitura(l, contrato).map(paraTela))
      setCab({
        periodo: l.periodo || '', saldoSinal: (l.saldo_anterior ?? 0) < 0 ? -1 : 1,
        saldoTexto: l.saldo_anterior == null ? '' : valorBRFormatado(Math.abs(l.saldo_anterior)),
        totalSinal: (l.total_extrato ?? 0) < 0 ? -1 : 1,
        total: l.total_extrato == null ? '' : valorBRFormatado(Math.abs(l.total_extrato)),
        repasse: l.valor_repasse == null ? '' : valorBRFormatado(Math.abs(l.valor_repasse)),
      })
    } catch (e) {
      setErro(e?.message || 'Não consegui ler o extrato.')
    } finally {
      setLendo(false)
    }
  }

  const titulo = `Conferir extrato — ${fmtYm(competencia)} · ${contrato.favorecido || 'administradora'}`
  if (!linhas) {
    return (
      <Modal open onClose={onClose} title={titulo} size="md">
        <div className="space-y-3 text-sm">
          <p className="text-xs text-texto-2">
            O Finup já calculou esta competência sozinho (repasse previsto {fmt(projetada.repasse)}). Anexe o extrato da
            administradora para conferir item a item, ou digite partindo do que foi projetado.
          </p>
          {linha.linha?.conferencia && (
            <p className="text-xs text-receita flex items-center gap-1"><CheckCircle size={12} /> Já conferida em {linha.linha.conferencia.conferido_em.split('-').reverse().join('/')} — conferir de novo substitui.</p>
          )}
          <input ref={arquivoRef} type="file" accept="image/*,application/pdf" className="hidden" aria-label="Arquivo do extrato"
            onChange={e => lerArquivo(e.target.files?.[0])} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary flex items-center gap-1" disabled={lendo || !podeEditar} onClick={() => arquivoRef.current?.click()}>
              {lendo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {lendo ? 'Lendo o extrato…' : 'Anexar PDF ou foto do extrato'}
            </button>
            <button type="button" className="btn-secondary flex items-center gap-1" disabled={lendo || !podeEditar} onClick={comecarDigitando}>
              <Pencil size={14} /> Digitar
            </button>
          </div>
          <p className="text-[11px] text-texto-3">A leitura usa a IA do Finup; o arquivo não é guardado.</p>
          {erro && <p role="alert" className="text-xs text-perigo">{erro}</p>}
        </div>
      </Modal>
    )
  }

  const itensTela = linhas.map(l => ({ ...l, valor: valorDe(l) }))
  const saldoExtrato = numOuNull(cab.saldoTexto) == null ? null : r2(cab.saldoSinal * numOuNull(cab.saldoTexto))
  const totalExtrato = numOuNull(cab.total) == null ? null : r2(cab.totalSinal * numOuNull(cab.total))
  // Extrato de outra competência: bloqueia e esconde os avisos de saldo/total (comparariam meses diferentes).
  const outroMes = periodoDeOutroMes(cab.periodo, competencia)
  const difSaldo = linha.foraDoSaldo || outroMes ? null : conferirSaldoAnterior(saldoExtrato, projetada.saldo_anterior)
  const temAjusteSaldo = linhas.some(l => l.ajusteSaldo)
  const comparacao = compararComProjetado(itensTela, projetada.itens, contrato)
  const avisos = avisosTaxasUnicas(itensTela, saldosTaxa, contrato)
  const montado = montarConferencia(contrato, projetada, itensTela, {
    periodo: cab.periodo.trim(), saldo_anterior: saldoExtrato, total: totalExtrato, repasse: numOuNull(cab.repasse),
  }, { origem, hoje: hojeStr() })

  const mudar = (i, campos) => { setErro(''); setLinhas(prev => prev.map((l, j) => (j === i ? { ...l, ...campos } : l))) }
  const incluir = () => setLinhas(prev => [...prev, paraTela({ id: `n${Date.now().toString(36)}`, descricao: '', valor: -0, tipo: 'despesa', natureza: 'outra', taxa_id: null })])
  const criarAjuste = () => setLinhas(prev => [...prev, { ...paraTela(linhaAjusteSaldo(difSaldo.diferenca)), ajusteSaldo: true }])
  // "Passar adiante" vale para a diferença escolhida; se os números mudarem, pergunta de novo.
  const difRepasse = linha.foraDoSaldo || outroMes ? null : conferirRepasse(numOuNull(cab.repasse), montado.resumo.saldo, totalExtrato)
  const decidido = !difRepasse || (passarDif != null && Math.abs(passarDif - difRepasse.diferenca) < 0.005)
  const ajustarRepasse = () => { setPassarDif(null); setLinhas(prev => [...prev, paraTela(linhaAjusteRepasse(difRepasse.diferenca))]) }

  const confirmar = async () => {
    if (outroMes) return setErro(`Este extrato é de ${outroMes.extrato}; a competência é ${outroMes.conferindo}.`)
    if (!decidido) return setErro('Escolha o que fazer com a diferença entre o extrato e os itens conferidos.')
    const sem = itensTela.find(l => !String(l.descricao || '').trim())
    if (sem) return setErro('Informe a descrição de todos os itens.')
    setSalvando(true)
    setErro('')
    try {
      await salvarCompetenciaRepasse(contrato.id, {
        competencia, itens: montado.itens, status: 'fechada', observacao: linha.linha?.observacao || null,
        repasse_lancamento_id: linha.linha?.repasse_lancamento_id || null, conferencia: montado.conferencia,
      })
      onClose()
    } catch (e) {
      setErro(e?.message || 'Falha ao gravar a conferência.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={titulo} size="xl">
      <div className="space-y-3 text-sm">
        {outroMes && (
          <div role="alert" data-testid="aviso-periodo" className="p-3 rounded-lg border-2 border-perigo/60 bg-perigo/10 text-sm text-texto-1 space-y-2">
            <p className="flex items-start gap-2 font-medium">
              <AlertTriangle size={16} className="text-perigo shrink-0 mt-0.5" />
              Este extrato é de {outroMes.extrato} e você está conferindo {outroMes.conferindo}. Anexe o extrato certo ou troque a competência.
            </p>
            <p className="text-xs text-texto-2">Se a leitura errou o período, corrija o campo &quot;Período do extrato&quot; abaixo.</p>
            {podeEditar && (
              <button type="button" className="btn-secondary text-xs py-1 flex items-center gap-1" onClick={() => { setLinhas(null); setErro(''); setPassarDif(null) }}>
                <Upload size={12} /> Anexar outro extrato
              </button>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-texto-3">
          <label>Período do extrato
            <input className="input py-1 text-sm" value={cab.periodo} onChange={e => setCab(c => ({ ...c, periodo: e.target.value }))} aria-label="Período do extrato" placeholder={fmtYm(competencia)} />
          </label>
          <div>
            <span>Saldo anterior no extrato</span>
            <div className="flex gap-1">
              <select className="input py-1 text-xs w-14 px-1" value={cab.saldoSinal} onChange={e => setCab(c => ({ ...c, saldoSinal: Number(e.target.value) }))} aria-label="Sinal do saldo anterior" title="+ a administradora me devia · − eu devia">
                <option value={1}>+</option><option value={-1}>−</option>
              </select>
              <CampoValor className="input py-1 text-sm min-w-0" value={cab.saldoTexto} onChange={v => setCab(c => ({ ...c, saldoTexto: v }))} aria-label="Saldo anterior do extrato" placeholder="Opcional" />
            </div>
          </div>
          <div>
            <span>Total do extrato</span>
            <div className="flex gap-1">
              <select className="input py-1 text-xs w-14 px-1" value={cab.totalSinal} onChange={e => setCab(c => ({ ...c, totalSinal: Number(e.target.value) }))} aria-label="Sinal do total do extrato" title="+ a administradora me deve · − eu devo (passa para o mês seguinte)">
                <option value={1}>+</option><option value={-1}>−</option>
              </select>
              <CampoValor className="input py-1 text-sm min-w-0" value={cab.total} onChange={v => setCab(c => ({ ...c, total: v }))} aria-label="Total do extrato" placeholder="Opcional" />
            </div>
          </div>
          <label>Valor do repasse (líquido)
            <CampoValor className="input py-1 text-sm" value={cab.repasse} onChange={v => setCab(c => ({ ...c, repasse: v }))} aria-label="Valor do repasse do extrato" placeholder={`Calculado: ${valorBRFormatado(montado.resumo.saldo > 0 ? montado.resumo.saldo : 0)}`} />
          </label>
        </div>

        {difSaldo && (
          <div role="alert" data-testid="aviso-saldo-anterior" className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-aviso/50 bg-aviso/10 text-xs text-texto-1">
            <AlertTriangle size={14} className="text-aviso" />
            <span>O saldo anterior do extrato ({fmt(difSaldo.extrato)}) é diferente do saldo do Finup ({fmt(difSaldo.finup)}).</span>
            {!temAjusteSaldo && podeEditar && (
              <button type="button" className="btn-secondary text-xs py-1" onClick={criarAjuste}>Criar ajuste de {fmt(difSaldo.diferenca)}</button>
            )}
          </div>
        )}

        <div className="space-y-2">
          {linhas.map((l, i) => (
            <div key={l.id} data-testid="item-extrato" className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_130px_28px] gap-2 items-center p-2 rounded-lg bg-surface-2/60">
              <input className="input py-1 text-sm col-span-2 sm:col-span-1" value={l.descricao} onChange={e => mudar(i, { descricao: e.target.value })} aria-label="Descrição do item do extrato" maxLength={200} placeholder="Descrição" />
              <select className="input py-1 text-xs" value={l.tipo} aria-label={`Tipo de ${l.descricao || 'item'}`}
                onChange={e => { const tipo = e.target.value; mudar(i, { tipo, sinal: tipo === 'aluguel' ? 1 : l.tipo === 'aluguel' ? -1 : l.sinal, taxa_id: tipo === 'taxa_unica' && unicas.length === 1 ? unicas[0].id : null, natureza: tipo === 'despesa' ? l.natureza || 'outra' : null }) }}>
                {TIPOS_EXTRATO.map(t => <option key={t} value={t}>{ROTULOS_TIPO_EXTRATO[t]}</option>)}
              </select>
              <div className="min-w-0">
                {l.tipo === 'taxa_unica' && (
                  <select className="input py-1 text-xs" value={l.taxa_id || ''} aria-label={`Taxa do contrato de ${l.descricao || 'item'}`} onChange={e => mudar(i, { taxa_id: e.target.value || null })}>
                    <option value="">Sem ligação</option>
                    {unicas.map(t => <option key={t.id} value={t.id}>{t.descricao}{saldosTaxa[t.id] ? ` — falta ${valorBRFormatado(saldosTaxa[t.id].falta)}` : ''}</option>)}
                  </select>
                )}
                {l.tipo === 'despesa' && (
                  <select className="input py-1 text-xs" value={l.natureza || 'outra'} aria-label={`Natureza de ${l.descricao || 'item'}`} onChange={e => mudar(i, { natureza: e.target.value })}>
                    {Object.entries(NATUREZAS_DESPESA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                )}
              </div>
              <div className="flex items-center gap-1">
                <select className="input py-1 text-xs w-11 px-1" value={l.sinal} aria-label={`Sinal de ${l.descricao || 'item'}`} onChange={e => mudar(i, { sinal: Number(e.target.value) })}>
                  <option value={1}>+</option><option value={-1}>−</option>
                </select>
                <CampoValor className="input py-1 text-sm min-w-0" value={l.texto} onChange={v => mudar(i, { texto: v })} aria-label={`Valor de ${l.descricao || 'item'}`} />
              </div>
              <button type="button" className="p-1 text-texto-3 hover:text-perigo" title="Remover item" onClick={() => setLinhas(prev => prev.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className="btn-secondary text-xs py-1 flex items-center gap-1" onClick={incluir}><Plus size={12} /> Item</button>
        </div>

        <table className="w-full text-xs" data-testid="comparacao-extrato">
          <thead>
            <tr className="text-texto-3 text-left"><th className="py-1">Tipo</th><th className="text-right">Extrato</th><th className="text-right">Projetado</th><th className="text-right">Diferença</th></tr>
          </thead>
          <tbody>
            {comparacao.map(x => (
              <tr key={x.chave} className="border-t border-borda">
                <td className="py-1">{x.rotulo}</td>
                <td className="text-right">{fmt(x.lido)}</td>
                <td className="text-right">{fmt(x.projetado)}</td>
                <td className={`text-right ${Math.abs(x.diferenca) > 0.004 ? 'text-aviso font-medium' : 'text-texto-3'}`}>{Math.abs(x.diferenca) > 0.004 ? fmt(x.diferenca) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {difRepasse && (
          <div role="alert" data-testid="aviso-repasse" className="p-2 rounded-lg border border-aviso/50 bg-aviso/10 text-xs text-texto-1 space-y-2">
            <p className="flex items-start gap-1">
              <AlertTriangle size={14} className="text-aviso shrink-0" />
              {difRepasse.fonte === 'total' ? 'O total do extrato' : 'O líquido do extrato'} ({fmt(difRepasse.extrato)}) não bate com os itens conferidos ({fmt(difRepasse.calculado)}) — diferença de {fmt(difRepasse.diferenca)}. Falta algum item?
            </p>
            {podeEditar && (
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-1">
                  <input type="radio" name="dif-repasse" className="accent-primary" checked={false} onChange={ajustarRepasse} />
                  Criar ajuste de {fmt(difRepasse.diferenca)} nesta competência
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" name="dif-repasse" className="accent-primary" checked={decidido} onChange={() => setPassarDif(difRepasse.diferenca)} />
                  Passar a diferença para a competência seguinte
                </label>
              </div>
            )}
          </div>
        )}

        {avisos.map(a => <p key={a} className="text-xs text-aviso flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {a}</p>)}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-lg bg-surface-2/60 text-xs" data-testid="resumo-conferencia">
          <p>Saldo anterior (Finup) <strong className="block text-sm text-texto-1">{linha.foraDoSaldo ? '—' : fmt(projetada.saldo_anterior)}</strong></p>
          <p>Resultado do mês <strong className="block text-sm text-texto-1">{fmt(montado.resumo.resultado)}</strong></p>
          <p>Saldo <strong className={`block text-sm ${montado.resumo.saldo < 0 ? 'text-despesa' : 'text-texto-1'}`}>{fmt(montado.resumo.saldo)}</strong></p>
          <p>Repasse conferido <strong className="block text-sm text-texto-1">{montado.resumo.repasse > 0 ? fmt(montado.resumo.repasse) : 'Sem repasse'}</strong></p>
        </div>
        <p className="text-[11px] text-texto-3">
          Ao confirmar, a competência fica Conferida, o agendamento do repasse passa a ter o valor do extrato e as competências seguintes são reprojetadas a partir dela.
        </p>

        {erro && <p role="alert" className="text-xs text-perigo">{erro}</p>}
        <div className="flex justify-end gap-2 pt-2 border-t border-borda">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          {podeEditar && <button type="button" className="btn-primary" disabled={salvando || !decidido || !!outroMes} title={outroMes ? 'O extrato é de outra competência' : decidido ? undefined : 'Escolha o que fazer com a diferença do repasse'} onClick={confirmar}>Confirmar conferência</button>}
        </div>
      </div>
    </Modal>
  )
}
