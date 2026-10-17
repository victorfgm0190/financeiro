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
- "Esqueci minha senha" e convite: ver **Links de senha** abaixo.

## Links de senha (esqueci / convite)

Rota pública `api/senha.js` (sem token, fora do `comAmbiente`); o ambiente vem como no login (endereço
ou campo Ambiente). Tokens na tabela `senha_tokens` **do banco do ambiente** (migração
`2026-10-17_senha_tokens.sql`): 32 bytes aleatórios em base64url, só o sha256 gravado, uso único, e
gerar um novo invalida os anteriores do mesmo usuário (`api/_senhaTokens.js`).

- `POST /api/senha?acao=esqueci { ambiente?, login }` → resposta SEMPRE "Se o usuário existir,
  enviaremos um link para o e-mail cadastrado." (inclusive ambiente inexistente/suspenso, usuário sem
  e-mail ou inativo, falha do e-mail). Usuário ativo com e-mail → link `redefinir` (1 h).
  Limite: 3 por hora por IP e 3 por hora por usuário (tabela `senha_pedidos` do central); acima do
  limite a resposta é a mesma, sem e-mail.
- `GET /api/senha?acao=validar&token=…` → `{ ok, nome, tipo }` ou 410 "Link expirado ou já utilizado".
- `POST /api/senha?acao=definir { token, novaSenha }` → mínimo 8; grava a senha, zera tentativas e
  bloqueio, `trocar_senha = false`.
- `POST /api/usuarios?acao=enviar-convite { id }` (só admin do ambiente) → link `convite` (48 h).
- O link do e-mail é `https://<endereço do ambiente>/definir-senha?token=…` (www para o `vm`,
  `<sigla>.finup.app.br` para clientes). validar/definir procuram o token **só** no banco do ambiente
  do endereço: token de um ambiente nunca vale em outro (nem no www).
