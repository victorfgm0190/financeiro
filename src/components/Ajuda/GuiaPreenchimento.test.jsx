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

  it('Enter: toggle já escolhido avança; seletor fechado é do guia (vazio e obrigatório avisa, com valor avança); linha do botão some ao guiar', () => {
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
    // Vazio: o Enter é do guia (a lista NÃO abre — abre com clique, digitação ou Alt+↓); obrigatório
    // pela validação do formulário, o Próximo segura e avisa.
    expect(balao().textContent).toContain('Obrigatório')
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    act(() => { conta.dispatchEvent(ev) })
    expect(ev.defaultPrevented).toBe(true)
    expect(conta.getAttribute('aria-expanded')).toBe('false')
    expect(balao().dataset.campo).toBe('agendamento.account')
    expect(screen.getByRole('alert').textContent).toContain('Escolha a conta.')
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

describe('Preencher com guia — Etapa 5 (conta e lançamento)', () => {
  // Formulário dentro de uma janela (role=dialog) que, ao salvar, troca para uma pergunta própria
  // ("É parcela?", "Parecidos") antes de gravar — como o TransactionForm.
  function ComPergunta() {
    const [aberto, setAberto] = useState(true)
    const [etapa, setEtapa] = useState('form')
    if (!aberto) return null
    return (
      <div role="dialog">
        {etapa === 'form' ? (
          <div data-help-form="agendamento">
            <BotaoPreencherGuia form="agendamento" oferecer={false} />
            <div data-help-id="agendamento.description"><input aria-label="Descrição" defaultValue="Conta de luz" /></div>
            <button type="button" data-help-salvar="agendamento" onClick={() => setEtapa('pergunta')}>Salvar</button>
          </div>
        ) : (
          <div>
            <p>É parcela?</p>
            <button type="button" onClick={() => setEtapa('form')}>Voltar ao formulário</button>
            <button type="button" onClick={() => setAberto(false)}>Lançar assim</button>
          </div>
        )}
      </div>
    )
  }

  it('pergunta intermediária do formulário: o guia pausa (não diz "Pronto"), volta com o formulário e conclui ao gravar', async () => {
    render(<><ComPergunta /><GuiaPreenchimento /></>)
    fireEvent.click(screen.getByTestId('botao-preencher-guia'))
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByTestId('guia-preenchimento')).toBeNull())
    expect(preenchimentoAtivo()).toBeTruthy()
    // Esc na pausa é da janela, não do guia.
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    act(() => { document.body.dispatchEvent(ev) })
    expect(ev.defaultPrevented).toBe(false)
    expect(preenchimentoAtivo()).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao formulário' }))
    await waitFor(() => expect(balao().dataset.campo).toBe('agendamento.description'))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByTestId('guia-preenchimento')).toBeNull())
    // Salvou de novo e gravou (a janela fechou): agora sim, Pronto.
    fireEvent.click(screen.getByRole('button', { name: 'Lançar assim' }))
    await waitFor(() => expect(balao().dataset.fase).toBe('pronto'))
  })

  it('foco: rádio já marcado, botão de escolha já escolhido; só botão de ação → foco no Próximo do balão', () => {
    function Opcoes() {
      return (
        <div data-help-form="agendamento">
          <BotaoPreencherGuia form="agendamento" oferecer={false} />
          <div data-help-id="agendamento.transactionType">
            <label><input type="radio" name="t" value="a" readOnly /> A</label>
            <label><input type="radio" name="t" value="b" defaultChecked /> B</label>
          </div>
          <div data-help-id="agendamento.frequency">
            <button type="button" aria-pressed="false">Mensal</button>
            <button type="button" aria-pressed="true">Anual</button>
          </div>
          <div data-help-id="agendamento.category"><button type="button">Dividir em categorias</button></div>
        </div>
      )
    }
    render(<><Opcoes /><GuiaPreenchimento /></>)
    fireEvent.click(screen.getByTestId('botao-preencher-guia'))
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    expect(document.activeElement.value).toBe('b')
    enter(document.activeElement)
    expect(document.activeElement.textContent).toBe('Anual')
    enter(document.activeElement)
    expect(balao().dataset.campo).toBe('agendamento.category')
    expect(document.activeElement.textContent).toBe('Próximo')
  })
})

