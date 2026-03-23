const RELEASE_SCOPE = (process.env.NEXT_PUBLIC_RELEASE_SCOPE ?? 'full').trim().toLowerCase();

export function isLiveLimitedRelease(): boolean {
  return RELEASE_SCOPE === 'limited';
}

/**
 * Rotas permitidas quando NEXT_PUBLIC_RELEASE_SCOPE=limited (middleware).
 * Deve estar alinhado com o que o menu / app realmente expõe — senão o usuário cai em /rede-franqueados.
 */
export const LIMITED_RELEASE_ALLOWED_PATHS: readonly string[] = [
  '/',
  '/aceitar-convite',
  '/esqueci-senha',
  '/redefinir-senha',
  '/auth',
  '/rede-franqueados',
  '/comunidade',
  '/dashboard-novos-negocios',
  '/painel-novos-negocios',
  '/painel-contabilidade',
  '/painel-credito',
  '/login',
  '/perfil',
  '/api',
  '/_next',
] as const;

/** Mesma regra do middleware: `/` só a home exata; demais por prefixo. */
export function isPathAllowedInLimitedRelease(pathname: string): boolean {
  return LIMITED_RELEASE_ALLOWED_PATHS.some((path) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path),
  );
}

/** @deprecated Prefer isPathAllowedInLimitedRelease — nome mantido para compat. */
export const isAllowedInLimitedRelease = isPathAllowedInLimitedRelease;
