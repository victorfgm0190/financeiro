// Contexto que decide o que aparece no tour, no checklist e na ajuda (lib/ajudaTelas `mostrar`):
// as MESMAS regras do menu (podeVer), das permissões (pode … 'incluir'), do botão do Assistente e da
// chave do controle gerencial do ambiente.
import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { controleGerencialAtivo } from '../../lib/controleGerencial'

export function montarContextoAjuda({ podeVer, pode, settings }) {
  return {
    podeVer: (pagina) => !!podeVer?.(pagina),
    podeIncluir: (modulo) => !!pode?.(modulo, 'incluir'),
    pode: (modulo, acao = 'ver') => !!pode?.(modulo, acao),
    // Mesma condição do botão ✨ Assistente do cabeçalho (App.jsx podeAssistente).
    iaAtiva: !!pode?.('lancamentos', 'incluir'),
    gerencialAtivo: controleGerencialAtivo(settings),
  }
}

export function useContextoAjuda() {
  const { podeVer, pode, settings } = useApp()
  return useMemo(() => montarContextoAjuda({ podeVer, pode, settings }), [podeVer, pode, settings])
}
