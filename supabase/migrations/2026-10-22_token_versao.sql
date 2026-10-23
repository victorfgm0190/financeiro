-- REVOGAÇÃO DE SESSÃO (GRAFITY B5): versão dos tokens do usuário. Sobe quando ele é desativado, muda
-- de nível/permissões/perfis ou troca de senha; o JWT leva a versão do login (`tv`) e a API recusa o
-- token cuja versão não bate mais (api/_sessao.js). Só a coluna nova — nenhum dado muda.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS token_versao INTEGER NOT NULL DEFAULT 0;
