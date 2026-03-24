import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isAppFullyPublic, isPublicRedeNovosNegociosEnabled } from '@/lib/public-rede-novos';
import { type ProcessoCard } from '@/app/steps-viabilidade/StepsKanbanColumn';
import { PAINEL_COLUMNS, type PainelColumnKey } from '@/app/steps-viabilidade/painelColumns';
import { PainelNovosNegociosClient } from '@/app/steps-viabilidade/PainelNovosNegociosClient';
import { buildChecklistAtrasoByCardId } from '@/lib/painel-checklist-atraso';
import { sortProcessosPorOrdemColuna } from '@/lib/painel-coluna-ordem';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function PainelNovosNegociosPage({
  searchParams,
}: {
  searchParams?: { card?: string | string[]; abrir?: string | string[] };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const publicMode = isPublicRedeNovosNegociosEnabled();

  let db = supabase;
  if (!user && (publicMode || isAppFullyPublic())) {
    try {
      db = createAdminClient();
    } catch {
      /* RLS com cliente anónimo: lista pode vir vazia */
    }
  }

  const { data: rows } = await db
    .from('processo_step_one')
    .select(
      'id, cidade, estado, status, etapa_atual, updated_at, user_id, step_atual, cancelado_em, removido_em, cancelado_motivo, removido_motivo, etapa_painel, trava_painel, tipo_aquisicao_terreno, numero_franquia, nome_franqueado, nome_condominio, quadra_lote, historico_base_id, ordem_coluna_painel',
    )
  ;

  const rowsTodos = rows ?? [];

  const processIds = rowsTodos.map((r) => r.user_id).filter(Boolean) as string[];
  let profiles: { id: string; full_name: string | null }[] = [];
  if (processIds.length > 0) {
    const { data: prof } = await db
      .from('profiles')
      .select('id, full_name')
      .in('id', [...new Set(processIds)]);
    profiles = prof ?? [];
  }
  const profileByUserId = Object.fromEntries(profiles.map((p) => [p.id, p.full_name ?? null]));

  const baseProcessoIds = Array.from(
    new Set(rowsTodos.map((r) => (r.historico_base_id as string | null | undefined) ?? r.id)),
  );
  let checklistAtrasoByCardId = new Map<string, { hasAtrasado: boolean; hasAtencao: boolean }>();
  if (baseProcessoIds.length > 0) {
    const { data: checklistRows } = await db
      .from('processo_card_checklist')
      .select('processo_id, etapa_painel, prazo, status, concluido')
      .in('processo_id', baseProcessoIds);

    checklistAtrasoByCardId = buildChecklistAtrasoByCardId(
      rowsTodos.map((r) => ({
        id: r.id,
        historico_base_id: (r as { historico_base_id?: string | null }).historico_base_id ?? null,
        etapa_painel: (r as { etapa_painel?: string | null }).etapa_painel ?? null,
      })),
      checklistRows ?? [],
      { defaultEtapaPainel: 'step_1' },
    );
  }

  const baseIdByProcessoId = new Map<string, string>();
  const processoIdsAprovadosEmComite = new Set<string>();
  for (const row of rowsTodos) {
    const baseId = String((row as { historico_base_id?: string | null }).historico_base_id ?? row.id);
    baseIdByProcessoId.set(row.id, baseId);
  }
  const baseIds = [...new Set(Array.from(baseIdByProcessoId.values()).filter(Boolean))];
  if (baseIds.length > 0) {
    const { data: comiteRows } = await db
      .from('processo_card_comite')
      .select('processo_id, comite_resultado')
      .eq('comite_resultado', 'aprovado')
      .in('processo_id', baseIds);

    const baseIdsAprovados = new Set<string>();
    for (const row of comiteRows ?? []) {
      const baseId = String((row as { processo_id?: string | null }).processo_id ?? '');
      if (baseId) baseIdsAprovados.add(baseId);
    }
    for (const [procId, baseId] of baseIdByProcessoId.entries()) {
      if (baseIdsAprovados.has(baseId)) processoIdsAprovadosEmComite.add(procId);
    }
  }

  const processos: ProcessoCard[] = rowsTodos.map((r) => {
    const raw = r as {
      etapa_painel?: string | null;
      trava_painel?: boolean | null;
      tipo_aquisicao_terreno?: string | null;
      observacoes?: string | null;
    };
    const st = String(r.status ?? '').toLowerCase();
    const isCancelado = st === 'cancelado' || Boolean((r as any).cancelado_em);
    const isRemovido = st === 'removido' || Boolean((r as any).removido_em);
    return {
      id: r.id,
      cidade: r.cidade ?? '',
      estado: r.estado ?? null,
      status: r.status ?? 'rascunho',
      cancelado_motivo: (r as any).cancelado_motivo ?? null,
      removido_motivo: (r as any).removido_motivo ?? null,
      cancelado_em: (r as any).cancelado_em ?? null,
      removido_em: (r as any).removido_em ?? null,
      etapa_atual: r.etapa_atual ?? 1,
      updated_at: r.updated_at ?? null,
      franqueado_nome: (r as { nome_franqueado?: string | null }).nome_franqueado ?? profileByUserId[r.user_id] ?? null,
      numero_franquia: (r as { numero_franquia?: string | null }).numero_franquia ?? null,
      nome_condominio: (r as { nome_condominio?: string | null }).nome_condominio ?? null,
      quadra_lote: (r as { quadra_lote?: string | null }).quadra_lote ?? null,
      step_atual: (r as { step_atual?: number }).step_atual ?? 1,
      etapa_painel: (raw.etapa_painel ?? 'step_1') as PainelColumnKey | string,
      trava_painel: raw.trava_painel ?? false,
      tipo_aquisicao_terreno: raw.tipo_aquisicao_terreno ?? null,
      observacoes: raw.observacoes ?? null,
      has_atividade_atrasada:
        isCancelado || isRemovido ? false : checklistAtrasoByCardId.get(r.id)?.hasAtrasado ?? false,
      has_atividade_atencao:
        isCancelado || isRemovido ? false : checklistAtrasoByCardId.get(r.id)?.hasAtencao ?? false,
      has_comite_aprovado: isCancelado || isRemovido ? false : processoIdsAprovadosEmComite.has(r.id),
      ordem_coluna_painel: ((r as { ordem_coluna_painel?: number | null }).ordem_coluna_painel ?? 0) as number,
    };
  });

  const byEtapa = PAINEL_COLUMNS.reduce(
    (acc, col) => {
      let list = processos.filter((p) => p.etapa_painel === col.key);
      if (col.key === 'credito_terreno') {
        list = list.filter(
          (p) => (p.tipo_aquisicao_terreno ?? '') !== 'Permuta',
        );
      }
      acc[col.key] = sortProcessosPorOrdemColuna(list);
      return acc;
    },
    {} as Record<PainelColumnKey, ProcessoCard[]>,
  );

  const cardParam = searchParams?.card;
  const abrirParam = searchParams?.abrir;
  const initialOpenProcessId =
    (Array.isArray(cardParam) ? cardParam[0] : cardParam) ??
    (Array.isArray(abrirParam) ? abrirParam[0] : abrirParam);

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-moni-primary hover:underline">
              ← Início
            </Link>
            <span className="text-stone-400">/</span>
            <span className="font-medium text-stone-700">Painel Novos Negócios</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl overflow-x-auto px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-moni-dark">Painel Novos Negócios</h1>
            <p className="mt-1 text-sm text-stone-600">
              Fases com processos/cards dentro. Independente dos macro-itens do menu — apenas um board por etapa.
            </p>
          </div>
        </div>
        <PainelNovosNegociosClient
          byEtapa={byEtapa}
          initialOpenProcessId={initialOpenProcessId}
          kanbanReadOnly={false}
        />
      </main>
    </div>
  );
}
