import { CloudOff } from 'lucide-react'
import { useApp } from '../../context/AppContext'

// Telas que dependem do servidor (importações, Clientes): sem internet, um aviso no lugar delas.
export default function SoComInternet({ titulo, children }) {
  const { dbStatus } = useApp()
  if (dbStatus !== 'local') return children
  return (
    <div className="card text-center py-12">
      <CloudOff size={32} className="text-aviso mx-auto mb-3" />
      <p className="text-texto-1 font-medium">{titulo} — disponível só com internet</p>
      <p className="text-xs text-texto-3 mt-1">Conecte-se para usar esta tela. O resto do app continua funcionando e guarda suas alterações no aparelho.</p>
    </div>
  )
}
