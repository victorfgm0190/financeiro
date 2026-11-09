// @vitest-environment jsdom
// Preenchimento Guiado (Etapa 4): objetivo → campos na ordem (pula os escondidos, foco no campo, Enter
// avança, obrigatório vazio segura o Próximo) → obrigatórios → resumo com os dados reais → Salvar →
// Pronto; wizard: acompanha a troca de etapa; Esc sai; oferta da 1ª abertura; o "Faça comigo" que abre
// o formulário passa a guiado; rodapé do help de campo. Dados fictícios.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'

const app = vi.hoisted(() => ({ profiles: [{ id: 'pf' }], accounts: [{ id: 'c1', name: 'Conta Teste', type: 'checking', profileId: 'pf' }], categories: [{ id: 'k1', name: 'Luz' }], dbStatus: 'connected' }))
const bv = vi.hoisted(() => ({ estado: null }))
vi.mock('../../context/AppContext', () => ({ useApp: () => ({ ...app, podeVer: () => true, pode: () => true, settings: {} }) }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../lib/abrirTela', () => ({ navegarPara: vi.fn() }))
vi.mock('../BoasVindas/useGuiaTela', () => ({ useEstadoBoasVindas: () => bv.estado }))
vi.mock('../../lib/boasVindasApi', async (orig) => ({ ...(await orig()), responderOfertaGuia: vi.fn(async () => true), marcarTarefaConcluida: vi.fn(async () => true) }))

const { default: GuiaPreenchimento } = await import('./GuiaPreenchimento.jsx')
const { default: BotaoPreencherGuia } = await import('./BotaoPreencherGuia.jsx')
const { default: HelpCampoPainel } = await import('./HelpCampoPainel.jsx')
const { _reiniciarPreenchimento, preenchimentoAtivo, encerrarPreenchimento } = await import('../../help/guiaPreenchimento.js')
const { iniciarTarefa, tourAtivo, _reiniciarTour } = await import('../BoasVindas/tourEstado')
const { abrirHelpCampo, fecharHelpCampo } = await import('../../help/helpCampoEstado.js')
const { helpDoFormulario } = await import('../../help/index.js')
const { responderOfertaGuia, marcarTarefaConcluida } = await import('../../lib/boasVindasApi')

beforeEach(() => { bv.estado = null; _reiniciarPreenchimento(); _reiniciarTour(); vi.clearAllMocks() })
afterEach(() => { act(() => { encerrarPreenchimento(); fecharHelpCampo() }); cleanup() })

function Agendamento({ onClose = () => {}, oferecer = false }) {
  const [desc, setDesc] = useState('')
  return (
    <div data-help-form="agendamento">
      <BotaoPreencherGuia form="agendamento" oferecer={oferecer} resumo={() => [`Despesa "${desc}" na Conta Teste.`]} onFechar={onClose} />
      <div data-help-id="agendamento.description"><input aria-label="Descrição" value={desc} onChange={e => setDesc(e.target.value)} /></div>
      <div data-help-id="agendamento.account" style={{ display: 'none' }}><select aria-label="Conta"><option value="">—</option></select></div>
      <div data-help-id="agendamento.amount"><input aria-label="Valor" defaultValue="" /></div>
      <button type="button" data-help-salvar="agendamento" onClick={onClose}>Criar Agendamento</button>
    </div>
  )
}
function Tela(props) {
  const [aberto, setAberto] = useState(true)
  return <>{aberto && <Agendamento {...props} onClose={() => setAberto(false)} />}<GuiaPreenchimento /></>
}
const balao = () => screen.getByTestId('guia-preenchimento')
const enter = (el) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })

