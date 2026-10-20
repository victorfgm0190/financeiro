// O que o cabeçalho do desktop mostra em cada página: seletores de perfil (chips / menu) e o período
// financeiro. Clientes Finup é da plataforma, não das finanças: nenhum dos dois se aplica.
const SEM_PERFIL = new Set(['clientes'])
const SEM_PERIODO = new Set(['schedule', 'clientes', 'contratos'])

export const cabecalhoDaPagina = (page) => ({ perfis: !SEM_PERFIL.has(page), periodo: !SEM_PERIODO.has(page) })
