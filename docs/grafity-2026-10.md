# Análise GRAFITY — Finup, outubro/2026

Data: 19/10/2026 · Base: `main` em `172188e` · Escopo: só leitura (nenhum código alterado, nenhuma
escrita no banco — apenas `SELECT` nos bancos principal e central).

Comparação com a análise de 18/09/2026 (score 7.8). Aquele relatório não está versionado no
repositório; a comparação usa os itens do plano de 18/09 (P0/P1/P2) reproduzidos na seção 3.

---

## 1. Resumo

- Em um mês entraram 50 commits: multi-cliente (um banco por ambiente + banco central), níveis de
  usuário, modo sem internet (fila em IndexedDB), feed .ics da agenda, motor de integridade,
  importação de qualquer banco (OFX/planilha), regras novas da Importar Fatura, atalhos, tema
  claro/escuro, navegação mobile, tipos de documento, histórico/edição em série e conta central por
  perfil.
- Suíte de testes: **89 arquivos, 1157 testes, todos passando** (`npx vitest run`, 19/10).
- Do plano de 18/09: os dois P0 estão resolvidos (deduplicação feita por outra implementação;
  "bug gerencial-groups" é **falso positivo**). P1 e P2 de resiliência de rede seguem **quase todos
  pendentes** (só `bemApi.js` tem timeout; não há X-Request-ID, BroadcastChannel, timeout de query
  nem `/api/health`).
- O salto para multi-cliente trouxe achados de segurança novos. O mais grave era: **`/api/sync`
  aceitava qualquer nome de tabela vindo do cliente e o concatenava no SQL** (P0, B1) —
  **corrigido em 19/10** (lista fechada de tabelas + identificadores validados e entre aspas +
  colunas conferidas; ver §5.4 e §5.5).
- O usuário Postgres usado pelo `/api` (`neondb_owner`) é o **mesmo em todos os bancos**, é dono de
  todos eles (inclusive o central) e herda `neon_superuser` (CREATEROLE, CREATEDB, BYPASSRLS,
  REPLICATION). Qualquer injeção de SQL futura alcançaria todos os clientes (§5.5) — passa a ser o P0
  aberto.
- Isolamento entre clientes é bom: o ambiente vem do JWT assinado e cada cliente tem banco
  próprio; trocar o Host só gera 401. Dentro de um mesmo cliente, porém, leituras não respeitam a
  permissão "ver" e várias rotas ignoram os perfis permitidos.

**Conexões mapeadas: 65 — 38 OK · 22 risco · 5 bug** na análise; **39 OK · 22 risco · 4 bug**
depois da correção do B1 no mesmo dia.
**Score: 7.0 / 10** na análise (era 7.8) → **7.2** com o B1 corrigido. Não é piora do que existia:
o escopo passou a ser multi-cliente e a régua de segurança subiu. Com os demais P0 e P1 abaixo
resolvidos, a estimativa é **8.2**.

---

## 2. Mapa de conexões

### 2.1 Fluxo geral

```
Navegador (React)
 ├─ AppContext ──► IndexedDB finup_<amb>_<user>  (kv 'estado' = cache; 'fila' = pendências)
 │      │            src/lib/armazenamentoLocal.js:14-109
 │      ├─ carga: GET /api/load  (db.js:948) → banco é a autoridade; fila reaplicada por cima
 │      └─ envio: fila → POST /api/sync | /api/sync-srf | /api/lancamento-rateios (lotes de 500)
 ├─ wrappers: db.js (apiGet/apiPost/apiPut/apiDelete) + 6 chamar() + bemApi.request()
 ├─ fetch cru: Login, DefinirSenha, EntrarComCodigo
 ├─ localStorage: auth_token (JWT), preferências de UI, finup_reserve_balances (dado de negócio)
 └─ sessionStorage: perfil ativo, passagem entre telas, scroll

Vercel /api (Node, pg.Pool)
 ├─ comAmbiente (_ambiente.js:32-55): JWT válido + amb_sigla do token = sigla do host
 ├─ requireAuth (_auth.js:48-61) + regraDaRota (src/lib/permissoes.js:160)
 ├─ _conexao.js: Pool por banco (max 3), AsyncLocalStorage escolhe o banco do ambiente
 ├─ Banco do ambiente (Neon) — 50 tabelas no principal
 ├─ Banco central (Neon) — 9 tabelas (ambientes, agenda, plataforma, senha)
 ├─ Neon Management API (_neon.js) — provisionamento de cliente
 └─ Resend (_email.js) — e-mails de boas-vindas/senha
```

