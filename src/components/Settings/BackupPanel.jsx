import { useRef, useState } from 'react'
import { ShieldCheck, Download, Upload, FileCheck2, FolderOpen, Clock, AlertTriangle, Check, X } from 'lucide-react'
import Modal from '../shared/Modal'
import HelpCampo from '../shared/HelpCampo'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useBackupLocal, podeFazerBackup } from '../../hooks/useBackupLocal'
import { exportarBackup, baixarArquivo, lerArquivoBackup, previaRestauracao, restaurarBackup, conferirComArquivo } from '../../lib/backupCliente'
import { suportaPasta, escolherPasta, perguntarAoSair, MANTER_PADRAO } from '../../lib/backupPasta'
import { diasDesde, DIAS_LEMBRETE, textoUltimoBackup, versaoDoManifesto } from '../../lib/backupFormato'

// Configurações → Dados → Backup. Exportar (com progresso), Restaurar (arquivo → prévia → digitar
// RESTAURAR → progresso → conferência), Conferir com um arquivo e, só no computador, o backup ao sair.
// Regras: src/lib/backupFormato.js · API: api/backup.js · aparelho: src/lib/backupPasta.js.

const fmtData = (iso) => { try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) } catch { return iso || '—' } }
const n = (x) => (x == null ? '—' : Number(x).toLocaleString('pt-BR'))

function Barra({ valor, total, rotulo }) {
  const pct = total ? Math.min(100, Math.round((valor / total) * 100)) : 0
  return (
    <div className="space-y-1" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={rotulo}>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
      <p className="text-xs text-texto-2">{rotulo} · {pct}%</p>
    </div>
  )
}

