import { describe, it, expect } from 'vitest'
import { CAMPOS, FORMULARIOS, ID_CAMPO, helpDoCampo, helpDoFormulario, telaDoCampo } from './index.js'
import { HELP_CAMPOS, textoHelpCampo } from '../lib/helpCampos.js'

// Base do help de campo (Etapa 1): estrutura, conteúdo completo de Contratos e Agendamentos e o
// adaptador antigo (src/lib/helpCampos.js) lendo daqui, sem texto duplicado.
// Etapa 6: todas as telas completas (npm run help:check limpo).
const COMPLETAS = ['contratos', 'agendamentos', 'contas', 'lancamentos', 'categorias', 'favorecidos', 'perfis', 'reservas', 'cadastros', 'patrimonio', 'fluxo', 'contratosAcoes', 'configuracoes', 'importar', 'operacoes', 'lancamentosModais', 'filtros', 'assistente', 'acesso']
const texto = (v) => typeof v === 'string' && v.trim().length > 0

describe('base do help de campo', () => {
  it('todo campo: id "tela.campo", título, para que serve e obrigatório; sem campos desconhecidos', () => {
    const permitidos = new Set(['titulo', 'paraQueServe', 'relacaoComTela', 'oQueAconteceAoSalvar', 'obrigatorio', 'quandoUsar', 'atencao', 'exemplo', 'pendente'])
    for (const [id, c] of Object.entries(CAMPOS)) {
      expect(id, id).toMatch(ID_CAMPO)
      expect(texto(c.titulo), `${id}.titulo`).toBe(true)
      expect(texto(c.paraQueServe), `${id}.paraQueServe`).toBe(true)
      expect(typeof c.obrigatorio, `${id}.obrigatorio`).toBe('boolean')
      expect(Object.keys(c).filter(k => !permitidos.has(k)), id).toEqual([])
    }
  })

  it('todas as telas completas: relação com a tela em todos, nada pendente', () => {
    const ids = Object.keys(CAMPOS).filter(id => COMPLETAS.includes(telaDoCampo(id)))
    expect(ids.length).toBeGreaterThan(100 - 40)
    for (const id of ids) {
      expect(texto(CAMPOS[id].relacaoComTela), `${id}.relacaoComTela`).toBe(true)
      expect(CAMPOS[id].pendente, id).toBeUndefined()
    }
    // Modo administradora, composição e conferência do extrato estão cobertos.
    for (const id of ['contrato.modoRepasse', 'contrato.diaRepasse', 'contrato.taxaAdmPct', 'contrato.categoriaTaxaAdm', 'contratoTaxa.formaDesconto',
      'repasseComposicao.valorItem', 'repasseComposicao.fechada', 'conferenciaExtrato.arquivo', 'conferenciaExtrato.total', 'conferenciaExtrato.diferencaRepasse']) {
      expect(helpDoCampo(id), id).toBeTruthy()
    }
  })

  it('formulários: objetivo, pré-requisitos, ordem de campos existentes e resumo ao salvar', () => {
    for (const f of ['contrato', 'contratoTaxa', 'repasseComposicao', 'conferenciaExtrato', 'agendamento', 'registrarAgendamento']) {
      const h = helpDoFormulario(f)
      expect(h, f).toBeTruthy()
      expect(texto(h.objetivo) && texto(h.resumoAoSalvar), f).toBe(true)
      expect(Array.isArray(h.preRequisitos), f).toBe(true)
      for (const p of h.preRequisitos) expect(texto(p.id) && texto(p.texto), f).toBe(true)
      expect(h.ordemCampos.length, f).toBeGreaterThan(0)
      for (const id of h.ordemCampos) expect(CAMPOS[id], `${f} → ${id}`).toBeTruthy()
      expect(new Set(h.ordemCampos).size, f).toBe(h.ordemCampos.length)
    }
    expect(Object.keys(FORMULARIOS).length).toBeGreaterThanOrEqual(6)
  })

  it('adaptador antigo lê da base nova: o texto do ⓘ é o paraQueServe', () => {
    expect(textoHelpCampo('contrato.modalidade')).toBe(CAMPOS['contrato.modalidade'].paraQueServe)
    expect(HELP_CAMPOS.agendamento.amount).toBe(CAMPOS['agendamento.amount'].paraQueServe)
    expect(HELP_CAMPOS.cartao.fechamento).toBe(CAMPOS['cartao.fechamento'].paraQueServe)
    expect(textoHelpCampo('nada.disso')).toBe('')
    expect(Object.values(HELP_CAMPOS).reduce((s, o) => s + Object.keys(o).length, 0)).toBe(Object.keys(CAMPOS).length)
  })
})
