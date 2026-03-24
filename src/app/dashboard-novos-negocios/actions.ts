'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchDashboardRawData } from '@/lib/dashboard-novos-negocios/fetchData';

export type DashboardNovosNegociosRaw = Awaited<ReturnType<typeof fetchDashboardRawData>>;

/**
 * Agregado de todos os kanbans (gráficos / KPIs).
 * Preferência: service role. Sem chave, sessão + RLS se houver login.
 */
export async function loadDashboardNovosNegociosData(): Promise<
  { ok: true; data: DashboardNovosNegociosRaw } | { ok: false; error: string }
> {
  try {
    const admin = createAdminClient();
    const data = await fetchDashboardRawData(admin);
    return { ok: true, data };
  } catch {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error:
          'Dashboard: defina SUPABASE_SERVICE_ROLE_KEY no servidor (ex.: Vercel) ou entre com uma conta.',
      };
    }
    try {
      const data = await fetchDashboardRawData(supabase);
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