describe('celular: lado do balão', () => {
  it('não cobre o campo aceso; se der, nem o Salvar (em cima, embaixo ou entre os dois)', async () => {
    const { ladoDoBalaoCelular } = await import('../../help/guiaPreenchimento.js')
    const base = { vh: 700, alturaBalao: 200 }
    // Campo no alto, sem Salvar à vista: balão embaixo.
    expect(ladoDoBalaoCelular({ ...base, alvo: { top: 100, bottom: 150 } })).toEqual({ lado: 'baixo' })
    // Campo embaixo: balão em cima.
    expect(ladoDoBalaoCelular({ ...base, alvo: { top: 600, bottom: 650 } })).toEqual({ lado: 'cima' })
    // Campo no meio e Salvar embaixo: em cima (não cobre nenhum dos dois).
    expect(ladoDoBalaoCelular({ ...base, alvo: { top: 330, bottom: 380 }, salvar: { top: 620, bottom: 668 } })).toEqual({ lado: 'cima' })
    // Campo no alto e Salvar embaixo (folha do "+"): entre os dois, logo abaixo do campo.
    expect(ladoDoBalaoCelular({ ...base, alvo: { top: 180, bottom: 240 }, salvar: { top: 620, bottom: 656 } })).toEqual({ lado: 'entre', top: 248 })
    // Não cabe inteiro entre os dois: encolhe (rola por dentro), mas não abaixo do mínimo.
    expect(ladoDoBalaoCelular({ ...base, alturaBalao: 300, alvo: { top: 260, bottom: 320 }, salvar: { top: 620, bottom: 656 } })).toEqual({ lado: 'entre', top: 328, altura: 288 })
    expect(ladoDoBalaoCelular({ ...base, alturaBalao: 300, alvo: { top: 400, bottom: 460 }, salvar: { top: 620, bottom: 656 } }).lado).not.toBe('entre')
    // Teclado aberto: a faixa de baixo sobe com ele.
    expect(ladoDoBalaoCelular({ ...base, teclado: 300, alvo: { top: 250, bottom: 290 } })).toEqual({ lado: 'cima' })
  })
})

