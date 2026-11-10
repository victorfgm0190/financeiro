// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'

// Configurações → Backup: quem pode, prévia da restauração (avisos, quantidades, textos do que é
// substituído e mantido), confirmação digitando RESTAURAR, conferência e o backup ao sair só no computador.
const sessao = vi.hoisted(() => ({ atual: { id: 'u1', nivel: 'admin', perfis: 'todos', ambSigla: 'teste1' } }))
const cliente = vi.hoisted(() => ({
  exportarBackup: vi.fn(), baixarArquivo: vi.fn(), lerArquivoBackup: vi.fn(), previaRestauracao: vi.fn(),
  restaurarBackup: vi.fn(), conferirComArquivo: vi.fn(),
}))
const mobile = vi.hoisted(() => ({ v: false }))
vi.mock('../../lib/backupCliente', () => cliente)
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.v }))
vi.mock('../../hooks/useBackupLocal', () => ({
  useBackupLocal: () => ({ cfg: { pasta: null, perguntar: null, manter: 10, ultimo: null }, atualizar: vi.fn(), sessao: sessao.atual }),
  podeFazerBackup: (s) => s?.nivel === 'admin' && s?.perfis === 'todos',
}))
const { default: BackupPanel } = await import('./BackupPanel.jsx')

const ARQ = {
  manifesto: { ambiente: 'vm', geradoEm: '2026-11-10T12:00:00Z', appHash: 'abc1234', schema: { ultima: 'm1' },
    tabelas: { lancamentos: { linhas: 4743 }, contas: { linhas: 71 } } },
  tabelas: {},
}
const PREVIA = {
  versao: { recusar: [], semMigracoes: ['m2'], colunasPadrao: [], tabelasVazias: [] },
  atuais: { lancamentos: 120, contas: 9, contratos: 2 },
  perfisSomem: [{ id: 'u9', nome: 'Restrito', restam: 0 }],
  agenda: { assinaturas: 1 },
  destino: { ambiente: 'teste1', ultima: 'm2' },
}
const escolher = (rotulo) => {
  const input = screen.getByText(rotulo).closest('label').querySelector('input[type=file]')
  fireEvent.change(input, { target: { files: [new File(['{}'], 'b.json')] } })
}

beforeEach(() => {
  mobile.v = false
  sessao.atual = { id: 'u1', nivel: 'admin', perfis: 'todos', ambSigla: 'teste1' }
  Object.values(cliente).forEach(f => f.mockReset())
})
afterEach(cleanup)

