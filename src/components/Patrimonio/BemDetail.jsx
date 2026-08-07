import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Info, ListOrdered, History, Settings2, Wallet } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import Modal from '../shared/Modal'
import Toast from '../shared/Toast'
import ConfirmDialog from '../shared/ConfirmDialog'
import { getBem, getFinanciamento, getParcelas, getMovimentacoes, estornarEntrada } from '../../lib/bemApi'
import BemInfoTab from './BemInfoTab'
import BemParcelasTab from './BemParcelasTab'
import BemHistoricoTab from './BemHistoricoTab'
import TradeInResumo from './TradeInResumo'
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
    addAccount, updateAccount, updateTransaction, addPayee,
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

  const [confirmandoEstorno, setConfirmandoEstorno] = useState(false)
  const [estornando, setEstornando] = useState(false)

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

  // Carrega já na abertura, não só ao entrar na aba Histórico: o painel de entrada fica no
  // topo de todas as abas e é daqui que ele sai. `movimentacoes === null` continua sendo o
  // gatilho, então recarregarTudo() (que o zera) segue disparando um refetch.
  useEffect(() => {
    if (movimentacoes !== null) return
    setLoadingMov(true)
    setErroMov(null)
    getMovimentacoes(conta.id)
      .then(r => setMovimentacoes(r.movimentacoes || []))
      .catch(err => setErroMov(err.message))
      .finally(() => setLoadingMov(false))
  }, [movimentacoes, conta.id])

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

  const estornar = async () => {
    setEstornando(true)
    try {
      // O flag só vai quando a UI JÁ avisou do financiamento no diálogo — é o que mantém o
      // 409 do backend útil para qualquer outro chamador que não tenha avisado nada.
      const r = await estornarEntrada(conta.id, { confirmar_com_financiamento: !!financiamento })

      sincronizarSaldo(conta.id, r.bem?.saldo)
      for (const b of r.bens_restaurados || []) sincronizarSaldo(b.id, b.saldo)
      // Mesma razão do sincronizarSaldo em aposEntrada: o backend tirou o `bem_id` das
      // transferências, mas o sync é diferencial sobre o estado React — sem espelhar aqui, o
      // próximo full-sync reporia o vínculo que acabamos de desfazer.
      for (const t of r.transferencias_desvinculadas || []) updateTransaction(t.id, { bemId: null })

      const partes = []
      if (r.transferencias_desvinculadas?.length) {
        partes.push(`${r.transferencias_desvinculadas.length} transferência(s) desvinculada(s)`)
      }
      if (r.lancamentos_removidos?.length) {
        partes.push(`${r.lancamentos_removidos.length} lançamento(s) de perda/ganho apagado(s)`)
      }
      for (const b of r.bens_restaurados || []) {
        partes.push(`${b.nome} voltou a ${b.saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`)
      }
      const estimados = (r.bens_restaurados || []).filter(b => b.saldo_estimado)
      avisar(
        `Entrada estornada${partes.length ? `: ${partes.join(' · ')}` : ''}. `
        + 'Pronto para registrar de novo.'
        + (estimados.length
          ? ` Atenção: o saldo de ${estimados.map(b => b.nome).join(', ')} foi restaurado pela `
            + 'nota fiscal (esta entrada é anterior ao registro do saldo original) — confira.'
          : ''),
        estimados.length ? 'error' : 'success',
      )
      await recarregarTudo()
    } catch (err) {
      avisar(err.message, 'error')
    } finally {
      setEstornando(false)
    }
  }

  const aposFinanciamento = async (resposta) => {
    setModal(null)
    const fin = resposta.financiamento
    const contaDivida = resposta.conta_divida

    // A conta de dívida nasce direto no banco, fora do estado React — antes disso ela só
    // aparecia depois de um full-load, o que fazia parecer que o endpoint não a criava.
    // O id vem do backend de propósito: assim o upsert do sync cai na linha que já existe em
    // vez de criar uma segunda conta.
    if (contaDivida?.id && !accountsRef.current.some(a => a.id === contaDivida.id)) {
      addAccount({
        id: contaDivida.id,
        name: contaDivida.name,
        type: contaDivida.type,
        balance: contaDivida.balance,
        creditDebt: 0,
        creditMonthBill: 0,
      })
    }

    avisar(
      `Financiamento criado: ${fin.parcelas_criadas} parcelas e ${fin.agendamentos_criados} agendamentos.`
      + (contaDivida?.name ? ` Conta “${contaDivida.name}” disponível em Patrimônio › Dívidas.` : '')
      + ' Recarregue o app para ver os agendamentos nas outras telas.',
    )
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

  const temEntrada = (movimentacoes || []).some(
    m => m.tipo === 'entrada_venda' || m.tipo === 'entrada_trade_in',
  )

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

            {temEntrada && (
              <TradeInResumo
                movimentacoes={movimentacoes}
                saldoBem={bem.saldo}
                contas={accounts}
                estornando={estornando}
                onEstornar={() => setConfirmandoEstorno(true)}
              />
            )}

            {movimentacoes !== null && !temEntrada && !bem.foi_vendido && (
              <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-400">Nenhuma entrada registrada neste bem.</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Vincule as transferências da entrada e, se houve troca, o bem antigo — a
                    perda ou o ganho é calculado sozinho.
                  </p>
                </div>
                <button
                  className="btn-primary text-xs py-1.5 px-3 shrink-0 flex items-center gap-1.5"
                  onClick={() => setModal('entrada')}
                >
                  <Wallet size={13} /> Registrar entrada
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

      <ConfirmDialog
        open={confirmandoEstorno}
        onClose={() => setConfirmandoEstorno(false)}
        onConfirm={estornar}
        danger
        title="Estornar a entrada?"
        confirmLabel="Estornar"
        message={
          'Isto desfaz a entrada inteira deste bem: o bem dado na troca volta ao saldo que '
          + 'tinha e deixa de constar como vendido, o lançamento de perda/ganho é apagado e as '
          + 'transferências são desvinculadas. As transferências em si NÃO são apagadas — elas '
          + 'continuam no Extrato, porque são movimentações bancárias reais.'
          + (financiamento
            ? ' Atenção: este bem já tem financiamento, e ele foi dimensionado a partir desta '
              + 'entrada. Estornar agora deixa os dois valores incoerentes até você refazer a entrada.'
            : '')
        }
      />

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
