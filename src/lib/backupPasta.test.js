import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  gravarNaPasta, permissaoDaPasta, backendBackup, comPrazo, PRAZO_IDB_MS, tipoDeErroDaPasta, perguntarAoSair, lerConfig, salvarConfig, suportaPasta, nomeDoBancoBackup, MANTER_PADRAO,
  escolherPastaDeBackup, mensagemDaEscolha, lerConfigDetalhado, salvarConfigDetalhado, chaveEspelho, motivoDoIdb, textoDoMotivo,
} from './backupPasta'

// Pasta falsa com a mesma forma do FileSystemDirectoryHandle.
function pastaFalsa(nomes = [], { permissao = 'prompt', pedido = 'granted' } = {}) {
  const arquivos = new Map(nomes.map(n => [n, 'antigo']))
  return {
    kind: 'directory', name: 'Backups', arquivos,
    async getFileHandle(n) {
      return { async createWritable() { let buf = ''; return { write: async (t) => { buf += t }, close: async () => { arquivos.set(n, buf) } } } }
    },
    async *entries() { for (const n of [...arquivos.keys()]) yield [n, { kind: 'file' }] },
    async removeEntry(n) { arquivos.delete(n) },
    queryPermission: async () => permissao,
    requestPermission: async () => pedido,
  }
}
const memoria = () => { let v; return { get: async () => v, set: async (x) => { v = x } } }

describe('gravar na pasta e rotação', () => {
  it('grava o arquivo e apaga só os mais antigos do Finup deste ambiente além de "manter"', async () => {
    const pasta = pastaFalsa([
      'finup-backup-vm-2026-11-01-0800.json', 'finup-backup-vm-2026-11-02-0800.json', 'finup-backup-vm-2026-11-03-0800.json',
      'finup-backup-teste1-2026-01-01-0800.json', 'minha-planilha.xlsx', 'finup-backup-vm-copia.json',
    ])
    const r = await gravarNaPasta(pasta, 'finup-backup-vm-2026-11-10-1830.json', '{"x":1}', { ambiente: 'vm', manter: 2 })
    expect(pasta.arquivos.get('finup-backup-vm-2026-11-10-1830.json')).toBe('{"x":1}')
    expect(r.apagados).toEqual(['finup-backup-vm-2026-11-01-0800.json', 'finup-backup-vm-2026-11-02-0800.json'])
    expect([...pasta.arquivos.keys()].sort()).toEqual([
      'finup-backup-teste1-2026-01-01-0800.json', 'finup-backup-vm-2026-11-03-0800.json', 'finup-backup-vm-2026-11-10-1830.json',
      'finup-backup-vm-copia.json', 'minha-planilha.xlsx',
    ])
  })
  it('permissão: só pede quando mandado (no clique) e devolve o que o navegador respondeu', async () => {
    expect(await permissaoDaPasta(pastaFalsa([], { permissao: 'prompt' }))).toBe('prompt')
    expect(await permissaoDaPasta(pastaFalsa([], { permissao: 'prompt', pedido: 'denied' }), { pedir: true })).toBe('denied')
    expect(await permissaoDaPasta(pastaFalsa([], { permissao: 'granted', pedido: 'denied' }), { pedir: true })).toBe('granted')
  })
  it('erro da pasta → permissão, pasta sumiu ou falha do backup', () => {
    expect(tipoDeErroDaPasta({ name: 'NotAllowedError' })).toBe('permissao')
    expect(tipoDeErroDaPasta({ name: 'NotFoundError' })).toBe('pasta')
    expect(tipoDeErroDaPasta(new Error('rede'))).toBe('backup')
  })
})

