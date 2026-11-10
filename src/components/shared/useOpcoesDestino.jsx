// Opções do seletor de CONTA DESTINO (SearchableSelect) agrupadas por perfil: o perfil atual primeiro
// e, abaixo, um bloco por outro perfil permitido, com o selo do perfil no cabeçalho. Dentro de cada
// bloco, a ordem dos Grupos de Contas de sempre. Um perfil só: lista de sempre, sem cabeçalhos.
// Regras em src/lib/contasPorPerfil.js.
import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { blocosDestinoPorPerfil } from '../../lib/contasPorPerfil'
import { perfilDaConta } from '../../lib/perfilConta'
import { buildAccountSelectOptions } from './utils'
import ProfileBadge from './ProfileBadge'

export function useOpcoesDestino({ accounts, accountGroups, excludeId = null, isMobile = false }) {
  const { profiles, activeProfileId } = useApp()
  return useMemo(() => {
    const blocos = blocosDestinoPorPerfil(accounts, profiles, activeProfileId, { excludeId, isMobile })
    if (blocos.length <= 1) {
      return { options: buildAccountSelectOptions(blocos[0]?.contas || [], accountGroups, { isMobile }), sections: null }
    }
    const options = []
    const sections = []
    for (const b of blocos) {
      for (const o of buildAccountSelectOptions(b.contas, accountGroups, { isMobile })) options.push({ ...o, section: b.key })
      const { rotulo, nomeCompleto } = perfilDaConta(b.contas[0], profiles)
      sections.push({
        key: b.key,
        label: (
          <span className="flex flex-wrap items-center gap-1.5" data-testid="destino-perfil">
            {b.perfil ? <ProfileBadge account={b.contas[0]} /> : null}
            <span>{b.perfil ? (nomeCompleto && nomeCompleto !== rotulo ? nomeCompleto : rotulo) : 'Contas sem perfil'}</span>
            {b.atual && <span className="font-normal text-texto-3">· perfil atual</span>}
          </span>
        ),
      })
    }
    return { options, sections }
  }, [accounts, accountGroups, profiles, activeProfileId, excludeId, isMobile])
}
