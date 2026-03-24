import type { SupabaseClient } from '@supabase/supabase-js';

export type ProcessoOrdemColuna = {
  id: string;
  ordem_coluna_painel?: number | null;
  updated_at?: string | null;
};

export function sortProcessosPorOrdemColuna<T extends ProcessoOrdemColuna>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const oa = a.ordem_coluna_painel ?? 0;
    const ob = b.ordem_coluna_painel ?? 0;
    if (oa !== ob) return oa - ob;
    const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return String(a.id).localeCompare(String(b.id));
  });
}

/** Próximo índice no fim da coluna (novo card ou card que entra na fase). */
export async function allocNextOrdemColunaPainel(
  supabase: SupabaseClient,
  etapaPainel: string,
): Promise<number> {
  const { data } = await supabase
    .from('processo_step_one')
    .select('ordem_coluna_painel')
    .eq('etapa_painel', etapaPainel)
    .order('ordem_coluna_painel', { ascending: false })
    .limit(1)
    .maybeSingle();

  const max = (data as { ordem_coluna_painel?: number } | null)?.ordem_coluna_painel;
  return (typeof max === 'number' ? max : -1) + 1;
}
