// @vitest-environment jsdom
// Nova Conta × vínculo com perfil (CPF/CNPJ): perfil já marcado pelo filtro do topo (ou o único do
// ambiente), aviso de "Sem vínculo", cadastro rápido de perfil sem perder o digitado e aviso ao
// salvar sem vínculo com um perfil no filtro. Dados fictícios.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useApp } from '../../context/AppContext'
import AccountForm from './AccountForm'
import { AVISO_SEM_VINCULO, perfilPadraoDaContaNova, avisoContaForaDoFiltro } from '../../lib/textosVinculo'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

const PF = { id: 'p1', name: 'Pessoa Um', type: 'pf', document: '00000000001' }
const PJ = { id: 'p2', name: 'Empresa Dois', type: 'pj', document: '00000000000100' }
const GRUPOS = [{ id: 'g1', name: 'Conta Corrente', type: 'financeiro', order: 0 }]

function montar({ profiles = [PF, PJ], activeProfileId = null, initial = undefined } = {}) {
  const app = {
    accounts: [], accountGroups: GRUPOS, activeAccountGroups: GRUPOS, profiles, categories: [],
    addAccount: vi.fn(() => 'acc_novo'), updateAccount: vi.fn(), recalcularSaldo: vi.fn(), pode: () => true,
    activeProfileId, setAvisoToast: vi.fn(), addProfile: vi.fn(() => 'prf_novo'),
    activeProfileIdState: null, categoryGroupOrder: [],
  }
  useApp.mockReturnValue(app)
  const onClose = vi.fn()
  render(<AccountForm initial={initial} onClose={onClose} />)
  return { app, onClose }
}
const vinculo = () => screen.getByLabelText('Vínculo (CPF / CNPJ)')
const nome = (v) => fireEvent.change(screen.getByPlaceholderText('Digite o nome da conta'), { target: { value: v } })

describe('perfil padrão da conta nova', () => {
  it('o do filtro do topo; em "Tudo", o único perfil; senão Sem vínculo', () => {
    expect(perfilPadraoDaContaNova({ activeProfileId: 'p2', profiles: [PF, PJ] })).toBe('p2')
    expect(perfilPadraoDaContaNova({ activeProfileId: null, profiles: [PF] })).toBe('p1')
    expect(perfilPadraoDaContaNova({ activeProfileId: null, profiles: [PF, PJ] })).toBeNull()
    expect(perfilPadraoDaContaNova({ activeProfileId: 'apagado', profiles: [PF, PJ] })).toBeNull()
  })
  it('com um perfil no filtro, a conta nova já vem nele — e aparece na lista filtrada', () => {
    const { app } = montar({ activeProfileId: 'p2' })
    expect(vinculo().value).toBe('p2')
    expect(screen.queryByTestId('aviso-sem-vinculo')).toBeNull()
    nome('Conta Teste')
    fireEvent.click(screen.getByRole('button', { name: 'Criar Conta' }))
    expect(app.addAccount).toHaveBeenCalledTimes(1)
    expect(app.addAccount.mock.calls[0][0]).toMatchObject({ name: 'Conta Teste', profileId: 'p2' })
    expect(app.setAvisoToast).not.toHaveBeenCalled()
  })
  it('"Tudo" com um perfil só: já vem nele', () => {
    montar({ profiles: [PF] })
    expect(vinculo().value).toBe('p1')
  })
  it('editar não muda o vínculo gravado', () => {
    montar({ activeProfileId: 'p2', initial: { id: 'a1', name: 'X', type: 'checking', profileId: null } })
    expect(vinculo().value).toBe('')
  })
})

describe('aviso de Sem vínculo', () => {
  it('aparece logo abaixo do campo quando o vínculo é "Sem vínculo" e some ao escolher um perfil', () => {
    montar()
    expect(screen.getByTestId('aviso-sem-vinculo').textContent).toBe(AVISO_SEM_VINCULO)
    fireEvent.change(vinculo(), { target: { value: 'p1' } })
    expect(screen.queryByTestId('aviso-sem-vinculo')).toBeNull()
  })
  it('salvar Sem vínculo com um perfil no filtro: avisa que ela não aparece nesse filtro', () => {
    const { app } = montar({ activeProfileId: 'p1' })
    fireEvent.change(vinculo(), { target: { value: '' } })
    nome('Avulsa')
    fireEvent.click(screen.getByRole('button', { name: 'Criar Conta' }))
    expect(app.addAccount).toHaveBeenCalledTimes(1)
    expect(app.setAvisoToast).toHaveBeenCalledWith(avisoContaForaDoFiltro('Avulsa', 'Pessoa Um'))
  })
  it('salvar Sem vínculo em "Tudo": sem aviso (ela aparece)', () => {
    const { app } = montar()
    nome('Avulsa')
    fireEvent.click(screen.getByRole('button', { name: 'Criar Conta' }))
    expect(app.setAvisoToast).not.toHaveBeenCalled()
  })
})

describe('ambiente sem nenhum perfil', () => {
  it('"Criar perfil agora" abre o cadastro por cima, sem perder o que foi digitado, e marca o perfil novo', () => {
    const { app } = montar({ profiles: [] })
    expect(screen.getByTestId('sem-perfil').textContent).toMatch(/Você ainda não cadastrou um perfil \(CPF\/CNPJ\)/)
    nome('Minha conta')
    fireEvent.click(screen.getByRole('button', { name: 'Criar perfil agora' }))
    fireEvent.change(screen.getByPlaceholderText('Nome da pessoa'), { target: { value: 'Pessoa Nova' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar perfil' }))
    expect(app.addProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'Pessoa Nova', type: 'pf', isDefault: true }))
    expect(screen.getByPlaceholderText('Digite o nome da conta').value).toBe('Minha conta')
    fireEvent.click(screen.getByRole('button', { name: 'Criar Conta' }))
    expect(app.addAccount.mock.calls[0][0]).toMatchObject({ name: 'Minha conta', profileId: 'prf_novo' })
  })
  it('Enter no cadastro rápido não envia o formulário da conta', () => {
    const { app } = montar({ profiles: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Criar perfil agora' }))
    const campo = screen.getByPlaceholderText('Nome da pessoa')
    fireEvent.change(campo, { target: { value: 'P' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(app.addAccount).not.toHaveBeenCalled()
    expect(app.addProfile).toHaveBeenCalledTimes(1)
  })
})
