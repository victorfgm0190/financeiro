# Agenda no celular (feed .ics)

Cada usuário do cadastro pode assinar os próprios agendamentos no iPhone ou no Google Agenda, em
dois calendários: **Finup Despesas** e **Finup Receitas**. A agenda é só para consulta.

Onde fica a tela: Configurações › Geral › Agenda no celular, ou "Agenda no celular" no menu do
usuário (barra lateral e tela "Mais" do celular). O menu vale para qualquer nível de acesso.

## Como funciona

| peça | onde | o quê |
|---|---|---|
| geração | navegador do dono (`src/hooks/useAgendaFeed.js`, `src/lib/agendaFeed.js`) | monta o .ics a partir dos dados já carregados: as mesmas ocorrências e valores da Visão Calendário (status A pagar) |
| gravação | `POST /api/agenda-feed?acao=publicar` (autenticada) | grava o .ics só no banco **central** (`agenda_cache`) |
| leitura pública | `GET /api/agenda?t=<token>&tipo=despesa\|receita` | valida o token e lê o .ics **só no central**; não abre o banco do ambiente (teste em `api/agenda.test.js`) |

O app gera e envia o feed nestes momentos:
- ao abrir, depois do `/api/load`, quando o hash mudou ou o feed não foi gerado hoje (é isso que faz a janela andar);
- 15 s depois da última mudança em agendamentos, faturas, contas, categorias ou favorecidos;
- quando a tela cria o feed ou muda as opções.

**Limitação aceita:** uma mudança feita por outro usuário só entra no feed quando o dono abrir o
Finup. A tela diz isso: "Atualiza quando você abre o Finup".

### O que entra no feed

- Janela: de hoje −30 dias até hoje +12 meses.
- Agendamentos pendentes (a próxima ocorrência e as seguintes), sem os zerados.
- Faturas em aberto do contas_a_pagar. Se a mesma fatura já tem o agendamento `pagamento_fatura`,
  o card não entra: a fatura nunca aparece duas vezes.
- **Despesas:** despesas e faturas. **Receitas:** receitas.
- Transferências, aplicações e resgates ficam de fora.
- Vale a visão "Tudo" dos perfis permitidos do dono. Sem permissão de ver agendamentos, o feed fica
  vazio, e o servidor garante isso.

### Formato do .ics (RFC 5545)

- Eventos de dia inteiro.
- UID estável:
  - ocorrência: `ag-<agendamento>-<data original>@finup.app.br`;
  - fatura: `fat-<cartão>-<AAAAMM>@finup.app.br`.
- Título "Descrição — R$ 1.500,00". Sem o valor quando "Mostrar valores" está em Não. Atrasado começa com ⚠.
- Descrição com conta, categoria, favorecido e link para o ambiente.
- Escape de `\ , ;` e de quebras de linha. Linhas dobradas em 75 octetos e terminadas em CRLF.

## Banco central (`supabase/central/2026-10-18_agenda_feeds.sql`)

**`agenda_feeds`:**
- `token_hash` (sha256) é o que a rota pública procura;
- `token_cifrado` guarda o token em AES-256-GCM com a chave `AGENDA_TOKEN_KEY`, nunca o token em texto puro;
- há um feed ativo por (ambiente, usuário);
- "Gerar novo link" revoga o anterior.

**`agenda_cache`:** o .ics por feed e tipo, mais o hash.

O central também é atualizado sozinho nestes casos:
- usuário desativado → feed revogado;
- nível, permissões ou perfis mudaram → cache apagado (404 até o dono abrir o app);
- cliente excluído → feeds do ambiente apagados;
- ambiente suspenso → 404.

**Cache da rota pública:** `s-maxage=3600, stale-while-revalidate=86400`, também no 404. Um link
revogado ainda pode responder por até cerca de 1 h.

## Chave `AGENDA_TOKEN_KEY` (Vercel)

São 32 bytes aleatórios em base64. Sem a chave, a tela avisa e não gera feed.

1. Gere a chave no terminal:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
2. Na Vercel: projeto › **Settings › Environment Variables** › **Add**.
   - Nome: `AGENDA_TOKEN_KEY`.
   - Valor: a chave gerada.
   - Ambientes: Production (e Preview, se quiser testar lá).
   - Marque **Sensitive**.
3. Faça um **Redeploy** do último deploy, porque a variável só vale nos deploys novos.

**Não troque a chave depois.** Os links já criados continuam funcionando, porque a rota pública
usa o hash. Mas a tela não consegue mais mostrar o link: o dono teria que usar "Gerar novo link" e
assinar de novo.
