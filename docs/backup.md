# Backup completo do ambiente (10/11/2026)

Configurações → Dados → Backup. Só administrador com acesso a todos os perfis (a API confere).

## Arquivo

`finup-backup-<ambiente>-AAAA-MM-DD-HHMM.json` com:

- `manifesto`: formato, versão do formato, ambiente de origem, data/hora, hash do app, versão do banco
  (lista de migrações aplicadas e a última migração real — `_estrutura_base`, marca do provisionamento,
  fica na lista mas nunca é a "última") e, por tabela, quantidade de linhas, impressão digital e
  colunas;
- `tabelas`: cada linha é o texto que o Postgres gera (`to_jsonb(linha)::text`), guardado como string.
  Volta ao banco com `jsonb_populate_recordset`, sem passar pelos números do JavaScript: numeric com as
  casas, datas, jsonb — tudo igual.

Impressão digital da tabela = SHA-256 das linhas unidas por `\n`, em ordem fixa (id ou chave primária,
depois o texto da linha, comparação byte a byte), datas com fuso em UTC. É calculada igual no
navegador (crypto.subtle), no script (Node) e no banco (`sha256`).

## O que entra e o que fica de fora

Lista única em `src/lib/backupFormato.js` (`NO_BACKUP` e `FORA_DO_BACKUP` com o motivo). O teste
`src/lib/backupFormato.test.js` varre a estrutura base, as migrações e os `CREATE TABLE` da API e
**falha se surgir tabela nova sem classificação**. Em produção, tabela do banco que não está em
`FORA_DO_BACKUP` entra no backup (nada fica de fora em silêncio).

Fora: acesso (usuarios, membros, organizacoes, senha_tokens, login_bloqueios), plataforma_*,
_migracoes (vai no manifesto), backup_preparo (área de preparo) e indices_cache (cache do Banco
Central, baixado de novo). Feriados é cadastro do usuário: entra.

Identidade do ambiente (configuracoes.rodape_titulo / rodape_frase) não viaja e fica a do destino.

## Exportar

`GET /api/backup?acao=manifesto` (uma transação REPEATABLE READ; impressões de todas as tabelas numa
consulta só) e `?acao=paginas&de=<tabela>&offset=<n>` (várias tabelas por resposta, até ~2 MB: as que
cabem vêm numa consulta UNION ALL, a tabela grande vem em páginas). Assim o teste1 sai em 2 chamadas e o
vm em ~9 (antes: uma chamada por tabela, 62, ~25 s no teste1). `?acao=pagina` (uma tabela) continua
existindo. O navegador junta as páginas, recalcula a impressão digital de cada tabela e compara com o
manifesto; se o banco mudou no meio, tenta de novo.

Linha de comando (mesmo código, só leitura, uma transação):

    node --env-file=.env.local scripts/backup-exportar.js --ambiente vm [--saida <pasta|arquivo.json>]
    node --env-file=.env.local scripts/backup-conferir.js --ambiente vm --arquivo <arquivo.json>

## Restaurar (tudo ou nada)

1. Prévia (`acao: 'previa'`): versão, quantidades do arquivo × atuais, usuários com perfis permitidos
   que somem, assinaturas da Agenda no celular do ambiente.
2. Confirmação digitando RESTAURAR.
3. Envio em partes (~2 MB) para `backup_preparo` (migração 2026-11-10b, aditiva).
4. `acao: 'aplicar'` — uma transação (`api/_backup.js aplicarRestauracao`): confere versão e partes,
   trava as tabelas, guarda o rodapé, desliga os gatilhos do app (updated_at), apaga dos filhos para os
   pais e grava dos pais para os filhos (ordem pelas chaves estrangeiras do banco), devolve o rodapé,
   acerta as sequências, religa os gatilhos, **confere quantidade e impressão digital de cada tabela** e
   só então confirma. Qualquer erro ou diferença desfaz tudo. Limpa o lote da área de preparo.
5. Tela de conferência "tabela | no arquivo | no banco | ok/diferente" e a lista de usuários para
   ajustar os perfis.

Versão: só a LISTA de migrações reais decide (nomes com `_` na frente, como `_estrutura_base`, não
contam; o campo `schema.ultima` do arquivo é só informativo e nunca é usado — arquivos até 8741e16
podem trazer `_estrutura_base` ali). Arquivo com migração, tabela ou coluna que o destino não tem → recusa antes de tudo. Arquivo
mais antigo → aceita; colunas novas ficam no padrão e tabelas que ele não traz ficam vazias. Arquivo do
formato antigo (sem manifesto) → recusa com explicação.

## Backup ao sair (só no computador)

Substitui o backup automático de 24 h (removido). Pasta escolhida com `showDirectoryPicker`, guardada no
IndexedDB `finup_backup_<ambiente>_<usuário>` com "Perguntar ao sair", quantos manter (padrão 10) e o
último backup. Ao Sair: "Deseja fazer backup antes de sair?" → grava na pasta e apaga os mais antigos do
Finup deste ambiente (só nomes no padrão). Sem suporte (Safari, Firefox): baixa para Downloads. Erro:
outra pasta, Downloads, tentar de novo ou sair sem backup. Celular: nunca pergunta. Lembrete discreto
na barra lateral depois de 7 dias.