describe('Preencher com guia', () => {
  it('fluxo completo: objetivo, campos na ordem (escondido fica de fora), obrigatório, resumo real, Salvar e Pronto', async () => {
    render(<Tela />)
    fireEvent.click(screen.getByTestId('botao-preencher-guia'))
    expect(balao().dataset.fase).toBe('objetivo')
    expect(balao().textContent).toContain(helpDoFormulario('agendamento').objetivo)
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    // transactionType não está na tela: começa na Descrição, com o foco nela.
    expect(balao().dataset.campo).toBe('agendamento.description')
    const desc = screen.getByLabelText('Descrição')
    expect(document.activeElement).toBe(desc)
    // Obrigatório vazio: Enter não passa.
    enter(desc)
    expect(screen.getByRole('alert').textContent).toMatch(/obrigatório/)
    fireEvent.change(desc, { target: { value: 'Luz do escritório' } })
    enter(desc)
    // Conta escondida: pula direto para o Valor.
    expect(balao().dataset.campo).toBe('agendamento.amount')
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    // Valor obrigatório vazio: lista para voltar a ele.
    expect(balao().dataset.fase).toBe('faltando')
    expect(screen.getByRole('button', { name: 'Valor' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Seguir mesmo assim' }))
    expect(balao().dataset.fase).toBe('resumo')
    expect(screen.getByTestId('guia-resumo').textContent).toContain('Despesa "Luz do escritório" na Conta Teste.')
    expect(screen.getByTestId('guia-resumo').textContent).toContain(helpDoFormulario('agendamento').resumoAoSalvar)
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(balao().dataset.fase).toBe('salvar')
    expect(balao().textContent).toContain('Criar Agendamento')
    fireEvent.click(screen.getByRole('button', { name: 'Criar Agendamento' }))
    await waitFor(() => expect(balao().dataset.fase).toBe('pronto'))
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(screen.queryByTestId('guia-preenchimento')).toBeNull()
  })

  it('Voltar volta ao campo anterior; Esc sai só do guia (o formulário continua)', () => {
    render(<Tela />)
    fireEvent.click(screen.getByTestId('botao-preencher-guia'))
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(balao().dataset.campo).toBe('agendamento.amount')
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(balao().dataset.campo).toBe('agendamento.description')
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    act(() => { screen.getByLabelText('Descrição').dispatchEvent(ev) })
    expect(ev.defaultPrevented).toBe(true)
    expect(screen.queryByTestId('guia-preenchimento')).toBeNull()
    expect(screen.getByLabelText('Descrição')).toBeTruthy()
  })

  it('wizard: no fim da etapa acende o Avançar e continua na etapa seguinte', async () => {
    function Wizard() {
      const [etapa, setEtapa] = useState(0)
      return (
        <div data-help-form="contrato">
          <BotaoPreencherGuia form="contrato" oferecer={false} />
          {etapa === 0 && <div data-help-id="contrato.objeto"><input aria-label="Objeto" defaultValue="Sala 3" /></div>}
          {etapa === 1 && <div data-help-id="contrato.valorPrincipal"><input aria-label="Valor" defaultValue="1000" /></div>}
          {etapa === 0
            ? <button type="button" data-help-avancar="contrato" onClick={() => setEtapa(1)}>Avançar</button>
            : <button type="button" data-help-salvar="contrato">Confirmar</button>}
        </div>
      )
    }
    render(<><Wizard /><GuiaPreenchimento /></>)
    fireEvent.click(screen.getByTestId('botao-preencher-guia'))
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    expect(balao().dataset.campo).toBe('contrato.objeto')
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(balao().dataset.fase).toBe('avancar')
    fireEvent.click(screen.getByRole('button', { name: 'Avançar' }))
    await waitFor(() => expect(balao().dataset.campo).toBe('contrato.valorPrincipal'))
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(balao().dataset.fase).toBe('resumo')
  })

  it('oferta na 1ª abertura: Sim inicia; "Não perguntar mais" grava e some; respondida não aparece', () => {
    bv.estado = { guiasLigados: true, progresso: {} }
    const { unmount } = render(<Tela oferecer />)
    expect(screen.getByTestId('oferta-guia')).toBeTruthy()
    expect(responderOfertaGuia).toHaveBeenCalledWith('agendamento', 'vista')
    fireEvent.click(screen.getByRole('button', { name: 'Não perguntar mais' }))
    expect(responderOfertaGuia).toHaveBeenCalledWith('agendamento', 'nunca')
    expect(screen.queryByTestId('oferta-guia')).toBeNull()
    unmount()
    bv.estado = { guiasLigados: true, progresso: { guiaOfertaDesligada: true } }
    const r2 = render(<Tela oferecer />)
    expect(screen.queryByTestId('oferta-guia')).toBeNull()
    r2.unmount()
    bv.estado = { guiasLigados: true, progresso: { guiaOfertas: {} } }
    render(<Tela oferecer />)
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }))
    expect(responderOfertaGuia).toHaveBeenCalledWith('agendamento', 'sim')
    expect(balao().dataset.fase).toBe('objetivo')
  })

  it('"Faça comigo" (Sim no guia da tela / jornada) que abre o formulário: ele já abre guiado e conclui a tarefa ao salvar', async () => {
    act(() => iniciarTarefa('contratos.primeiro-contrato'))
    expect(tourAtivo()).toMatchObject({ tipo: 'tarefa' })
    function Contrato({ onClose }) {
      return (
        <div data-help-form="contrato">
          <BotaoPreencherGuia form="contrato" funcao="contrato" onFechar={onClose} />
          <div data-help-id="contrato.tipo"><select data-guia="contrato-form.tipo" aria-label="Tipo" defaultValue="pagar"><option value="pagar">A pagar</option></select></div>
          <button type="button" data-help-salvar="contrato" onClick={onClose}>Confirmar</button>
        </div>
      )
    }
    function Host() { const [a, setA] = useState(true); return <>{a && <Contrato onClose={() => setA(false)} />}<GuiaPreenchimento /></> }
    render(<Host />)
    expect(tourAtivo()).toBeNull()
    expect(preenchimentoAtivo()).toMatchObject({ form: 'contrato', origem: 'tarefa', tarefaId: 'contratos.primeiro-contrato' })
    // Perfil, conta e categoria existem: sem pré-requisito, vai ao objetivo.
    expect(balao().dataset.fase).toBe('objetivo')
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    expect(balao().dataset.campo).toBe('contrato.tipo')
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(balao().dataset.fase).toBe('salvar')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(balao().dataset.fase).toBe('pronto'))
    expect(marcarTarefaConcluida).toHaveBeenCalledWith('contratos.primeiro-contrato')
  })

  it('pré-requisito faltando: "Cadastrar agora" fecha o formulário e volta guiado ao reabrir', () => {
    const antes = app.profiles
    app.profiles = []
    try {
      function Contrato({ onClose }) {
        return <div data-help-form="contrato"><BotaoPreencherGuia form="contrato" funcao="contrato" oferecer={false} onFechar={onClose} /></div>
      }
      function Host() { const [a, setA] = useState(true); return <>{a && <Contrato onClose={() => setA(false)} />}<button type="button" onClick={() => setA(true)}>abrir</button><GuiaPreenchimento /></> }
      render(<Host />)
      fireEvent.click(screen.getByTestId('botao-preencher-guia'))
      expect(balao().dataset.fase).toBe('prereq')
      fireEvent.click(screen.getAllByRole('button', { name: 'Cadastrar agora' })[0])
      expect(screen.queryByTestId('botao-preencher-guia')).toBeNull()
      expect(preenchimentoAtivo()).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'abrir' }))
      expect(preenchimentoAtivo()).toMatchObject({ form: 'contrato', origem: 'pendente' })
    } finally { app.profiles = antes }
  })

  it('rodapé do help de campo: "Preencher com guia" inicia o guia do formulário do campo', () => {
    render(<><HelpCampoPainel /><Tela /></>)
    act(() => screen.getByLabelText('Descrição').focus())
    act(() => { abrirHelpCampo('agendamento.description') })
    const painel = screen.getByTestId('help-campo-painel')
    fireEvent.click(painel.querySelector('button[title^="Percorre os campos"]'))
    expect(screen.queryByTestId('help-campo-painel')).toBeNull()
    expect(balao().dataset.fase).toBe('objetivo')
  })
})

