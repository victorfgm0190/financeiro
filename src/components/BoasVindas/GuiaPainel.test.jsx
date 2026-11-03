// @vitest-environment jsdom
// "Ver todas as funções": selos que acompanham o bloco (somem fora da área visível / atrás do painel,
// não se sobrepõem), item sem bloco explica quando aparece, clique no item só destaca (não abre a
// ação), "Abrir" fecha o guia antes. Balão do "Faça comigo" sem cobrir o alvo. Dados fictícios.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { useApp } from '../../context/AppContext'
import AjudaTela from './AjudaTela'
import { _reiniciarTour } from './tourEstado'
import { posicaoBalao, posicionarSelos, quandoAparece } from './tourPassos'
import { itemAcionavel } from './guiaElementos'
import { _reiniciarBoasVindas } from '../../lib/boasVindasApi'
import { AJUDA_TELAS } from '../../lib/ajudaTelas'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))

beforeEach(() => {
  cleanup(); _reiniciarTour(); _reiniciarBoasVindas()
  useApp.mockReturnValue({ dbStatus: 'connected', podeVer: () => true, pode: () => true, settings: { controleGerencial: true } })
  // Tour já visto e oculto no Painel: só o painel "Ver todas as funções" nos testes.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ tourVistoEm: '2026-11-01T10:00:00Z', guiasOcultos: ['dashboard'], guiasLigados: true }) })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const em = (top) => (el) => { if (el) el.getBoundingClientRect = () => ({ top, bottom: top + 40, left: 100, right: 300, width: 200, height: 40 }) }

function Painel({ onSaldo }) {
  return (
    <>
      <button data-guia="dashboard.saldo-principal" ref={em(120)} onClick={onSaldo}>Saldo Principal</button>
      <div data-guia="dashboard.cards-mes" ref={em(200)}>Receitas e Despesas</div>
      <AjudaTela pagina="dashboard" />
    </>
  )
}
const abrirLista = async () => {
  await waitFor(() => expect(fetch).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: `Ajuda: ${AJUDA_TELAS.dashboard.titulo}` }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Ver todas as funções desta tela' }))
  return screen.getByTestId('guia-tela')
}

describe('painel "Ver todas as funções"', () => {
  it('clicar no item só rola e destaca: a ação do bloco NÃO roda', async () => {
    const onSaldo = vi.fn()
    render(<Painel onSaldo={onSaldo} />)
    await abrirLista()
    await waitFor(() => expect(screen.getByTestId('item-guia-saldo-principal').textContent).not.toContain('não aparece agora'))
    fireEvent.click(screen.getByTestId('item-guia-saldo-principal'))
    expect(onSaldo).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saldo Principal' }).classList.contains('guia-destaque')).toBe(true))
  })
  it('"Abrir" fecha o guia antes e só então executa a ação', async () => {
    const onSaldo = vi.fn()
    render(<Painel onSaldo={onSaldo} />)
    await abrirLista()
    fireEvent.click(await screen.findByTitle('Fechar o guia e abrir "Saldo Principal"'))
    expect(screen.queryByTestId('guia-tela')).toBeNull()
    await waitFor(() => expect(onSaldo).toHaveBeenCalledTimes(1))
  })
  it('item sem bloco na tela: "não aparece agora" e quando aparece', async () => {
    render(<Painel />)
    await abrirLista()
    const alertas = screen.getByTestId('item-guia-ver-alertas')
    expect(alertas.textContent).toContain('não aparece agora')
    expect(alertas.textContent).toMatch(/Aparece quando uma fatura de cartão está perto de vencer/) // já no texto: não repete
    expect(alertas.textContent.match(/Aparece quando/g)).toHaveLength(1)
    expect(screen.getByTestId('item-guia-projecao').textContent).toMatch(/não aparece agora · Depende/)
    await waitFor(() => expect(screen.getByTestId('item-guia-saldo-principal').textContent).not.toContain('não aparece agora'))
  })
})

describe('partes puras', () => {
  const area = { top: 60, left: 240, right: 1024, bottom: 768 } // área do <main> (abaixo do cabeçalho)
  const r = (top, left = 300, w = 200, h = 40) => ({ top, left, right: left + w, bottom: top + h, width: w, height: h })
  it('selo some quando o bloco sai da área visível (nunca fica preso no cabeçalho)', () => {
    const s = posicionarSelos([
      { chave: 'a', numero: 1, rect: r(-200), area },
      { chave: 'b', numero: 2, rect: r(10), area }, // passou por baixo do cabeçalho
      { chave: 'c', numero: 3, rect: r(300), area },
      { chave: 'd', numero: 4, rect: r(900), area },
    ])
    expect(s.map(x => x.chave)).toEqual(['c'])
  })
  it('selo atrás do painel do guia ou de uma faixa fixa some', () => {
    const painel = { top: 80, left: 640, right: 1010, bottom: 760 }
    const s = posicionarSelos([{ chave: 'a', numero: 1, rect: r(300, 600), area }, { chave: 'b', numero: 2, rect: r(300, 300), area }], [painel])
    expect(s.map(x => x.chave)).toEqual(['b'])
  })
  it('dois selos no mesmo ponto: o segundo vai para o lado', () => {
    const [a, b] = posicionarSelos([{ chave: 'a', numero: 1, rect: r(300), area }, { chave: 'b', numero: 2, rect: r(300), area }])
    expect(b).toBeTruthy()
    expect(Math.abs(a.left - b.left)).toBeGreaterThanOrEqual(20)
  })
  it('balão do "Faça comigo": não cobre o alvo e evita o próximo passo', () => {
    const vw = 1280, vh = 800, t = { largura: 340, altura: 200 }
    const ordem = ['direita', 'esquerda', 'abaixo', 'acima']
    const alvo = r(300, 500)
    expect(posicaoBalao(alvo, t, { vw, vh }, { ordem }).left).toBeGreaterThanOrEqual(alvo.right)
    const ocupado = { top: 0, left: 700, right: 1280, bottom: 800 }
    const q = posicaoBalao(alvo, t, { vw, vh }, { ordem, evitar: [ocupado] })
    expect(q.left + 340).toBeLessThanOrEqual(alvo.left)
    // Botão no canto de cima à direita: não cabe à direita → à esquerda.
    const canto = r(70, 1150, 110, 36)
    expect(posicaoBalao(canto, t, { vw, vh }, { ordem }).left + 340).toBeLessThanOrEqual(1150)
  })
  it('quando aparece: frase do texto, botões de linha, ou explicação geral', () => {
    expect(quandoAparece(AJUDA_TELAS.dashboard.itens.find(i => i.chave === 'envelopes'))).toBe('Só aparece quando há envelopes cadastrados.')
    expect(quandoAparece({ porLinha: true, texto: 'Apaga.' })).toMatch(/cada linha/)
    expect(quandoAparece({ texto: 'Mostra X.' })).toMatch(/Depende/)
    expect(quandoAparece({ quando: 'Aparece no fim do mês.' })).toBe('Aparece no fim do mês.')
  })
  it('"Abrir" só para botões que não apagam, saem nem gravam', () => {
    const b = document.createElement('button')
    expect(itemAcionavel({ rotulo: 'Saldo Principal' }, b)).toBe(true)
    expect(itemAcionavel({ rotulo: 'Excluir' }, b)).toBe(false)
    expect(itemAcionavel({ rotulo: 'Cards' }, document.createElement('div'))).toBe(false)
  })
})
