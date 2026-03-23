import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const LIMITED_ALLOWED = [
  '/rede-franqueados',
  '/comunidade',
  '/dashboard-novos-negocios',
  '/painel-novos-negocios',
  '/login',
  '/auth',
  '/perfil',
  '/api',
  '/_next',
] as const;

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  const isLimited = process.env.NEXT_PUBLIC_RELEASE_SCOPE === 'limited';
  if (isLimited) {
    const pathname = request.nextUrl.pathname;
    const allowed = LIMITED_ALLOWED.some((path) => pathname.startsWith(path));
    if (!allowed) {
      const redirect = NextResponse.redirect(new URL('/rede-franqueados', request.url));
      response.cookies.getAll().forEach((cookie) => {
        redirect.cookies.set(cookie.name, cookie.value);
      });
      return redirect;
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
