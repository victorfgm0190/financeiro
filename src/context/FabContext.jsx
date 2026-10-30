import { createContext, useContext, useEffect, useState } from 'react'

// Permite que cada tela registre a sua "ação principal" no FAB central (botão +)
// do mobile (MobileShell): a ação vira um item do menu do + com o texto da tela (ex.: "Novo
// lançamento em Itaú"). Só registre o que NÃO repete os cards de cima (Lançamento/Agendamento/
// Transferência/Reserva) — ex.: o lançamento já na conta/cartão aberto. Sem ação
// registrada o menu mostra só as ações de modules.js. Só afeta o mobile — no desktop os
// botões de ação do header continuam sendo o caminho principal.
const FabContext = createContext({ fabAction: null, setFabAction: () => {} })

export function FabProvider({ children }) {
  const [fabAction, setFabAction] = useState(null)
  return (
    <FabContext.Provider value={{ fabAction, setFabAction }}>
      {children}
    </FabContext.Provider>
  )
}

export function useFab() {
  return useContext(FabContext)
}

// Hook para as telas registrarem a ação do FAB enquanto montadas. `run` é invocada pelo item
// do menu do + mobile, que mostra `label`. Passe em `deps` o estado que a ação captura (ex.:
// conta/cartão selecionado) e o que muda o texto, para re-registrar. run null → sem item.
export function useRegisterFab(run, deps = [], label = '') {
  const { setFabAction } = useContext(FabContext)
  useEffect(() => {
    setFabAction(run ? { run, label } : null)
    return () => setFabAction(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
