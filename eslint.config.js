import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // Rebaixadas de "error" para "warn" (NÃO desligadas; continuam aparecendo no lint), decisão de
    // 07/11/2026:
    // - Regras do React Compiler: o compilador NÃO está ativo no projeto (vite.config usa react()
    //   puro), então o que elas apontam não muda nada na tela hoje. SE O REACT COMPILER FOR LIGADO,
    //   ESTAS QUATRO VOLTAM A SER "error".
    // - react-refresh/only-export-components: só afeta o recarregamento rápido em desenvolvimento;
    //   não tem efeito em produção.
    rules: {
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
  // Funções da Vercel e scripts rodam no Node (process, Buffer…), não no navegador.
  {
    files: ['api/**/*.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
])