describe('Preencher com guia — correções da Etapa 4', () => {
  // Formulário com toggle (aria-pressed), seletor próprio (aria-haspopup + data-preenchido), "Fim"
  // condicional (data OU "Sem data de fim") e validação própria (provedor) — a mesma do Salvar.
  function Form({ onSalvar = () => {} }) {
    const [tipo, setTipo] = useState('expense')
    const [conta, setConta] = useState('')
    const [aberta, setAberta] = useState(false)
    const [fim, setFim] = useState('')
    const [semFim, setSemFim] = useState(false)
    const erros = () => [
      ...(!conta ? [{ id: 'agendamento.account', msg: 'Escolha a conta.' }] : []),
      ...(!semFim && !fim ? [{ id: 'contrato.fim', msg: 'Informe o fim ou marque "Sem data de fim".' }] : []),
    ]
    const validacao = {
      erros,
      obrigatorio: (id) => (id === 'agendamento.account') || (id === 'contrato.fim' && !semFim),
    }
    return (
      <div data-help-form="agendamento">
        <BotaoPreencherGuia form="agendamento" oferecer={false} validacao={validacao} />
        <div data-help-id="agendamento.transactionType">
          {['expense', 'income'].map(t => <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}>{t}</button>)}
        </div>
        <div data-help-id="agendamento.account">
          <button type="button" aria-label="Conta" aria-haspopup="listbox" aria-expanded={aberta} data-preenchido={conta ? 'sim' : 'nao'}
            onKeyDown={e => { if (e.key === 'Enter') setAberta(true) }}>{conta || 'Selecione'}</button>
          <button type="button" onClick={() => { setConta('c1'); setAberta(false) }}>escolher conta</button>
        </div>
        {/* Fora do roteiro (ordemCampos) do agendamento: tem passo do mesmo jeito (ordem visual). */}
        <div data-help-id="contrato.fim">
          <input type="date" aria-label="Fim" value={fim} disabled={semFim} onChange={e => setFim(e.target.value)} />
          <label><input type="checkbox" aria-label="Sem data de fim" checked={semFim} onChange={e => setSemFim(e.target.checked)} />Sem data de fim</label>
        </div>
        <button type="button" data-help-salvar="agendamento" onClick={() => { if (!erros().length) onSalvar() }}>Salvar</button>
      </div>
    )
  }

  it('Enter: toggle já escolhido avança; seletor fechado vazio abre, com valor avança; linha do botão some ao guiar', () => {
    render(<><Form /><GuiaPreenchimento /></>)
    fireEvent.click(screen.getByTestId('botao-preencher-guia'))
    expect(screen.queryByTestId('botao-preencher-guia')).toBeNull() // sem espaço em branco no topo
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    expect(balao().dataset.campo).toBe('agendamento.transactionType')
    enter(screen.getByRole('button', { name: 'income' })) // não escolhido: Enter é dele (escolhe)
    expect(balao().dataset.campo).toBe('agendamento.transactionType')
    enter(screen.getByRole('button', { name: 'expense' })) // já escolhido: Próximo
    expect(balao().dataset.campo).toBe('agendamento.account')
    const conta = screen.getByRole('button', { name: 'Conta' })
    act(() => conta.focus())
    // Vazio: o guia não segura o Enter (a lista abre); obrigatório pela validação do formulário.
    expect(balao().textContent).toContain('Obrigatório')
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    act(() => { conta.dispatchEvent(ev) })
    expect(ev.defaultPrevented).toBe(false)
    expect(balao().dataset.campo).toBe('agendamento.account')
    fireEvent.click(screen.getByRole('button', { name: 'escolher conta' }))
    enter(screen.getByRole('button', { name: 'Conta' })) // fechado e com valor: Próximo
    expect(balao().dataset.campo).toBe('contrato.fim')
  })

  it('obrigatório condicional (data OU "Sem data de fim"): bloqueia o Próximo até um dos dois', async () => {
    render(<><Form /><GuiaPreenchimento /></>)
    fireEvent.click(screen.getByTestId('botao-preencher-guia'))
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    fireEvent.click(screen.getByRole('button', { name: 'escolher conta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(balao().dataset.campo).toBe('contrato.fim')
    expect(balao().textContent).toContain('Obrigatório')
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(screen.getByRole('alert').textContent).toContain('Sem data de fim')
    expect(balao().dataset.campo).toBe('contrato.fim')
    fireEvent.click(screen.getByLabelText('Sem data de fim'))
    await waitFor(() => expect(balao().textContent).not.toContain('Obrigatório'))
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(balao().dataset.fase).toBe('resumo')
  })

  it('Salvar barrado pela validação: o guia volta ao primeiro campo com erro', async () => {
    render(<><Form /><GuiaPreenchimento /></>)
    fireEvent.click(screen.getByTestId('botao-preencher-guia'))
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(balao().dataset.fase).toBe('faltando')
    fireEvent.click(screen.getByRole('button', { name: 'Seguir mesmo assim' }))
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(balao().dataset.fase).toBe('salvar')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(balao().dataset.campo).toBe('agendamento.account'))
  })

  it('Salvar clicado no MEIO do roteiro: o clique passa (o guia não o engole) e, barrado, vai ao campo com erro', async () => {
    const onSalvar = vi.fn()
    render(<><Form onSalvar={onSalvar} /><GuiaPreenchimento /></>)
    fireEvent.click(screen.getByTestId('botao-preencher-guia'))
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    fireEvent.click(screen.getByRole('button', { name: 'escolher conta' }))
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(balao().dataset.campo).toBe('contrato.fim')
    // Volta ao 1º campo (balão no meio) e clica direto no Salvar: falta o "Fim".
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(balao().dataset.campo).toBe('agendamento.transactionType')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(balao().dataset.campo).toBe('contrato.fim'))
    expect(onSalvar).not.toHaveBeenCalled()
    // Corrigido: o Salvar no meio do roteiro grava.
    fireEvent.click(screen.getByLabelText('Sem data de fim'))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(onSalvar).toHaveBeenCalledTimes(1)
  })
})
