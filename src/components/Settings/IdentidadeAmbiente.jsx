import { useState } from 'react'
import { Save } from 'lucide-react'
import { useApp } from '../../context/AppContext'

// Configurações › Geral › Identidade do ambiente: de quem é o sistema e a frase dos relatórios.
// Gravado em configuracoes.rodape_titulo / rodape_frase (sync de configurações, como as demais).
// Aparece no rodapé da barra lateral e no cabeçalho dos relatórios exportados para Excel; nome vazio
// nos relatórios = nome do usuário logado; frase vazia = a linha some.
export default function IdentidadeAmbiente({ somenteLeitura = false }) {
  const { settings, updateSettings, usuario } = useApp()
  const [nome, setNome] = useState(settings?.rodapeTitulo || '')
  const [frase, setFrase] = useState(settings?.rodapeFrase || '')
  const [salvo, setSalvo] = useState(false)
  const mudou = nome.trim() !== String(settings?.rodapeTitulo || '').trim() || frase.trim() !== String(settings?.rodapeFrase || '').trim()

  const salvar = (e) => {
    e.preventDefault()
    if (somenteLeitura) return
    updateSettings({ rodapeTitulo: nome.trim() || null, rodapeFrase: frase.trim() || null })
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  return (
    <form className="card space-y-4" onSubmit={salvar}>
      <div>
        <h2 className="text-sm font-semibold text-texto-2 mb-1">Identidade do ambiente</h2>
        <p className="text-xs text-texto-3">
          Aparece no rodapé da barra lateral e no cabeçalho dos relatórios exportados para Excel.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="ident-nome">Nome do ambiente</label>
        <input id="ident-nome" className="input" maxLength={120} value={nome} onChange={e => setNome(e.target.value)}
          placeholder="De quem é o sistema" disabled={somenteLeitura} />
        <p className="text-xs text-texto-3 mt-1">
          Vazio: os relatórios usam o nome do usuário logado{usuario?.nome ? ` (${usuario.nome})` : ''}.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="ident-frase">Frase do ambiente (opcional)</label>
        <input id="ident-frase" className="input" maxLength={160} value={frase} onChange={e => setFrase(e.target.value)}
          placeholder="Frase exibida nos relatórios" disabled={somenteLeitura} />
        <p className="text-xs text-texto-3 mt-1">Vazia: a linha da frase não aparece.</p>
      </div>
      {!somenteLeitura && (
        <div className="flex justify-end">
          <button type="submit" className="btn-primary flex items-center gap-2" disabled={!mudou && !salvo}>
            <Save size={14} /> {salvo ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      )}
    </form>
  )
}
