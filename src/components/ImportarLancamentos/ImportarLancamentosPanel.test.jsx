import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToString } from 'react-dom/server'
import { pode, podeVerPagina, moduloDaPagina } from '../../lib/permissoes'

// Acesso à tela "Importar lançamentos" por nível, renderizada sem navegador (useApp simulado com o
// `pode` de verdade de permissoes.js).
let usuario = null
vi.mock('../../context/AppContext', () => ({
  useApp: () => ({
    profileAccounts: [{ id: 'c1', name: 'Conta Corrente', type: 'checking' }],
    transactions: [], categories: [], payees: [], gerencialGroups: [],
    pode: (modulo, acao = 'ver') => pode(usuario, modulo, acao),
    addTransaction: () => {}, deleteTransaction: () => {}, addCategory: () => {}, addPayees: () => {}, recalcularSaldo: () => {},
  }),
}))
const { default: ImportarLancamentosPanel, ListaLotes } = await import('./ImportarLancamentosPanel')

const U = {
  admin: { nivel: 'admin' },
  operador: { nivel: 'operador' },
  consulta: { nivel: 'consulta' },
  soIncluir: { nivel: 'personalizado', permissoes: { lancamentos: { ver: true, incluir: true } } },
  soExcluir: { nivel: 'personalizado', permissoes: { lancamentos: { ver: true, excluir: true } } },
  soVer: { nivel: 'personalizado', permissoes: { lancamentos: { ver: true } } },
  nada: { nivel: 'personalizado', permissoes: {} },
}
const LOTE = { id: 'L1', conta_id: 'c1', formato: 'xlsx', arquivo: 'a.xlsx', qtd: 2, gravados: 2, total_entradas: 10, total_saidas: 5, status: 'concluida', criado_em: '2026-10-18T10:00:00Z' }

const tela = () => renderToString(<ImportarLancamentosPanel />)
// A lista de lotes como o painel a monta, com o podeExcluir do usuário.
const lista = (u) => renderToString(<ListaLotes lotes={[LOTE]} erroLotes="" nomeConta={() => 'Conta Corrente'}
  podeExcluir={pode(u, 'lancamentos', 'excluir')} ocupado={false} onRecarregar={() => {}} onDesfazer={() => {}} />)

describe('Importar lançamentos — acesso por nível', () => {
  beforeEach(() => { usuario = null })

  it('a página pertence ao módulo lancamentos', () => {
    expect(moduloDaPagina('importar-lancamentos')).toBe('lancamentos')
  })

  it('consulta: vê a página no menu, mas só a mensagem — sem "Gerar Excel", "Importar" nem "Desfazer"', () => {
    expect(podeVerPagina(U.consulta, 'importar-lancamentos')).toBe(true)
    usuario = U.consulta
    const h = tela()
    expect(h).toContain('Seu nível de acesso não permite incluir lançamentos')
    expect(h).not.toContain('Gerar Excel')
    expect(h).not.toContain('Desfazer')
    expect(h).not.toContain('<button') // nenhum botão (nem "Importar N lançamentos")
    expect(h).not.toContain('<input') // nem escolher arquivo
  })

  it('personalizado sem incluir (só ver, ou só excluir): não importa', () => {
    for (const u of [U.soVer, U.soExcluir]) {
      usuario = u
      const h = tela()
      expect(h).toContain('Seu nível de acesso não permite incluir lançamentos')
      expect(h).not.toContain('Gerar Excel')
    }
  })

  it('personalizado sem nenhuma permissão em lançamentos: a página nem aparece no menu', () => {
    expect(podeVerPagina(U.nada, 'importar-lancamentos')).toBe(false)
  })

  it('quem pode incluir vê "Gerar Excel para preencher" e o envio do arquivo', () => {
    for (const u of [U.admin, U.operador, U.soIncluir]) {
      usuario = u
      const h = tela()
      expect(h).toContain('Gerar Excel para preencher')
      expect(h).not.toContain('Seu nível de acesso não permite')
    }
  })

  it('"Desfazer importação" só para quem pode excluir', () => {
    expect(lista(U.admin)).toContain('Desfazer importação')
    expect(lista(U.operador)).toContain('Desfazer importação')
    expect(lista(U.soIncluir)).not.toContain('Desfazer importação')
    expect(lista(U.soIncluir)).toContain('Concluída') // vê a lista, só não desfaz
  })
})

describe('saldo depois de importar/desfazer', () => {
  const ler = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')
  it('a tela só chama recalcularSaldo, que usa saldosDaConta de src/lib/saldos.js (nenhuma fórmula nova)', () => {
    const painel = ler('./ImportarLancamentosPanel.jsx')
    expect(painel).toContain('recalcularSaldo(')
    expect(painel).not.toMatch(/initialBalance|projectedBalance|\bbalance\s*[:=]/)
    const ctx = ler('../../context/AppContext.jsx')
    const corpo = ctx.slice(ctx.indexOf('const recalcularSaldo = useCallback'), ctx.indexOf('}, [update])', ctx.indexOf('const recalcularSaldo = useCallback')))
    expect(corpo).toContain('saldosDaConta(accountId, initBal, d.transactions)')
    expect(ctx).toMatch(/import \{[^}]*saldosDaConta[^}]*\} from '\.\.\/lib\/saldos'/)
  })
})
