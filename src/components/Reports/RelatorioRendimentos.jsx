import { useMemo, useState } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'
import { Segmentado } from '../Dashboard/DespesasCategoria'
import CampoValor from '../Contratos/CampoValor'
import { parseValorBR, valorBRFormatado } from '../../lib/valorBR'
import { hojeStr } from '../../lib/contratos/datas'
import { rotuloContrato } from '../../lib/contratos/parcelas'
import { ehModoRepasse } from '../../lib/contratos/repasse'
import {
  REFERENCIAS_RENDIMENTO, REFERENCIA_PADRAO, AVISO_CONTADOR, COLUNAS_DEDUTIVEIS, TIPOS_DEDUCAO,
  relatorioDoContrato, somarRelatorios, conferenciaInforme,
} from '../../lib/contratos/rendimentos'
import { specRendimentos } from '../../lib/contratos/rendimentosExcel'
import { exportarExcel } from '../../lib/exportExcel'
import HelpCampo from '../shared/HelpCampo'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const TODOS = '__todos'
const v0 = (v) => (Math.abs(Number(v) || 0) < 0.005 ? '—' : fmt(v))

// RENDIMENTOS DE ALUGUEL (Etapa 5): por contrato a receber (ou todos os do perfil), por ano, mês a
// mês. A conta mora em lib/contratos/rendimentos.js; a composição vem de contrato_competencias.
export default function RelatorioRendimentos() {
  const { contratos, schedules, transactions, indicesContratos, activeProfileId, activeProfile, atualizarContrato, pode } = useApp()
  const hoje = hojeStr()
  const doPerfil = useMemo(
    () => (contratos || []).filter(c => c.tipo === 'receber' && (!activeProfileId || c.perfil_id === activeProfileId))
      .sort((a, b) => rotuloContrato(a).localeCompare(rotuloContrato(b))),
    [contratos, activeProfileId],
  )
  const [contratoId, setContratoId] = useState(TODOS)
  const [ano, setAno] = useState(hoje.slice(0, 4))
  const [referencia, setReferencia] = useState(REFERENCIA_PADRAO)
  const [exportando, setExportando] = useState(false)
  const [erro, setErro] = useState('')

  const selecionados = useMemo(
    () => (contratoId === TODOS ? doPerfil : doPerfil.filter(c => c.id === contratoId)),
    [contratoId, doPerfil],
  )
  const itens = useMemo(() => selecionados.map(c => {
    const { rel, anos } = relatorioDoContrato(c, { ano, referencia, schedules, transactions, indices: indicesContratos, hoje })
    return { contrato: c, rotulo: rotuloContrato(c), rel, anos, conferencia: conferenciaInforme(c, ano, rel.totais) }
  }), [selecionados, ano, referencia, schedules, transactions, indicesContratos, hoje])
  const total = useMemo(() => (itens.length === 1 ? itens[0].rel : somarRelatorios(itens.map(i => i.rel))), [itens])
  const anos = useMemo(() => {
    const s = new Set([hoje.slice(0, 4), ano])
    for (const i of itens) for (const a of i.anos) s.add(a)
    return [...s].sort().reverse()
  }, [itens, hoje, ano])
  const temRepasse = selecionados.some(ehModoRepasse)

  const exportar = async () => {
    if (!total) return
    setExportando(true)
    setErro('')
    try {
      await exportarExcel(specRendimentos(itens, { ano, referencia, total, perfil: activeProfile?.name || '' }))
    } catch (e) {
      setErro(e.message || 'Não foi possível exportar.')
    } finally {
      setExportando(false)
    }
  }

  if (!doPerfil.length) {
    return <div className="card text-sm text-texto-3">Nenhum contrato a receber {activeProfileId ? 'neste perfil' : ''}. Cadastre em Contratos.</div>
  }

  const th = 'px-2 py-1.5 text-right font-medium whitespace-nowrap'
  const td = 'px-2 py-1 text-right tabular-nums whitespace-nowrap'
  const linha = (m, rotulo, destaque = false) => (
    <tr key={rotulo} className={destaque ? 'font-semibold border-t-2 border-borda-forte' : 'border-t border-borda'}>
      <td className="px-2 py-1 text-left whitespace-nowrap">{rotulo}</td>
      <td className={`${td} text-receita`}>{v0(m.bruto)}</td>
      {COLUNAS_DEDUTIVEIS.map(c => <td key={c.chave} className={td}>{v0(m.dedutiveis[c.chave])}</td>)}
      <td className={`${td} font-medium`}>{v0(m.totalDedutiveis)}</td>
      <td className={`${td} font-medium`}>{v0(m.base)}</td>
      <td className={td}>{v0(m.naoDedutiveis)}</td>
      <td className={`${td} text-receita`} title={m.repassePrevisto > 0.004 ? `Previsto, sem registro: ${fmt(m.repassePrevisto)}` : undefined}>
        {v0(m.repasse)}{m.repassePrevisto > 0.004 ? ' *' : ''}
      </td>
      {temRepasse && <td className={`${td} ${m.saldoFim < 0 ? 'text-despesa' : ''}`}>{m.saldoFim == null ? '—' : fmt(m.saldoFim)}</td>}
    </tr>
  )
  const tipos = Object.entries(total?.porTipo || {}).filter(([, v]) => v.dedutivel || v.naoDedutivel)

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-texto-2 flex items-center gap-2">
            <FileSpreadsheet size={14} /> Aluguéis — Rendimentos e Repasses
          </h3>
          <button type="button" className="btn-secondary text-xs flex items-center gap-1.5" onClick={exportar} disabled={exportando || !total}>
            {exportando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Exportar Excel
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-help-form="filtrosRendimentos">
          <div data-help-id="filtroRendimentos.contrato">
            <label className="label" htmlFor="rend-contrato">Contrato<HelpCampo campo="filtroRendimentos.contrato" /></label>
            <select id="rend-contrato" className="input" value={contratoId} onChange={e => setContratoId(e.target.value)}>
              <option value={TODOS}>Todos os contratos a receber</option>
              {doPerfil.map(c => <option key={c.id} value={c.id}>{rotuloContrato(c)}</option>)}
            </select>
          </div>
          <div data-help-id="filtroRendimentos.ano">
            <label className="label" htmlFor="rend-ano">Ano<HelpCampo campo="filtroRendimentos.ano" /></label>
            <select id="rend-ano" className="input" value={ano} onChange={e => setAno(e.target.value)}>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div data-help-id="filtroRendimentos.referencia">
            <span className="label">Mês de referência do aluguel<HelpCampo campo="filtroRendimentos.referencia" /></span>
            <Segmentado opcoes={REFERENCIAS_RENDIMENTO} valor={referencia} onChange={setReferencia} rotulo="Mês de referência" />
          </div>
        </div>
        <p className="text-xs text-aviso">{AVISO_CONTADOR}</p>
        {erro && <p className="text-xs text-despesa">{erro}</p>}
      </div>

      {total && (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-texto-3">
                <th className="px-2 py-1.5 text-left font-medium" rowSpan={2}>Mês</th>
                <th className={th} rowSpan={2}>Aluguel bruto</th>
                <th className="px-2 py-1 text-center font-medium border-b border-borda" colSpan={COLUNAS_DEDUTIVEIS.length + 1}>Deduções dedutíveis</th>
                <th className={th} rowSpan={2}>Base tributável</th>
                <th className={th} rowSpan={2} title="Benfeitoria, consumo e o que não estiver marcado como dedutível">Não dedutíveis</th>
                <th className={th} rowSpan={2} title="No mês em que caiu na conta">Repasse recebido</th>
                {temRepasse && <th className={th} rowSpan={2}>Saldo adm. fim do mês</th>}
              </tr>
              <tr className="text-texto-3">
                {COLUNAS_DEDUTIVEIS.map(c => <th key={c.chave} className={th}>{c.titulo}</th>)}
                <th className={th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {total.meses.map(m => linha(m, `${MESES[Number(m.mes.slice(5, 7)) - 1]}/${m.mes.slice(0, 4)}`))}
              {linha(total.totais, `Total ${ano}`, true)}
            </tbody>
          </table>
          <p className="text-[11px] text-texto-3 mt-2">
            Repasse recebido: no mês em que caiu na conta. * previsto, ainda sem registro.
            {total.saldoInicioAno != null && <> Saldo com a administradora no início do ano: {fmt(total.saldoInicioAno)}.</>}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {tipos.length > 0 && (
          <div className="card">
            <h4 className="text-xs font-semibold text-texto-2 mb-2">Deduções por tipo — {ano}</h4>
            <table className="w-full text-xs">
              <thead><tr className="text-texto-3"><th className="text-left font-medium py-1">Tipo</th><th className="text-right font-medium">Dedutível</th><th className="text-right font-medium">Não dedutível</th></tr></thead>
              <tbody>
                {tipos.map(([k, v]) => (
                  <tr key={k} className="border-t border-borda">
                    <td className="py-1">{TIPOS_DEDUCAO[k] || k}</td>
                    <td className="text-right tabular-nums">{v0(v.dedutivel)}</td>
                    <td className="text-right tabular-nums">{v0(v.naoDedutivel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-texto-3 mt-2">A marcação "dedutível IR" de cada item muda na composição da competência (ficha do contrato).</p>
          </div>
        )}
        <div className="card">
          <h4 className="text-xs font-semibold text-texto-2 mb-2">Conferência com o informe da administradora — {ano}</h4>
          {itens.map(i => (
            // A chave remonta os campos quando o ano ou o informe gravado mudam.
            <ConferenciaInforme key={`${i.contrato.id}:${ano}:${i.conferencia.rendimentos.informado}:${i.conferencia.deducoes.informado}`} item={i} ano={ano} mostrarNome={itens.length > 1}
              podeEditar={!!pode?.('contratos', 'editar')} atualizarContrato={atualizarContrato} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ConferenciaInforme({ item, ano, mostrarNome, podeEditar, atualizarContrato }) {
  const { contrato, rotulo, conferencia } = item
  const fmtCampo = (v) => (v == null ? '' : valorBRFormatado(v))
  const [rend, setRend] = useState(fmtCampo(conferencia.rendimentos.informado))
  const [ded, setDed] = useState(fmtCampo(conferencia.deducoes.informado))
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState('')

  const num = (t) => (t === '' || t == null ? null : parseValorBR(t))
  const gravar = async () => {
    setSalvando(true)
    setMsg('')
    try {
      const informes = { ...(contrato.informes_adm || {}) }
      const r = num(rend)
      const d = num(ded)
      if (r == null && d == null) delete informes[ano]
      else informes[ano] = { rendimentos: r, deducoes: d }
      await atualizarContrato(contrato.id, { informes_adm: informes })
      setMsg('Gravado.')
    } catch (e) {
      setMsg(e.message || 'Não foi possível gravar.')
    } finally {
      setSalvando(false)
    }
  }
  const dif = (x) => (x.diferenca == null ? '—' : <span className={Math.abs(x.diferenca) > 0.004 ? 'text-despesa font-semibold' : 'text-receita'}>{fmt(x.diferenca)}</span>)
  return (
    <div className="mb-3 last:mb-0" data-help-form="informeAdm">
      {mostrarNome && <p className="text-xs font-medium text-texto-1 mb-1">{rotulo}</p>}
      <table className="w-full text-xs">
        <thead><tr className="text-texto-3"><th className="text-left font-medium py-1" /><th className="text-right font-medium">Calculado</th><th className="text-right font-medium">Informe da adm.</th><th className="text-right font-medium">Diferença</th></tr></thead>
        <tbody>
          <tr className="border-t border-borda">
            <td className="py-1">Rendimentos (aluguel bruto)<HelpCampo campo="informeAdm.rendimentos" /></td>
            <td className="text-right tabular-nums">{fmt(conferencia.rendimentos.calculado)}</td>
            <td className="text-right w-36"><CampoValor helpId="informeAdm.rendimentos" className="input py-1 text-right text-xs" aria-label={`Rendimentos informados ${rotulo}`} value={rend} onChange={setRend} disabled={!podeEditar} placeholder="0,00" /></td>
            <td className="text-right tabular-nums">{dif(conferencia.rendimentos)}</td>
          </tr>
          <tr className="border-t border-borda">
            <td className="py-1">Deduções dedutíveis<HelpCampo campo="informeAdm.deducoes" /></td>
            <td className="text-right tabular-nums">{fmt(conferencia.deducoes.calculado)}</td>
            <td className="text-right w-36"><CampoValor helpId="informeAdm.deducoes" className="input py-1 text-right text-xs" aria-label={`Deduções informadas ${rotulo}`} value={ded} onChange={setDed} disabled={!podeEditar} placeholder="0,00" /></td>
            <td className="text-right tabular-nums">{dif(conferencia.deducoes)}</td>
          </tr>
        </tbody>
      </table>
      {podeEditar && (
        <div className="flex items-center justify-end gap-2 mt-1.5">
          {msg && <span className="text-[11px] text-texto-3">{msg}</span>}
          <button type="button" className="btn-secondary text-xs" onClick={gravar} disabled={salvando}>{salvando ? 'Gravando…' : 'Gravar informe'}</button>
        </div>
      )}
    </div>
  )
}
