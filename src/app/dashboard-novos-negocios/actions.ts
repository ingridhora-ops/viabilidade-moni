'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchDashboardRawData } from '@/lib/dashboard-novos-negocios/fetchData';

export type DashboardNovosNegociosRaw = Awaited<ReturnType<typeof fetchDashboardRawData>>;

/**
 * Agregado de todos os kanbans para matriz (admin/team/supervisor).
 * Usa service role para refletir o mesmo universo do painel; frank/consultor seguem RLS no cliente anon.
 */
export async function loadDashboardNovosNegociosData(): Promise<
  { ok: true; data: DashboardNovosNegociosRaw } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const rawRole = String((profile as { role?: string | null } | null)?.role ?? '')
    .trim()
    .toLowerCase();

  const useServiceRoleAggregate = rawRole === 'admin' || rawRole === 'team' || rawRole === 'supervisor';

  if (useServiceRoleAggregate) {
    try {
      const admin = createAdminClient();
      const data = await fetchDashboardRawData(admin);
      return { ok: true, data };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        const data = await fetchDashboardRawData(supabase);
        return { ok: true, data };
      } catch {
        return { ok: false, error: msg };
      }
    }
  }

  try {
    const data = await fetchDashboardRawData(supabase);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
