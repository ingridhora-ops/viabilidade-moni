'use client';

import { PortalSidebar } from './PortalSidebar';
import { usePathname } from 'next/navigation';

type AppShellProps = {
  user: { id: string; email?: string; full_name?: string | null } | null;
  userRole: string;
  /** Visitante em app pública: mostra sidebar Rede + Novos Negócios (como equipa). */
  showPublicPortalNav?: boolean;
  children: React.ReactNode;
};

export function AppShell({ user, userRole, showPublicPortalNav = false, children }: AppShellProps) {
  const pathname = usePathname();
  const isSirene = pathname?.startsWith('/sirene') ?? false;

  if (!user && !showPublicPortalNav) {
    return <>{children}</>;
  }

  return (
    <div className={`flex min-h-screen ${isSirene ? 'bg-stone-900' : 'bg-stone-50'}`}>
      <PortalSidebar user={user} userRole={userRole} publicVisitor={showPublicPortalNav} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
