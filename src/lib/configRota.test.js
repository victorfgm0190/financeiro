import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CONFIG_ABAS, parseConfigHash, configHash, ehHashConfig } from './configRota'

const ler = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')

describe('rota de Configurações no hash', () => {
  it('lê aba e seção do hash', () => {
    expect(parseConfigHash('#config/cadastros/categorias')).toEqual({ aba: 'cadastros', secao: 'categorias' })
    expect(parseConfigHash('#config/perigo/zona-perigo')).toEqual({ aba: 'perigo', secao: 'zona-perigo' })
  })

  it('cai na primeira aba/seção quando falta ou não existe', () => {
    expect(parseConfigHash('')).toEqual({ aba: 'geral', secao: 'periodo' })
    expect(parseConfigHash('#config')).toEqual({ aba: 'geral', secao: 'periodo' })
    expect(parseConfigHash('#config/regras')).toEqual({ aba: 'regras', secao: 'classificacao' })
    expect(parseConfigHash('#config/xyz/abc')).toEqual({ aba: 'geral', secao: 'periodo' })
    expect(parseConfigHash('#config/dados/categorias')).toEqual({ aba: 'dados', secao: 'backup' })
  })

  it('ida e volta', () => {
    for (const a of CONFIG_ABAS) for (const s of a.secoes) {
      expect(parseConfigHash(configHash(a.id, s.id))).toEqual({ aba: a.id, secao: s.id })
    }
  })

  it('só reconhece hash de Configurações', () => {
    expect(ehHashConfig('#config/geral/periodo')).toBe(true)
    expect(ehHashConfig('#config')).toBe(true)
    expect(ehHashConfig('#configuracoes')).toBe(false)
    expect(ehHashConfig('#outra')).toBe(false)
    expect(ehHashConfig('')).toBe(false)
  })

  it('estrutura e ordem das abas', () => {
    expect(CONFIG_ABAS.map(a => a.id)).toEqual(['geral', 'cadastros', 'regras', 'dados', 'perigo'])
    expect(CONFIG_ABAS.map(a => a.secoes.map(s => s.id))).toEqual([
      ['periodo', 'estornos', 'perfis'],
      ['categorias', 'centros-custo', 'grupos-contas', 'controle-gerencial', 'favorecidos'],
      ['classificacao', 'grupo-gerencial'],
      ['backup', 'importacao', 'manutencao'],
      ['zona-perigo'],
    ])
  })
})

describe('nenhuma seção sumiu da tela Configurações', () => {
  const painel = ler('../components/Settings/SettingsPanel.jsx')
  const dindin = ler('../components/Settings/DindinImportPanel.jsx')

  it('toda seção do menu tem um bloco renderizado no painel', () => {
    for (const a of CONFIG_ABAS) for (const s of a.secoes) {
      expect(painel, `seção ${a.id}/${s.id}`).toContain(`secao === '${s.id}' &&`)
    }
  })

  it('as 13 seções que existiam antes continuam lá', () => {
    const antes = [
      'Período Financeiro', 'Estornos de Cartão', 'Perfis CPF / CNPJ', 'Categorias (',
      'Regras de Classificação (', 'Regras de Grupo Gerencial (', 'Centros de Custo', 'Grupos de Contas',
      'Controle Gerencial de Cartão', 'Backup de Dados', 'Manutenção', 'Zona de Perigo',
    ]
    for (const t of antes) expect(painel, t).toContain(t)
    expect(painel).toContain('<DindinImportPanel />')
    expect(dindin).toContain('Importação Dindin')
  })
})
