import { useMemo, useState } from 'react'
import { AlertTriangle, FileSpreadsheet, Download } from 'lucide-react'
import Modal from '../shared/Modal'
import { fmt, fmtDate } from '../shared/utils'
import { exportarExcel, entregarArquivo, nomeArquivoFinup } from '../../lib/exportExcel'
import { gerarCsv } from '../../lib/csvFinup'
import { isoLocal } from '../../lib/hoje'
import { extratoDaFuncao, juntarExtratos, atalhosExtrato, agruparRendimentos } from '../../lib/extratoReserva'
import { erroPeriodo, rotuloPeriodo, rotuloMes } from '../../lib/fluxoPeriodo'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const ymDe = (wm) => `${wm.year}-${String(wm.month0 + 1).padStart(2, '0')}`

// Extrato da função (Reservas › Fluxo Futuro): a linha do tempo de uma função — ou de todas, no
// TOTAL GERAL — como fluxo de caixa. A conta mora em lib/extratoReserva; os previstos vêm de
// `previstosDoPeriodo` (o MESMO cálculo da grade, ver FluxoTab) e os realizados de `realizadosDe`
// (os mesmos lançamentos do saldo). O saldo de fim de mês é igual ao da grade.
//   funcao: a função clicada, ou null para TOTAL GERAL (todas as `funcoes` da tela)
// O MESMO componente abre em dois lugares:
//   • Reservas › Fluxo Futuro: modal, já na função clicada;
//   • menu Relatórios ("Fluxo de Caixa da Reserva"): `pagina` (sem modal) + `seletorFuncao`, com a
//     opção "Todas as funções" e um resumo por função. Dados de useDadosExtratoReserva (mesmo cálculo).
export default function ExtratoReservaModal({
  funcao, funcoes, saldoInicialDe, previstosDoPeriodo, realizadosDe, periodoInicial, atual, hoje, onClose,
  pagina = false, seletorFuncao = false,
}) {
  const [funcaoSel, setFuncaoSel] = useState(funcao ?? null)
  const [periodo, setPeriodo] = useState(periodoInicial)
  const [rascunho, setRascunho] = useState(periodoInicial)
  // "Agrupar rendimentos" (ligada por padrão): só muda a lista; faixas, totais e saldos ficam iguais.
  const [agrupar, setAgrupar] = useState(true)
  const erro = erroPeriodo(rascunho, atual)
  const todas = !funcaoSel

  const { extrato: extratoDia, rotulos, resumoPorFuncao } = useMemo(() => {
    const { win, ini, sched } = previstosDoPeriodo(periodo)
    const meses = win.windowMonths.slice(ini).map((wm, k) => ({ ...wm, idx: ini + k }))
    const desde = `${ymDe(meses[0])}-01`
    const lista = funcaoSel ? [funcaoSel] : funcoes
    const porFuncao = lista.map(f => extratoDaFuncao({
      id: f.id, nome: f.name, saldoHoje: saldoInicialDe(f),
      realizados: realizadosDe(f, desde), previstos: sched[f.id]?.movs || [], meses,
    }))
    const ext = funcaoSel ? porFuncao[0] : juntarExtratos(porFuncao)
    const resumoPorFuncao = funcaoSel ? [] : porFuncao.map((e, k) => ({
      nome: lista[k].name, saldoInicial: round2(e.saldoInicial), entradas: e.entradas, saidas: e.saidas, saldoFinal: round2(e.saldoFinal),
    }))
    const rot = {}
    for (const m of meses) rot[m.idx] = rotuloMes(ymDe(m))
    // Seção dos realizados: no índice 0 ela É a coluna do mês do período aberto na grade.
    rot.hoje = meses[0].idx === 0 ? `${rot[0]} · saldo de hoje (${fmtDate(hoje)})` : `Realizado até hoje (${fmtDate(hoje)})`
    if (ext.dataInicial == null) ext.dataInicial = desde
    return { extrato: ext, rotulos: rot, resumoPorFuncao }
  }, [periodo, funcaoSel, funcoes, saldoInicialDe, previstosDoPeriodo, realizadosDe, hoje])
  // A tela e o Excel usam o mesmo `extrato` (agrupado ou dia a dia, como estiver na tela).
  const extrato = useMemo(() => (agrupar ? agruparRendimentos(extratoDia) : extratoDia), [agrupar, extratoDia])

  const aplicar = (p) => {
    if (erroPeriodo(p, atual)) return
    setRascunho(p)
    setPeriodo(p)
  }
  const nome = funcaoSel ? funcaoSel.name : 'Todas as funções'
  const negativoTexto = extrato.negativoEm
    ? `Fica negativo em ${fmtDate(extrato.negativoEm).slice(0, 5)}`
    : extrato.negativoSecao != null ? `Fica negativo em ${rotulos[extrato.negativoSecao]}` : null

  const linhasExport = () => {
    const linhas = [{ data: extrato.dataInicial, descricao: 'Saldo inicial', saldo: extrato.saldoInicial, _estilo: 'grupo' }]
    for (const s of extrato.secoes) {
      for (const it of s.itens) {
        linhas.push({
          data: it.date, funcao: it.funcao, descricao: it.label, tipo: it.tipo, situacao: it.previsto ? 'Previsto' : 'Realizado',
          entrada: it.entrada || null, saida: it.saida || null, saldo: it.saldo,
        })
      }
      linhas.push({ descricao: `Subtotal ${rotulos[s.chave]}`, entrada: s.entradas, saida: s.saidas, saldo: s.saldoFim, _estilo: 'subtotal' })
    }
    return linhas
  }
  const exportar = () => {
    const linhas = linhasExport()
    const abaPorFuncao = resumoPorFuncao.length ? [{
      nome: 'Por função', titulo: `Por função — ${rotuloPeriodo(periodo)}`,
      colunas: [
        { chave: 'nome', titulo: 'Função' }, { chave: 'saldoInicial', titulo: 'Saldo inicial', tipo: 'moeda' },
        { chave: 'entradas', titulo: 'Entradas', tipo: 'moeda', cor: () => 'receita' }, { chave: 'saidas', titulo: 'Saídas', tipo: 'moeda', cor: () => 'despesa' },
        { chave: 'saldoFinal', titulo: 'Saldo final', tipo: 'moeda', cor: (l) => (l.saldoFinal < 0 ? 'despesa' : null) },
      ],
      linhas: resumoPorFuncao,
      totais: { titulo: 'TOTAL', rotulo: () => '', somar: ['saldoInicial', 'entradas', 'saidas', 'saldoFinal'] },
    }] : []
    exportarExcel({ abas: [{
      titulo: `Reservas — Extrato da função: ${nome}`, nome: 'Extrato',
      filtros: [`Período: ${rotuloPeriodo(periodo)}`, ...(negativoTexto ? [negativoTexto] : [])],
      resumo: [
        { rotulo: 'Saldo inicial', valor: round2(extrato.saldoInicial) },
        { rotulo: 'Entradas', cor: 'receita', valor: extrato.entradas },
        { rotulo: 'Saídas', cor: 'despesa', valor: extrato.saidas },
        { rotulo: 'Saldo final', valor: round2(extrato.saldoFinal) },
      ],
      colunas: [
        { chave: 'data', titulo: 'Data', tipo: 'data' },
        ...(todas ? [{ chave: 'funcao', titulo: 'Função' }] : []),
        { chave: 'descricao', titulo: 'Descrição' },
        { chave: 'tipo', titulo: 'Tipo' },
        { chave: 'situacao', titulo: 'Situação', tipo: 'status' },
        { chave: 'entrada', titulo: 'Entrada', tipo: 'moeda', cor: () => 'receita' },
        { chave: 'saida', titulo: 'Saída', tipo: 'moeda', cor: () => 'despesa' },
        { chave: 'saldo', titulo: 'Saldo', tipo: 'moeda', cor: (l) => (l.saldo < 0 ? 'despesa' : null) },
      ],
      linhas,
      totais: false,
    }, ...abaPorFuncao], nomeArquivo: { relatorio: `Extrato-Reserva-${nome}`, periodo: isoLocal(new Date()).slice(0, 7) },
    }).catch(err => window.alert(`Não consegui exportar: ${err?.message || err}`))
  }
  const exportarCsv = async () => {
    try {
      const csv = gerarCsv(
        ['Data', ...(todas ? ['Função'] : []), 'Descrição', 'Tipo', 'Situação', 'Entrada', 'Saída', 'Saldo'],
        linhasExport().map(l => [l.data ? fmtDate(l.data) : '', ...(todas ? [l.funcao || ''] : []), l.descricao || '', l.tipo || '', l.situacao || '',
          l.entrada ?? '', l.saida ?? '', l.saldo ?? '']),
      )
      await entregarArquivo(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }),
        nomeArquivoFinup(`Extrato-Reserva-${nome}`, isoLocal(new Date()).slice(0, 7)).replace(/\.xlsx$/, '.csv'), { tipo: 'text/csv' })
    } catch (err) {
      window.alert(`Não consegui exportar o CSV: ${err?.message || err}`)
    }
  }

  const valorCls = (neg) => (neg ? 'text-despesa font-semibold' : 'text-texto-2')
  const sinalSaida = (it) => (it.provisorio ? '~' : '')

  const conteudo = (
      <div className="space-y-3" data-testid="extrato-reserva">
        {/* Topo: função (menu Relatórios), período, atalhos, aviso de negativo e exportação */}
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          {seletorFuncao && (
            <label className="text-xs text-texto-2 space-y-1">
              <span className="block">Função</span>
              <select aria-label="Função de reserva" className="input text-xs py-1.5 w-56" value={funcaoSel?.id || ''}
                onChange={e => setFuncaoSel(funcoes.find(f => f.id === e.target.value) || null)}>
                <option value="">Todas as funções</option>
                {funcoes.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
          )}
          <label className="text-xs text-texto-2 space-y-1">
            <span className="block">De</span>
            <input type="month" aria-label="Mês inicial" className="input text-xs py-1.5 w-36" value={rascunho.de} min={atual}
              onChange={e => setRascunho(r => ({ ...r, de: e.target.value }))} />
          </label>
          <label className="text-xs text-texto-2 space-y-1">
            <span className="block">Até</span>
            <input type="month" aria-label="Mês final" className="input text-xs py-1.5 w-36" value={rascunho.ate} min={rascunho.de}
              onChange={e => setRascunho(r => ({ ...r, ate: e.target.value }))} />
          </label>
          <button type="button" className="btn-primary text-xs py-1.5" disabled={!!erro || (rascunho.de === periodo.de && rascunho.ate === periodo.ate)}
            onClick={() => aplicar(rascunho)}>Aplicar</button>
          <button type="button" onClick={exportarCsv} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 ml-auto">
            <Download size={12} /> CSV
          </button>
          <button type="button" onClick={exportar} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5">
            <FileSpreadsheet size={12} /> Excel
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {atalhosExtrato(atual).map(a => {
            const ativo = periodo.de === a.de && periodo.ate === a.ate
            return (
              <button key={a.id} type="button" onClick={() => aplicar({ de: a.de, ate: a.ate })}
                className={`text-xs px-2 py-1 rounded border transition-colors ${ativo ? 'border-primary text-primary-fg bg-primary/10' : 'border-borda text-texto-2 hover:bg-surface-hover'}`}>
                {a.rotulo}
              </button>
            )
          })}
          <span className="text-xs text-texto-3 ml-1">{rotuloPeriodo(periodo)}</span>
          <label className="ml-auto inline-flex items-center gap-2 text-xs text-texto-2 cursor-pointer select-none">
            <span>Agrupar rendimentos</span>
            <input type="checkbox" role="switch" aria-checked={agrupar} className="sr-only peer" checked={agrupar}
              onChange={e => setAgrupar(e.target.checked)} />
            <span aria-hidden="true" className="relative w-8 h-4 rounded-full bg-borda-campo transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50 after:absolute after:top-0.5 after:left-0.5 after:w-3 after:h-3 after:rounded-full after:bg-surface after:transition-transform peer-checked:after:translate-x-4" />
          </label>
        </div>
        {erro && <p role="alert" className="text-xs text-despesa">{erro}</p>}
        {negativoTexto && (
          <p className="flex items-center gap-1.5 text-xs text-despesa font-medium" data-testid="extrato-negativo">
            <AlertTriangle size={13} /> {negativoTexto}
          </p>
        )}

        {/* ── Computador: tabela com cabeçalho fixo ── */}
        <div className="hidden md:block rounded-lg border border-borda-forte/60 overflow-auto max-h-[calc(90vh-15rem)]">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="text-left [&>th]:border-b [&>th]:border-borda [&>th]:px-3 [&>th]:py-2 [&>th]:text-texto-2 [&>th]:font-medium">
                <th className="whitespace-nowrap">Data</th>
                {todas && <th>Função</th>}
                <th>Descrição</th>
                <th>Tipo</th>
                <th className="text-right">Entrada</th>
                <th className="text-right">Saída</th>
                <th className="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="[&>tr>td]:px-3 [&>tr>td]:py-1.5 [&>tr>td]:border-b [&>tr>td]:border-borda/40">
              <tr className="bg-surface-2/40 font-semibold">
                <td className="whitespace-nowrap text-texto-2">{fmtDate(extrato.dataInicial)}</td>
                <td colSpan={todas ? 5 : 4} className="text-texto-1">Saldo inicial</td>
                <td className={`text-right ${valorCls(extrato.saldoInicial < 0)}`} data-testid="extrato-saldo-inicial">{fmt(extrato.saldoInicial)}</td>
              </tr>
              {extrato.secoes.map(s => (
                <SecaoTabela key={s.chave} s={s} rotulo={rotulos[s.chave]} todas={todas} valorCls={valorCls} sinalSaida={sinalSaida} />
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-surface-2">
              <tr className="font-bold [&>td]:px-3 [&>td]:py-2 [&>td]:border-t-2 [&>td]:border-t-borda-forte">
                <td colSpan={todas ? 4 : 3} className="text-texto-1">Total do período</td>
                <td className="text-right text-receita">{fmt(extrato.entradas)}</td>
                <td className="text-right text-despesa">{fmt(extrato.saidas)}</td>
                <td className={`text-right ${valorCls(extrato.saldoFinal < 0)}`} data-testid="extrato-saldo-final">{fmt(extrato.saldoFinal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Celular: linhas compactas, subtotal do mês como faixa ── */}
        <div className="md:hidden -mx-5">
          <div className="px-4 py-2 flex items-center justify-between bg-surface-2/50 border-y border-borda">
            <span className="text-xs font-semibold text-texto-1">Saldo inicial · {fmtDate(extrato.dataInicial)}</span>
            <span className={`text-xs ${valorCls(extrato.saldoInicial < 0)}`}>{fmt(extrato.saldoInicial)}</span>
          </div>
          {extrato.secoes.map(s => (
            <div key={s.chave}>
              {s.itens.map((it, i) => (
                <div key={i} className={`px-4 py-2 flex items-start gap-3 border-b border-borda/40 ${it.neg ? 'bg-despesa/10' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-texto-3">
                      {fmtDate(it.date)}{todas && <> · {it.funcao}</>} · {it.tipo}
                      {it.previsto && <span className="ml-1 px-1 rounded bg-aviso/15 text-aviso">Previsto</span>}
                    </p>
                    <p className="text-xs text-texto-1 truncate">{it.label}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-medium ${it.entrada ? 'text-receita' : 'text-despesa'} ${it.provisorio ? 'italic' : ''}`}>
                      {it.entrada ? `+${fmt(it.entrada)}` : `−${sinalSaida(it)}${fmt(it.saida)}`}
                    </p>
                    <p className={`text-[11px] ${it.neg ? 'text-despesa font-semibold' : 'text-texto-3'}`}>{fmt(it.saldo)}</p>
                  </div>
                </div>
              ))}
              <div className={`px-4 py-1.5 border-b border-borda-forte ${s.neg ? 'bg-despesa/15' : 'bg-surface-2'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-texto-1">{rotulos[s.chave]}</span>
                  <span className={`text-xs font-bold ${s.neg ? 'text-despesa' : 'text-texto-1'}`}>{fmt(s.saldoFim)}</span>
                </div>
                <p className="text-[11px] text-texto-3">
                  <span className="text-receita">↓ {fmt(s.entradas)}</span> · <span className="text-despesa">↑ {fmt(s.saidas)}</span>
                </p>
              </div>
            </div>
          ))}
          <div className="px-4 py-2.5 bg-surface-2 border-b border-borda-forte">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-texto-1">Saldo final</span>
              <span className={`text-sm font-bold ${extrato.saldoFinal < 0 ? 'text-despesa' : 'text-texto-1'}`}>{fmt(extrato.saldoFinal)}</span>
            </div>
            <p className="text-[11px] text-texto-3">
              Entradas <span className="text-receita">{fmt(extrato.entradas)}</span> · Saídas <span className="text-despesa">{fmt(extrato.saidas)}</span>
            </p>
          </div>
        </div>
        {resumoPorFuncao.length > 0 && (
          <div className="rounded-lg border border-borda-forte/60 overflow-x-auto" data-testid="extrato-por-funcao">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left [&>th]:px-3 [&>th]:py-2 [&>th]:text-texto-2 [&>th]:font-medium [&>th]:border-b [&>th]:border-borda">
                  <th>Subtotal por função</th><th className="text-right">Saldo inicial</th><th className="text-right">Entradas</th>
                  <th className="text-right">Saídas</th><th className="text-right">Saldo final</th>
                </tr>
              </thead>
              <tbody className="[&>tr>td]:px-3 [&>tr>td]:py-1.5 [&>tr>td]:border-b [&>tr>td]:border-borda/40">
                {resumoPorFuncao.map(r => (
                  <tr key={r.nome}>
                    <td className="text-texto-1">{r.nome}</td>
                    <td className="text-right text-texto-2">{fmt(r.saldoInicial)}</td>
                    <td className="text-right text-receita">{fmt(r.entradas)}</td>
                    <td className="text-right text-despesa">{fmt(r.saidas)}</td>
                    <td className={`text-right font-semibold ${r.saldoFinal < 0 ? 'text-despesa' : 'text-texto-1'}`}>{fmt(r.saldoFinal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-texto-3">
          “Previsto” = agendamento ainda não realizado; “~” = resgate provisório (provisão de despesa). O saldo de cada mês é o mesmo da grade do Fluxo Futuro.
        </p>
      </div>
  )

  if (pagina) {
    return (
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-texto-2">Fluxo de Caixa da Reserva — {nome}</h2>
        {conteudo}
      </div>
    )
  }
  return (
    <Modal open onClose={onClose} title={`Extrato da função — ${nome}`} size="2xl" voltarNoCelular>
      {conteudo}
    </Modal>
  )
}

function SecaoTabela({ s, rotulo, todas, valorCls, sinalSaida }) {
  return (
    <>
      {s.itens.map((it, i) => (
        <tr key={i} className={it.neg ? 'bg-despesa/10' : ''}>
          <td className="whitespace-nowrap text-texto-2">{fmtDate(it.date)}</td>
          {todas && <td className="text-texto-2 whitespace-nowrap">{it.funcao}</td>}
          <td className="text-texto-1 max-w-xs truncate" title={it.label}>{it.label}</td>
          <td className="text-texto-2 whitespace-nowrap">
            {it.tipo}
            {it.previsto && <span className="ml-1.5 px-1 rounded text-[10px] bg-aviso/15 text-aviso">Previsto</span>}
          </td>
          <td className="text-right text-receita whitespace-nowrap">{it.entrada ? fmt(it.entrada) : ''}</td>
          <td className={`text-right text-despesa whitespace-nowrap ${it.provisorio ? 'italic' : ''}`}>{it.saida ? `${sinalSaida(it)}${fmt(it.saida)}` : ''}</td>
          <td className={`text-right whitespace-nowrap ${valorCls(it.neg)}`}>{fmt(it.saldo)}</td>
        </tr>
      ))}
      <tr className={`font-semibold ${s.neg ? 'bg-despesa/15' : 'bg-surface-2/60'}`} data-testid="extrato-subtotal" data-chave={s.chave}>
        <td colSpan={todas ? 4 : 3} className="text-texto-1">{rotulo}</td>
        <td className="text-right text-receita">{fmt(s.entradas)}</td>
        <td className="text-right text-despesa">{fmt(s.saidas)}</td>
        <td className={`text-right ${s.neg ? 'text-despesa' : 'text-texto-1'}`} data-testid="extrato-subtotal-saldo">{fmt(s.saldoFim)}</td>
      </tr>
    </>
  )
}
