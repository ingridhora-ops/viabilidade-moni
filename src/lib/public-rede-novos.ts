/**
 * Acesso sem login a Rede de Franqueados + Novos Negócios (e subitens do menu).
 *
 * **Padrão: público** — não exige login em PROD (middleware + páginas).
 * Para **exigir login** nestas rotas: `NEXT_PUBLIC_PUBLIC_REDE_NOVOS_NEGOCIOS=false` na Vercel.
 *
 * Sem sessão, visualização/edição podem usar o service role no servidor (`SUPABASE_SERVICE_ROLE_KEY`).
 * Quem precisar de app fechada deve definir a env acima como `false`.
 */
export function isPublicRedeNovosNegociosEnabled(): boolean {
  const v = (process.env.NEXT_PUBLIC_PUBLIC_REDE_NOVOS_NEGOCIOS ?? '').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return true;
}

/**
 * App aberta sem login/cadastro (visitantes entram direto; só /admin exige sessão no middleware).
 * Padrão: **público**. Para exigir login em todo o site: `NEXT_PUBLIC_APP_PUBLIC=false` na Vercel.
 */
export function isAppFullyPublic(): boolean {
  const v = (process.env.NEXT_PUBLIC_APP_PUBLIC ?? '').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return true;
}

const PUBLIC_REDE_NOVOS_PREFIXES: readonly string[] = [
  '/rede-franqueados',
  '/comunidade',
  '/dashboard-novos-negocios',
  '/painel-novos-negocios',
] as const;

export function isPublicRedeNovosPath(pathname: string): boolean {
  return PUBLIC_REDE_NOVOS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function allowPublicAccessRedeNovos(pathname: string): boolean {
  return isPublicRedeNovosNegociosEnabled() && isPublicRedeNovosPath(pathname);
}
