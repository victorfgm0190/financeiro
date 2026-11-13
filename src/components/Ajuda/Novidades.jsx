// "O QUE MUDOU NESTA VERSÃO" (lista em src/novidades.js, regras em src/lib/novidades.js):
//   • NovidadesLista — o histórico (Ajuda → Novidades) e o miolo da janela;
//   • OQueMudou — janela que abre sozinha com as versões que a pessoa ainda não viu. A última vista
//     fica no servidor (/api/boas-vindas, progresso.novidadeVista): vale em todos os aparelhos.
//     Quem ainda não viu as boas-vindas (usuário novo) não recebe a janela: marca a mais nova como vista.
//     Espera tour/guia/jornada e outras janelas; um aviso de cada vez (src/lib/filaDeAvisos.js).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import Modal from '../shared/Modal'
import { NOVIDADES } from '../../novidades'
import { maisNovaPrimeiro, novidadesNaoVistas, versaoMaisNova, visivelPara, paraRecursos, semRecurso, novidadesDeRecursoNaoVistas } from '../../lib/novidades'
import { assinarBoasVindas, estadoBoasVindas, marcarNovidadeVista, marcarNovidadesRecursoVistas } from '../../lib/boasVindasApi'
import { useRecursosLiberados } from '../../hooks/useStatusSugestoesIa'
import { statusSugestoesImportacao } from '../../lib/sugestoesImportacaoApi'
import { getSessao } from '../../lib/api'
import { haModalAberto } from '../../lib/recargaRemota'
import { useTourAtivo } from '../BoasVindas/tourEstado'
import { usePassoJornadaAtivo } from '../BoasVindas/jornadaEstado'
import { useVezDoAviso } from '../../hooks/useVezDoAviso'

const dataBr = (iso) => { const [a, m, d] = String(iso).split('-'); return `${d}/${m}/${a}` }
const ehAdmin = () => getSessao()?.nivel === 'admin'

export function NovidadesLista({ novidades }) {
  return (
    <ol className="space-y-3" data-testid="novidades-lista">
      {novidades.map(n => (
        <li key={n.id} className="rounded-lg border border-borda p-3" data-testid={`novidade-${n.id}`}>
          <p className="text-sm font-semibold text-texto-1">{n.titulo}</p>
          <p className="text-[11px] text-texto-3">{dataBr(n.data)}{n.publico === 'admin' ? ' · para administradores' : ''}</p>
          <ul className="list-disc pl-5 mt-1 space-y-0.5 text-sm text-texto-1">{n.itens.map(i => <li key={i}>{i}</li>)}</ul>
        </li>
      ))}
    </ol>
  )
}

// Ajuda → Novidades: o histórico completo que esta pessoa pode ver (as de recurso contratado só com
// o recurso liberado).
export function HistoricoNovidades({ lista = NOVIDADES, carregarStatus = statusSugestoesImportacao }) {
  const admin = ehAdmin()
  const { recursos } = useRecursosLiberados(carregarStatus)
  const liberado = Object.values(recursos).some(Boolean)
  const itens = useMemo(() => paraRecursos(maisNovaPrimeiro(lista), liberado ? recursos : {}).filter(n => visivelPara(n, { admin })), [lista, admin, liberado]) // eslint-disable-line react-hooks/exhaustive-deps
  return <NovidadesLista novidades={itens} />
}

function useBoasVindas() {
  const [e, setE] = useState(estadoBoasVindas)
  useEffect(() => assinarBoasVindas(setE), [])
  return e
}

export default function OQueMudou({ lista = NOVIDADES, espera = 1500, carregarStatus = statusSugestoesImportacao }) {
  const bv = useBoasVindas()
  const tour = useTourAtivo()
  const passo = usePassoJornadaAtivo()
  const [aberto, setAberto] = useState(false)
  const marcouRef = useRef(false)

  // Novidades gerais: marca "última versão vista". As de RECURSO contratado (só com o recurso liberado)
  // têm "já vi" próprio — liberado depois, aparecem na próxima abertura; status que falha não as esconde.
  const { recursos } = useRecursosLiberados(carregarStatus)
  const liberadoIa = Object.values(recursos).some(Boolean)
  const maisNova = versaoMaisNova(semRecurso(lista))
  const vista = bv?.progresso?.novidadeVista || null
  const vistasRecurso = bv?.progresso?.novidadesRecursoVistas
  const usuarioNovo = !!bv && !bv.tourVistoEm && bv.guiasLigados !== false
  const naoVistas = useMemo(() => {
    if (!bv) return []
    const gerais = novidadesNaoVistas(lista, vista, { admin: ehAdmin() })
    const deRecurso = novidadesDeRecursoNaoVistas(lista, vistasRecurso || [], liberadoIa ? recursos : {}, { admin: ehAdmin() })
    return maisNovaPrimeiro([...gerais, ...deRecurso])
  }, [bv, lista, vista, vistasRecurso, liberadoIa]) // eslint-disable-line react-hooks/exhaustive-deps
  const quer = !!bv && !usuarioNovo && naoVistas.length > 0
  const { naFrente } = useVezDoAviso('novidades', quer || aberto)

  // Nada a mostrar (usuário novo, só itens de administrador, tudo antigo): grava a mais nova como vista.
  // As de recurso não entram aqui (só são marcadas quando aparecem).
  useEffect(() => {
    if (!bv || marcouRef.current || !maisNova || vista === maisNova) return
    if (usuarioNovo || naoVistas.length === 0) { marcouRef.current = true; marcarNovidadeVista(maisNova) }
  }, [bv, usuarioNovo, naoVistas.length, maisNova, vista])

  const bloqueado = !!tour || !!passo || !!bv?.tourAberto || naFrente
  useEffect(() => {
    if (!quer || aberto || bloqueado) return
    // Outra janela aberta: tenta de novo até ela fechar.
    const t = setInterval(() => { if (!haModalAberto()) setAberto(true) }, espera)
    return () => clearInterval(t)
  }, [quer, aberto, bloqueado, espera])

  if (!aberto) return null
  const fechar = () => {
    setAberto(false); marcouRef.current = true
    if (maisNova && vista !== maisNova) marcarNovidadeVista(maisNova)
    const deRecurso = naoVistas.filter(n => n.recurso).map(n => n.id)
    if (deRecurso.length) marcarNovidadesRecursoVistas(deRecurso)
  }
  return (
    <Modal open onClose={fechar} title="O que mudou no Finup" size="md">
      <div className="space-y-3" data-testid="o-que-mudou" data-help-id="novidades.janela">
        <p className="text-sm text-texto-2 flex items-center gap-1.5"><Sparkles size={14} className="text-primary-fg" aria-hidden="true" /> Novidades desde a última vez que você abriu o Finup.</p>
        <NovidadesLista novidades={naoVistas} />
        <p className="text-xs text-texto-3">O histórico completo fica em Ajuda → Novidades.</p>
        <div className="flex justify-end">
          <button type="button" className="btn-primary" onClick={fechar}>Entendi</button>
        </div>
      </div>
    </Modal>
  )
}
