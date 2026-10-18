import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileSpreadsheet, Upload, AlertTriangle, Check, Undo2, RefreshCw, Loader2, FileDown, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { getSessao } from '../../lib/api'
import { ORIGIN } from '../../lib/origins'
import { TIPOS_CONTA_IMPORTAVEIS, rotulosCategorias, fmtDataBR, fmtValorBR } from '../../lib/importacaoPadrao/comum'
import { montarPrevia, lancamentosParaGravar, SEM_CATEGORIA, PREFIXO_NOVA } from '../../lib/importacaoPadrao/previa'
import {
  listarImportacoes, contasDoOfx, registrarLote, concluirLote, marcarLoteDesfeito, listarDepara, salvarDepara, aguardarGravados,
} from '../../lib/importacaoApi'
import Modal from '../shared/Modal'

// IMPORTAR LANÇAMENTOS (importação padrão, todos os ambientes): 1) conta de destino (sem cartão —
// cartão continua no Importar Fatura); 2) gerar o Excel desta conta / enviar o arquivo (.xlsx gerado,
// .csv ou OFX); 3) prévia (válidas, erros por linha, possíveis duplicados desmarcados, categorias
// sem correspondência, totais); 4) confirmar. A gravação é pelo app (addTransaction, em blocos, com
// barra de progresso) e o saldo é recalculado por recalcularSaldo (lançamento com data futura vai
// para o projetado, como em todo o app). Lote em_andamento → concluida quando o banco tem
// todos; "Desfazer" apaga os lançamentos do lote (deleteTransaction) e marca desfeita.

const BLOCO = 25
const novoId = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
const novoLoteId = () => globalThis.crypto?.randomUUID?.() ?? novoId('imp')
const pausa = () => new Promise(r => setTimeout(r, 0))
const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

function Passo({ n, titulo, children, desativado }) {
  return (
    <section className={`card space-y-3 ${desativado ? 'opacity-50 pointer-events-none' : ''}`}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-texto-1">
        <span className="w-6 h-6 rounded-full bg-primary/15 text-primary-fg text-xs flex items-center justify-center">{n}</span> {titulo}
      </h2>
      {children}
    </section>
  )
}

function Progresso({ progresso }) {
  if (!progresso) return null
  const pct = progresso.total ? Math.round((progresso.feitos / progresso.total) * 100) : 0
  return (
    <div className="card border-primary/40 space-y-2" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-texto-1">
        <Loader2 size={15} className="animate-spin text-primary-fg" />
        <span className="font-medium">{progresso.rotulo} {progresso.feitos} de {progresso.total}</span>
        <span className="ml-auto text-xs text-texto-3">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      {progresso.detalhe && <p className="text-xs text-texto-3">{progresso.detalhe}</p>}
      <p className="text-[11px] text-texto-3">Não feche esta página até terminar.</p>
    </div>
  )
}