describe('preferências neste aparelho', () => {
  it('padrão: sem pasta, não pergunta; com pasta, pergunta; escolha explícita manda', () => {
    expect(perguntarAoSair({ pasta: null, perguntar: null })).toBe(false)
    expect(perguntarAoSair({ pasta: {}, perguntar: null })).toBe(true)
    expect(perguntarAoSair({ pasta: {}, perguntar: 'nunca' })).toBe(false)
    expect(perguntarAoSair({ pasta: null, perguntar: 'sempre' })).toBe(true)
  })
  it('guarda por usuário e ambiente; padrão de 10 backups', async () => {
    const b = memoria()
    expect(await lerConfig(b)).toMatchObject({ pasta: null, manter: MANTER_PADRAO, ultimo: null })
    await salvarConfig(b, { manter: 5 })
    expect(await salvarConfig(b, { ultimo: 123 })).toMatchObject({ manter: 5, ultimo: 123 })
    expect(nomeDoBancoBackup({ id: 'u1', ambSigla: 'TESTE1' })).toBe('finup_backup_teste1_u1')
    expect(nomeDoBancoBackup(null)).toBeNull()
  })
  it('suporte à escolha de pasta só com showDirectoryPicker (Safari/Firefox não têm)', () => {
    expect(suportaPasta({ showDirectoryPicker: () => {} })).toBe(true)
    expect(suportaPasta({})).toBe(false)
  })
})

// IndexedDB que nunca responde (o que travava a tela no teste do Chrome).
const idbMudo = () => ({ open: () => ({}) })
afterEach(() => { vi.useRealTimers() })

describe('IndexedDB pendurado nunca prende a tela', () => {
  it('lerConfig devolve as preferências vazias depois do prazo', async () => {
    vi.useFakeTimers()
    const p = lerConfig(backendBackup('finup_backup_x_u1', idbMudo()))
    await vi.advanceTimersByTimeAsync(PRAZO_IDB_MS + 10)
    await expect(p).resolves.toMatchObject({ pasta: null, ultimo: null, manter: MANTER_PADRAO })
  })
  it('salvarConfig termina (sem lançar) mesmo sem conseguir gravar', async () => {
    vi.useFakeTimers()
    const p = salvarConfig(backendBackup('finup_backup_x_u1', idbMudo()), { ultimo: 5 }, { manter: 3 })
    await vi.advanceTimersByTimeAsync(PRAZO_IDB_MS + 10)
    await expect(p).resolves.toMatchObject({ ultimo: 5, manter: 3 })
  })
  it('comPrazo: passa o resultado ou rejeita no prazo', async () => {
    await expect(comPrazo(Promise.resolve(7), 50)).resolves.toBe(7)
    await expect(comPrazo(new Promise(() => {}), 10, 'demorou')).rejects.toThrow('demorou')
  })
})

// ── Escolha da pasta (defeito de 11/11: "Selecionar pasta" e a tela continuava "Nenhuma pasta") ──────
const pastaEscolhida = ({ permissao = 'granted', pedido = 'granted', pedidoLanca = false } = {}) => ({
  kind: 'directory', name: 'FINUP',
  queryPermission: async () => permissao,
  requestPermission: async () => { if (pedidoLanca) throw Object.assign(new Error('sem clique'), { name: 'SecurityError' }); return pedido },
})
const janela = (resultado) => ({ showDirectoryPicker: vi.fn(async () => { if (resultado instanceof Error) throw resultado; return resultado }) })
const erro = (name, message = name) => Object.assign(new Error(message), { name })

