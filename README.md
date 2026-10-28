# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Assistente IA (Finup)

O "✨ Assistente" (botão "+" do celular e cabeçalho do desktop) interpreta texto, voz ou foto e
abre uma **prévia** nos formulários de lançamento/agendamento — nada é gravado sem confirmação.
A rota `api/assistente.js` chama a API da Anthropic (modelo `claude-haiku-5-5`) e precisa da
variável de ambiente **`ANTHROPIC_API_KEY`** na Vercel (Production e Preview). A chave fica só no
servidor: nunca vai para o navegador, logs ou commits. Sem ela, a rota responde 503
("Assistente indisponível"). Para testar localmente, coloque a chave no `.env.local` (fora do git).

Tabelas por ambiente: `ia_pre_lancamentos`, `ia_apelidos` e `ia_uso`
(migração `supabase/migrations/2026-10-28_ia_assistente.sql`; a rota também as cria se faltarem).
