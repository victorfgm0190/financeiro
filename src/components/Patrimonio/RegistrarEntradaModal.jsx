import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { fmt } from '../shared/utils'
import DateInput from '../shared/DateInput'
import FavorecidoAutocomplete from '../shared/FavorecidoAutocomplete'
import { registrarEntrada, getBem } from '../../lib/bemApi'
import { fmtData, hojeIso, round2, montarAjustesEntrada } from './bemUtils'

export default function RegistrarEntradaModal({
  bem, transacoes, contas, favorecidos = [], onCancel, onSuccess, onErro,
}) {
  const [busca, setBusca] = useState('')
  const [escolhidas, setEscolhidas] = useState({}) // { [txId]: categoriaId | '' }
  const [favorecido, setFavorecido] = useState('')
  const [usarBemAntigo, setUsarBemAntigo] = useState(false)
  const [bemAntigoId, setBemAntigoId] = useState('')
  const [bemAntigo, setBemAntigo] = useState(null)
  const [carregandoBemAntigo, setCarregandoBemAntigo] = useState(false)
  const [valorVenda, setValorVenda] = useState('')
  const [data, setData] = useState(hojeIso())
  const [loading, setLoading] = useState(false)

  const categoriasBem = useMemo(() => {
    const c = bem.categorias || {}
    return [c.prestacao, c.perda, c.ganho, c.taxa_finan].filter(x => x?.id)
  }, [bem])

  const nomeConta = useMemo(() => {
    const mapa = Object.fromEntries(contas.map(c => [c.id, c.name]))
    return (id) => mapa[id] || '—'
  }, [contas])

  const bensDisponiveis = useMemo(
    () => contas.filter(c => c.type === 'asset' && c.id !== bem.id),
    [contas, bem.id],
  )

  // Quem já chega aqui é só transferência que creditou a conta deste bem e ainda não foi
  // vinculada — o recorte é feito por quem monta o modal. O filtro de tipo fica como guarda
  // para o componente não depender disso.
  const semCandidatas = useMemo(
    () => transacoes.filter(t => t.type === 'transfer').length === 0,
    [transacoes],
  )

  const transferencias = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return transacoes
      .filter(t => t.type === 'transfer')
      .filter(t => !termo
        || (t.description || '').toLowerCase().includes(termo)
        || nomeConta(t.accountId).toLowerCase().includes(termo)
        || nomeConta(t.toAccountId).toLowerCase().includes(termo))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 60)
  }, [transacoes, busca, nomeConta])

  // valor_nota_fiscal do bem antigo só existe no backend — o estado do app não carrega essa coluna.
  useEffect(() => {
    if (!usarBemAntigo || !bemAntigoId) { setBemAntigo(null); return }
    let cancelado = false
    setCarregandoBemAntigo(true)
    getBem(bemAntigoId)
      .then(r => { if (!cancelado) setBemAntigo(r.bem) })
      .catch(err => { if (!cancelado) onErro(err.message) })
      .finally(() => { if (!cancelado) setCarregandoBemAntigo(false) })
    return () => { cancelado = true }
  }, [usarBemAntigo, bemAntigoId, onErro])

  const toggle = (tx) => {
    setEscolhidas(prev => {
      const copia = { ...prev }
      if (tx.id in copia) delete copia[tx.id]
      else copia[tx.id] = categoriasBem[0]?.id || ''
      return copia
    })
  }

  const totalTransferencias = useMemo(
    () => round2(transacoes
      .filter(t => t.id in escolhidas)
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0)),
    [transacoes, escolhidas],
  )

  const valorTradeIn = usarBemAntigo ? (Number(valorVenda) || 0) : 0
  const perdaGanho = bemAntigo ? round2(valorTradeIn - (bemAntigo.valor_nota_fiscal || 0)) : null
  const totalEntrada = round2(totalTransferencias + valorTradeIn)

  const tradeInIncompleto = usarBemAntigo && (!bemAntigoId || !(valorTradeIn > 0))
  const podeEnviar = totalEntrada > 0 && !tradeInIncompleto && !loading

  const enviar = async (e) => {
    e.preventDefault()
    if (!podeEnviar) return
    setLoading(true)
    try {
      const itens = transacoes
        .filter(t => t.id in escolhidas)
        .map(t => ({
          transferencia_id: t.id,
          valor: Math.abs(Number(t.amount) || 0),
          categoria_id: escolhidas[t.id] || null,
          descricao: t.description || 'Entrada à vista',
        }))

      if (usarBemAntigo) {
        itens.push({
          bem_origem_id: bemAntigoId,
          valor: valorTradeIn,
          descricao: `Recebido ${bemAntigo?.nome || 'bem antigo'} como entrada`,
        })
      }

      const resposta = await registrarEntrada(bem.id, { data, transferencias: itens })

      // Espelha no estado do app o que a entrada mudou nas transferências escolhidas.
      // A CATEGORIA o backend já grava (UPDATE lancamentos ... category_id = COALESCE(...)),
      // mas o estado React não sabe disso — e o sync é diferencial sobre ele, então sem
      // espelhar aqui o próximo full-sync reenviaria a categoria antiga por cima da nova
      // (mesmo motivo do sincronizarSaldo em BemDetail). O FAVORECIDO é só do frontend: o
      // endpoint não o toca, e chega ao banco pelo sync normal.
      // Campo vazio não entra em `mudancas` — não sobrescreve o que já existe no lançamento.
      const ajustes = montarAjustesEntrada({ transacoes, escolhidas, favorecido, bemId: bem.id })
      onSuccess(resposta, { ajustes, favorecido: favorecido.trim() })
    } catch (err) {
      onErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="p-3 bg-gray-800/60 rounded-lg text-xs space-y-1">
        <div className="flex justify-between"><span className="text-gray-500">Bem</span><span className="text-gray-200">{bem.nome}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Saldo atual</span><span className="text-gray-200">{fmt(bem.saldo)}</span></div>
      </div>

      <div>
        <label className="label">Data da Entrada *</label>
        <DateInput className="input" required value={data} onChange={e => setData(e.target.value)} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Transferências Disponíveis</label>
          <span className="text-xs text-gray-600">{Object.keys(escolhidas).length} selecionada(s)</span>
        </div>
        <div className="relative mb-2">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            className="input pl-8" placeholder="Buscar por descrição ou conta..."
            value={busca} onChange={e => setBusca(e.target.value)}
          />
        </div>

        <div className="max-h-56 overflow-y-auto space-y-1 border border-gray-800 rounded-lg p-2">
          {transferencias.length === 0 && (
            <p className="text-xs text-gray-600 py-3 px-3 text-center">
              {semCandidatas
                ? 'Nenhuma transferência disponível. Só aparecem aqui transferências feitas '
                  + `para a conta "${bem.nome}".`
                : 'Nenhuma transferência encontrada para essa busca.'}
            </p>
          )}
          {transferencias.map(t => {
            const marcada = t.id in escolhidas
            return (
              <div key={t.id} className={`rounded-lg px-2.5 py-2 ${marcada ? 'bg-blue-500/10 border border-blue-500/20' : 'hover:bg-gray-800/50'}`}>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" className="mt-1 accent-blue-500" checked={marcada} onChange={() => toggle(t)} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm text-gray-200 truncate">{t.description || 'Transferência'}</span>
                        {t.bemId && (
                          <span className="text-[10px] shrink-0 px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
                            Já vinculada
                          </span>
                        )}
                      </span>
                      <span className="text-sm text-gray-200 shrink-0">{fmt(Math.abs(Number(t.amount) || 0))}</span>
                    </span>
                    <span className="block text-xs text-gray-600 truncate">
                      {fmtData(t.date)} · {nomeConta(t.accountId)} → {nomeConta(t.toAccountId)}
                      {t.payee && ` · ${t.payee}`}
                    </span>
                  </span>
                </label>
                {marcada && categoriasBem.length > 0 && (
                  <select
                    className="input mt-2 text-xs py-1"
                    value={escolhidas[t.id] || ''}
                    onChange={e => setEscolhidas(prev => ({ ...prev, [t.id]: e.target.value }))}
                  >
                    <option value="">Sem categoria</option>
                    {categoriasBem.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <label className="label">Favorecido</label>
        <FavorecidoAutocomplete
          value={favorecido}
          onChange={setFavorecido}
          suggestions={favorecidos}
          placeholder="Ex: Shopping Car Londrina"
        />
        <p className="text-xs text-gray-600 mt-1">
          Preenche as transferências selecionadas que estão SEM favorecido. As que já têm um
          não são alteradas — o mesmo vale para a categoria.
        </p>
      </div>

      <div className="border border-gray-800 rounded-lg p-3 space-y-3">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox" className="accent-blue-500" checked={usarBemAntigo}
            onChange={e => setUsarBemAntigo(e.target.checked)}
          />
          <span className="text-sm text-gray-300">Usar um bem antigo como entrada (trade-in)</span>
        </label>

        {usarBemAntigo && (
          <div className="space-y-3 pl-6">
            <div>
              <label className="label">Qual bem?</label>
              <select className="input" value={bemAntigoId} onChange={e => setBemAntigoId(e.target.value)}>
                <option value="">Selecione...</option>
                {bensDisponiveis.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {bensDisponiveis.length === 0 && (
                <p className="text-xs text-gray-600 mt-1">Nenhum outro bem cadastrado.</p>
              )}
            </div>

            {carregandoBemAntigo && (
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> Buscando nota fiscal...
              </p>
            )}

            {bemAntigo && (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Nota fiscal</span>
                  <span className="text-gray-200">{fmt(bemAntigo.valor_nota_fiscal)}</span>
                </div>
                {bemAntigo.foi_vendido && (
                  <p className="text-xs text-despesa">
                    Este bem já consta como vendido — o backend vai recusar o trade-in.
                  </p>
                )}
                <div>
                  <label className="label">Por quanto vai vender? (R$)</label>
                  <input
                    className="input" type="number" step="0.01" min="0.01"
                    value={valorVenda} onChange={e => setValorVenda(e.target.value)}
                  />
                </div>
                {perdaGanho !== null && valorTradeIn > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">{perdaGanho >= 0 ? 'Ganho' : 'Perda'}</span>
                    <span className={perdaGanho >= 0 ? 'text-receita' : 'text-despesa'}>{fmt(perdaGanho)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="p-3 bg-gray-800/60 rounded-lg flex items-center justify-between">
        <span className="text-sm text-gray-400">Total da Entrada</span>
        <span className="text-lg font-bold text-teal-400">{fmt(totalEntrada)}</span>
      </div>

      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={loading}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={!podeEnviar}>
          {loading && <Loader2 size={14} className="animate-spin" />}
          Registrar Entrada
        </button>
      </div>
    </form>
  )
}