### 2.2 Tabelas reais no Neon (19/10, `information_schema.tables`)

**Banco principal (`vm`) — 50 tabelas** (linhas aproximadas de `pg_stat_user_tables`):

| tabela | linhas | tabela | linhas | tabela | linhas |
|---|---:|---|---:|---|---:|
| _migracoes | 5 | historico_alteracoes | 107 | plataforma_historico | 6 |
| account_mapping | 85 | import_layouts | 0 | regras_classificacao | 1253 |
| agendamentos | 340 | importacao_depara | 0 | reservas | 0 |
| atalhos_usuario | 0 | importacoes_lancamentos | 0 | reservas_funcoes | 5 |
| bem_movimentacoes | 5 | importacoes_pendentes | 0 | reservas_movimentos | 0 |
| card_imports | 42 | lancamento_rateios | 134 | reserve_adjustments | 4 |
| cartoes | 8 | lancamentos | 4310 | reserve_daily_ledger | 4042 |
| categorias | 219 | login_bloqueios | 0 | reserve_functions | 42 |
| configuracoes | 1 | marcos_saldo_gerencial | 0 | reserve_period_snapshots | 41 |
| contas | 70 | membros | 2 | reserve_periods | 41 |
| envelopes | 5 | orcamento | 0 | schedule_reserva_funcoes | 1487 |
| favorecido_alias | 3 | organizacoes | 1 | senha_tokens | 1 |
| favorecidos | 787 | pendencias_integridade | 187 | tipos_documento | 12 |
| financing | 1 | perfis | 2 | usuarios | 2 |
| financing_installments | 60 | plataforma_cadastro_envios | 1 | | |
| fluxo_consultas | 3 | plataforma_clientes | 1 | | |
| fluxo_datas_provisorias | 5 | | | | |
| fluxo_provisorios | 0 | gerencial_rules | 0 | grupos_conta | 29 |

**Banco central — 9 tabelas:** agenda_cache (2), agenda_feeds (2), ambientes (2), login_handoff (1),
plataforma_cadastro_envios (1), plataforma_clientes (2), plataforma_exclusoes (1),
plataforma_historico (16), senha_pedidos (15).

`SHOW statement_timeout` = **0** (sem limite) nos dois bancos.

### 2.3 Arquivos em `/api`

**Rotas (49):**
- Raiz (36): account-mapping, agenda, agenda-feed, agendamentos, atalhos, auth,
  backfill-ger-rastreabilidade, cadastro-publico, clientes, fatura-conferencia, fluxo-consultas,
  fluxo-datas-provisorias, fluxo-provisorios, historico, import-layouts, importacoes-lancamentos,
  importacoes-pendentes, integridade, lancamento-rateios, load, ping, reserve-adjustments,
  reserve-daily-ledger, reserve-function-transactions, reserve-periods, reserve-snapshots, search,
  senha, sigla-disponivel, sync, sync-srf, tipos-documento, transaction-history,
  transactions-bulk-update, transferencias-executadas, usuarios.
- `bem/` (7): criar, migrate, [id], [id]/atualizar-valores, [id]/estornar-entrada,
  [id]/movimentacoes, [id]/registrar-entrada.
- `financiamento/` (6): criar, [id], [id]/parcelas, parcela/[id]/favorecido, parcela/[id]/pagar,
  parcelas/popular-rateios.

**Módulos internos (23, prefixo `_`):** _agendaFeed, _ambiente, _auth, _bem, _central, _conexao,
_db, _email, _emailBoasVindas, _emailModelo, _emailSenha, _excluirCliente, _historico, _kitBasico,
_neon, _permissoesApi, _plataforma, _provisionar, _senhaLimite, _senhaTokens, _sqlEmbutido,
_syncTrava, _tiposDocumento, _usuarios.

**Testes (17):** `*.test.js` + `_testes/pglite.js`.

### 2.4 Classificação das conexões

**Rotas /api (49): 31 OK · 13 risco · 5 bug**

