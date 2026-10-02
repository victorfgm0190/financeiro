// Abas e seções da tela Configurações e a rota delas no hash da URL (#config/<aba>/<seção>).
// O hash é o que faz a aba/seção sobreviver ao reload e o que permite abrir uma parte específica
// de Configurações por link (<a href="#config/cadastros/categorias">).

export const CONFIG_ABAS = [
  {
    id: 'geral', label: 'Geral',
    secoes: [
      { id: 'periodo', label: 'Período financeiro' },
      { id: 'estornos', label: 'Estorno de cartão' },
      { id: 'perfis', label: 'Perfis' },
    ],
  },
  {
    id: 'cadastros', label: 'Cadastros',
    secoes: [
      { id: 'categorias', label: 'Categorias' },
      { id: 'centros-custo', label: 'Centros de custo' },
      { id: 'grupos-contas', label: 'Grupos de contas' },
      { id: 'controle-gerencial', label: 'Controle gerencial' },
      { id: 'favorecidos', label: 'Favorecidos', novo: true },
    ],
  },
  {
    id: 'regras', label: 'Regras',
    secoes: [
      { id: 'classificacao', label: 'Regras de classificação' },
      { id: 'grupo-gerencial', label: 'Regras de grupo gerencial' },
    ],
  },
  {
    id: 'dados', label: 'Dados',
    secoes: [
      { id: 'backup', label: 'Backup' },
      { id: 'importacao', label: 'Importação' },
      { id: 'manutencao', label: 'Manutenção' },
    ],
  },
  {
    id: 'perigo', label: 'Zona de perigo', perigo: true,
    secoes: [{ id: 'zona-perigo', label: 'Zona de perigo' }],
  },
]

export const CONFIG_HASH_PREFIX = '#config'

export const ehHashConfig = (hash) =>
  typeof hash === 'string' && (hash === CONFIG_HASH_PREFIX || hash.startsWith(`${CONFIG_HASH_PREFIX}/`))

// Hash → { aba, secao } sempre válidos: aba desconhecida cai na primeira; seção desconhecida (ou
// ausente) cai na primeira da aba.
export function parseConfigHash(hash) {
  const partes = ehHashConfig(hash) ? hash.slice(CONFIG_HASH_PREFIX.length + 1).split('/') : []
  const aba = CONFIG_ABAS.find(a => a.id === partes[0]) || CONFIG_ABAS[0]
  const secao = aba.secoes.find(s => s.id === partes[1]) || aba.secoes[0]
  return { aba: aba.id, secao: secao.id }
}

export const configHash = (aba, secao) => `${CONFIG_HASH_PREFIX}/${aba}/${secao}`

export const abaDe = (abaId) => CONFIG_ABAS.find(a => a.id === abaId) || CONFIG_ABAS[0]
