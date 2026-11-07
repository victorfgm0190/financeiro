import { createContext } from 'react'

// Falha de validação do cadastro de contrato ({ campo, erro } ou null): o bloco cuja chave é `campo`
// fica destacado e mostra o erro junto dele (ContratoWizard rola até ele). Chaves: as do formulário
// (validarEtapaCampo), 'encargos' e 'taxa:<índice>' (cartão da tarifa/taxa da administradora).
export const CampoErroContext = createContext(null)

// Classe do destaque (borda vermelha) de um bloco com erro.
export const CLASSE_ERRO = 'rounded-lg ring-2 ring-perigo ring-offset-2 ring-offset-surface'
