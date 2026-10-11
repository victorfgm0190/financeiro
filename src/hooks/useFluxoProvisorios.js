import { useCallback, useEffect, useState } from 'react'
import {
  fetchFluxoProvisorios, createFluxoProvisorio, updateFluxoProvisorioApi,
  deleteFluxoProvisorioApi, efetivarFluxoProvisorio,
} from '../lib/db'

// Lançamentos PROVISÓRIOS (fluxo_provisorios) — simulação compartilhada pelo relatório Fluxo de
// Caixa e pela tela Fluxo de Caixa Futuro: o que é criado numa aparece na outra. Não entram no
// estado global do app (data/localStorage/diff-sync); são lidos e gravados direto pelo endpoint.
// As funções lançam o erro do endpoint — quem chama decide como avisar.
export function useFluxoProvisorios() {
  const [provisorios, setProvisorios] = useState([])

  useEffect(() => {
    let vivo = true
    fetchFluxoProvisorios()
      .then(lista => { if (vivo) setProvisorios(lista) })
      // Falha aqui não pode derrubar a tela: sem provisórios o fluxo é exatamente o de antes.
      .catch(err => console.error('[FluxoCaixa] provisórios:', err.message))
    return () => { vivo = false }
  }, [])

  // Cria (sem id) ou atualiza (com id). Devolve o registro gravado.
  const salvarProvisorio = useCallback(async (payload) => {
    if (payload.id) {
      const atualizado = await updateFluxoProvisorioApi(payload)
      setProvisorios(lista => lista.map(p => p.id === atualizado.id ? atualizado : p))
      return atualizado
    }
    const criado = await createFluxoProvisorio(payload)
    setProvisorios(lista => [...lista, criado])
    return criado
  }, [])

  const excluirProvisorio = useCallback(async (id) => {
    await deleteFluxoProvisorioApi(id)
    setProvisorios(lista => lista.filter(p => p.id !== id))
  }, [])

  // Efetivar como agendamento: o backend cria o agendamento único e apaga o provisório na MESMA
  // transação. Devolve o agendamento no formato do app (para espelhar no estado global).
  const efetivarComoAgendamento = useCallback(async (id) => {
    const { schedule } = await efetivarFluxoProvisorio(id)
    setProvisorios(lista => lista.filter(p => p.id !== id))
    return schedule
  }, [])

  return { provisorios, salvarProvisorio, excluirProvisorio, efetivarComoAgendamento }
}
