import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Info, ListOrdered, History, Settings2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import Modal from '../shared/Modal'
import Toast from '../shared/Toast'
import { getBem, getFinanciamento, getParcelas, getMovimentacoes } from '../../lib/bemApi'
import BemInfoTab from './BemInfoTab'
import BemParcelasTab from './BemParcelasTab'
import BemHistoricoTab from './BemHistoricoTab'
import FinanciamentoModal from './FinanciamentoModal'
import PagarParcelaModal from './PagarParcelaModal'
import RegistrarEntradaModal from './RegistrarEntradaModal'
import ParametrizarBemModal from './ParametrizarBemModal'
import { transferenciasElegiveisEntrada } from './bemUtils'

const ABAS = [
  { id: 'informacoes', label: 'Informações', icone: Info },
  { id: 'parcelas', label: 'Parcelas', icone: ListOrdered },
  { id: 'historico', label: 'Histórico', icone: History },
]

const POR_PAGINA = 20

export default function BemDetail({ conta, onClose }) {
  const {
    accounts, categories, profileTransactions, payees,
    updateAccount, updateTransaction, addPayee,
  } = useApp()

  const [bem, setBem] = useState(null)
  const [financiamento, setFinanciamento] = useState(null)
  const [abaAtiva, setAbaAtiva] = useState('informacoes')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [toast, setToast] = useState(null)

  const [parcelas, setParcelas] = useState([])
  const [paginaParcelas, setPaginaParcelas] = useState(1)
  const [metaParcelas, setMetaParcelas] = useState({ totalPages: 1, total: 0 })
  const [loadingParcelas, setLoadingParcelas] = useState(false)

  const [movimentacoes, setMovimentacoes] = useState(null)
  const [loadingMov, setLoadingMov] = useState(false)
  const [erroMov, setErroMov] = useState(null)

  const [modal, setModal] = useState(null) // 'financiamento' | 'entrada' | 'parametrizar' | { parcela }

  const avisar = useCallback((mensagem, variante = 'success') => {
    setToast({ mensagem, variante })
  }, [])

  // `accounts` é lido por ref, não por dependência: updateAccount refaz o array
  // incondicionalmente (AppContext.jsx:1271, `.map()` sem comparar valor), então usá-lo como
  // dep aqui fechava um ciclo — accounts novo → sincronizarSaldo nova → carregar novo → o
  // efeito de baixo redispara → sincronizarSaldo chama updateAccount → accounts novo. Cada
  // volta repunha loading = true e a tela nunca saía de "Carregando bem...".
  const accountsRef = useRef(accounts)
  useEffect(() => { accountsRef.current = accounts }, [accounts])

  // Mantém o saldo do estado do app alinhado ao que o backend acabou de gravar. Sem isso, um
  // full-sync (reconexão) reenviaria o saldo antigo do React e sobrescreveria o do banco.
  const sincronizarSaldo = useCallback((contaId, saldo) => {
    if (!contaId || saldo == null) return
    if (!accountsRef.current.some(a => a.id === contaId)) return
    updateAccount(contaId, { balance: saldo })
  }, [updateAccount])

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const { bem: dadosBem } = await getBem(conta.id)
      setBem(dadosBem)
      sincronizarSaldo(conta.id, dadosBem.saldo)

      if (dadosBem.financiamento?.id) {
        const { financiamento: fin } = await getFinanciamento(dadosBem.financiamento.id)
        setFinanciamento(fin)
      } else {
        setFinanciamento(null)
      }
    } catch (err) {
      setErro(err.message)
    } finally {
      setLoading(false)
    }
  }, [conta.id, sincronizarSaldo])

  useEffect(() => { carregar() }, [carregar])

  const carregarParcelas = useCallback(async (financiamentoId, pagina) => {
    setLoadingParcelas(true)
    try {
      const r = await getParcelas(financiamentoId, { page: pagina, limit: POR_PAGINA })
      setParcelas(r.parcelas || [])
      setMetaParcelas({ totalPages: r.total_pages || 1, total: r.total_parcelas || 0 })
      setPaginaParcelas(r.page || pagina)
    } catch (err) {
      avisar(err.message, 'error')
    } finally {
      setLoadingParcelas(false)
    }
  }, [avisar])

  useEffect(() => {
    if (abaAtiva !== 'parcelas' || !financiamento?.id) return
    carregarParcelas(financiamento.id, paginaParcelas)
  }, [abaAtiva, financiamento?.id, paginaParcelas, carregarParcelas])

  useEffect(() => {
    if (abaAtiva !== 'historico' || movimentacoes !== null) return
    setLoadingMov(true)
    setErroMov(null)
    getMovimentacoes(conta.id)
      .then(r => setMovimentacoes(r.movimentacoes || []))
      .catch(err => setErroMov(err.message))
      .finally(() => setLoadingMov(false))
  }, [abaAtiva, movimentacoes, conta.id])

  const recarregarTudo = useCallback(async () => {
    setMovimentacoes(null)
    await carregar()
  }, [carregar])

  const aposParametrizar = async () => {
    setModal(null)
    avisar('Bem parametrizado.')
    await recarregarTudo()
  }

  const aposEntrada = async (resposta, { ajustes = [], favorecido = '' } = {}) => {
    setModal(null)
    sincronizarSaldo(conta.id, resposta.bem?.saldo)
    for (const antigo of resposta.bens_antigos || []) {
      sincronizarSaldo(antigo.id, antigo.saldo_reducido)
    }
    // Favorecido e categoria das transferências escolhidas — mesma razão do sincronizarSaldo:
    // o sync é diferencial sobre o estado React, então o que o backend gravou (categoria) e o
    // que só o frontend conhece (favorecido) precisam existir aqui para não se perderem.
    for (const { id, mudancas } of ajustes) updateTransaction(id, mudancas)
    if (favorecido && !payees.includes(favorecido)) addPayee(favorecido)

    const total = resposta.entrada_total?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    avisar(
      `Entrada de ${total} registrada.`
      + (ajustes.length ? ` ${ajustes.length} lançamento(s) atualizado(s).` : ''),
    )
    await recarregarTudo()
  }

  const aposFinanciamento = async (resposta) => {
    setModal(null)
    const fin = resposta.financiamento
    avisar(`Financiamento criado: ${fin.parcelas_criadas} parcelas e ${fin.agendamentos_criados} agendamentos. Recarregue o app para ver a conta de dívida e os agendamentos nas outras telas.`)
    setAbaAtiva('parcelas')
    setPaginaParcelas(1)
    await recarregarTudo()
  }

  const aposPagamento = async (resposta) => {
    setModal(null)
    sincronizarSaldo(resposta.saldos_atualizados?.bem?.id, resposta.saldos_atualizados?.bem?.saldo_novo)
    sincronizarSaldo(resposta.saldos_atualizados?.divida?.id, resposta.saldos_atualizados?.divida?.saldo_novo)
    avisar(`Parcela ${resposta.parcela.numero} ${resposta.parcela.status === 'paid' ? 'quitada' : 'paga parcialmente'}.`)
    setMovimentacoes(null)
    await carregar()
    if (financiamento?.id) await carregarParcelas(financiamento.id, paginaParcelas)
  }

  const contasCorrentes = accounts.filter(
    a => !['credit', 'asset', 'liability', 'gerencial'].includes(a.type),
  )

  const transferenciasDoBem = useMemo(
    () => transferenciasElegiveisEntrada(profileTransactions, conta.id),
    [profileTransactions, conta.id],
  )

  // Mesma ordenação do autocomplete de TransactionForm: os mais usados primeiro.
  const favorecidosOrdenados = useMemo(() => {
    const usos = {}
    for (const tx of profileTransactions) {
      if (tx.payee) usos[tx.payee] = (usos[tx.payee] || 0) + 1
    }
    return [...new Set(payees)].sort((a, b) => (usos[b] || 0) - (usos[a] || 0))
  }, [profileTransactions, payees])

  const naoParametrizado = bem && !bem.valor_nota_fiscal && !bem.categorias?.prestacao?.id

  const resumoParcelas = financiamento ? {
    pagas: financiamento.parcelas?.filter(p => p.status === 'paid').length ?? 0,
    proxima: financiamento.parcelas?.find(p => p.status !== 'paid') ?? null,
  } : null

  return (
    <>
      <Modal open onClose={onClose} title={bem?.nome || conta.name} size="xl">
        {loading && (
          <div className="flex items-center justify-center py-14 text-gray-500 gap-2 text-sm">
            <Loader2 size={18} className="animate-spin" /> Carregando bem...
          </div>
        )}

        {!loading && erro && (
          <div className="card text-center py-10">
            <p className="text-sm text-despesa">{erro}</p>
            <button className="btn-secondary mt-4 text-xs py-1.5 px-4" onClick={carregar}>Tentar novamente</button>
          </div>
        )}

        {!loading && !erro && bem && (
          <div className="space-y-4">
            {naoParametrizado && (
              <div className="card border border-amber-500/20 bg-amber-500/5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-amber-300">Bem ainda não parametrizado</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Defina a nota fiscal e as 4 categorias para poder criar o financiamento.
                  </p>
                </div>
                <button className="btn-primary text-xs py-1.5 px-3 shrink-0 flex items-center gap-1.5" onClick={() => setModal('parametrizar')}>
                  <Settings2 size={13} /> Parametrizar
                </button>
              </div>
            )}

            <div className="flex gap-1 border-b border-gray-800">
              {ABAS.map(aba => {
                const Icone = aba.icone
                const ativa = abaAtiva === aba.id
                return (
                  <button
                    key={aba.id}
                    onClick={() => setAbaAtiva(aba.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                      ativa
                        ? 'border-teal-500 text-teal-400'
                        : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    <Icone size={13} /> {aba.label}
                  </button>
                )
              })}
              {!naoParametrizado && (
                <button
                  onClick={() => setModal('parametrizar')}
                  className="ml-auto text-xs text-gray-600 hover:text-gray-400 px-2"
                  title="Reparametrizar categorias"
                >
                  <Settings2 size={13} />
                </button>
              )}
            </div>

            {abaAtiva === 'informacoes' && (
              <BemInfoTab
                bem={bem}
                financiamento={financiamento}
                parcelasResumo={resumoParcelas}
                onCriarFinanciamento={() => setModal('financiamento')}
                onRegistrarEntrada={() => setModal('entrada')}
              />
            )}

            {abaAtiva === 'parcelas' && (
              <BemParcelasTab
                financiamento={financiamento}
                parcelas={parcelas}
                page={paginaParcelas}
                totalPages={metaParcelas.totalPages}
                totalParcelas={metaParcelas.total}
                loading={loadingParcelas}
                onPage={setPaginaParcelas}
                onPagar={(parcela) => setModal({ parcela })}
              />
            )}

            {abaAtiva === 'historico' && (
              <BemHistoricoTab movimentacoes={movimentacoes} loading={loadingMov} erro={erroMov} />
            )}
          </div>
        )}
      </Modal>

      <Modal open={modal === 'parametrizar'} onClose={() => setModal(null)} title="Parametrizar Bem">
        {modal === 'parametrizar' && (
          <ParametrizarBemModal
            conta={conta}
            categorias={categories}
            onCancel={() => setModal(null)}
            onSuccess={aposParametrizar}
            onErro={(m) => avisar(m, 'error')}
          />
        )}
      </Modal>

      <Modal open={modal === 'financiamento'} onClose={() => setModal(null)} title="Criar Financiamento" size="lg">
        {modal === 'financiamento' && bem && (
          <FinanciamentoModal
            bem={bem}
            contasCorrentes={contasCorrentes}
            onCancel={() => setModal(null)}
            onSuccess={aposFinanciamento}
            onErro={(m) => avisar(m, 'error')}
          />
        )}
      </Modal>

      <Modal open={modal === 'entrada'} onClose={() => setModal(null)} title="Registrar Entrada à Vista" size="lg">
        {modal === 'entrada' && bem && (
          <RegistrarEntradaModal
            bem={bem}
            transacoes={transferenciasDoBem}
            contas={accounts}
            favorecidos={favorecidosOrdenados}
            onCancel={() => setModal(null)}
            onSuccess={aposEntrada}
            onErro={(m) => avisar(m, 'error')}
          />
        )}
      </Modal>

      <Modal open={!!modal?.parcela} onClose={() => setModal(null)} title="Pagar Parcela" size="lg">
        {modal?.parcela && bem && (
          <PagarParcelaModal
            bem={bem}
            financiamento={financiamento}
            parcela={modal.parcela}
            contasCorrentes={contasCorrentes}
            onCancel={() => setModal(null)}
            onSuccess={aposPagamento}
            onErro={(m) => avisar(m, 'error')}
          />
        )}
      </Modal>

      {toast && (
        <Toast
          message={toast.mensagem}
          variant={toast.variante}
          onClose={() => setToast(null)}
          duration={toast.variante === 'error' ? 8000 : 6000}
        />
      )}
    </>
  )
}