| situação | rotas |
|---|---|
| **Bug** (5 → 4) | `sync` (tabela sem lista de permitidas, §5 B1 — **corrigido 19/10**, passa a OK); `transactions-bulk-update`, `lancamento-rateios`, `agendamentos` PUT, `sync-srf` (gravam sem conferir perfis permitidos, §5 B3) |
| **Risco** (13) | `load` (79 `ADD COLUMN IF NOT EXISTS`/DDL a cada carga; sem checagem de "ver"); `search`*, `fatura-conferencia`, `transaction-history`, `transferencias-executadas`, `reserve-function-transactions` (leitura sem corte por perfil — *`search` corta perfil mas não "ver"); `ping` (exige login, devolve `err.message`); `backfill-ger-rastreabilidade` e `bem/migrate` (rotas de manutenção expostas em produção); `auth` (login fixo por variável de ambiente); `senha` (validar/definir sem limite de tentativas); `sigla-disponivel` e `agenda` (públicas, sem limite de taxa) |
| **OK** (31) | demais rotas: autenticadas via `comAmbiente`, regra de módulo na escrita, status coerentes |

**Infraestrutura e cliente (16): 7 OK · 9 risco · 0 bug**

| # | conexão | situação | onde |
|---|---|---|---|
| 1 | React → /api via `db.js` | risco: sem timeout, sem request-id | `src/lib/db.js:17,33,99,116` |
| 2 | 6 wrappers `chamar()` (agenda, atalhos, clientes, importação, layouts, usuários) | risco: idem, código repetido | `src/lib/*Api.js` |
| 3 | `bemApi.request()` | OK: timeout de 10 s | `src/lib/bemApi.js:9,17,27` |
| 4 | fetch cru nas telas de login/senha | risco: sem timeout | `Login.jsx:84,102`, `DefinirSenha.jsx:21,41`, `EntrarComCodigo.jsx:15` |
| 5 | AppContext ↔ IndexedDB (cache + fila) | OK | `AppContext.jsx:762-767,1118-1135`, `armazenamentoLocal.js` |
| 6 | AppContext → /api/load + /api/sync (guardas) | OK | `AppContext.jsx:933-969,998-1061`; `syncSeguro.js:20-34`; `_syncTrava.js:31-61` |
| 7 | `auth_token` (JWT) em localStorage | risco: exposto a XSS, irrevogável por 12 h | `src/lib/api.js:8-23`; `api/auth.js:41` |
| 8 | `finup_reserve_balances` em localStorage | risco: dado de negócio fora do banco | `ReservasPanel.jsx:43,48`; `AppContext.jsx:3446` |
| 9 | preferências de UI em localStorage/sessionStorage | OK | `useTheme.js`, `agendaCalendario.js:192`, etc. |
| 10 | múltiplas abas | risco: sem coordenação de fila/envio | só `storage` do tema em `useTheme.js:64` |
| 11 | /api → banco do ambiente (pg.Pool) | risco: sem timeouts, TLS sem verificação de certificado | `api/_conexao.js:46-49` |
| 12 | /api → banco central | risco: mesmo Pool/configuração | `api/_central.js`, `_conexao.js` |
| 13 | /api → Neon Management API | OK | `api/_neon.js` |
| 14 | /api → Resend | OK | `api/_email.js` |
| 15 | feed .ics público por token | OK (intencional; sha256 no central) | `api/agenda.js:13-27`, `_agendaFeed.js` |
| 16 | código morto `supabase.js` / `storage.js` | risco baixo (confunde manutenção) | `src/lib/supabase.js`, `src/lib/storage.js` |

**Total: 65 conexões — 38 OK · 22 risco · 5 bug.**

---

## 3. Status do plano de 18/09

