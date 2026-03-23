const RELEASE_SCOPE = (process.env.NEXT_PUBLIC_RELEASE_SCOPE ?? 'full').trim().toLowerCase();

export function isLiveLimitedRelease(): boolean {
  return RELEASE_SCOPE === 'limited';
}

const LIMITED_ALLOWED_PREFIXES = [
  '/',
  '/login',
  '/aceitar-convite',
  '/esqueci-senha',
  '/redefinir-senha',
  '/api/webhooks/',
  '/rede-franqueados',
  '/comunidade',
  '/painel-novos-negocios',
  '/dashboard-novos-negocios',
  '/perfil',
] as const;

export function isAllowedInLimitedRelease(pathname: string): boolean {
  return LIMITED_ALLOWED_PREFIXES.some((prefix) =>
    prefix.endsWith('/')
      ? pathname.startsWith(prefix)
      : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
