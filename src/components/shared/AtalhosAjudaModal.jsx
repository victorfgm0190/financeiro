import Modal from './Modal'
import Teclas from './Teclas'
import { useAtalhos } from '../../context/atalhosHooks'
import { ATALHOS_FIXOS, CONTEXTOS } from '../../lib/atalhos/registry'

// Shift+? — atalhos válidos AGORA (ações com handler montado na tela/modal atual) + os fixos.
export default function AtalhosAjudaModal() {
  const ctx = useAtalhos()
  const ajuda = ctx?.ajuda
  if (!ajuda) return null
  const comAtalho = ajuda.acoes.filter(a => ctx.mapa[a.id])
  const grupos = CONTEXTOS
    .map(c => ({ ...c, acoes: comAtalho.filter(a => a.contexto === c.id) }))
    .filter(g => g.acoes.length)
  return (
    <Modal open onClose={ctx.fecharAjuda} title="Atalhos de teclado">
      <div className="space-y-4">
        {!grupos.length && (
          <p className="text-sm text-texto-2">Nenhum atalho configurável disponível {ajuda.emModal ? 'neste modal' : 'nesta tela'}.</p>
        )}
        {grupos.map(g => (
          <div key={g.id}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-3 mb-1.5">{g.label}</h3>
            <ul className="divide-y divide-borda">
              {g.acoes.map(a => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="text-sm text-texto-1">{a.label}</span>
                  <Teclas combinacao={ctx.mapa[a.id]} />
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-3 mb-1.5">Fixos</h3>
          <ul className="divide-y divide-borda">
            {ATALHOS_FIXOS.map(f => (
              <li key={f.combinacao} className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-sm text-texto-2">{f.label}</span>
                <Teclas combinacao={f.combinacao} />
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-texto-3">
          Para mudar, vá em <a href="#config/cadastros/atalhos" onClick={ctx.fecharAjuda} className="text-primary-fg hover:underline">Configurações › Cadastros › Atalhos</a>.
        </p>
      </div>
    </Modal>
  )
}