| prio | item | status | evidência |
|---|---|---|---|
| P0 | Deduplicação na Importar Fatura (`findMatchingTransaction`: data + descrição normalizada + valor) | **FEITO** (implementação diferente) | `findMatchingTransaction` nunca existiu (nem no histórico do git). O casamento é `resolverLinhasRevisao` — `src/lib/revisaoImportacao.js:165`, chamado em `ImportPanel.jsx:1885`. Critério: **mesma fatura** + valor ±R$0,01 (`:19`) + similaridade de descrição normalizada (`conciliacaoMatch.js:13-42`, ≥0,7 = existe, ≥0,4 = possível) + nº da parcela; data da compra só desempata ou descarta (`:138-139`); `fitid` do OFX = duplicata exata (`:206-214`); colisão de parcela pela chave da série (`:89-103`). Usar a fatura no lugar da data segue a regra do CLAUDE.md ("Cartão: filtrar por `fatura_ref`") |
| P0 | Persistência dos grupos gerenciais | **FALSO POSITIVO** | `gerencialGroups` → `reservas_funcoes` em `SECOES_SYNC` (`src/lib/db.js:1399`), enfileirado em `filaOffline.js:62` e gravado por `api/sync.js:47-68` (seção genérica); lido em `api/load.js:469`. Neon: 5 linhas em `reservas_funcoes` |
| P1 | Timeout em fetch (AbortController 25 s) | **PARCIAL** | só `bemApi.js:9,17` (10 s). `db.js`, os 6 `chamar()` e as telas de login não têm timeout; `/api/load` e `/api/sync` podem ficar pendurados |
| P1 | X-Request-ID | **PENDENTE** | nenhum cabeçalho de correlação no cliente; o servidor não loga `x-vercel-id` |
| P1 | Tratamento de erro por status | **PARCIAL** | 401 → `clearTokenAndRedirect` (`api.js:43`, `db.js:19,41,107,120`); 409 exclusão em massa → confirmação (`db.js:1182-1197`, `AppContext.jsx:945-953`); 403 só em `clientesApi.js:29`; 410 em `DefinirSenha.jsx:47`. Sem tratamento de 429/5xx e sem manipulador central. Servidor devolve `err.message` cru em 500 (`sync.js:123`, `ping.js:11`, `transactions-bulk-update.js:57`) |
| P2 | BroadcastChannel entre abas | **PENDENTE** | não há BroadcastChannel nem `navigator.locks`; duas abas mantêm filas próprias em memória e gravam no mesmo IndexedDB |
| P2 | Timeout de queries | **PENDENTE** | `api/_conexao.js:46-49` sem `connectionTimeoutMillis`/`statement_timeout`/`query_timeout`; `statement_timeout = 0` nos dois bancos |
| P2 | `/api/health` | **PENDENTE** | não existe; `api/ping.js` exige login e ambiente (não serve para monitor externo) |

Placar do plano: 1 feito · 1 falso positivo · 2 parciais · 4 pendentes.

Conferência no banco: há **9 grupos** em `lancamentos` com mesma conta + `fatura_ref` + valor +
descrição + data. Podem ser compras legítimas repetidas (ou gêmeas aceitas), mas vale uma olhada
com o motor de integridade.

---

## 4. Módulos novos de outubro/2026

| módulo | arquivos principais | conexões / persistência | situação |
|---|---|---|---|
| Atalhos de teclado | `src/lib/atalhos/{registry,combinacao,modoAlt,api}.js`, `AtalhosContext.jsx`, `AtalhosPanel.jsx`, `AtalhosAjudaModal.jsx` | `/api/atalhos` → `atalhos_usuario`, filtrado por `user_id` (`api/atalhos.js:69,89`) | OK |
| Tema claro/escuro | `src/hooks/useTheme.js`, `ThemeToggle.jsx` | localStorage `finup_tema_mobile`/`_desktop`; único módulo sincronizado entre abas (`useTheme.js:64`) | OK |
| Navegação mobile | `src/mobile/{navegacao.js,MobileShell.jsx,modules.js,MaisMobile.jsx}`, `useIsMobile.js` | sem backend; `finup:mobile:ocultarValores` em localStorage | OK |
| Tipos de documento | `src/lib/tiposDocumento.js`, `TiposDocumentoPanel.jsx`, `TipoDocumento{Select,Badge,Filtro}.jsx` | `/api/tipos-documento` (`cadastros:*`) → `tipos_documento` (12); fora do diff-sync (`db.js:255-276`) | OK |
| Histórico / edição em série | `src/lib/historico.js`, `HistoricoPainel.jsx`, `camposSerie.js`, `EscopoSerieDialog.jsx`, `BulkEditModal.jsx` | `/api/historico` → `historico_alteracoes` (107); `registrarEdicao` em `AppContext.jsx:880` | OK; edição em massa usa `transactions-bulk-update` (sem corte por perfil, B3) |
| Saldo principal por perfil | `src/lib/saldoPrincipal.js:16` (protegida), wrapper `AppContext.jsx:3304`, `src/lib/contaCentral.js:12` | índice único no Neon (uma central/favorita por perfil), coberto por `api/contasFlags.test.js` | OK |
| Regras da Importar Fatura | `src/lib/revisaoImportacao.js`, `conciliacaoMatch.js`, `ImportPanel.jsx` | grava pela fila do sync; colisão faz UPDATE com `fatura_ref` (`:280-297`) | OK (ver §3) |
| Feed ICS da agenda | `api/agenda.js`, `api/agenda-feed.js`, `_agendaFeed.js`, `AgendaCelularPanel.jsx`, `useAgendaFeed.js`, `agendaIcs.js` | central: `agenda_feeds` (2), `agenda_cache` (2); token sha256 + `AGENDA_TOKEN_KEY` (fail-closed) | OK; sem limite de taxa em `/api/agenda` |
| Motor de integridade | `src/lib/integridade/{motor,regras,ajustes,dbRows}.js`, `IntegridadePanel.jsx`, `AjusteIntegridadeModal.jsx`, `AceitarSaldoModal.jsx` | `/api/integridade` (`alertas:editar`) → `pendencias_integridade`: 92 pendentes, 70 ignoradas, 25 resolvidas | OK; 92 pendências abertas a triar |
| Controle de usuários | `UsuariosPanel.jsx`, `usuariosApi.js`, `src/lib/permissoes.js` | `/api/usuarios` (`requireAdmin`, filtrado por `orgId`); níveis admin/operador/consulta/personalizado | risco: permissões vivem no JWT por 12 h (B5) e leituras ignoram "ver" (B2) |

