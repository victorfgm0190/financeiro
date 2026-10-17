# Ambientes (multi-cliente) — um banco por cliente

Etapa 2, Parte A. Cada cliente tem o **próprio database** no mesmo projeto Neon. Um **banco
central** (`finup_central`) guarda a lista de ambientes. Nesta parte só existe o ambiente do Victor
(`vm` → database `neondb`); nenhum banco de cliente foi criado ainda.

## Banco central (`finup_central`)

Esquema em `supabase/central/` (idempotente), aplicado por `scripts/migrar-central.js`:

| tabela | para quê |
|---|---|
| `ambientes` | `id`, `sigla` (UNIQUE, minúscula), `nome`, `database_name`, `status` (`ativo`/`suspenso`/`cancelado`/`provisionando`), `cliente_id`, `schema_versao`, `created_at`, `updated_at` |
| `login_handoff` | código de passagem do login: `codigo_hash` (sha256), `ambiente_id`, `usuario_id`, `payload` (JSONB), `expira_em` (60 s), `usado_em` |
| `plataforma_clientes`, `plataforma_historico`, `plataforma_cadastro_envios` | pedidos e Controle de Clientes (DDL em `api/_plataforma.js`) |

Seed: `vm` / "Victor Moreira" / `neondb` / `ativo` / `schema_versao = 2`.

**Nenhuma URL nem senha fica na tabela.** A URL de um ambiente é a `CENTRAL_DATABASE_URL` com o nome
do database trocado por `ambientes.database_name` (mesmo host, mesmo usuário): `urlDoDatabase()` em
`api/_conexao.js`.

Siglas reservadas (nenhum cliente usa): `www app api admin mail suporte login finup vm`
(`SIGLAS_RESERVADAS` em `src/lib/plataforma.js`). Sigla de cliente também não pode repetir a de um
ambiente existente (`siglaOcupada` olha `plataforma_clientes` e `ambientes`).

> As cópias antigas de `plataforma_*` no `neondb` **continuam lá** até o Victor conferir e apagar.
> `scripts/copiar-plataforma-central.js` copia (ON CONFLICT DO NOTHING) e mostra as contagens antes/depois.

## Conexão por ambiente (API)

- `api/_conexao.js`: um `Pool` por database em cache; `AsyncLocalStorage` com o ambiente da requisição;
  `rodarNoAmbiente(amb, fn)`; `poolDoContexto()` lança `ErroSemAmbiente` sem contexto — **não existe
  banco padrão**. A API não lê mais `NEON_DATABASE_URL` (só os scripts antigos).
- `api/_db.js`: `query`, `withTransaction`, `upsertRows`, `deleteRows`… usam o banco do contexto.
- `api/_central.js`: acesso explícito ao central (`centralQuery`, `withCentralTransaction`,
  `buscarAmbientePorSigla` com cache de 30 s).
- `api/_ambiente.js`: **toda rota protegida** exporta `export default comAmbiente(handler)`. O wrapper
  confere o token (401), o ambiente do token × endereço (401), o status (403 "Ambiente
  indisponível") e roda o handler no contexto. O teste `api/ambientes.test.js` falha se uma rota
  (fora `auth`, `cadastro-publico`, `sigla-disponivel`) não estiver envolvida.
- Rotas públicas: `cadastro-publico` e `sigla-disponivel` usam o central; `auth` usa o ambiente
  informado (campo ou endereço). `clientes` usa o central e só responde no ambiente `vm` para o
  `PLATAFORMA_ADMIN`.
- `ensure*Schema()` de runtime marcam "já rodei" **por database** (`registroPorBanco()`).

## Endereços e login

| endereço | ambiente |
|---|---|
| `www.finup.app.br` | `vm`; tela com campo Ambiente (o navegador lembra o último digitado) |
| `finup.app.br` | redireciona para o www (domínio na Vercel) |
| `vm.finup.app.br` | redireciona para o www (`vercel.json`) |
| `<sigla>.finup.app.br` | a sigla; campo Ambiente oculto ("Ambiente: CM") |
| `financeiro-gnsm.vercel.app`, `localhost` | `AMBIENTE_PADRAO` (variável; valor `vm`), como o www |

- JWT ganha `amb` (id) e `amb_sigla`. Em cada requisição o ambiente do token tem de ser o do
  endereço: no www só vale token do `vm`; em `<sigla>.finup.app.br` só da sigla. Token antigo (sem
  `amb`) vale como `vm` até expirar.
- Ambiente inexistente, suspenso ou senha errada → sempre "Usuário, senha ou ambiente inválidos".
- Bloqueio por tentativas: por usuário, no banco do ambiente. Login fixo de emergência
  (`ADMIN_USER`/`ADMIN_PASS`) só no `vm`.
- Login no www com sigla de **cliente**: a API grava um código de uso único (60 s, só o hash) em
  `login_handoff` e responde `{ redirect: "https://<sigla>.finup.app.br/entrar?c=<código>" }`. A página
  `/entrar` chama `POST /api/auth?acao=trocar-codigo`, salva o token no localStorage daquele endereço e
  limpa a URL. Código expirado, reutilizado ou de outro ambiente → 401.
- "Esqueci minha senha": por ora só a mensagem "Fale com o administrador do seu ambiente".

## Migrações em todos os ambientes

```
node --env-file=.env.local scripts/migrar-central.js            # esquema do central
node --env-file=.env.local scripts/migrar-ambientes.js --dry-run  # lista o que faria
node --env-file=.env.local scripts/migrar-ambientes.js            # aplica
```

`migrar-ambientes.js` percorre os ambientes `ativo`, aplica as migrações pendentes de
`supabase/migrations` (ordem de nome) e grava `ambientes.schema_versao` = nº de migrações aplicadas.
Cada database registra os nomes em `_migracoes`. Database sem `_migracoes` (o neondb, migrado à mão)
registra as primeiras `schema_versao` migrações como linha de base, sem rodá-las de novo.

## Variáveis

| variável | onde | valor |
|---|---|---|
| `CENTRAL_DATABASE_URL` | Vercel + `.env.local` | URL do `finup_central` |
| `AMBIENTE_PADRAO` | Vercel (+ local) | `vm` — ambiente de `financeiro-gnsm.vercel.app` e `localhost` |
| `NEON_DATABASE_URL` | só scripts antigos | a API não usa mais |