- Telas: `/definir-senha` (pública; tira o token da URL ao abrir; sucesso → login com "Senha
  definida, faça login"); `/?esqueci=1` abre o login direto no pedido de link; Configurações ›
  Usuários tem o botão "Enviar link de senha" (desabilitado sem e-mail ou para inativo).
- E-mails: `api/_emailSenha.js`, com o visual comum de `api/_emailModelo.js` (o mesmo das boas-vindas).

## Criar o ambiente de um cliente (Aprovar) — Parte B

O botão **Aprovar** do Controle de Clientes chama `provisionarProximoPasso()` (`api/_provisionar.js`)
uma vez por passo; a tela mostra o progresso e, em erro, a mensagem e **Tentar novamente**. Cada passo
é idempotente e grava `prov_<passo>` no `plataforma_historico` (falha → `prov_falhou`); repetir
continua do passo pendente e nunca duplica.

1. **ambiente** — linha em `ambientes` (`status 'provisionando'`, `database_name 'cliente_<sigla>'`);
   cliente → `aprovado`.
2. **database** — `POST /projects/{NEON_PROJECT_ID}/branches/{NEON_BRANCH_ID}/databases` (dono
   `neondb_owner`) e espera a operação terminar (`api/_neon.js`). Já existe → segue.
3. **estrutura** — `supabase/estrutura_base.sql` + todas as migrações, numa transação, registradas em
   `_migracoes`; `ambientes.schema_versao` atualizada.
4. **kit** — `api/_kitBasico.js` (lista única do que um cliente novo ganha).
5. **admin** — organização + usuário `admin` (nome e e-mail do cliente, nível admin, senha aleatória
   inutilizável).
6. **convite** — token `convite` (48 h, `api/_senhaTokens.js`) e e-mail de boas-vindas com o botão
   "Criar minha senha" → `https://<sigla>.finup.app.br/definir-senha?token=…`.
7. **ativar** — `ambientes.status` e `plataforma_clientes.status` → `ativo`.

Cliente ativo: **Reenviar convite** (convite novo; o anterior deixa de valer) e **Mensagem de
boas-vindas** (copiar/WhatsApp). Ciclo de vida: Suspender → ambiente `suspenso` (login e API
respondem "Ambiente indisponível"); Reativar → volta a `ativo` (se já tinha sido ativado; senão o
provisionamento continua); Cancelar → `cancelado`, **sem apagar o database** (exclusão definitiva é
outra etapa, com confirmação dupla).

**Regra: o banco do cliente nasce vazio.** Nada é copiado do neondb.

- `supabase/estrutura_base.sql` é GERADO a partir do catálogo do neondb (só estrutura, nenhum comando
  de dados): `node --env-file=.env.local scripts/gerar-estrutura-base.js`. A API usa a cópia embutida
  em `api/_sqlEmbutido.js`: depois de mudar a estrutura ou criar uma migração, rode
  `node scripts/gerar-sql-embutido.js` (o teste `api/provisionar.test.js` falha se esquecer).
- O `supabase/schema.sql` antigo não roda num banco vazio e tem seeds do Victor: fica só como referência.

### O que é só do ambiente principal (`vm`)

- Seeds do navegador (`seedDefaults(defaultData)`, o plano de contas antigo) e os seeds/ajustes por
  nome do `/api/load` (categorias Capitalização/Consórcio, conversão "Consórcio HS",
  `exibir_como_despesa` por nome de função de reserva).
- De-para e importação **Dindin**: Configurações › Dados › Importação, a aba "Conta Corrente" do
  Importar (extrato Dindin), `GET /api/account-mapping` (cliente → lista vazia) e o sync da tabela
  `account_mapping` (cliente → 403). O "Cartão de Crédito" (Importar Fatura) vale para todos.
- Rodapé da barra lateral: colunas `configuracoes.rodape_titulo` / `rodape_frase`. Vazias no `vm` = o
  texto de sempre ("Gislaine & Victor Moreira" / "Transformando conhecimento em resultados."); no
  cliente o kit grava o nome (ou a empresa, se PJ).
- Dia de início do mês financeiro: já é por banco (`configuracoes.financial_month_start_day`), editável
  em Configurações › Geral; o kit grava 1, o `vm` continua 15.
- O `/api/load` só devolve "banco vazio" quando não há configurações nem categorias: cliente novo, com
  o kit e sem contas, abre normalmente (sem semear nada).

## Migrações em todos os ambientes

```
node --env-file=.env.local scripts/migrar-central.js [--dry-run]  # esquema do central (supabase/central/*.sql)
node --env-file=.env.local scripts/migrar-ambientes.js --dry-run  # lista o que faria
node --env-file=.env.local scripts/migrar-ambientes.js            # aplica
```

`migrar-ambientes.js` percorre os ambientes `ativo` e `suspenso` (os dos clientes também), aplica as migrações pendentes de
`supabase/migrations` (ordem de nome) e grava `ambientes.schema_versao` = nº de migrações aplicadas.
Cada database registra os nomes em `_migracoes`. Database sem `_migracoes` (o neondb, migrado à mão)
registra as primeiras `schema_versao` migrações como linha de base, sem rodá-las de novo.

## Variáveis

| variável | onde | valor |
|---|---|---|
| `CENTRAL_DATABASE_URL` | Vercel + `.env.local` | URL do `finup_central` |
| `AMBIENTE_PADRAO` | Vercel (+ local) | `vm` — ambiente de `financeiro-gnsm.vercel.app` e `localhost` |
| `NEON_DATABASE_URL` | só scripts (`gerar-estrutura-base`, antigos) | a API não usa mais |
| `NEON_API_KEY` | Vercel + `.env.local` (Secret) | chave do projeto finup — cria o database do cliente |
| `NEON_PROJECT_ID` / `NEON_BRANCH_ID` | Vercel + `.env.local` | projeto finup / branch production |
