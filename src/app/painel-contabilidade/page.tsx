import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAppFullyPublic } from '@/lib/public-rede-novos';
import type { ProcessoCard } from '@/app/steps-viabilidade/StepsKanbanColumn';
import type { PainelColumnKey } from '@/app/steps-viabilidade/painelColumns';
import { PainelContabilidadeClient } from '@/app/painel-contabilidade/PainelContabilidadeClient';
import { dayStartLocal, parsePrazoBrOrIso } from '@/lib/painel-checklist-atraso';
import { sortProcessosPorOrdemColuna } from '@/lib/painel-coluna-ordem';

export default async function PainelContabilidadePage({
  searchParams,
}: {
  searchParams?: { card?: string | string[]; abrir?: string | string[] };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user && !isAppFullyPublic()) redirect('/login');

  let db = supabase;
  if (!user && isAppFullyPublic()) {
    try {
      db = createAdminClient();
    } catch {
      /* RLS */
    }
  }

  const { data: rows } = await db
    .from('processo_step_one')
    .select(
      'id, cidade, estado, status, etapa_atual, updated_at, user_id, step_atual, cancelado_em, removido_em, cancelado_motivo, removido_motivo, etapa_painel, trava_painel, tipo_aquisicao_terreno, numero_franquia, nome_franqueado, nome_condominio, quadra_lote, historico_base_id, ordem_coluna_painel',
    );

  const rowsTodos = rows ?? [];
  const contabKeys: Array<'contabilidade_incorporadora' | 'contabilidade_spe' | 'contabilidade_gestora'> = [
    'contabilidade_incorporadora',
    'contabilidade_spe',
    'contabilidade_gestora',
  ];
  const contabProcessos = rowsTodos.filter((r) => contabKeys.includes(r.etapa_painel as any));

  const processIds = contabProcessos.map((r) => r.user_id).filter(Boolean) as string[];
  let profiles: { id: string; full_name: string | null }[] = [];
  if (processIds.length > 0) {
    const { data: prof } = await db.from('profiles').select('id, full_name').in('id', [...new Set(processIds)]);
    profiles = prof ?? [];
  }
  const profileByUserId = Object.fromEntries(profiles.map((p) => [p.id, p.full_name ?? null]));

  const baseProcessoIds = Array.from(new Set(contabProcessos.map((r) => (r.historico_base_id as string | null | undefined) ?? r.id)));
  let checklistByProcesso = new Map<string, { hasAtrasado: boolean; hasAtencao: boolean }>();
  if (baseProcessoIds.length > 0) {
    const { data: checklistRows } = await db
      .from('processo_card_checklist')
      .select('processo_id, prazo, status, concluido')
      .in('processo_id', baseProcessoIds);

    const hoje = dayStartLocal(new Date());
    const amanha = dayStartLocal(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1));
    checklistByProcesso = (checklistRows ?? []).reduce((acc, row) => {
      const processoId = String((row as { processo_id?: string | null }).processo_id ?? '');
      if (!processoId) return acc;
      const status = String((row as { status?: string | null }).status ?? '').trim().toLowerCase();
      const concluido = Boolean((row as { concluido?: boolean | null }).concluido);
      if (concluido || status === 'concluido' || status === 'concluida') return acc;
      const prazo = parsePrazoBrOrIso((row as { prazo?: string | null }).prazo ?? null);
      if (!prazo) return acc;
      const prazoDia = dayStartLocal(prazo);
      const current = acc.get(processoId) ?? { hasAtrasado: false, hasAtencao: false };
      if (prazoDia.getTime() < hoje.getTime()) current.hasAtrasado = true;
      if (prazoDia.getTime() === amanha.getTime()) current.hasAtencao = true;
      acc.set(processoId, current);
      return acc;
    }, new Map<string, { hasAtrasado: boolean; hasAtencao: boolean }>());
  }

  const processos: ProcessoCard[] = contabProcessos.map((r) => {
    const st = String(r.status ?? '').toLowerCase();
    const isCancelado = st === 'cancelado' || Boolean((r as any).cancelado_em);
    const isRemovido = st === 'removido' || Boolean((r as any).removido_em);
    const baseChecklistId = String((r.historico_base_id as string | null | undefined) ?? r.id);
    const checklistFlags = checklistByProcesso.get(baseChecklistId);
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
      etapa_painel: ((r as any).etapa_painel ?? 'contabilidade_incorporadora') as PainelColumnKey | string,
      trava_painel: ((r as any).trava_painel ?? false) as boolean,
      tipo_aquisicao_terreno: ((r as any).tipo_aquisicao_terreno ?? null) as string | null,
      observacoes: ((r as any).observacoes ?? null) as string | null,
      has_atividade_atrasada:
        isCancelado || isRemovido ? false : checklistFlags?.hasAtrasado ?? false,
      has_atividade_atencao:
        isCancelado || isRemovido ? false : checklistFlags?.hasAtencao ?? false,
      ordem_coluna_painel: ((r as { ordem_coluna_painel?: number | null }).ordem_coluna_painel ?? 0) as number,
    };
  });

  const byEtapa = {
    contabilidade_incorporadora: sortProcessosPorOrdemColuna(
      processos.filter((p) => p.etapa_painel === 'contabilidade_incorporadora'),
    ),
    contabilidade_spe: sortProcessosPorOrdemColuna(processos.filter((p) => p.etapa_painel === 'contabilidade_spe')),
    contabilidade_gestora: sortProcessosPorOrdemColuna(
      processos.filter((p) => p.etapa_painel === 'contabilidade_gestora'),
    ),
  };

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
            <span className="font-medium text-stone-700">Painel Contabilidade</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl overflow-x-auto px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-moni-dark">Painel Contabilidade</h1>
            <p className="mt-1 text-sm text-stone-600">Kanban com as fases de Contabilidade conectadas ao card pai e ao histórico compartilhado.</p>
          </div>
        </div>
        <PainelContabilidadeClient byEtapa={byEtapa} initialOpenProcessId={initialOpenProcessId} />
      </main>
    </div>
  );
}