describe('Backup (Configurações)', () => {
  it('sem ser admin com todos os perfis: só a explicação, sem botões', () => {
    sessao.atual = { id: 'u2', nivel: 'admin', perfis: ['p1'] }
    render(<BackupPanel />)
    expect(screen.getByText(/só administrador com acesso a todos os perfis/)).toBeTruthy()
    expect(screen.queryByText('Exportar backup completo')).toBeNull()
  })

  it('computador mostra o backup ao sair (navegador sem pasta explica Downloads); celular não', () => {
    render(<BackupPanel />)
    expect(screen.getByText(/Backup ao sair/)).toBeTruthy()
    expect(screen.getByText(/não permite escolher uma pasta.*Downloads/)).toBeTruthy()
    cleanup()
    mobile.v = true
    render(<BackupPanel />)
    expect(screen.queryByText(/Backup ao sair/)).toBeNull()
    expect(screen.getByText('Exportar backup completo')).toBeTruthy()
  })

  it('restaurar: prévia com origem, versão, quantidades e avisos; só libera com RESTAURAR; termina com a conferência', async () => {
    cliente.lerArquivoBackup.mockResolvedValue({ arquivo: ARQ })
    cliente.previaRestauracao.mockResolvedValue(PREVIA)
    cliente.restaurarBackup.mockResolvedValue({ tempoMs: 4200, conferencia: [{ tabela: 'contas', arquivo: { linhas: 71 }, banco: { linhas: 71 }, ok: true }, { tabela: 'lancamentos', arquivo: { linhas: 4743 }, banco: { linhas: 4743 }, ok: true }], perfisSomem: [{ id: 'u9', nome: 'Restrito', restam: 0 }] })
    const aoRestaurar = vi.fn()
    render(<BackupPanel aoRestaurar={aoRestaurar} />)
    escolher('Restaurar backup')
    const dialogo = await screen.findByRole('dialog')
    const d = within(dialogo)
    expect(d.getByText(/ambiente VM · gerado em/)).toBeTruthy()
    expect(d.getByText(/não tinha a atualização m2/)).toBeTruthy()
    expect(d.getByText(/Restrito — fica sem nenhum perfil/)).toBeTruthy()
    expect(d.getByText(/1 assinatura da Agenda no celular/)).toBeTruthy()
    expect(d.getByText('4.743')).toBeTruthy()
    expect(d.getByText(/O que não estiver no arquivo deixa de existir/)).toBeTruthy()
    expect(d.getByText(/Fica como está: usuários, senhas e acessos; o título e a frase do rodapé/)).toBeTruthy()
    const botao = d.getByRole('button', { name: 'Restaurar' })
    expect(botao.disabled).toBe(true)
    fireEvent.change(d.getByLabelText('Palavra de confirmação'), { target: { value: 'restaurar' } })
    expect(botao.disabled).toBe(true)
    fireEvent.change(d.getByLabelText('Palavra de confirmação'), { target: { value: 'RESTAURAR' } })
    expect(botao.disabled).toBe(false)
    fireEvent.click(botao)
    expect(await d.findByText(/Backup restaurado em 4 s/)).toBeTruthy()
    expect(d.getByText('Todas as 2 tabelas conferem')).toBeTruthy()
    expect(d.getByText(/Ajuste estes usuários/)).toBeTruthy()
    fireEvent.click(d.getByRole('button', { name: 'Recarregar o app' }))
    expect(aoRestaurar).toHaveBeenCalled()
  })

  it('versão mais nova: mostra o motivo e não oferece restaurar', async () => {
    cliente.lerArquivoBackup.mockResolvedValue({ arquivo: ARQ })
    cliente.previaRestauracao.mockResolvedValue({ ...PREVIA, versao: { ...PREVIA.versao, recusar: ['O arquivo é de uma versão mais nova do banco.'] } })
    render(<BackupPanel />)
    escolher('Restaurar backup')
    const d = within(await screen.findByRole('dialog'))
    expect(d.getByText(/Não dá para restaurar este arquivo aqui/)).toBeTruthy()
    expect(d.queryByRole('button', { name: 'Restaurar' })).toBeNull()
  })

  it('formato antigo: mensagem clara, nada é aberto', async () => {
    cliente.lerArquivoBackup.mockRejectedValue(new Error('Este arquivo é de uma versão antiga do backup do Finup.'))
    render(<BackupPanel />)
    escolher('Restaurar backup')
    expect((await screen.findByRole('alert')).textContent).toMatch(/versão antiga do backup/)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('conferir com um arquivo: tabela com diferentes primeiro, sem restaurar', async () => {
    cliente.lerArquivoBackup.mockResolvedValue({ arquivo: ARQ })
    cliente.conferirComArquivo.mockResolvedValue([
      { tabela: 'contas', arquivo: { linhas: 71 }, banco: { linhas: 71 }, ok: true },
      { tabela: 'lancamentos', arquivo: { linhas: 4743 }, banco: { linhas: 4744 }, ok: false },
    ])
    render(<BackupPanel />)
    escolher('Conferir com um arquivo')
    const d = within(await screen.findByRole('dialog'))
    expect(d.getByText('1 tabela diferente de 2')).toBeTruthy()
    const linhas = d.getAllByRole('row')
    expect(linhas[1].textContent).toMatch(/lancamentos.*diferente/)
    expect(cliente.restaurarBackup).not.toHaveBeenCalled()
  })

  it('exportar: progresso e download com o nome do arquivo', async () => {
    cliente.exportarBackup.mockImplementation(async ({ onProgresso }) => { onProgresso({ linhas: 5, totalLinhas: 10, tabela: 'lancamentos' }); return { texto: '{}', nome: 'finup-backup-teste1-2026-11-10-1830.json' } })
    render(<BackupPanel />)
    fireEvent.click(screen.getByText('Exportar backup completo'))
    expect(await screen.findByText(/Backup baixado: finup-backup-teste1-2026-11-10-1830.json/)).toBeTruthy()
    expect(cliente.baixarArquivo).toHaveBeenCalledWith('finup-backup-teste1-2026-11-10-1830.json', '{}')
  })
})
