import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { textoAtualizadoHa } from '../../lib/recargaRemota'

// "Atualizado há X min" desde a última carga (ou checagem) do banco. Relógio local, sem rede.
export default function AtualizadoHa({ className = '' }) {
  const { ultimaCarga } = useApp()
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  const texto = textoAtualizadoHa(ultimaCarga, Math.max(agora, ultimaCarga || 0))
  if (!texto) return null
  return <span className={className}>{texto}</span>
}