describe('computador: posição do balão (não cobre nenhum controle do formulário)', () => {
  // Tela 1440×800; janela do formulário (modal) no meio: 420..1020 × 80..720. Balão 340×200.
  const tela = { vw: 1440, vh: 800, largura: 340, altura: 200 }
  const janela = { top: 80, left: 420, right: 1020, bottom: 720 }
  const cruza = (p, r, w = 340, h = 200) => Math.min(p.left + w, r.right) > Math.max(p.left, r.left) && Math.min(p.top + h, r.bottom) > Math.max(p.top, r.top)

  it('prefere FORA da janela: campo da coluna da esquerda (Conta) não leva o balão para cima de Valor nem das abas', async () => {
    const { posicaoBalaoComputador } = await import('../../help/guiaPreenchimento.js')
    // Abas (Despesa/Receita/Transferência), Conta (esquerda), Valor (direita), Categoria embaixo.
    const abas = [{ top: 140, left: 440, right: 620, bottom: 180 }, { top: 140, left: 620, right: 800, bottom: 180 }, { top: 140, left: 800, right: 1000, bottom: 180 }]
    const conta = { top: 220, left: 440, right: 710, bottom: 260 }
    const valor = { top: 220, left: 730, right: 1000, bottom: 260 }
    const categoria = { top: 300, left: 440, right: 1000, bottom: 340 }
    const controles = [...abas, conta, valor, categoria]
    const p = posicaoBalaoComputador({ ...tela, alvo: conta, janela, controles })
    expect(p.lado).toBe('fora-direita')
    expect(p.left).toBeGreaterThanOrEqual(janela.right)
    for (const r of controles) expect(cruza(p, r)).toBe(false)
  })

  it('sem espaço fora (janela larga): um lugar que não cobre campo nem aba', async () => {
    const { posicaoBalaoComputador } = await import('../../help/guiaPreenchimento.js')
    const larga = { top: 20, left: 20, right: 1420, bottom: 780 }
    const abas = [{ top: 60, left: 40, right: 400, bottom: 100 }]
    const conta = { top: 120, left: 40, right: 400, bottom: 160 }
    const valor = { top: 120, left: 420, right: 780, bottom: 160 }
    const controles = [...abas, conta, valor, { top: 180, left: 40, right: 780, bottom: 220 }]
    const p = posicaoBalaoComputador({ ...tela, alvo: conta, janela: larga, controles })
    expect(p.lado).not.toMatch(/^fora/)
    expect(p.top + 200).toBeLessThanOrEqual(800 - 8)
    for (const r of controles) expect(cruza(p, r)).toBe(false)
  })

  it('tela 1280×720 com janela de 672px: ao lado não cabe 340px → o balão afina (até 260px) e fica fora', async () => {
    const { posicaoBalaoComputador } = await import('../../help/guiaPreenchimento.js')
    const j = { top: 36, left: 304, right: 976, bottom: 684 }
    const controles = [{ top: 100, left: 324, right: 956, bottom: 660 }] // o formulário inteiro
    const p = posicaoBalaoComputador({ vw: 1280, vh: 720, largura: 340, altura: 200, alvo: { top: 300, left: 324, right: 640, bottom: 340 }, janela: j, controles })
    expect(p.lado).toBe('fora-direita')
    expect(p.largura).toBeGreaterThanOrEqual(260)
    expect(p.largura).toBeLessThan(340)
    expect(p.left).toBeGreaterThanOrEqual(j.right)
    expect(p.left + p.largura).toBeLessThanOrEqual(1280 - 8)
    // Espaço menor que o mínimo: não afina além dele (vai para outro lugar).
    const apertada = posicaoBalaoComputador({ vw: 1100, vh: 720, largura: 340, altura: 200, alvo: { top: 300, left: 324, right: 640, bottom: 340 }, janela: { ...j, left: 214, right: 886 }, controles })
    expect(apertada.lado).not.toMatch(/^fora-(direita|esquerda)$/)
  })

  it('nunca cobre o campo aceso; se tudo cobre algum controle, escolhe o que cobre menos', async () => {
    const { posicaoBalaoComputador } = await import('../../help/guiaPreenchimento.js')
    const larga = { top: 0, left: 0, right: 1280, bottom: 800 }
    const alvo = { top: 380, left: 470, right: 810, bottom: 420 }
    // Grade de controles cobrindo quase tudo; um vão livre embaixo à esquerda.
    const controles = []
    for (let y = 0; y < 800; y += 100) for (let x = 0; x < 1280; x += 160) if (!(y >= 560 && x < 400)) controles.push({ top: y + 10, left: x + 10, right: x + 150, bottom: y + 90 })
    const p = posicaoBalaoComputador({ ...tela, alvo, janela: larga, controles })
    expect(cruza(p, alvo)).toBe(false)
    const custo = (q) => controles.reduce((s, r) => s + (cruza(q, r) ? 1 : 0), 0)
    expect(custo(p)).toBeLessThanOrEqual(custo({ top: alvo.bottom + 18, left: 470 }))
  })

  it('fase sem campo (objetivo, resumo): ao lado da janela, sem cobrir o formulário', async () => {
    const { posicaoBalaoComputador } = await import('../../help/guiaPreenchimento.js')
    const p = posicaoBalaoComputador({ ...tela, alvo: null, janela, controles: [{ top: 140, left: 440, right: 1000, bottom: 700 }] })
    expect(p.lado).toBe('fora-direita')
  })
})

describe('Esc com lista, menu ou janela aberta no formulário', () => {
  it('algoAbertoNoForm: gatilho com aria-expanded, lista em portal, foco em outra janela', async () => {
    const { algoAbertoNoForm } = await import('../../help/guiaPreenchimento.js')
    render(
      <div data-help-form="x">
        <button type="button" aria-haspopup="listbox" aria-expanded="false">Categoria</button>
        <button type="button" aria-expanded="true">Mais opções</button>
        <input aria-label="campo" />
      </div>,
    )
    const raiz = document.querySelector('[data-help-form="x"]')
    // Seção expandida (Mais opções) não é lista aberta.
    expect(algoAbertoNoForm(raiz, { foco: screen.getByLabelText('campo') })).toBe(false)
    screen.getByRole('button', { name: 'Categoria' }).setAttribute('aria-expanded', 'true')
    expect(algoAbertoNoForm(raiz)).toBe(true)
    screen.getByRole('button', { name: 'Categoria' }).setAttribute('aria-expanded', 'false')
    // Outra janela aberta por cima, com o foco nela.
    const outra = document.createElement('div')
    outra.setAttribute('role', 'dialog')
    outra.innerHTML = '<input aria-label="na outra" />'
    document.body.appendChild(outra)
    expect(algoAbertoNoForm(raiz, { foco: outra.querySelector('input') })).toBe(true)
    outra.remove()
  })
})