---

## 5. Segurança multi-cliente

### 5.1 Credenciais no código e em arquivos versionados
- **Nenhuma credencial no código de produção.** Sem URL de banco, chave de API ou senha fixa fora
  de `*.test.js` e `api/_testes/pglite.js`. Sem fallback inseguro (`process.env.X || 'segredo'`): o
  único `||` (`_agendaFeed.js:23`) falha fechado.
- `.env.production` está versionado, mas **só tem comentários** (nenhuma variável). `.env*` está no
  `.gitignore:26`; `docs/privado/` e backups `.json` também.
- Busca no histórico completo do git (`git log -p --all`) por connection strings `postgres://…@`,
  chaves Supabase/JWT (`eyJ…`), `sk_live`, `re_…` e `npg_…`: **nenhuma ocorrência**.
- **Login fixo por variável de ambiente** (`ADMIN_USER`/`ADMIN_PASS` com `ALLOW_ENV_ADMIN=true`)
  gera token **admin** mesmo com conta bloqueada; restrito ao ambiente `vm` e ao host principal,
  com comparação em tempo constante (`api/auth.js:64-137,160-181,265-269`). O próprio código diz
  "remover antes da comercialização".

### 5.2 Endpoints sem autenticação
Exatamente 5, todos intencionais: `auth` (login), `senha` (redefinição por token de uso único),
`cadastro-publico` (3/h por IP + honeypot), `sigla-disponivel` (leitura no central) e `agenda`
(feed .ics por token). Todas as outras rotas passam por `comAmbiente`, e `api/_db.test.js` garante
isso. Lacunas: sem limite de taxa em `sigla-disponivel`, `senha?acao=validar|definir` e `agenda`.
Sem CORS (só mesma origem). `vercel.json` não define CSP/HSTS/`X-Frame-Options`.

### 5.3 Isolamento de dados
- **Entre clientes: bom.** O ambiente sai do JWT assinado (`amb`, `amb_sigla`) e precisa bater com o
  host (`_ambiente.js:32-55`); trocar Host/`x-forwarded-host` só gera 401. O banco é escolhido por
  AsyncLocalStorage, sem banco padrão (`_conexao.js:84-96`).
- **Mas todos os bancos usam o mesmo host e o mesmo papel (role)** do Postgres (`_conexao.js:8-9,
  30-37`), e esse papel tem poderes muito acima do necessário (conferido em §5.5): SQL arbitrário
  num ambiente não fica preso ao banco daquele cliente.
- **Dentro do cliente:** os dados são compartilhados por todos os usuários (exceto atalhos, layouts
  de importação e feeds, que são por usuário). A restrição por perfis (`perfis_permitidos`) só vale
  para contas/cartões/lançamentos/agendamentos e só em `load`, `search`, `sync` e
  `importacoes-lancamentos`.

