// Regra única de mobile × desktop (abaixo do breakpoint `md` do Tailwind = 768px).
// Usada pelo useIsMobile (layout) e pelo useTheme (tema por contexto).
// O script anti-flash do index.html repete este valor literal — os dois têm que ser iguais.
export const MOBILE_MEDIA_QUERY = '(max-width: 767.98px)'
