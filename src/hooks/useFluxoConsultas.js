import { useCallback, useEffect, useState } from 'react'
import { fetchFluxoConsultas, createFluxoConsulta, updateFluxoConsultaApi, deleteFluxoConsultaApi } from '../lib/db'
import { normalizarConsulta } from '../lib/fluxoConsultas'

// Consultas salvas (fluxo_consultas) da tela Fluxo de Caixa Futuro. Só essa tela usa, então
// ficam fora do estado global: lidas e gravadas direto pelo endpoint, state após sucesso.
export function useFluxoConsultas() {
  const [consultas, setConsultas] = useState([])
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    let vivo = true
    fetchFluxoConsultas()
      .then(lista => { if (vivo) setConsultas(lista.map(normalizarConsulta)) })
      // Sem consultas a tela usa a virtual "FC Principal" — o comportamento de antes.
      .catch(err => console.error('[FluxoCaixa] consultas:', err.message))
      .finally(() => { if (vivo) setCarregado(true) })
    return () => { vivo = false }
  }, [])

  // Cria (sem id) ou atualiza. Marcar como padrão desmarca as outras (o banco faz o mesmo).
  const salvarConsulta = useCallback(async (payload) => {
    const row = normalizarConsulta(payload.id ? await updateFluxoConsultaApi(payload) : await createFluxoConsulta(payload))
    setConsultas(lista => {
      const outras = lista.filter(c => c.id !== row.id).map(c => (row.padrao && c.padrao ? { ...c, padrao: false } : c))
      return [...outras, row]
    })
    return row
  }, [])

  const excluirConsulta = useCallback(async (id) => {
    await deleteFluxoConsultaApi(id)
    setConsultas(lista => lista.filter(c => c.id !== id))
  }, [])

  return { consultas, carregado, salvarConsulta, excluirConsulta }
}