### 5.4 Achados

| id | prio | achado | onde |
|---|---|---|---|
| **B1** | **P0 — CORRIGIDO 19/10** | `/api/sync` `type:'section'` aceita qualquer `table` do cliente; o nome é concatenado sem aspas em `INSERT INTO ${table}` / `DELETE FROM ${table}` / `SELECT … FROM ${tabela}`. Tabela fora de `MODULO_DA_TABELA` passa para quem tem `configuracoes:editar` (`_permissoesApi.js:104-108`). Resultado: um admin de cliente pode gravar em `usuarios`/`membros`/`senha_tokens` e **injetar SQL**. A trava de exclusão em massa também se desliga com nome inválido (`_syncTrava.js:53`) | `api/sync.js:47-68`, `api/_db.js:40,232`, `api/_permissoesApi.js:69,104-108` |
| **B2** | P1 | GET/HEAD/OPTIONS não checam módulo (`regraDaRota` devolve `null`). Um usuário "personalizado" sem `ver` lê tudo via `/api/load` e demais GETs | `src/lib/permissoes.js:161` |
| **B3** | **P1 — CORRIGIDO 22/10** | Gravações sem corte por perfil permitido: `transactions-bulk-update` (`WHERE id = ANY($1)`), `lancamento-rateios`, `agendamentos` PUT, `sync-srf` (sem dono do `scheduleId` e sem trava de exclusão em massa) | `api/transactions-bulk-update.js:9-25`, `api/sync-srf.js` |
| B4 | **P1 — CORRIGIDO 22/10 (as 4 rotas; `load` fica na Parte B do B2)** | Leituras sem corte por perfil: `fatura-conferencia`, `transaction-history`, `transferencias-executadas`, `reserve-function-transactions`; em `load`, categorias/grupos/regras/orçamento/envelopes vêm inteiros | `api/load.js:487-500` |
| B5 | **P1 — CORRIGIDO 22/10** | JWT de 12 h sem revogação: nível, permissões e perfis ficam no token; desativar ou rebaixar usuário só vale quando ele expira | `api/auth.js:41,142-151`; `_auth.js:48-61` |
| R1 | P1 | Login fixo por variável de ambiente (admin mesmo com conta bloqueada) | `api/auth.js:64-137` |
| R2 | **P1 — CORRIGIDO 22/10** | TLS sem verificação de certificado (`rejectUnauthorized: false`) | `api/_conexao.js:48` |
| R3 | P2 | 500 devolve `err.message` cru (vaza nome de tabela/coluna e SQL) | `sync.js:123`, `ping.js:11`, `load.js:516` … |
| R4 | P2 | Rotas de manutenção em produção (`backfill-ger-rastreabilidade`, `bem/migrate` — GET aberto a qualquer usuário logado) | `api/backfill-ger-rastreabilidade.js:30-47`, `api/bem/migrate.js:95-119` |
| R5 | P2 | Sem limite de taxa em `sigla-disponivel`, `senha` validar/definir e `agenda` | — |
| R6 | P2 | Sem cabeçalhos de segurança (CSP, HSTS, frame-ancestors) | `vercel.json` |
| R7 | **P0** | Papel do Postgres compartilhado com poderes de administrador em todos os bancos (§5.5) | `api/_conexao.js:8-9,30-37` |

**Correção do B1 (19/10):**
- `api/_syncTrava.js` — `TABELAS_DO_SYNC`: lista fechada com as 14 tabelas de `SECOES_SYNC`
  (`src/lib/db.js:1392`) + `account_mapping`. Fora dela: `usuarios`, `membros`, `senha_tokens`,
  `login_bloqueios`, `organizacoes`, `_migracoes`, `plataforma_*`, e as que têm caminho próprio
  (`contas`/`cartoes`, `favorecidos`, `configuracoes`, `schedule_reserva_funcoes`,
  `lancamento_rateios`, `tipos_documento`).
- `api/sync.js` — `type:'section'` com tabela fora da lista → **400** (`codigo:
  'tabela_nao_permitida'`) **antes** da autorização e de qualquer consulta ao banco.
- `api/_db.js` — `citarIdent()`: tabela e colunas só passam com `^[a-z_][a-z0-9_]*$` e vão sempre
  entre aspas duplas (`montarUpsertSql`, `deleteRows`). `upsertRowsNoClient` confere **todas** as
  chaves de **todas** as linhas contra as colunas reais (`information_schema.columns`, em cache por
  banco, relido uma vez antes de recusar) → coluna inexistente ou tabela inexistente = **400**.
