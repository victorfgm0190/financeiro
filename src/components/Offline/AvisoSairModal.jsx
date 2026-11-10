import Modal from '../shared/Modal'

// Aviso do "Sair" com alterações ainda não enviadas (useSair). "Sincronizar e sair" é o padrão
// (foco inicial); sem internet fica desabilitado e diz "Sem internet". Sair não apaga nada do aparelho.
// Junto: a pergunta do backup ao sair (só no computador — useSair decide quando abrir).
function textoPendenciasAoSair(n) {
  return n === 1
    ? 'Existe 1 alteração ainda não enviada para a nuvem. Se sair agora, ela fica guardada neste aparelho e será enviada quando você entrar de novo aqui.'
    : `Existem ${n} alterações ainda não enviadas para a nuvem. Se sair agora, elas ficam guardadas neste aparelho e serão enviadas quando você entrar de novo aqui.`
}

const ERROS = {
  permissao: 'O navegador não liberou a gravação na pasta de backup.',
  pasta: 'A pasta de backup não está mais disponível (foi movida, renomeada ou apagada).',
  backup: 'Não foi possível fazer o backup.',
}

export function BackupAoSairModal({ estado, suporte, nomePasta, sim, nao, tentarDeNovo, outraPasta, baixar, sairSemBackup, cancelar }) {
  if (!estado) return null
  const { fase, tipo, mensagem, prog } = estado
  const pct = prog?.totalLinhas ? Math.min(100, Math.round((prog.linhas / prog.totalLinhas) * 100)) : 0
  return (
    <Modal open onClose={cancelar} title="Backup antes de sair" size="sm">
      <div className="space-y-4 text-sm">
        {fase === 'pergunta' && (
          <>
            <p className="text-texto-1">Deseja fazer backup antes de sair?</p>
            <p className="text-xs text-texto-2">{nomePasta && suporte ? `O arquivo vai para a pasta ${nomePasta}.` : 'O arquivo é baixado para a pasta Downloads.'}</p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" className="btn-secondary min-h-[40px]" onClick={cancelar}>Cancelar</button>
              <button type="button" className="btn-secondary min-h-[40px]" onClick={nao}>Não, só sair</button>
              <button type="button" className="btn-primary min-h-[40px]" onClick={sim} autoFocus>Sim, fazer backup</button>
            </div>
          </>
        )}
        {fase === 'progresso' && (
          <div className="space-y-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progresso do backup">
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
            <p className="text-xs text-texto-2">Fazendo o backup{prog?.tabela ? ` (${prog.tabela})` : ''}… {pct}%. Depois o Finup sai sozinho.</p>
          </div>
        )}
        {fase === 'erro' && (
          <>
            <p role="alert" className="text-perigo">{ERROS[tipo] || ERROS.backup}</p>
            {mensagem && <p className="text-xs text-texto-2 break-words">{mensagem}</p>}
            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" className="btn-secondary min-h-[40px]" onClick={cancelar}>Cancelar</button>
              <button type="button" className="btn-secondary min-h-[40px]" onClick={sairSemBackup}>Sair sem backup</button>
              {tipo === 'backup'
                ? <button type="button" className="btn-primary min-h-[40px]" onClick={tentarDeNovo}>Tentar de novo</button>
                : (
                  <>
                    <button type="button" className="btn-secondary min-h-[40px]" onClick={baixar}>Baixar para Downloads</button>
                    {suporte && <button type="button" className="btn-primary min-h-[40px]" onClick={outraPasta}>Escolher outra pasta</button>}
                  </>
                )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export default function AvisoSairModal({ aberto, pendentes, online, saindo, erro, sincronizarESair, sairMesmoAssim, cancelar, backup }) {
  return (
    <>
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
      {backup && <BackupAoSairModal {...backup} />}
    </>
  )
}
