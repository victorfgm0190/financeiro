# Testes automatizados (Vitest)

## Comandos

| comando | o que roda | tempo nesta máquina* |
|---|---|---|
| `npm run test:logica` | lógica (`src/lib`, `src/hooks`, `src/context`, `src/help`, `scripts`) e depois `api/` | ~5 min |
| `npm run test:telas` | telas (`src/components`, `src/pages`, `src/mobile`) | ~2,5 min |
| `npm test` (= `npm run test:tudo`) | os dois acima, em sequência | ~7,5 min |

\* i7-1355U, 12 threads, em 09/11/2026: lógica com 227 arquivos e 2.849 testes; telas com 84
arquivos e 532 testes.

Um arquivo só: `npx vitest run caminho/do/arquivo.test.jsx`. O projeto certo é escolhido pela pasta.

Antes de cada commit, nesta ordem e sempre em primeiro plano com limite de tempo:
1. lint: `npm run lint`
2. `npm test`
3. `npm run build`
4. `npm run help:check`

## Como a suíte está dividida (`vite.config.js`, `test.projects`)

| projeto | arquivos | limite por teste | workers |
|---|---|---|---|
| `logica` | tudo fora de `api/` e das pastas de tela | 5 s (padrão) | 6 |
| `api` | `api/**/*.test.js` (Postgres em WASM, PGlite) | 30 s; hooks 60 s | 4 |
| `telas` | `src/components`, `src/pages`, `src/mobile` | 15 s | 4 |

- **Por que separar.** Montar uma tela grande (jsdom + React) leva de 1 a 4 s sozinha. Com a suíte
  inteira em paralelo, todos os núcleos ficavam ocupados, dezenas de testes de tela passavam dos
  5 s e a rodada não cabia em 10 min, embora todos passassem isolados. Agora as telas rodam
  depois, com no máximo 4 workers e limite de 15 s. A lógica mantém o limite padrão.
- **Pasta nova.** Fora de `api/` e das pastas de tela, cai sozinha em `logica`. Pasta de tela nova
  precisa entrar em `PASTAS_DE_TELA` no `vite.config.js`.
- **Teste que precisa de mais tempo.** Alguns arquivos ainda definem um limite próprio
  (`LENTO = { timeout: 90_000 }`): `help:check` dentro do teste e telas inteiras com vários tipos de
  formulário. Use esse recurso só quando o teste for lento também isolado.
- **Se um teste de tela falhar só por tempo:** rode o arquivo isolado
  (`npx vitest run <arquivo> --maxWorkers=1`). Se passar, é carga da máquina, não um bug. Feche
  programas pesados (OBS, por exemplo) e rode de novo.
