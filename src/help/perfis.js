// Help de campo — PERFIS (Configurações › Perfis): cadastro de perfil (CPF/CNPJ) —
// src/components/Settings/SettingsPanel.jsx, data-help-form="perfil". Nada específico de um cliente.

export const campos = {
  'perfil.tipo': {
    titulo: 'Tipo',
    paraQueServe: 'Pessoa física ou jurídica. Define se o documento é CPF ou CNPJ.',
    relacaoComTela: 'Muda o rótulo e a máscara do campo de documento logo abaixo.',
    obrigatorio: true,
  },
  'perfil.nome': {
    titulo: 'Nome / razão social',
    paraQueServe: 'Nome do titular do perfil, mostrado nos filtros, selos e relatórios.',
    relacaoComTela: 'É por ele que você escolhe o perfil no topo da tela e no vínculo das contas.',
    obrigatorio: true,
    exemplo: 'Pessoal',
  },
  'perfil.documento': {
    titulo: 'Documento',
    paraQueServe: 'CPF ou CNPJ do titular, mostrado ao vincular contas a este perfil.',
    relacaoComTela: 'Aparece no seletor "Vínculo (CPF / CNPJ)" das contas, ao lado do nome. Opcional.',
    obrigatorio: false,
  },
  'perfil.cor': {
    titulo: 'Cor',
    paraQueServe: 'Cor que identifica o perfil nos selos e listas.',
    relacaoComTela: 'Só aparência: ajuda a distinguir de relance os lançamentos e contas de cada perfil.',
    obrigatorio: false,
  },
  'perfil.principal': {
    titulo: 'Perfil principal',
    paraQueServe: 'Marca este perfil como o principal.',
    relacaoComTela: 'Só um perfil é principal: ao salvar, o anterior deixa de ser. Na lista de perfis ele ganha o selo "Principal".',
    obrigatorio: false,
  },
}

export const formularios = {}
