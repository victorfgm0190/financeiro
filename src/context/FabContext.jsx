import { createContext, useContext, useEffect, useState } from 'react'

// Permite que cada tela registre a sua "ação principal" no FAB central (botão +)
// da BottomNav mobile. Quando nenhuma tela registra uma ação, o App cai no
// quick-add global. Só afeta o mobile — no desktop os botões de ação do header
// continuam sendo o caminho principal.
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
// invocada quando o usuário toca no + da BottomNav. Passe em `deps` o estado
// que a ação captura (ex.: conta/cartão selecionado) para re-registrar.
export function useRegisterFab(run, deps = []) {
  const { setFabAction } = useContext(FabContext)
  useEffect(() => {
    setFabAction(() => run)
    return () => setFabAction(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
