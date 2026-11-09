import { getSessao } from '../../lib/api'

// "ambiente · commit" (ex.: "teste1 · a1b2c3d"): mostra qual código está no ar em cada endereço.
// O commit vem do build (vite.config.js: VERCEL_GIT_COMMIT_SHA com 7 caracteres; local, o git).
// Prova de que o teste1 segue a branch homologacao e o www segue o main.
export const textoVersao = (sigla, commit) => `${sigla || 'vm'} · ${commit || 'dev'}`

export default function VersaoAmbiente({ className = '' }) {
  const texto = textoVersao(getSessao()?.ambSigla, import.meta.env.VITE_APP_COMMIT)
  return (
    <p data-testid="versao-ambiente" className={`text-[10px] text-texto-3 leading-tight font-mono ${className}`} title="Ambiente e versão (commit) em execução">
      {texto}
    </p>
  )
}
