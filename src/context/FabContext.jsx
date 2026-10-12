import { createContext, useContext, useEffect, useState } from 'react'

// Permite que cada tela registre a sua "ação principal" no FAB central (botão +)
// do mobile (MobileShell): a ação vira o item "Novo nesta tela" do menu do +. Sem ação
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

// Hook para as telas registrarem a ação do FAB enquanto montadas. `run` é
// invocada pelo item "Novo nesta tela" do menu do + mobile. Passe em `deps` o estado
// que a ação captura (ex.: conta/cartão selecionado) para re-registrar.
export function useRegisterFab(run, deps = []) {
  const { setFabAction } = useContext(FabContext)
  useEffect(() => {
    setFabAction(() => run)
    return () => setFabAction(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