describe('escolherPastaDeBackup — nunca em silêncio', () => {
  it('pede a pasta com permissão de gravar (readwrite)', async () => {
    const w = janela(pastaEscolhida())
    await escolherPastaDeBackup(w)
    expect(w.showDirectoryPicker).toHaveBeenCalledWith({ id: 'finup-backup', mode: 'readwrite' })
  })
  it('pasta com permissão → ok', async () => {
    const r = await escolherPastaDeBackup(janela(pastaEscolhida()))
    expect(r).toMatchObject({ status: 'ok', permissao: 'granted' })
    expect(r.pasta.name).toBe('FINUP')
  })
  it('permissão ainda não dada: pede; concedida → ok', async () => {
    expect(await escolherPastaDeBackup(janela(pastaEscolhida({ permissao: 'prompt', pedido: 'granted' })))).toMatchObject({ status: 'ok', permissao: 'granted' })
  })
  it('permissão recusada → negada (com a pasta, para dizer o nome)', async () => {
    const r = await escolherPastaDeBackup(janela(pastaEscolhida({ permissao: 'prompt', pedido: 'denied' })))
    expect(r.status).toBe('negada')
    expect(r.pasta.name).toBe('FINUP')
  })
  it('o navegador não deixa pedir agora (sem clique ativo) → ok, a permissão é pedida no Sair', async () => {
    expect(await escolherPastaDeBackup(janela(pastaEscolhida({ permissao: 'prompt', pedidoLanca: true })))).toMatchObject({ status: 'ok', permissao: 'prompt' })
  })
  it('AbortError (fechou a janela OU o Chrome recusou a edição de arquivos sem perguntar) → cancelado', async () => {
    expect(await escolherPastaDeBackup(janela(erro('AbortError', 'The user aborted a request.')))).toEqual({ status: 'cancelado' })
  })
  it('NotAllowedError/SecurityError → negada; outro erro → erro com a mensagem', async () => {
    expect((await escolherPastaDeBackup(janela(erro('NotAllowedError')))).status).toBe('negada')
    expect((await escolherPastaDeBackup(janela(erro('SecurityError')))).status).toBe('negada')
    expect(await escolherPastaDeBackup(janela(erro('TypeError', 'quebrou')))).toEqual({ status: 'erro', mensagem: 'quebrou' })
  })
})

describe('mensagemDaEscolha', () => {
  const ok = { status: 'ok', pasta: { name: 'FINUP' }, permissao: 'granted' }
  it('ok: nome da pasta', () => {
    expect(mensagemDaEscolha(ok)).toEqual({ tipo: 'ok', texto: 'Pasta de backup: FINUP.' })
  })
  it('ok sem guardar no aparelho: aviso com o motivo e o que fazer', () => {
    const m = mensagemDaEscolha(ok, { guardado: false, motivo: 'prazo' })
    expect(m.tipo).toBe('aviso')
    expect(m.texto).toMatch(/Pasta de backup: FINUP\..*vale só até fechar ou recarregar.*não respondeu.*Downloads/)
  })
  it('cancelado: explica a permissão de edição de arquivos e o destino Downloads', () => {
    const m = mensagemDaEscolha({ status: 'cancelado' }, { perguntar: true })
    expect(m.tipo).toBe('aviso')
    expect(m.texto).toMatch(/Nenhuma pasta foi guardada.*Edição de arquivos.*backup ao sair vai para a pasta Downloads/)
    expect(mensagemDaEscolha({ status: 'cancelado' }, { perguntar: false }).texto).toMatch(/se ligar "Perguntar ao sair"/)
  })
  it('negada: erro com o nome da pasta e como liberar', () => {
    const m = mensagemDaEscolha({ status: 'negada', pasta: { name: 'FINUP' } })
    expect(m.tipo).toBe('erro')
    expect(m.texto).toMatch(/não deu permissão para o Finup gravar na pasta FINUP.*Edição de arquivos/)
  })
})

// IndexedDB falso: lento, mudo, com erro ao abrir ou ao gravar.
function idbFalso({ atraso = 0, mudo = false, erroAbrir = null, erroGravar = null } = {}) {
  const dados = new Map()
  const pedido = (fn) => { const r = {}; setTimeout(() => { try { r.result = fn(); r.onsuccess?.() } catch (e) { r.error = e; r.onerror?.() } }, 0); return r }
  return {
    dados,
    open() {
      const r = {}
      if (mudo) return r
      setTimeout(() => {
        if (erroAbrir) { r.error = erroAbrir; r.onerror?.(); return }
        r.result = {
          objectStoreNames: { contains: () => true }, close() {},
          transaction: () => ({ objectStore: () => ({
            get: (k) => pedido(() => dados.get(k)),
            put: (v, k) => pedido(() => { if (erroGravar) throw erroGravar; dados.set(k, v) }),
          }) }),
        }
        r.onsuccess?.()
      }, atraso)
      return r
    },
  }
}
const lsFalso = () => { const m = new Map(); return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) } }

