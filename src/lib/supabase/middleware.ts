import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { normalizeAccessRole } from '@/lib/authz';
import { isAdminOnlyPath, isTeamAllowedPath } from '@/lib/access-matrix';
import { allowPublicAccessRedeNovos, isAppFullyPublic } from '@/lib/public-rede-novos';

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === '/signup' || pathname.startsWith('/signup/')) {
    const url = new URL('/login', request.url);
    url.searchParams.set('tab', 'cadastro');
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage = pathname === '/login' || pathname === '/aceitar-convite';
  const isPublicPage =
    isAuthPage ||
    pathname === '/esqueci-senha' ||
    pathname === '/redefinir-senha' ||
    pathname.startsWith('/api/webhooks/');
  const protectedPrefixes = [
    '/step-one',
    '/step-2',
    '/step-3',
    '/step-5',
    '/step-6',
    '/step-7',
    '/painel',
    '/painel-novos-negocios',
    '/dashboard-novos-negocios',
    '/rede-franqueados',
    '/comunidade',
    '/perfil',
    '/sirene',
  ];
  const matchesProtected = protectedPrefixes.some((p) => pathname.startsWith(p));
  const publicRedeNovos = allowPublicAccessRedeNovos(pathname);
  const appPublic = isAppFullyPublic();
  const needsAuth = appPublic
    ? pathname === '/admin' || pathname.startsWith('/admin/')
    : (matchesProtected && !publicRedeNovos) || isAdminOnlyPath(pathname);

  if (needsAuth && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && user) {
    return NextResponse.redirect(new URL('/rede-franqueados', request.url));
  }

  if (!user || isPublicPage) return response;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  const accessRole = normalizeAccessRole((profile as { role?: string | null } | null)?.role);

  if (accessRole === 'pending') {
    if (pathname !== '/login') {
      const url = new URL('/login', request.url);
      url.searchParams.set('status', 'pending');
      return NextResponse.redirect(url);
    }
    return response;
  }

  if (accessRole === 'blocked') {
    if (pathname !== '/login') {
      const url = new URL('/login', request.url);
      url.searchParams.set('status', 'blocked');
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Team: só Rede, Comunidade, Novos Negócios (painel/dashboard/tarefas), Perfil e home `/`.
  // APIs seguem validação nos handlers / RLS (não redirecionar JSON).
  if (accessRole === 'team' && !pathname.startsWith('/api')) {
    if (!isTeamAllowedPath(pathname)) {
      return NextResponse.redirect(new URL('/rede-franqueados', request.url));
    }
  }

  const isAdminOnly = isAdminOnlyPath(pathname);
  if (isAdminOnly && accessRole !== 'admin') {
    return NextResponse.redirect(new URL('/rede-franqueados', request.url));
  }

  return response;
}