// Tabela "tabela | no arquivo | no banco | ok/diferente" — diferentes primeiro.
export function TabelaConferencia({ conferencia }) {
  const linhas = [...(conferencia || [])].sort((a, b) => Number(a.ok) - Number(b.ok) || a.tabela.localeCompare(b.tabela))
  const ruins = linhas.filter(c => !c.ok).length
  return (
    <div className="space-y-2">
      <p className={`text-sm font-medium flex items-center gap-1.5 ${ruins ? 'text-perigo' : 'text-primary-fg'}`}>
        {ruins ? <X size={15} /> : <Check size={15} />}
        {ruins ? `${ruins} tabela${ruins === 1 ? '' : 's'} diferente${ruins === 1 ? '' : 's'} de ${linhas.length}` : `Todas as ${linhas.length} tabelas conferem`}
      </p>
      <div className="max-h-[50vh] overflow-auto border border-borda rounded-lg">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface"><tr className="text-left text-texto-2 border-b border-borda">
            <th className="px-2 py-1.5 font-medium">Tabela</th><th className="px-2 py-1.5 font-medium text-right">No arquivo</th>
            <th className="px-2 py-1.5 font-medium text-right">No banco</th><th className="px-2 py-1.5 font-medium">Resultado</th>
          </tr></thead>
          <tbody>
            {linhas.map(c => (
              <tr key={c.tabela} className="border-b border-borda/50">
                <td className="px-2 py-1 break-all">{c.tabela}</td>
                <td className="px-2 py-1 text-right tabular-nums">{n(c.arquivo?.linhas)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{n(c.banco?.linhas)}</td>
                <td className={`px-2 py-1 ${c.ok ? 'text-primary-fg' : 'text-perigo'}`}>
                  {c.ok ? 'ok' : `diferente${c.motivo ? ` — ${c.motivo}` : c.banco?.linhas === c.arquivo?.linhas ? ' — conteúdo' : ''}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ListaPerfis({ usuarios, depois = false }) {
  if (!usuarios?.length) return null
  return (
    <div className="text-xs rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2 space-y-1">
      <p className="text-aviso font-medium">{depois
        ? 'Ajuste estes usuários: os perfis permitidos deles não existem mais (Configurações › Usuários).'
        : 'Estes usuários têm perfis permitidos que deixam de existir com o arquivo: depois de restaurar, eles veem menos (ou nada) até você ajustar.'}</p>
      <ul className="list-disc pl-4 text-texto-1">
        {usuarios.map(u => <li key={u.id}>{u.nome}{u.restam === 0 ? ' — fica sem nenhum perfil' : ''}</li>)}
      </ul>
    </div>
  )
}

const SUBSTITUIDO = 'Tudo o que é dado deste ambiente é trocado pelo do arquivo: contas, cartões, lançamentos, agendamentos, categorias, regras, reservas e o histórico delas, contratos, bens, financiamentos, consórcios, histórico de alterações, pendências, cadastros e preferências. O que não estiver no arquivo deixa de existir.'
const MANTIDO = 'Fica como está: usuários, senhas e acessos; o título e a frase do rodapé deste ambiente; o controle da plataforma.'

function Restaurar({ aberto, onFechar, arquivo, previa, aoTerminar }) {
  const [texto, setTexto] = useState('')
  const [fase, setFase] = useState('previa') // previa | restaurando | resultado | erro
  const [prog, setProg] = useState({ feitas: 0, total: 1, fase: 'enviando' })
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')
  if (!aberto || !arquivo || !previa) return null
  const m = arquivo.manifesto
  const v = previa.versao
  const recusa = v.recusar.length > 0
  const nomes = [...new Set([...Object.keys(m.tabelas), ...Object.keys(previa.atuais || {})])].sort()
  const restaurar = async () => {
    setFase('restaurando')
    try {
      const r = await restaurarBackup(arquivo, { onProgresso: setProg })
      setResultado(r)
      setFase('resultado')
    } catch (err) {
      setErro(err.message)
      setResultado(err.dados?.conferencia ? { conferencia: err.dados.conferencia } : null)
      setFase('erro')
    }
  }
  const fechar = () => { if (fase === 'restaurando') return; if (fase === 'resultado') aoTerminar(); else onFechar() }
  return (
    <Modal open={aberto} onClose={fechar} title="Restaurar backup" size="lg">
      <div className="space-y-3 text-sm" data-help-form="backupRestaurar">
        {fase === 'previa' && (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-texto-2">Origem</dt><dd className="text-texto-1">ambiente {String(m.ambiente || '—').toUpperCase()} · gerado em {fmtData(m.geradoEm)}{m.appHash ? ` · app ${m.appHash}` : ''}</dd>
              <dt className="text-texto-2">Destino</dt><dd className="text-texto-1">ambiente {String(previa.destino?.ambiente || '—').toUpperCase()} (este)</dd>
              <dt className="text-texto-2">Versão</dt><dd className="text-texto-1 break-all">arquivo {versaoDoManifesto(m) || '—'} · este banco {previa.destino?.ultima || '—'}</dd>
            </dl>
            {recusa && (
              <div role="alert" className="text-xs rounded-lg border border-perigo/40 bg-perigo-bg px-3 py-2 text-perigo space-y-1">
                <p className="font-medium">Não dá para restaurar este arquivo aqui. Nada foi alterado.</p>
                {v.recusar.map((r, i) => <p key={i}>{r}</p>)}
              </div>
            )}
            {!recusa && v.semMigracoes.length > 0 && (
              <p className="text-xs text-texto-2">O arquivo é de uma versão mais antiga: não tinha {v.semMigracoes.length === 1 ? 'a atualização' : 'as atualizações'} {v.semMigracoes.join(', ')}. As colunas novas ficam com o valor padrão{v.tabelasVazias.length ? ` e ficam vazias as tabelas ${v.tabelasVazias.join(', ')}` : ''}.</p>
            )}
            <ListaPerfis usuarios={previa.perfisSomem} />
            {previa.agenda?.assinaturas > 0 && (
              <p className="text-xs rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2 text-aviso">
                Este ambiente tem {previa.agenda.assinaturas} assinatura{previa.agenda.assinaturas === 1 ? '' : 's'} da Agenda no celular. Depois de restaurar, quem assinou passa a ver no celular os agendamentos do arquivo. Se não quiser, tire a assinatura do celular antes.
              </p>
            )}
            <div className="max-h-[35vh] overflow-auto border border-borda rounded-lg">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface"><tr className="text-left text-texto-2 border-b border-borda">
                  <th className="px-2 py-1.5 font-medium">Tabela</th><th className="px-2 py-1.5 font-medium text-right">No arquivo</th><th className="px-2 py-1.5 font-medium text-right">Hoje aqui</th>
                </tr></thead>
                <tbody>{nomes.map(t => (
                  <tr key={t} className="border-b border-borda/50"><td className="px-2 py-1 break-all">{t}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{n(m.tabelas[t]?.linhas ?? 0)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{n(previa.atuais?.[t])}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <p className="text-xs text-texto-1"><span className="font-semibold">Será substituído: </span>{SUBSTITUIDO}</p>
            <p className="text-xs text-texto-1">{MANTIDO}</p>
            <p className="text-xs text-texto-2">Tudo ou nada: se qualquer parte falhar, o banco fica exatamente como estava. Depois de restaurar, o Finup confere tabela por tabela com o arquivo.</p>
            {!recusa && (
              <label className="block text-xs text-texto-2" data-help-id="backup.confirmacao">
                Para confirmar, digite RESTAURAR<HelpCampo campo="backup.confirmacao" />
                <input className="input mt-1 w-full" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Palavra de confirmação" autoComplete="off" aria-label="Palavra de confirmação" />
              </label>
            )}
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button type="button" className="btn-secondary min-h-[40px]" onClick={onFechar}>Cancelar</button>
              {!recusa && <button type="button" className="btn-danger min-h-[40px] disabled:opacity-40" disabled={texto.trim() !== 'RESTAURAR'} onClick={restaurar}>Restaurar</button>}
            </div>
          </>
        )}
        {fase === 'restaurando' && (
          <div className="space-y-2">
            <Barra valor={prog.fase === 'aplicando' ? prog.total : prog.feitas} total={prog.total}
              rotulo={prog.fase === 'aplicando' ? 'Gravando tudo no banco e conferindo' : `Enviando o arquivo (parte ${prog.feitas + 1} de ${prog.total})`} />
            <p className="text-xs text-texto-2">Não feche esta aba.</p>
          </div>
        )}
        {fase === 'resultado' && resultado && (
          <>
            <p className="text-sm text-primary-fg font-medium">Backup restaurado{resultado.tempoMs ? ` em ${Math.max(1, Math.round(resultado.tempoMs / 1000))} s` : ''}. Conferência:</p>
            <TabelaConferencia conferencia={resultado.conferencia} />
            <ListaPerfis usuarios={resultado.perfisSomem} depois />
            <div className="flex justify-end"><button type="button" className="btn-primary min-h-[40px]" onClick={aoTerminar}>Recarregar o app</button></div>
          </>
        )}
        {fase === 'erro' && (
          <>
            <p role="alert" className="text-sm text-perigo">{erro}</p>
            <p className="text-xs text-texto-2">Nada foi alterado no banco.</p>
            {resultado?.conferencia && <TabelaConferencia conferencia={resultado.conferencia} />}
            <div className="flex justify-end"><button type="button" className="btn-secondary min-h-[40px]" onClick={onFechar}>Fechar</button></div>
          </>
        )}
      </div>
    </Modal>
  )
}

export default function BackupPanel({ avisoPendencias = () => false, aoRestaurar }) {
  const isMobile = useIsMobile()
  const { cfg, atualizar, sessao } = useBackupLocal()
  const pode = podeFazerBackup(sessao)
  const [exp, setExp] = useState(null) // { linhas, totalLinhas, tabela } | null
  const [msg, setMsg] = useState(null) // { tipo: 'ok'|'erro', texto }
  const [restauro, setRestauro] = useState(null) // { arquivo, previa }
  const [conf, setConf] = useState(null) // conferência sem restaurar
  const [ocupado, setOcupado] = useState('')
  const inputRestaurar = useRef(null)
  const inputConferir = useRef(null)
  const suporte = suportaPasta()

  // Só pelo clique no botão (nada exporta ao abrir, recarregar ou seguir um link). Ao terminar —
  // certo ou errado — a tela volta ao normal na hora; o "último backup" é gravado em segundo plano.
  const exportar = async () => {
    if (exp || ocupado) return
    setMsg(null)
    setExp({ linhas: 0, totalLinhas: 1, tabela: '' })
    let resultado = null
    try {
      resultado = await exportarBackup({ onProgresso: setExp })
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err?.message || String(err) })
    } finally {
      setExp(null)
    }
    if (!resultado) return
    try {
      baixarArquivo(resultado.nome, resultado.texto)
      atualizar({ ultimo: Date.now() })
      setMsg({ tipo: 'ok', texto: `Backup baixado: ${resultado.nome}` })
    } catch (err) {
      setMsg({ tipo: 'erro', texto: `O backup foi gerado, mas o navegador não baixou o arquivo: ${err?.message || err}` })
    }
  }

  const lerArquivo = async (e, para) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || exp || ocupado) return
    setMsg(null)
    if (para === 'restaurar' && avisoPendencias()) return
    setOcupado(para === 'restaurar' ? 'Lendo o arquivo e preparando a prévia…' : 'Lendo o arquivo e conferindo…')
    try {
      const { arquivo } = await lerArquivoBackup(file)
      if (para === 'restaurar') setRestauro({ arquivo, previa: await previaRestauracao(arquivo) })
      else setConf({ arquivo, conferencia: await conferirComArquivo(arquivo) })
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err.message })
    } finally { setOcupado('') }
  }

  const trocarPasta = async () => {
    try {
      const pasta = await escolherPasta()
      await atualizar({ pasta, nomePasta: pasta.name })
      setMsg({ tipo: 'ok', texto: `Pasta de backup: ${pasta.name}` })
    } catch (err) {
      if (err?.name !== 'AbortError') setMsg({ tipo: 'erro', texto: `Não foi possível usar a pasta: ${err.message}` })
    }
  }

  const ocupadoAgora = !!exp || !!ocupado
  const dias = diasDesde(cfg?.ultimo)

  return (
    <div className="card space-y-4" data-help-form="backup">
      <div className="flex items-center gap-2">
        <ShieldCheck size={15} className="text-primary-fg" />
        <h2 className="text-sm font-semibold text-texto-2">Backup de Dados</h2>
      </div>
      <p className="text-xs text-texto-2 -mt-2">
        O backup leva todos os dados deste ambiente: contas, cartões, lançamentos, agendamentos, categorias, regras, reservas e o histórico delas, contratos, bens, financiamentos, consórcios, histórico de alterações, pendências, cadastros e preferências. Não leva usuários, senhas e acessos, nem o controle da plataforma.
      </p>

      {!pode && (
        <p className="text-xs text-texto-2 bg-surface-2/60 rounded-lg px-3 py-2">Exportar, restaurar e conferir backup: só administrador com acesso a todos os perfis.</p>
      )}

      {pode && (
        <>
          <div data-guia="settings:backup.status" className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${dias == null || dias > DIAS_LEMBRETE ? 'text-aviso bg-aviso/5 border border-aviso/20' : 'text-texto-2 bg-surface-2/60'}`}>
            {dias == null || dias > DIAS_LEMBRETE ? <AlertTriangle size={12} className="shrink-0" /> : <Clock size={12} className="shrink-0 text-primary-fg" />}
            <span>{cfg ? textoUltimoBackup(cfg.ultimo, undefined, isMobile ? 'aparelho' : 'computador') : 'Carregando…'}{dias != null && dias > DIAS_LEMBRETE ? ' Faça um backup.' : ''}</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" data-guia="settings:backup.exportar" className="btn-primary flex items-center justify-center gap-2 flex-1 min-h-[40px] disabled:opacity-60" onClick={exportar} disabled={ocupadoAgora}>
              <Download size={14} /> {exp ? 'Exportando…' : 'Exportar backup completo'}
            </button>
            <label data-guia="settings:backup.importar" data-help-id="backup.importar" className={`btn-secondary flex items-center justify-center gap-2 flex-1 min-h-[40px] cursor-pointer ${ocupadoAgora ? 'opacity-60 pointer-events-none' : ''}`}>
              <Upload size={14} /> Restaurar backup<HelpCampo campo="backup.importar" />
              <input ref={inputRestaurar} type="file" accept=".json,application/json" className="hidden" onChange={e => lerArquivo(e, 'restaurar')} disabled={ocupadoAgora} />
            </label>
            <label data-guia="settings:backup.conferir" data-help-id="backup.conferir" className={`btn-secondary flex items-center justify-center gap-2 flex-1 min-h-[40px] cursor-pointer ${ocupadoAgora ? 'opacity-60 pointer-events-none' : ''}`}>
              <FileCheck2 size={14} /> Conferir com um arquivo<HelpCampo campo="backup.conferir" />
              <input ref={inputConferir} type="file" accept=".json,application/json" className="hidden" onChange={e => lerArquivo(e, 'conferir')} disabled={ocupadoAgora} />
            </label>
          </div>

          {exp && <Barra valor={exp.linhas} total={exp.totalLinhas} rotulo={exp.tabela ? `Exportando ${exp.tabela}` : 'Lendo o banco'} />}
          {ocupado && <p className="text-xs text-primary-fg">{ocupado}</p>}
          {msg && <p role={msg.tipo === 'erro' ? 'alert' : 'status'} className={`text-xs break-words ${msg.tipo === 'erro' ? 'text-perigo' : 'text-primary-fg'}`}>{msg.texto}</p>}

          <p className="text-xs text-texto-2 leading-relaxed">
            Restaurar troca os dados deste ambiente pelos do arquivo, tudo ou nada, e mantém usuários, senhas, acessos e a identidade do ambiente (título e frase do rodapé). Antes de restaurar, exporte um backup atual. &quot;Conferir com um arquivo&quot; compara o arquivo com o banco sem mudar nada.
          </p>

          {!isMobile && (
            <div data-guia="settings:backup.aoSair" className="border-t border-borda pt-3 space-y-3">
              <h3 className="text-xs font-semibold text-texto-1">Backup ao sair (neste computador)</h3>
              {suporte ? (
                <div className="flex flex-wrap items-center gap-2" data-help-id="backup.pasta">
                  <button type="button" className="btn-secondary flex items-center gap-2 min-h-[36px] text-xs" onClick={trocarPasta}>
                    <FolderOpen size={13} /> {cfg?.pasta ? 'Trocar pasta' : 'Escolher pasta de backup'}
                  </button>
                  <span className="text-xs text-texto-2">{cfg?.pasta ? <>Pasta: <span className="text-texto-1 font-medium">{cfg.nomePasta || cfg.pasta.name}</span></> : 'Nenhuma pasta escolhida.'}</span>
                  <HelpCampo campo="backup.pasta" />
                </div>
              ) : (
                <p className="text-xs text-texto-2">Este navegador não permite escolher uma pasta: ao sair, se você pedir o backup, o arquivo é baixado para a pasta Downloads.</p>
              )}
              <div className="flex flex-wrap gap-4">
                <label className="text-xs text-texto-2 flex items-center gap-2" data-help-id="backup.perguntarAoSair">
                  Perguntar ao sair<HelpCampo campo="backup.perguntarAoSair" />
                  <select className="input !py-1 !text-xs w-auto" aria-label="Perguntar ao sair" value={perguntarAoSair(cfg) ? 'sempre' : 'nunca'}
                    onChange={e => atualizar({ perguntar: e.target.value })}>
                    <option value="sempre">Sempre</option>
                    <option value="nunca">Nunca</option>
                  </select>
                </label>
                {suporte && (
                  <label className="text-xs text-texto-2 flex items-center gap-2" data-help-id="backup.manter">
                    Backups a manter na pasta<HelpCampo campo="backup.manter" />
                    <input type="number" min={1} max={100} className="input !py-1 !text-xs w-20" aria-label="Backups a manter na pasta" placeholder="Quantidade de arquivos"
                      value={cfg?.manter ?? MANTER_PADRAO} onChange={e => atualizar({ manter: Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || MANTER_PADRAO))) })} />
                  </label>
                )}
              </div>
              <p className="text-xs text-texto-2">Ao clicar em Sair, o Finup pergunta se quer fazer o backup antes{suporte ? ' e grava o arquivo na pasta, apagando os mais antigos do Finup deste ambiente além da quantidade escolhida (nenhum outro arquivo da pasta é tocado)' : ' e baixa o arquivo para Downloads'}. No celular não há pergunta: use o botão Exportar.</p>
            </div>
          )}
        </>
      )}

      {restauro && (
        <Restaurar aberto arquivo={restauro.arquivo} previa={restauro.previa}
          onFechar={() => setRestauro(null)} aoTerminar={() => { setRestauro(null); aoRestaurar?.() }} />
      )}
      <Modal open={!!conf} onClose={() => setConf(null)} title="Conferir backup com o banco" size="lg">
        {conf && (
          <div className="space-y-3">
            <p className="text-xs text-texto-2">Arquivo do ambiente {String(conf.arquivo.manifesto.ambiente || '—').toUpperCase()}, gerado em {fmtData(conf.arquivo.manifesto.geradoEm)}. Nada foi alterado.</p>
            <TabelaConferencia conferencia={conf.conferencia} />
          </div>
        )}
      </Modal>
    </div>
  )
}
