import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isLiveLimitedRelease, isPathAllowedInLimitedRelease } from '@/lib/release-scope';

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  if (isLiveLimitedRelease()) {
    const pathname = request.nextUrl.pathname;
    if (!isPathAllowedInLimitedRelease(pathname)) {
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