export default function ImportarLancamentosPanel() {
  const {
    profileAccounts, transactions, categories, payees, gerencialGroups, pode, addTransaction, deleteTransaction, addCategory, addPayees, recalcularSaldo,
  } = useApp()
  const podeIncluir = pode('lancamentos', 'incluir')
  const podeExcluir = pode('lancamentos', 'excluir')
  const contas = useMemo(() => (profileAccounts || []).filter(a => TIPOS_CONTA_IMPORTAVEIS.includes(a.type) && a.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [profileAccounts])
  const [contaId, setContaId] = useState('')
  const conta = contas.find(c => c.id === contaId) || null
  const [leitura, setLeitura] = useState(null) // { formato, linhas, erros, contaArquivo, ofx, arquivo }
  const [erroArquivo, setErroArquivo] = useState('')
  const [avisos, setAvisos] = useState([]) // avisos que pedem confirmação (outra conta/ambiente/extrato)
  const [avisosOk, setAvisosOk] = useState(false)
  const [escolhas, setEscolhas] = useState({})
  const [selecao, setSelecao] = useState({})
  const [depara, setDepara] = useState({})
  const [progresso, setProgresso] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [lotes, setLotes] = useState([])
  const [erroLotes, setErroLotes] = useState('')
  const [desfazer, setDesfazer] = useState(null) // lote a confirmar
  const [gerando, setGerando] = useState(false)
  const inputRef = useRef(null)
  const ambiente = getSessao()?.ambSigla || 'vm'

  const carregarLotes = useCallback(() => listarImportacoes().then(l => { setLotes(l); setErroLotes('') }).catch(e => setErroLotes(e.message)), [])
  useEffect(() => { carregarLotes() }, [carregarLotes])
  useEffect(() => {
    listarDepara().then(l => setDepara(Object.fromEntries(l.map(d => [d.nome_origem, d.categoria_id])))).catch(() => {})
  }, [])

  // Sair da página no meio da gravação/desfazer → o navegador pergunta.
  useEffect(() => {
    if (!progresso) return undefined
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [progresso])

  const previa = useMemo(() => (leitura && conta ? montarPrevia({
    formato: leitura.formato, linhas: leitura.linhas, contaId: conta.id, transacoes: transactions, categorias: categories, depara, escolhas, selecao,
  }) : null), [leitura, conta, transactions, categories, depara, escolhas, selecao])
  const rotulos = useMemo(() => rotulosCategorias(categories), [categories])
  const nomeCategoria = useMemo(() => new Map(rotulos.map(r => [r.id, r.rotulo])), [rotulos])
  const nomeConta = (id) => (profileAccounts || []).find(a => a.id === id)?.name || 'conta removida'

  const limpar = () => {
    setLeitura(null); setErroArquivo(''); setAvisos([]); setAvisosOk(false); setEscolhas({}); setSelecao({}); setResultado(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const gerarExcel = async () => {
    if (!conta) return
    setGerando(true)
    try {
      const [{ default: ExcelJS }, { gerarExcelImportacao, nomeArquivoExcel }] = await Promise.all([import('exceljs'), import('../../lib/importacaoPadrao/excel')])
      const buf = await gerarExcelImportacao(ExcelJS, { conta, ambiente, categorias: categories, favorecidos: payees || [] })
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      a.href = url
      a.download = nomeArquivoExcel(conta)
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } finally {
      setGerando(false)
    }
  }

  const lerArquivoEscolhido = async (file) => {
    limpar()
    if (!file || !conta) return
    try {
      const [{ lerArquivo }, XLSX] = await Promise.all([import('../../lib/importacaoPadrao/leitura'), import('xlsx')])
      const r = lerArquivo({ nome: file.name, bytes: new Uint8Array(await file.arrayBuffer()), XLSX })
      if (!r.linhas.length) { setErroArquivo(r.erros[0]?.motivo || 'Nenhum lançamento encontrado no arquivo.'); return }
      const av = []
      if (r.contaArquivo && r.contaArquivo.id !== conta.id) av.push(`Este arquivo foi gerado para a conta "${r.contaArquivo.nome}". Importar mesmo assim na conta "${conta.name}"?`)
      if (r.contaArquivo?.ambiente && r.contaArquivo.ambiente !== ambiente) av.push(`Este arquivo foi gerado no ambiente ${r.contaArquivo.ambiente.toUpperCase()} (você está no ${ambiente.toUpperCase()}).`)
      if (r.ofx?.conta) {
        const outras = (await contasDoOfx(r.ofx.banco, r.ofx.conta).catch(() => [])).filter(id => id !== conta.id)
        if (outras.length) av.push(`Este extrato parece ser da conta "${nomeConta(outras[0])}" (já foi importado nela antes). Importar mesmo assim na conta "${conta.name}"?`)
      }
      setAvisos(av)
      setLeitura({ ...r, arquivo: file.name })
    } catch (e) {
      setErroArquivo(`Não foi possível ler o arquivo: ${e.message}`)
    }
  }

  const alternar = (linha, valor) => setSelecao(s => ({ ...s, [linha]: valor }))

  const gravar = async () => {
    if (!previa || !conta || !previa.totais.qtd) return
    const loteId = novoLoteId()
    setResultado(null)
    try {
      setProgresso({ rotulo: 'Preparando', feitos: 0, total: previa.totais.qtd })
      // 1) categorias novas ("criar nova") e de-para das escolhas, para as próximas importações
      const idsNovas = {}
      for (const p of previa.categoriasPendentes) {
        if (!p.escolha?.startsWith(PREFIXO_NOVA)) continue
        const nome = p.escolha.slice(PREFIXO_NOVA.length)
        const tipos = new Set(previa.itens.filter(i => i.selecionado && i.chaveCategoria === p.chave).map(i => i.tipo))
        const id = novoId('cat_imp')
        addCategory({ id, name: nome, type: tipos.size === 1 ? [...tipos][0] : 'both', color: '#6b7280', icon: '📌' })
        idsNovas[p.chave] = id
      }
      // De-para das escolhas: salvo DEPOIS que o banco confirmar (a categoria criada agora só existe
      // no banco depois do sync, e a rota confere se a categoria existe).
      const deparas = previa.categoriasPendentes
        .map(p => ({ texto: p.texto, cat: p.escolha?.startsWith(PREFIXO_NOVA) ? idsNovas[p.chave] : p.escolha }))
        .filter(d => d.cat && d.cat !== SEM_CATEGORIA)
      // 2) lançamentos
      const grupoD = gerencialGroups.find(g => g.number === 'D')?.id || 'grp_D'
      const txs = lancamentosParaGravar(previa, {
        contaId: conta.id, tipoConta: conta.type, grupoGerencialId: grupoD, importacaoId: loteId, origem: ORIGIN.IMPORTACAO_PADRAO,
        novoId: () => novoId('tx'), idsNovas,
      })
      await registrarLote({
        id: loteId, conta_id: conta.id, formato: leitura.formato, arquivo: leitura.arquivo, qtd: txs.length,
        total_entradas: previa.totais.entradas, total_saidas: previa.totais.saidas, ofx_banco: leitura.ofx?.banco, ofx_conta: leitura.ofx?.conta,
      })
      setLeitura(null) // a prévia sai da tela: os lançamentos novos entrariam nela como "duplicados"
      const novosFav = [...new Set(txs.map(t => t.payee).filter(Boolean))]
      if (novosFav.length) addPayees(novosFav)
      const inicio = performance.now()
      for (let i = 0; i < txs.length; i += BLOCO) {
        for (const tx of txs.slice(i, i + BLOCO)) addTransaction(tx)
        setProgresso({ rotulo: 'Gravando', feitos: Math.min(i + BLOCO, txs.length), total: txs.length })
        await pausa()
      }
      // Saldo pela regra de sempre (src/lib/saldos.js: data até hoje no saldo; futuras no projetado).
      recalcularSaldo(conta.id)
      const noApp = Math.round(performance.now() - inicio)
      // 3) espera o banco receber todos (sync do app) e conclui o lote
      setProgresso({ rotulo: 'Confirmando no banco:', feitos: 0, total: txs.length, detalhe: 'aguardando a sincronização' })
      const ok = await aguardarGravados(loteId, txs.length, { aoVer: (n) => setProgresso({ rotulo: 'Confirmando no banco:', feitos: n, total: txs.length }) })
      if (ok) await concluirLote(loteId)
      for (const d of deparas) await salvarDepara(d.texto, d.cat).catch(() => {})
      const total = Math.round(performance.now() - inicio)
      setResultado(ok
        ? { tipo: 'ok', texto: `${txs.length} lançamento${txs.length === 1 ? '' : 's'} importado${txs.length === 1 ? '' : 's'} na conta "${conta.name}" (${(noApp / 1000).toFixed(1).replace('.', ',')} s no app, ${(total / 1000).toFixed(1).replace('.', ',')} s até o banco confirmar).`, tempos: { noApp, total } }
        : { tipo: 'aviso', texto: 'Os lançamentos foram gravados no app, mas o banco ainda não confirmou todos. Confira em "Últimas importações" em instantes.' })
      setLeitura(null); setEscolhas({}); setSelecao({}); setAvisos([]); setAvisosOk(false)
      if (inputRef.current) inputRef.current.value = ''
    } catch (e) {
      setResultado({ tipo: 'erro', texto: `A importação parou: ${e.message}` })
    } finally {
      setProgresso(null)
      carregarLotes()
    }
  }

  const executarDesfazer = async (lote) => {
    setDesfazer(null)
    setResultado(null)
    try {
      const doLote = transactions.filter(t => t.importacaoId === lote.id)
      for (let i = 0; i < doLote.length; i += BLOCO) {
        for (const t of doLote.slice(i, i + BLOCO)) deleteTransaction(t.id)
        setProgresso({ rotulo: 'Desfazendo', feitos: Math.min(i + BLOCO, doLote.length), total: doLote.length })
        await pausa()
      }
      recalcularSaldo(lote.conta_id)
      setProgresso({ rotulo: 'Apagados no banco:', feitos: 0, total: doLote.length, detalhe: 'aguardando a sincronização' })
      const ok = await aguardarGravados(lote.id, 0, { aoVer: (n) => setProgresso({ rotulo: 'Apagados no banco:', feitos: Math.max(0, doLote.length - n), total: doLote.length }) })
      if (!ok) throw new Error('o banco ainda não confirmou a exclusão de todos os lançamentos; tente "Desfazer" de novo em instantes')
      await marcarLoteDesfeito(lote.id)
      setResultado({ tipo: 'ok', texto: `Importação desfeita: ${doLote.length} lançamento${doLote.length === 1 ? '' : 's'} apagado${doLote.length === 1 ? '' : 's'} da conta "${nomeConta(lote.conta_id)}".` })
    } catch (e) {
      setResultado({ tipo: 'erro', texto: `Não foi possível desfazer: ${e.message}` })
    } finally {
      setProgresso(null)
      carregarLotes()
    }
  }

  if (!podeIncluir) {
    return <div className="card text-center py-12"><p className="text-sm text-texto-2">Importar lançamentos</p><p className="text-xs text-texto-3 mt-1">Seu nível de acesso não permite incluir lançamentos.</p></div>
  }
  const ocupado = !!progresso
  const bloqueadoPorAviso = avisos.length > 0 && !avisosOk

  return (
    <div className="space-y-4 max-w-5xl">
      <Progresso progresso={progresso} />
      {resultado && (
        <div className={`card flex items-start gap-2 text-sm ${resultado.tipo === 'ok' ? 'text-receita' : resultado.tipo === 'aviso' ? 'text-aviso' : 'text-perigo'}`}>
          {resultado.tipo === 'ok' ? <Check size={16} className="mt-0.5" /> : <AlertTriangle size={16} className="mt-0.5" />}
          <span>{resultado.texto}</span>
          <button className="ml-auto text-texto-3 hover:text-texto-1" onClick={() => setResultado(null)} aria-label="Fechar"><X size={14} /></button>
        </div>
      )}

      <Passo n={1} titulo="Conta de destino" desativado={ocupado}>
        <select className="input max-w-md" value={contaId} onChange={e => { setContaId(e.target.value); limpar() }}>
          <option value="">Escolha a conta…</option>
          {contas.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <p className="text-xs text-texto-3">Contas correntes, poupanças e dinheiro. Cartão de crédito continua no <strong>Importar Fatura</strong>.</p>
      </Passo>

      <Passo n={2} titulo="Planilha" desativado={!conta || ocupado}>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary inline-flex items-center gap-1.5" onClick={gerarExcel} disabled={!conta || gerando}>
            <FileDown size={14} /> {gerando ? 'Gerando…' : 'Gerar Excel para preencher'}
          </button>
          <span className="text-xs text-texto-3">Excel desta conta, com listas de categorias e favorecidos.</span>
        </div>
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-borda rounded-xl p-6 cursor-pointer hover:border-primary/60 text-center">
          <Upload size={20} className="text-texto-3" />
          <span className="text-sm text-texto-1">Enviar o arquivo preenchido</span>
          <span className="text-xs text-texto-3">.xlsx (gerado pelo Finup), .csv (mesmas colunas) ou .ofx (extrato do banco)</span>
          <input ref={inputRef} type="file" accept=".xlsx,.csv,.ofx,.txt" className="hidden" onChange={e => lerArquivoEscolhido(e.target.files?.[0])} />
        </label>
        {erroArquivo && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erroArquivo}</p>}
      </Passo>

      {leitura && previa && (
        <>
          {avisos.length > 0 && (
            <div className="card border-aviso/50 space-y-2">
              {avisos.map((a, i) => <p key={i} className="flex items-start gap-2 text-sm text-texto-1"><AlertTriangle size={15} className="text-aviso shrink-0 mt-0.5" /> {a}</p>)}
              {!avisosOk ? (
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={() => setAvisosOk(true)}>Sim, importar na conta {conta.name}</button>
                  <button className="btn-secondary" onClick={limpar}>Cancelar</button>
                </div>
              ) : <p className="text-xs text-texto-3">Confirmado.</p>}
            </div>
          )}

          <Passo n={3} titulo={`Prévia — ${leitura.arquivo}`} desativado={bloqueadoPorAviso || ocupado}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="rounded-lg bg-surface-2 p-2"><p className="text-[11px] text-texto-3">Válidas</p><p className="font-semibold text-texto-1">{previa.validas.length}</p></div>
              <div className="rounded-lg bg-surface-2 p-2"><p className="text-[11px] text-texto-3">Com erro</p><p className={`font-semibold ${previa.comErro.length ? 'text-perigo' : 'text-texto-1'}`}>{previa.comErro.length}</p></div>
              <div className="rounded-lg bg-surface-2 p-2"><p className="text-[11px] text-texto-3">Possíveis duplicados</p><p className={`font-semibold ${previa.duplicados.length ? 'text-aviso' : 'text-texto-1'}`}>{previa.duplicados.length}</p></div>
              <div className="rounded-lg bg-surface-2 p-2"><p className="text-[11px] text-texto-3">A importar</p><p className="font-semibold text-texto-1">{previa.totais.qtd}</p></div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-texto-2">Entradas <strong className="text-receita">R$ {fmtValorBR(previa.totais.entradas)}</strong></span>
              <span className="text-texto-2">Saídas <strong className="text-despesa">R$ {fmtValorBR(previa.totais.saidas)}</strong></span>
              <span className="text-texto-2">Resultado <strong className={previa.totais.resultado < 0 ? 'text-despesa' : 'text-receita'}>R$ {fmtValorBR(previa.totais.resultado)}</strong></span>
              {previa.totais.de && <span className="text-texto-3">Período {fmtDataBR(previa.totais.de)} a {fmtDataBR(previa.totais.ate)}</span>}
            </div>

            {previa.categoriasPendentes.length > 0 && (
              <div className="border border-borda rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-texto-1">Categorias do arquivo que não existem no Finup</p>
                <p className="text-[11px] text-texto-3">Escolha a correspondente ou crie uma nova — fica salvo para as próximas importações. Sem escolha = sem categoria (a classificar).</p>
                {previa.categoriasPendentes.map(p => (
                  <div key={p.chave} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-[10rem] text-texto-1">“{p.texto}” <span className="text-texto-3 text-xs">({p.linhas} linha{p.linhas === 1 ? '' : 's'})</span></span>
                    <select className="input !py-1 max-w-xs" value={p.escolha || ''} onChange={e => setEscolhas(s => ({ ...s, [p.chave]: e.target.value || undefined }))}>
                      <option value="">— sem categoria (a classificar) —</option>
                      <option value={`${PREFIXO_NOVA}${p.texto}`}>+ Criar categoria “{p.texto}”</option>
                      {rotulos.map(r => <option key={r.id} value={r.id}>{r.rotulo}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {previa.comErro.length > 0 && (
              <div className="border border-perigo/30 rounded-lg p-3">
                <p className="text-xs font-semibold text-perigo mb-1">Linhas com erro (ficam de fora)</p>
                <ul className="text-xs text-texto-2 space-y-0.5 max-h-40 overflow-y-auto">
                  {previa.comErro.map(i => <li key={i.linha}>Linha {i.linha}: {i.erros.join(', ')}</li>)}
                </ul>
              </div>
            )}

            <div className="overflow-x-auto border border-borda rounded-lg max-h-[28rem] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-left text-texto-3 border-b border-borda">
                    <th className="px-2 py-2"><input type="checkbox" aria-label="Marcar todas" checked={previa.validas.every(i => i.selecionado)}
                      onChange={e => setSelecao(Object.fromEntries(previa.validas.map(i => [i.linha, e.target.checked])))} /></th>
                    <th className="px-2 py-2">Linha</th><th className="px-2 py-2">Data</th><th className="px-2 py-2">Descrição</th>
                    <th className="px-2 py-2">Categoria</th><th className="px-2 py-2">Favorecido</th><th className="px-2 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.validas.map(i => (
                    <tr key={i.linha} className={`border-b border-borda/60 last:border-0 ${i.duplicado ? 'bg-aviso/5' : ''}`}>
                      <td className="px-2 py-1.5"><input type="checkbox" checked={i.selecionado} onChange={e => alternar(i.linha, e.target.checked)} aria-label={`Importar linha ${i.linha}`} /></td>
                      <td className="px-2 py-1.5 text-texto-3">{i.linha}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-texto-2">{fmtDataBR(i.data)}</td>
                      <td className="px-2 py-1.5 text-texto-1">
                        {i.descricao}
                        {i.duplicado && <span className="block text-[11px] text-aviso">⚠ Possível duplicado: {i.duplicado}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-texto-2">
                        {i.categoriaId ? nomeCategoria.get(i.categoriaId) : i.categoriaStatus === 'nova' ? `+ ${i.novaCategoria}` : <span className="text-texto-3">sem categoria</span>}
                        {i.categoriaStatus === 'depara' && <span className="ml-1 text-[10px] text-texto-3">(de-para)</span>}
                      </td>
                      <td className="px-2 py-1.5 text-texto-2">{i.favorecido || '—'}</td>
                      <td className={`px-2 py-1.5 text-right whitespace-nowrap font-medium ${i.tipo === 'expense' ? 'text-despesa' : 'text-receita'}`}>{i.tipo === 'expense' ? '-' : ''}R$ {fmtValorBR(i.valorAbs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Passo>

          <Passo n={4} titulo="Confirmar" desativado={bloqueadoPorAviso || ocupado}>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary inline-flex items-center gap-1.5" onClick={gravar} disabled={!previa.totais.qtd || ocupado}>
                <Check size={14} /> Importar {previa.totais.qtd} lançamento{previa.totais.qtd === 1 ? '' : 's'} em “{conta.name}”
              </button>
              <button className="btn-secondary" onClick={limpar} disabled={ocupado}>Cancelar</button>
            </div>
          </Passo>
        </>
      )}

      <section className="card space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-texto-1">Últimas importações</h2>
          <button className="p-1.5 rounded text-texto-3 hover:text-texto-1" onClick={carregarLotes} aria-label="Recarregar"><RefreshCw size={12} /></button>
        </div>
        {erroLotes && <p className="text-xs text-perigo">{erroLotes}</p>}
        {!lotes.length && !erroLotes && <p className="text-xs text-texto-3">Nenhuma importação ainda.</p>}
        <ul className="divide-y divide-borda/60">
          {lotes.map(l => {
            const incompleta = l.status === 'em_andamento' && l.gravados < l.qtd
            // concluída, mas faltando lançamentos no banco = um "Desfazer" que parou no meio
            const desfazerInterrompido = l.status === 'concluida' && l.gravados < l.qtd
            return (
              <li key={l.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <FileSpreadsheet size={14} className="text-texto-3" />
                <span className="text-texto-1 font-medium">{nomeConta(l.conta_id)}</span>
                <span className="text-texto-3">{dataHora(l.criado_em)} · {l.formato.toUpperCase()} · {l.arquivo || 'arquivo'}</span>
                <span className="text-texto-2">{l.qtd} lanç. · +R$ {fmtValorBR(l.total_entradas)} / -R$ {fmtValorBR(l.total_saidas)}</span>
                {l.status === 'desfeita' && <span className="px-1.5 py-0.5 rounded bg-surface-2 text-texto-3">Desfeita em {dataHora(l.desfeita_em)}</span>}
                {l.status === 'concluida' && !desfazerInterrompido && <span className="px-1.5 py-0.5 rounded bg-receita/15 text-receita">Concluída</span>}
                {desfazerInterrompido && <span className="px-1.5 py-0.5 rounded bg-aviso/15 text-aviso">Desfazer interrompido: {l.gravados} de {l.qtd} ainda no banco</span>}
                {l.status === 'em_andamento' && (incompleta
                  ? <span className="px-1.5 py-0.5 rounded bg-aviso/15 text-aviso">Importação incompleta ({l.gravados} de {l.qtd})</span>
                  : <span className="px-1.5 py-0.5 rounded bg-surface-2 text-texto-2">Em andamento</span>)}
                {l.status !== 'desfeita' && podeExcluir && (
                  <button className="ml-auto btn-secondary !py-1 text-xs inline-flex items-center gap-1" disabled={ocupado} onClick={() => setDesfazer(l)}>
                    <Undo2 size={12} /> Desfazer importação
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <Modal open={!!desfazer} onClose={() => setDesfazer(null)} title="Desfazer importação">
        {desfazer && (
          <div className="space-y-4 text-sm">
            <p className="text-texto-1">Apagar os <strong>{desfazer.gravados}</strong> lançamento{desfazer.gravados === 1 ? '' : 's'} desta importação na conta <strong>{nomeConta(desfazer.conta_id)}</strong> ({desfazer.arquivo || desfazer.formato}, {dataHora(desfazer.criado_em)})?</p>
            <p className="text-xs text-texto-3">Só os lançamentos deste lote são apagados; o saldo da conta volta ao que era. Não dá para refazer — seria preciso importar de novo.</p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setDesfazer(null)}>Cancelar</button>
              <button className="btn-danger inline-flex items-center gap-1.5" onClick={() => executarDesfazer(desfazer)}><Undo2 size={14} /> Desfazer</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