- Conferido no Neon antes de ligar: todas as chaves que os mapeadores do app mandam existem nas
  tabelas, e nenhum nome de tabela/coluna foge do padrão.
- Testes: `api/syncTabelas.test.js` (11 casos — tabela permitida grava; fora da lista → 400 sem
  consulta ao banco; aspas/ponto-e-vírgula/ponto/maiúscula → 400; coluna inexistente, inclusive só
  na 2ª linha → 400; lista igual a `SECOES_SYNC`). Suíte completa: 1168 testes passando.

### 5.5 Privilégios do usuário Postgres compartilhado (19/10, somente leitura)

Consultas em `pg_roles`, `pg_auth_members`, `pg_database`, `information_schema.role_table_grants`,
`pg_tables` e `pg_extension`, nos bancos principal (`neondb`) e central (`finup_central`). Nada foi
alterado.

| item | valor |
|---|---|
| usuário | `neondb_owner` (o mesmo no principal, no central e nos bancos de cliente) |
| superusuário | não (`rolsuper = false`) |
| CREATEROLE / CREATEDB | **sim / sim** |
| REPLICATION / BYPASSRLS | **sim / sim** |
| limite de conexões | nenhum (`rolconnlimit = -1`) |
| membro de | `neon_superuser` (mesmos poderes: CREATEROLE, CREATEDB, BYPASSRLS, REPLICATION) |
| bancos | **dono** de `neondb`, `finup_central` e `cliente_teste1` (CONNECT + CREATE em todos); só CONNECT em `postgres` |
| schema `public` | USAGE + CREATE |
| tabelas `public` | **dono das 50** (principal) e das **9** (central); SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES e TRIGGER em todas |
| RLS | desligado em todas as tabelas |
| extensões | só `plpgsql` instalada; `dblink` e `postgres_fdw` **disponíveis** para instalar (o papel pode) |

Leitura: o isolamento entre clientes hoje depende **só do código do `/api`** escolher o banco
certo. Uma única falha de SQL (como era o B1) permitiria criar papéis, criar/apagar bancos,
instalar `dblink` e ler ou alterar o central e os outros clientes.

Recomendação (não executada): um papel por ambiente, sem CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS,
dono só do próprio banco (ou só com DML nas tabelas, e DDL por um papel de migração separado);
o central com papel próprio; `neondb_owner` reservado ao provisionamento (`_provisionar.js`).

---

## 6. Bugs e riscos priorizados

### P0
1. ~~**B1 — lista de tabelas permitidas no `/api/sync`.**~~ **Feito em 19/10** (§5.4).
2. **R7 — papel do Postgres por ambiente.** Conferido (§5.5): o papel compartilhado é dono de todos
   os bancos e herda `neon_superuser`. Criar um papel restrito por ambiente e trocar a conexão em
   `_conexao.js`.

### P1
3. **B2** — `regraDaRota` passa a exigir `ver` do módulo nos GETs (com `load` cortando as seções
   que o usuário não vê).
4. ~~**B3/B4**~~ **Feito em 22/10** (`exigirLinhasPermitidas`/`recortarLancamentos` em `api/_permissoesApi.js`; trava de exclusão em massa no `sync-srf`) — aplicar `perfis_permitidos` em `transactions-bulk-update`, `lancamento-rateios`,
   `agendamentos`, `sync-srf` e nas leituras listadas; trava de exclusão em massa no `sync-srf`.
5. ~~**B5**~~ **Feito em 22/10** (`usuarios.token_versao` + `api/_sessao.js` no `comAmbiente`, cache de 30 s) — conferir no banco, a cada requisição (com cache curto), se o usuário está ativo e qual o
   nível dele; ou reduzir a validade do token e renovar.
6. **R1** — desligar `ALLOW_ENV_ADMIN` em produção ou remover o login fixo antes do primeiro cliente
   pagante.
