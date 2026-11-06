import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'
import DateInput from '../shared/DateInput'
import { getExtratoBens } from '../../lib/bemApi'
import { extratoDoBem, saidasPorMes, totaisDeSaidas } from '../../lib/extratoBem'
import { specRelatorioBens } from '../../lib/relatorioBensExcel'
import { exportarExcel } from '../../lib/exportExcel'
import { isoLocal } from '../../lib/hoje'
import { useSubtelaGuia } from '../BoasVindas/subtelaGuia'

const rotuloMes = (mes) => { const [a, m] = mes.split('-'); return `${m}/${a}` }

// Visão Caixa do Patrimônio: quanto saiu de caixa por bem e por mês. Sai do Extrato do bem, a mesma
// leitura da aba "Resumo do bem". Troca e ajuste de avaliação não entram, porque não são caixa.
export default function RelatorioBens() {
  useSubtelaGuia('reports:bens')
  const { profiles, activeProfile } = useApp()
  const hoje = new Date()
  const [de, setDe] = useState(`${hoje.getFullYear()}-01-01`)
  const [ate, setAte] = useState(isoLocal(hoje))
  const [perfilId, setPerfilId] = useState(activeProfile?.id || '')
  const [bemId, setBemId] = useState('')
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    getExtratoBens()
      .then(r => { if (vivo) setDados(r) })
      .catch(e => { if (vivo) setErro(e.message) })
    return () => { vivo = false }
  }, [])

  const bensDoPerfil = useMemo(
    () => (dados?.bens || []).filter(b => !perfilId || b.perfil_id === perfilId),
    [dados, perfilId],
  )
  const linhas = useMemo(() => {
    if (!dados) return []
    const bens = bensDoPerfil.filter(b => !bemId || b.id === bemId)
    return saidasPorMes(bens.map(bem => ({ bem, linhas: extratoDoBem(bem, dados) })), { de, ate })
  }, [dados, bensDoPerfil, bemId, de, ate])
  const totais = useMemo(() => totaisDeSaidas(linhas), [linhas])

  const exportar = () => {
    const filtros = [
      `Perfil: ${profiles?.find(p => p.id === perfilId)?.name || 'Todos'}`,
      `Bem: ${bensDoPerfil.find(b => b.id === bemId)?.nome || 'Todos'}`,
    ]
    exportarExcel(specRelatorioBens(linhas, { de, ate, filtros, totais }))
      .catch(err => window.alert(`Não consegui exportar: ${err?.message || err}`))
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="text-sm font-semibold text-texto-1 mb-1">Bens e investimentos — saídas por mês</h2>
        <p className="text-xs text-texto-3 mb-3">
          O que saiu das suas contas para pagar cada bem. O que um terceiro pagou e as devoluções ficam em
          colunas próprias, fora do total. Bem dado na troca e ajuste de avaliação não são caixa e não aparecem.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div data-guia="reports:bens.datas">
            <label className="label">Data inicial</label>
            <DateInput className="input" value={de} onChange={e => setDe(e.target.value)} />
          </div>
          <div>
            <label className="label">Data final</label>
            <DateInput className="input" value={ate} onChange={e => setAte(e.target.value)} />
          </div>
          <div data-guia="reports:bens.perfil">
            <label className="label">Perfil</label>
            <select className="input" value={perfilId} onChange={e => { setPerfilId(e.target.value); setBemId('') }}>
              <option value="">Todos os perfis</option>
              {(profiles || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div data-guia="reports:bens.bem">
            <label className="label">Bem</label>
            <select className="input" value={bemId} onChange={e => setBemId(e.target.value)}>
              <option value="">Todos os bens</option>
              {bensDoPerfil.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </div>
        </div>
      </div>

      {erro && <p className="text-sm text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}
      {!erro && !dados && (
        <p className="flex items-center gap-2 text-sm text-texto-3 py-8 justify-center"><Loader2 size={14} className="animate-spin" /> Carregando…</p>
      )}

      {dados && (
        <div className="card">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p data-guia="reports:bens.total" className="text-sm text-texto-2">
              Saiu de caixa: <span className="font-semibold text-despesa">{fmt(totais.total)}</span>
            </p>
            {linhas.length > 0 && (
              <button data-guia="reports:bens.exportar" onClick={exportar} className="btn-secondary flex items-center gap-1.5 text-xs py-1">
                <FileSpreadsheet size={12} /> <span className="hidden sm:inline">Exportar Excel</span><span className="sm:hidden">Excel</span>
              </button>
            )}
          </div>
          {linhas.length === 0
            ? <p className="text-sm text-texto-3 text-center py-8">Nenhuma saída de bem neste período.</p>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="border-b border-borda text-xs text-texto-2">
                      <th className="text-left font-medium py-2 pr-3">Bem</th>
                      <th className="text-left font-medium py-2 px-2">Mês</th>
                      <th className="text-right font-medium py-2 px-2">Principal</th>
                      <th className="text-right font-medium py-2 px-2">Juros</th>
                      <th className="text-right font-medium py-2 px-2">Total de saídas</th>
                      <th className="text-right font-medium py-2 px-2">Pago por terceiros</th>
                      <th className="text-right font-medium py-2 pl-2">Devoluções</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map(l => (
                      <tr key={`${l.bemId}|${l.mes}`} className="border-b border-borda/60">
                        <td className="py-1.5 pr-3 text-texto-1">{l.bem}</td>
                        <td className="py-1.5 px-2 text-texto-2">{rotuloMes(l.mes)}</td>
                        <td className="py-1.5 px-2 text-right text-texto-1">{fmt(l.principal)}</td>
                        <td className="py-1.5 px-2 text-right text-texto-1">{fmt(l.juros)}</td>
                        <td className="py-1.5 px-2 text-right text-despesa font-medium">{fmt(l.total)}</td>
                        <td className="py-1.5 px-2 text-right text-texto-2">{fmt(l.terceiros)}</td>
                        <td className="py-1.5 pl-2 text-right text-receita">{fmt(l.devolucoes)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-borda-forte font-semibold">
                      <td className="py-2 pr-3 text-texto-1" colSpan={2}>Total</td>
                      <td className="py-2 px-2 text-right text-texto-1">{fmt(totais.principal)}</td>
                      <td className="py-2 px-2 text-right text-texto-1">{fmt(totais.juros)}</td>
                      <td className="py-2 px-2 text-right text-despesa">{fmt(totais.total)}</td>
                      <td className="py-2 px-2 text-right text-texto-2">{fmt(totais.terceiros)}</td>
                      <td className="py-2 pl-2 text-right text-receita">{fmt(totais.devolucoes)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
        </div>
      )}
    </div>
  )
}
