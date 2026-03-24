import { headers } from 'next/headers';

/**
 * Host do pedido HTTP (ex.: admin em https://app.vercel.app a enviar convite).
 * Assim os links nos e-mails usam o mesmo domínio que estás a usar no browser,
 * mesmo sem NEXT_PUBLIC_APP_URL.
 */
function publicUrlFromIncomingRequest(): string | null {
  try {
    const h = headers();
    const hostRaw = h.get('x-forwarded-host') ?? h.get('host');
    if (!hostRaw) return null;
    const host = hostRaw.split(',')[0].trim();
    if (!host) return null;
    if (/^localhost(:\d+)?$/i.test(host) || /^127\.0\.0\.1(:\d+)?$/i.test(host)) return null;
    let proto = h.get('x-forwarded-proto')?.split(',')[0].trim();
    if (!proto) proto = 'https';
    return `${proto}://${host}`.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function normalizeHttpsHost(raw: string): string {
  const h = raw.replace(/^https?:\/\//, '').replace(/\/$/, '').split(',')[0].trim();
  return h;
}

/**
 * Em deploy de **produção** na Vercel, domínio estável do projeto (custom ou *.vercel.app).
 * Útil quando `headers()` não traz o host certo mas o convite tem de apontar para o site público.
 * Ativa em Vercel → Settings → Environment Variables → expor system env vars.
 */
function publicUrlFromVercelProduction(): string | null {
  if (process.env.VERCEL !== '1') return null;
  if (process.env.VERCEL_ENV !== 'production') return null;
  const raw = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!raw) return null;
  const host = normalizeHttpsHost(raw);
  if (!host) return null;
  return `https://${host}`;
}

/**
 * URL base pública da app (links em e-mails, convites, redirects).
 *
 * Ordem:
 * 1. `NEXT_PUBLIC_APP_URL` ou `NEXT_PUBLIC_SITE_URL` (recomendado: URL público fixo na Vercel)
 * 2. Host do pedido atual (admin aberto em produção no browser)
 * 3. `VERCEL_PROJECT_PRODUCTION_URL` só em `VERCEL_ENV=production` (fallback na Vercel)
 * 4. `VERCEL_URL` (este deploy; preview ou production)
 * 5. `http://localhost:3000` — em **dev** local, define `NEXT_PUBLIC_APP_URL=https://teu-projeto.vercel.app`
 *    para os convites não usarem localhost.
 */
export function getPublicAppUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }
  const fromRequest = publicUrlFromIncomingRequest();
  if (fromRequest) return fromRequest;
  const fromVercelProd = publicUrlFromVercelProduction();
  if (fromVercelProd) return fromVercelProd;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = normalizeHttpsHost(vercel);
    return `https://${host}`;
  }
  return 'http://localhost:3000';
}
