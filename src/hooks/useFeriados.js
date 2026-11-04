import { useCallback, useEffect, useRef, useState } from 'react'
import { listarFeriadosApi, alternarFeriadoAutomaticoApi, criarFeriadoApi, atualizarFeriadoApi, excluirFeriadoApi } from '../lib/feriadosApi'

// Cadastro de feriados do cliente (Configurações → Cadastros → Feriados), lido de /api/feriados ao
// conectar. `antesDeMudar(cadastroAtual)`: chamado ANTES de cada alteração — o AppContext grava o
// orçamento dos ciclos encerrados dos envelopes diários com os feriados de antes.
export function useFeriados({ dbConectado, antesDeMudar }) {
  const [feriados, setFeriados] = useState([])
  const [carregados, setCarregados] = useState(false)
  const ref = useRef([])
  const antesRef = useRef(antesDeMudar)
  useEffect(() => { antesRef.current = antesDeMudar })
  useEffect(() => {
    if (!dbConectado || carregados) return
    let vivo = true
    listarFeriadosApi()
      .then(rows => { if (vivo) { ref.current = rows; setFeriados(rows); setCarregados(true) } })
      .catch(err => console.warn('[feriados] falha ao carregar:', err.message))
    return () => { vivo = false }
  }, [dbConectado, carregados])

  const aplicar = (fn) => { ref.current = fn(ref.current); setFeriados(ref.current) }
  const trocar = (row) => aplicar(prev => (prev.some(x => x.id === row.id) ? prev.map(x => (x.id === row.id ? row : x)) : [...prev, row]))
  const antes = () => antesRef.current?.(ref.current)

  const alternarFeriadoAutomatico = useCallback(async (chave, ativo) => {
    antes()
    trocar(await alternarFeriadoAutomaticoApi(chave, ativo))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const criarFeriado = useCallback(async (f) => {
    antes()
    const row = await criarFeriadoApi(f)
    trocar(row)
    return row
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const atualizarFeriado = useCallback(async (f) => {
    antes()
    trocar(await atualizarFeriadoApi(f))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const excluirFeriado = useCallback(async (id) => {
    antes()
    await excluirFeriadoApi(id)
    aplicar(prev => prev.filter(x => x.id !== id))
  }, [])

  return { feriados, feriadosCarregados: carregados, alternarFeriadoAutomatico, criarFeriado, atualizarFeriado, excluirFeriado }
}
