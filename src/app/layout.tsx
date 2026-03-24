import type { Metadata } from 'next';
import './globals.css';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';
import { normalizeAccessRole } from '@/lib/authz';
import { isAppFullyPublic } from '@/lib/public-rede-novos';

/** Sessão + papel vêm de cookies; sem isto o shell pode servir HTML cacheado com papel errado. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Viabilidade Moní | Casa Moní',
  description:
    'Ferramenta de viabilidade e análise de praça para franqueados Casa Moní. Da praça à hipótese em PDF.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let user: { id: string; email?: string; full_name?: string | null } | null = null;
  let userRole = 'pending';
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
    if (user?.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .single();
      userRole = normalizeAccessRole((profile?.role as string) ?? 'pending');
      (user as { full_name?: string | null }).full_name = profile?.full_name ?? null;
    }
  } catch {
    // ignore
  }

  const showPublicPortalNav = !user && isAppFullyPublic();

  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">
        <AppShell user={user} userRole={userRole} showPublicPortalNav={showPublicPortalNav}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
