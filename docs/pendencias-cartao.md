# Pendências — frente do cartão

## Teste instável: `src/hooks/useHoje.test.jsx` (registrado em 07/11/2026)

- **Teste:** "useHoje + próximos 7 dias › item 4: para vencimento em dia que existe no mês, o selo de Contas dá os mesmos dias de antes".
- **Sintoma:** falhou uma vez na suíte completa (`vitest run`, com a máquina carregada) e passou 11/11 rodando o arquivo sozinho.
- **Provável causa:** depende do relógio ("hoje") e/ou de tempo de execução; veio com os commits da frente do cartão (3a0f09f, 6cca0c2, c59ebff).
- **Combinado:** não mexer agora; a frente do cartão investiga (fixar a data com `vi.setSystemTime` ou aumentar o timeout do caso).
