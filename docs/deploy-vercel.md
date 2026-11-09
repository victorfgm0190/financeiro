# Deploy na Vercel: produção e homologação

Configuração feita pelo usuário no painel em 09/11/2026 e conferida por ele: o rodapé do teste1
mostrou "teste1 · ddb590c" e produção continuou no `45de725` do `main`. Regra das branches:
`CLAUDE.md`, seção "Branches e deploy".

## Branches e endereços

Há um projeto só na Vercel (`financeiro-gnsm`). O ambiente é escolhido pelo endereço
(`src/lib/ambienteHost.js`).

| branch | tipo de deploy | endereços |
|---|---|---|
| `main` | Production | `www.finup.app.br` (vm), `finup.app.br` e `vm.finup.app.br` (redirecionam para o www), `cv.`, `ggsm.` e as outras siglas |
| `homologacao` | Preview | `teste1.finup.app.br` (domínio ligado à branch) |
| qualquer outra (`feat/…`, `fix/…`) | Preview | só a URL `…vercel.app` da Vercel; cai no teste1 (`AMBIENTE_PADRAO` de Preview) e pede o login do Finup |

- **DNS:** os nameservers de `finup.app.br` são da Vercel (`ns1`/`ns2.vercel-dns.com`), com
  curinga. Domínio novo no projeto não precisa de registro fora da Vercel.
- **Ignored Build Step:** NÃO configurado (decisão do usuário). Todo push, de qualquer branch,
  gera um deploy.
- **Deployment Protection (Vercel Authentication):** DESLIGADA, porque bloqueava as chamadas
  `/api` no teste1. Quem abre um Preview cai na tela de login do Finup do ambiente teste1.

## Variáveis de ambiente (só os nomes)

| variável | Production | Preview | observação |
|---|:-:|:-:|---|
| `ANTHROPIC_API_KEY` | ✓ | ✓ | |
| `FINUP_DB_ESTRITO` | ✓ | ✓ | |
| `CENTRAL_DATABASE_URL` | ✓ | ✓ | |
| `FINUP_DB_KEY` | ✓ | ✓ | |
| `ADMIN_DATABASE_URL` | ✓ | ✓ | |
| `EMAIL_FROM` | ✓ | ✓ | |
| `RESEND_API_KEY` | ✓ | ✓ | |
| `JWT_SECRET` | ✓ | ✓ | já estava nos dois |
| `NEON_DATABASE_URL` | ✓ | ✓ | já estava nos dois |
| `VITE_SUPABASE_*` | ✓ | ✓ | já estavam nos dois |
| `ALLOW_ENV_ADMIN`, `ADMIN_USER`, `ADMIN_PASS` | ✓ | — | acesso de emergência só em produção |
| `PLATAFORMA_ADMIN` | ✓ | — | Controle de Clientes só em produção |
| `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_BRANCH_ID` | ✓ | — | criar o banco de um cliente (Aprovar) só funciona em produção |
| `AMBIENTE_PADRAO` | `vm` | `teste1` | ambiente de `…vercel.app` e de hosts sem sigla |
| `AGENDA_TOKEN_KEY` | ✓ | ✓ | criada em 09/11/2026, **chaves diferentes** em cada ambiente, Sensitive (ver abaixo) |
| `VERCEL_GIT_COMMIT_SHA` | auto | auto | variável de sistema; vira o hash do rodapé |

Variável nova ou alterada só vale nos deploys feitos depois. Para aplicá-la, faça Redeploy do deploy
atual da branch.

### `AGENDA_TOKEN_KEY`

Criada em 09/11/2026: uma chave em Preview e outra, diferente, em Production. O redeploy foi feito só
na `homologacao`; em produção, a chave passa a valer no próximo deploy do `main`. Chave diferente por
ambiente funciona porque cada ambiente só lê os feeds da própria sigla.

Se a chave mudar, as agendas já assinadas continuam atualizando: a rota pública procura o
`token_hash` e não usa a chave. O que se perde é o dono rever o link na tela. Aparece "a chave
do servidor mudou" com o botão **Gerar novo link**, que revoga o link antigo e cria outro.

A chave só é usada pela "Agenda no celular" (Configurações; feed `.ics` por usuário; ver
`docs/agenda-celular.md`). Sem ela:
- a tela mostra o aviso "Agenda no celular indisponível: falta configurar a chave…" e não gera link;
- `/api/agenda-feed` recusa a criação com 503;
- nada mais no app depende dela.

Formato: 32 bytes aleatórios em base64 (44 caracteres) ou em hex (64 caracteres). Não troque a chave sem
motivo: cada dono teria de usar "Gerar novo link" e adicionar a agenda de novo nos aparelhos.

## Conferir qual commit está no ar

O rodapé do menu (desktop), o fim de Configurações e o fim de Mais (celular) mostram
"ambiente · hash", por exemplo "teste1 · ddb590c". No teste1, o hash tem de ser o último commit
da `homologacao`. No www, o do `main`.
