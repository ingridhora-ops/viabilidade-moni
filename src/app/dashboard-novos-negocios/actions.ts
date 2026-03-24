'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchDashboardRawData } from '@/lib/dashboard-novos-negocios/fetchData';

export type DashboardNovosNegociosRaw = Awaited<ReturnType<typeof fetchDashboardRawData>>;

/**
 * Agregado de todos os kanbans (gráficos / KPIs).
 * Sempre leitura via service role — mesmo comportamento em dev/prod, público ou qualquer login.
 */
export async function loadDashboardNovosNegociosData(): Promise<
  { ok: true; data: DashboardNovosNegociosRaw } | { ok: false; error: string }
> {
  try {
    const admin = createAdminClient();
    const data = await fetchDashboardRawData(admin);
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Configuração do servidor: defina SUPABASE_SERVICE_ROLE_KEY (necessário para o dashboard agregado). ${msg}`,
    };
  }
}