describe('preferências: lento, sem resposta, com erro — e o espelho', () => {
  const NOME = 'finup_backup_vm_u1'
  it('IndexedDB lento (dentro do prazo): grava e lê de volta, guardado', async () => {
    vi.useFakeTimers()
    const be = backendBackup(NOME, idbFalso({ atraso: PRAZO_IDB_MS - 500 }))
    const p = salvarConfigDetalhado(be, { nomePasta: 'FINUP', perguntar: 'sempre' }, { manter: 10 })
    await vi.advanceTimersByTimeAsync(PRAZO_IDB_MS)
    await expect(p).resolves.toMatchObject({ guardado: true, cfg: { nomePasta: 'FINUP', perguntar: 'sempre' } })
    const l = lerConfigDetalhado(be)
    await vi.advanceTimersByTimeAsync(10)
    await expect(l).resolves.toMatchObject({ guardado: true, cfg: { nomePasta: 'FINUP' } })
  })
  it('sem resposta: grava no espelho, devolve guardado=false/prazo; a leitura usa o espelho', async () => {
    vi.useFakeTimers()
    const ls = lsFalso()
    const esp = { ls, chave: chaveEspelho(NOME) }
    const be = backendBackup(NOME, idbMudo())
    const p = salvarConfigDetalhado(be, { pasta: { name: 'FINUP' }, nomePasta: 'FINUP', perguntar: 'sempre' }, { manter: 4 }, esp)
    await vi.advanceTimersByTimeAsync(PRAZO_IDB_MS + 10)
    await expect(p).resolves.toMatchObject({ guardado: false, motivo: 'prazo' })
    expect(JSON.parse(ls.m.get('finup_backup_vm_u1_espelho'))).toEqual({ nomePasta: 'FINUP', perguntar: 'sempre', manter: 4, ultimo: null })
    const l = lerConfigDetalhado(be, esp)
    await vi.advanceTimersByTimeAsync(PRAZO_IDB_MS + 10)
    await expect(l).resolves.toMatchObject({ guardado: false, motivo: 'prazo', cfg: { pasta: null, nomePasta: 'FINUP', perguntar: 'sempre', manter: 4 } })
  })
  it('erro ao abrir → motivo erro; pasta que não dá para guardar (DataCloneError) → motivo pasta', async () => {
    vi.useFakeTimers()
    const l = lerConfigDetalhado(backendBackup(NOME, idbFalso({ erroAbrir: erro('UnknownError') })))
    await vi.advanceTimersByTimeAsync(10)
    await expect(l).resolves.toMatchObject({ guardado: false, motivo: 'erro' })
    const s = salvarConfigDetalhado(backendBackup(NOME, idbFalso({ erroGravar: erro('DataCloneError') })), { pasta: {} }, {})
    await vi.advanceTimersByTimeAsync(10)
    await expect(s).resolves.toMatchObject({ guardado: false, motivo: 'pasta' })
  })
  it('sem IndexedDB → indisponível', async () => {
    await expect(lerConfigDetalhado(backendBackup(NOME, null))).resolves.toMatchObject({ guardado: false, motivo: 'indisponivel' })
  })
  it('motivoDoIdb e textoDoMotivo', () => {
    expect(motivoDoIdb({ prazo: true })).toBe('prazo')
    expect(motivoDoIdb(erro('QuotaExceededError'))).toBe('cota')
    expect(textoDoMotivo('prazo')).toMatch(/não respondeu/)
    expect(textoDoMotivo('xyz')).toMatch(/deu erro/)
  })
})
