import Modal from '../shared/Modal'

// Aviso do "Sair" com alterações ainda não enviadas (useSair). "Sincronizar e sair" é o padrão
// (foco inicial); sem internet fica desabilitado e diz "Sem internet". Sair não apaga nada do aparelho.
function textoPendenciasAoSair(n) {
  return n === 1
    ? 'Existe 1 alteração ainda não enviada para a nuvem. Se sair agora, ela fica guardada neste aparelho e será enviada quando você entrar de novo aqui.'
    : `Existem ${n} alterações ainda não enviadas para a nuvem. Se sair agora, elas ficam guardadas neste aparelho e serão enviadas quando você entrar de novo aqui.`
}

export default function AvisoSairModal({ aberto, pendentes, online, saindo, erro, sincronizarESair, sairMesmoAssim, cancelar }) {
  return (
    <Modal open={aberto} onClose={cancelar} title="Alterações não enviadas" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-texto-1">{textoPendenciasAoSair(pendentes)}</p>
        {erro && <p role="alert" className="text-xs text-perigo">{erro}</p>}
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={cancelar} disabled={saindo}>Cancelar</button>
          <button type="button" className="btn-secondary" onClick={sairMesmoAssim} disabled={saindo}>Sair mesmo assim</button>
          <button
            type="button"
            className="btn-primary disabled:opacity-40"
            onClick={sincronizarESair}
            disabled={!online || saindo}
            autoFocus={online}
          >
            {!online ? 'Sem internet' : saindo ? 'Sincronizando…' : 'Sincronizar e sair'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