7. ~~**R2**~~ **Feito em 22/10** (`TLS_VERIFICADO` no pool e nos 6 scripts ativos) — `ssl: { rejectUnauthorized: true }` (o Neon tem certificado válido).
8. **Timeout de fetch** num wrapper único (`db.js` + os 7 `chamar()`), 25 s; `/api/load` talvez 45 s.
9. **X-Request-ID** gerado no wrapper e logado no servidor junto com `x-vercel-id`.
10. **Erro por status** centralizado: 401 (sessão), 403 (permissão), 409 (conflito), 429 (aguarde),
    5xx (servidor) com mensagem amigável; servidor deixa de devolver `err.message` (R3).

### P2
11. **Timeouts no Pool**: `connectionTimeoutMillis` ≈ 5 s, `statement_timeout` ≈ 20 s,
    `idleTimeoutMillis`; e `functions.maxDuration` no `vercel.json`.
12. **`/api/health`** público (`SELECT 1` no central, sem dados) para monitor externo.
13. **BroadcastChannel/`navigator.locks`** para que só uma aba envie a fila por vez e as outras
    recarreguem ao receber "gravou".
14. Mover `finup_reserve_balances` para `configuracoes` (dado de negócio fora do banco).
15. Tirar o DDL de `/api/load` (79 `ADD COLUMN IF NOT EXISTS`) e passar para `_migracoes`/provisionamento.
16. Delete + upsert do `sync` numa transação única (`sync.js:62-65` roda em paralelo, separado).
17. Limite de taxa em `sigla-disponivel`, `senha` e `agenda` (R5); cabeçalhos de segurança (R6);
    rotas de manutenção só para admin da plataforma (R4).
18. Remover código morto `src/lib/supabase.js` e `src/lib/storage.js`.
19. Triar as 92 pendências de integridade abertas e os 9 grupos de possíveis duplicados em fatura.

---

## 7. Score

| dimensão | peso | 18/09* | 19/10 | comentário |
|---|---:|---:|---:|---|
| Integridade de dados / persistência | 25% | — | 8.5 | fila offline, banco como autoridade, travas de exclusão em massa e de configuração |
| Segurança multi-cliente | 25% | — | 6.0 → 6.5 | isolamento por banco e JWT bom; B1 corrigido; R7 (P0), B2-B5, login fixo |
| Resiliência de rede | 15% | — | 5.0 | sem timeout (exceto bem), sem health, sem coordenação de abas, sem timeout de query |
| Observabilidade | 10% | — | 4.0 | sem request-id, `err.message` cru, logs só de contadores |
| Testes | 15% | — | 9.0 | 1157 testes passando, PGlite para SQL real, testes de permissão e ambiente |
| Funcionalidade | 10% | — | 9.0 | 10 módulos novos entregues em um mês |
| **Total** | | **7.8** | **7.0 → 7.2** | 7.2 com o B1 corrigido |

\* O relatório de 18/09 não está no repositório; só o total (7.8) é conhecido.

**Projeção:** P0 + P1 resolvidos → segurança 8.5, resiliência 7.0, observabilidade 6.0 →
**≈ 8.2**. Com P2 → ≈ 8.8.

---

## 8. Plano de ação

| etapa | itens | esforço | toca funções protegidas? |
|---|---|---|---|
| 1 — antes do próximo cliente | ~~B1 (lista de tabelas)~~ feito 19/10; R7 (papel do Postgres por ambiente), R1 (login fixo), R2 (TLS) | ~1 dia | não |
| 2 — permissões | B2, B3, B4, B5 | 2–3 dias | não (`api/` + `permissoes.js`) |
| 3 — cliente HTTP único | wrapper com timeout, X-Request-ID, erro por status; R3 no servidor | 1–2 dias | não |
| 4 — infraestrutura | timeouts no Pool, `/api/health`, `maxDuration`, cabeçalhos, limites de taxa | 1 dia | não |
| 5 — abas e limpeza | BroadcastChannel/locks na fila, `finup_reserve_balances`, DDL fora do load, transação no sync, código morto | 2 dias | a fila mora no AppContext, mas fora das funções protegidas |
| 6 — dados | triar 92 pendências e 9 grupos suspeitos | contínuo | não |

Nenhuma das funções protegidas (`reconciliarGerencial`, `getSaldoPrincipalBreakdown` /
`calcularSaldoPrincipalBreakdown`, `recalcularAgendamentosFatura`, `reconcileFaturaState`,
`applyEnsureGerencial`, `PatrimonioEditavel.jsx`) foi tocada nesta análise nem precisa mudar
para executar o plano.
