'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { PainelColumnKey } from './painelColumns';
import { PAINEL_COLUMNS } from './painelColumns';
import { STEP2_EM_CASA_CHECKLIST } from '@/lib/painel-step2-em-casa-checklist';
import {
  type MotivoCancelamento,
  type MotivoReprovacaoComite,
  type FaseContabilidadeDashboard,
  type FaseCreditoDashboard,
} from '@/lib/painel/cancelamento-motivos';
import { precisaMotivoReprovacaoComiteNoCancelamento } from '@/lib/painel/dashboard-etapas';
import { allocNextOrdemColunaPainel } from '@/lib/painel-coluna-ordem';
import { getPainelDbForPublicEdit } from '@/lib/painel-public-edit';

const STEP2_NOVO_NEGOCIO_ESTUDOS_DOCS_TITULOS = [
  'BCA',
  'Carta Proposta',
  'Mapa de Competidores + Batalha de Casas',
  'Gadgets',
  'Fotos do Terreno',
  'Fotos do Condomínio',
] as const;

async function resolveAutorNome(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  fallbackEmail?: string,
): Promise<string> {
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId).single();
  const nome = (profile?.full_name as string | null | undefined)?.trim();
  if (nome) return nome;
  const fallback = fallbackEmail?.split('@')?.[0]?.trim();
  return fallback || 'Usuário';
}

async function resolveHistoricoBaseId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  processoId: string,
): Promise<string> {
  const { data } = await supabase.from('processo_step_one').select('historico_base_id').eq('id', processoId).maybeSingle();
  return (data as { historico_base_id?: string | null } | null)?.historico_base_id ?? processoId;
}

async function registrarEventoCard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  processoId: string,
  autorId: string,
  autorNome: string,
  etapaPainel: string | null | undefined,
  tipo: string,
  descricao: string,
  detalhes?: Record<string, unknown> | null,
): Promise<void> {
  try {
    const baseId = await resolveHistoricoBaseId(supabase, processoId);
    await supabase.from('processo_card_eventos').insert({
      processo_id: baseId,
      autor_id: autorId,
      autor_nome: autorNome,
      etapa_painel: etapaPainel ?? null,
      tipo,
      descricao,
      detalhes: detalhes ?? null,
    });
  } catch {
    // não bloquear o fluxo
  }
}

export type PainelActionResult = { ok: true } | { ok: false; error: string };

export type MotivoActionResult =
  | { ok: true; mensagem: string }
  | { ok: false; error: string };

export type ProcessoResumoStep1 = {
  id: string;
  numero_franquia: string | null;
  modalidade: string | null;
  nome_franqueado: string | null;
  status_franquia: string | null;
  classificacao_franqueado: string | null;
  area_atuacao_franquia: string | null;
  email_franqueado: string | null;
  telefone_frank: string | null;
  cpf_frank: string | null;
  data_nasc_frank: string | null;
  responsavel_comercial: string | null;
  tamanho_camiseta_frank: string | null;
  socios: string | null;
  data_ass_cof: string | null;
  data_ass_contrato: string | null;
  data_expiracao_franquia: string | null;
  endereco_casa_frank: string | null;
  endereco_casa_frank_numero: string | null;
  endereco_casa_frank_complemento: string | null;
  cep_casa_frank: string | null;
  estado_casa_frank: string | null;
  cidade_casa_frank: string | null;
  // Campos do formulário "Novo Negócio" (Step 2)
  cidade: string | null;
  estado: string | null;
  tipo_aquisicao_terreno: string | null;
  valor_terreno: string | null;
  vgv_pretendido: string | null;
  produto_modelo_casa: string | null;
  link_pasta_drive: string | null;
  nome_condominio: string | null;
  quadra_lote: string | null;
  observacoes: string | null;
  previsao_aprovacao_condominio: string | null;
  previsao_aprovacao_prefeitura: string | null;
  previsao_emissao_alvara: string | null;
  data_aprovacao_condominio: string | null;
  data_aprovacao_prefeitura: string | null;
  data_emissao_alvara: string | null;
  previsao_liberacao_credito_obra: string | null;
  previsao_inicio_obra: string | null;
  data_aprovacao_credito: string | null;
  fase_contabilidade: string | null;
  fase_credito: string | null;
};

export type ProcessoRelacionado = {
  id: string;
  etapa_painel: string | null;
  cidade: string | null;
  estado: string | null;
  numero_franquia: string | null;
  nome_franqueado: string | null;
  nome_condominio: string | null;
};

export async function getResumoProcessoStep1(processoId: string): Promise<
  | { ok: true; data: ProcessoResumoStep1 }
  | { ok: false; error: string }
> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data, error } = await supabase
    .from('processo_step_one')
    .select(
      [
        'id',
        'numero_franquia',
        'modalidade',
        'nome_franqueado',
        'status_franquia',
        'classificacao_franqueado',
        'area_atuacao_franquia',
        'email_franqueado',
        'telefone_frank',
        'cpf_frank',
        'data_nasc_frank',
        'responsavel_comercial',
        'tamanho_camiseta_frank',
        'socios',
        'data_ass_cof',
        'data_ass_contrato',
        'data_expiracao_franquia',
        'endereco_casa_frank',
        'endereco_casa_frank_numero',
        'endereco_casa_frank_complemento',
        'cep_casa_frank',
        'estado_casa_frank',
        'cidade_casa_frank',
        'cidade',
        'estado',
        'tipo_aquisicao_terreno',
        'valor_terreno',
        'vgv_pretendido',
        'produto_modelo_casa',
        'link_pasta_drive',
        'nome_condominio',
        'quadra_lote',
        'observacoes',
        'previsao_aprovacao_condominio',
        'previsao_aprovacao_prefeitura',
        'previsao_emissao_alvara',
        'data_aprovacao_condominio',
        'data_aprovacao_prefeitura',
        'data_emissao_alvara',
        'previsao_liberacao_credito_obra',
        'previsao_inicio_obra',
        'data_aprovacao_credito',
        'fase_contabilidade',
        'fase_credito',
      ].join(','),
    )
    .eq('id', processoId)
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Processo não encontrado.' };
  return { ok: true, data: data as unknown as ProcessoResumoStep1 };
}

export async function getRelacionadosProcesso(
  processoId: string,
): Promise<
  | {
      ok: true;
      pai: ProcessoRelacionado | null;
      filhos: ProcessoRelacionado[];
      irmaos: ProcessoRelacionado[];
    }
  | { ok: false; error: string }
> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data: atual, error: atualErr } = await supabase
    .from('processo_step_one')
    .select('id, historico_base_id')
    .eq('id', processoId)
    .maybeSingle();
  if (atualErr || !atual) return { ok: false, error: atualErr?.message ?? 'Processo não encontrado.' };

  const baseId = ((atual as any).historico_base_id as string | null | undefined) ?? processoId;

  const { data: rows, error } = await supabase
    .from('processo_step_one')
    .select('id, etapa_painel, cidade, estado, numero_franquia, nome_franqueado, nome_condominio, historico_base_id')
    .or(`id.eq.${baseId},historico_base_id.eq.${baseId}`);
  if (error) return { ok: false, error: error.message };

  const all = ((rows ?? []) as any[]).map(
    (r) =>
      ({
        id: String(r.id),
        etapa_painel: (r.etapa_painel ?? null) as string | null,
        cidade: (r.cidade ?? null) as string | null,
        estado: (r.estado ?? null) as string | null,
        numero_franquia: (r.numero_franquia ?? null) as string | null,
        nome_franqueado: (r.nome_franqueado ?? null) as string | null,
        nome_condominio: (r.nome_condominio ?? null) as string | null,
      }) satisfies ProcessoRelacionado,
  );

  const pai = all.find((r) => r.id === baseId) ?? null;
  const filhos = all.filter((r) => r.id !== baseId);
  const irmaos = all.filter((r) => r.id !== processoId && r.id !== baseId);

  return { ok: true, pai, filhos, irmaos };
}

export async function updateDadosPreObra(
  processoId: string,
  payload: {
    previsao_aprovacao_condominio: string | null;
    previsao_aprovacao_prefeitura: string | null;
    previsao_emissao_alvara: string | null;
    data_aprovacao_condominio: string | null;
    data_aprovacao_prefeitura: string | null;
    data_emissao_alvara: string | null;
    data_aprovacao_credito: string | null;
    previsao_liberacao_credito_obra: string | null;
    previsao_inicio_obra: string | null;
  },
): Promise<PainelActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const normalize = (v: string | null | undefined) => {
    const s = String(v ?? '').trim();
    return s.length > 0 ? s : null;
  };

  const { error } = await supabase
    .from('processo_step_one')
    .update({
      previsao_aprovacao_condominio: normalize(payload.previsao_aprovacao_condominio),
      previsao_aprovacao_prefeitura: normalize(payload.previsao_aprovacao_prefeitura),
      previsao_emissao_alvara: normalize(payload.previsao_emissao_alvara),
      data_aprovacao_condominio: normalize(payload.data_aprovacao_condominio),
      data_aprovacao_prefeitura: normalize(payload.data_aprovacao_prefeitura),
      data_emissao_alvara: normalize(payload.data_emissao_alvara),
      data_aprovacao_credito: normalize(payload.data_aprovacao_credito),
      previsao_liberacao_credito_obra: normalize(payload.previsao_liberacao_credito_obra),
      previsao_inicio_obra: normalize(payload.previsao_inicio_obra),
      updated_at: new Date().toISOString(),
    })
    .eq('id', processoId);

  if (error) return { ok: false, error: error.message };

  await registrarEventoCard(
    supabase,
    processoId,
    userId,
    autorNome,
    null,
    'dados_pre_obra_update',
    'Dados Pré Obra atualizados',
    {
      has_previsao_aprovacao_condominio: Boolean(normalize(payload.previsao_aprovacao_condominio)),
      has_previsao_aprovacao_prefeitura: Boolean(normalize(payload.previsao_aprovacao_prefeitura)),
      has_previsao_emissao_alvara: Boolean(normalize(payload.previsao_emissao_alvara)),
      has_data_aprovacao_condominio: Boolean(normalize(payload.data_aprovacao_condominio)),
      has_data_aprovacao_prefeitura: Boolean(normalize(payload.data_aprovacao_prefeitura)),
      has_data_emissao_alvara: Boolean(normalize(payload.data_emissao_alvara)),
      has_data_aprovacao_credito: Boolean(normalize(payload.data_aprovacao_credito)),
      has_previsao_liberacao_credito_obra: Boolean(normalize(payload.previsao_liberacao_credito_obra)),
      has_previsao_inicio_obra: Boolean(normalize(payload.previsao_inicio_obra)),
    },
  );

  revalidatePath('/painel-novos-negocios');
  revalidatePath('/dashboard-novos-negocios');
  return { ok: true };
}

/** Atualiza a etapa do processo no Painel (mover card de coluna). */
export async function atualizarEtapaPainel(
  processoId: string,
  etapaKey: PainelColumnKey,
): Promise<PainelActionResult> {
  const validKeys = new Set(PAINEL_COLUMNS.map((c) => c.key));
  if (!validKeys.has(etapaKey)) return { ok: false, error: 'Etapa inválida.' };

  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data: beforeProc } = await supabase
    .from('processo_step_one')
    .select('etapa_painel')
    .eq('id', processoId)
    .maybeSingle();

  const fasePatch: Record<string, string> = {};
  if (etapaKey === 'contabilidade_incorporadora') fasePatch.fase_contabilidade = 'abertura_incorporadora';
  if (etapaKey === 'contabilidade_spe') fasePatch.fase_contabilidade = 'abertura_spe';
  if (etapaKey === 'contabilidade_gestora') fasePatch.fase_contabilidade = 'abertura_gestora';
  if (etapaKey === 'credito_terreno') fasePatch.fase_credito = 'check_legal_mais_credito';
  if (etapaKey === 'credito_obra') fasePatch.fase_credito = 'contratacao_credito';

  const fromEtapa = (beforeProc as { etapa_painel?: string } | null)?.etapa_painel ?? null;
  const ordemColuna =
    fromEtapa !== etapaKey ? await allocNextOrdemColunaPainel(supabase, etapaKey) : undefined;

  const { error } = await supabase
    .from('processo_step_one')
    .update({
      etapa_painel: etapaKey,
      updated_at: new Date().toISOString(),
      ...(ordemColuna !== undefined ? { ordem_coluna_painel: ordemColuna } : {}),
      ...fasePatch,
    })
    .eq('id', processoId);

  if (error) return { ok: false, error: error.message };

  await registrarEventoCard(
    supabase,
    processoId,
    userId,
    autorNome,
    beforeProc?.etapa_painel ?? null,
    'card_move',
    `Card movido para ${etapaKey}`,
    { from: beforeProc?.etapa_painel ?? null, to: etapaKey },
  );

  // Quando o card entra na etapa Step 2, garante que o checklist "Em Casa" exista.
  if (etapaKey === 'step_2') {
    const { data: existing } = await supabase
      .from('processo_card_checklist')
      .select('titulo, ordem')
      .eq('processo_id', processoId)
      .eq('etapa_painel', 'step_2');

    const existingTitles = new Set((existing ?? []).map((r) => r.titulo));
    const maxOrdem = Math.max(...(existing ?? []).map((r) => (typeof r.ordem === 'number' ? r.ordem : 0)), 0);
    const missing = STEP2_EM_CASA_CHECKLIST.filter((it) => !existingTitles.has(it.titulo));

    if (missing.length > 0) {
      const rows = missing.map((it, idx) => ({
        processo_id: processoId,
        etapa_painel: 'step_2',
        titulo: it.titulo,
        prazo: it.prazo,
        responsavel_nome: it.responsavelNome,
        concluido: false,
        ordem: maxOrdem + idx + 1,
      }));

      const { error: seedErr } = await supabase.from('processo_card_checklist').insert(rows);
      if (seedErr) return { ok: false, error: seedErr.message };
    }

    // Seed dos documentos "Estudos Novo Negócio" (Checklist/Anexos)
    const { data: existingDocs } = await supabase
      .from('processo_card_documentos')
      .select('titulo, ordem')
      .eq('processo_id', processoId)
      .eq('etapa_painel', 'step_2');

    const existingDocTitles = new Set((existingDocs ?? []).map((r) => r.titulo));
    const maxDocOrdem = Math.max(...(existingDocs ?? []).map((r) => (typeof r.ordem === 'number' ? r.ordem : 0)), 0);
    const missingDocs = STEP2_NOVO_NEGOCIO_ESTUDOS_DOCS_TITULOS.filter((t) => !existingDocTitles.has(t));

    if (missingDocs.length > 0) {
      const docRows = missingDocs.map((titulo, idx) => ({
        processo_id: processoId,
        etapa_painel: 'step_2',
        titulo,
        ordem: maxDocOrdem + idx + 1,
      }));
      const { error: seedDocsErr } = await supabase.from('processo_card_documentos').insert(docRows);
      if (seedDocsErr) return { ok: false, error: seedDocsErr.message };
    }
  }

  // Cria cards "filhos" conectados (Crédito e Contabilidade), compartilhando historico_base_id.
  // Crédito:
  // - Step 3 => Crédito Terreno (exceto Permuta)
  // - Step 6 => Crédito Obra
  // Contabilidade:
  // - Step 6 => Abertura da Incorporadora
  // - Ao avançar DE Step 7 => Abertura da SPE
  {
    const { data: parentProcData, error: parentProcErr } = await supabase
      .from('processo_step_one')
      .select(
        [
          'id',
          'user_id',
          'cidade',
          'estado',
          'status',
          'etapa_atual',
          'step_atual',
          'updated_at',
          'cancelado_em',
          'removido_em',
          'cancelado_motivo',
          'removido_motivo',
          'trava_painel',
          'tipo_aquisicao_terreno',
          'numero_franquia',
          'nome_franqueado',
          'nome_condominio',
          'quadra_lote',
          'observacoes',
          'historico_base_id',
        ].join(','),
      )
      .eq('id', processoId)
      .single();

    if (!parentProcErr && parentProcData) {
      const parentProc = parentProcData as unknown as {
        id: string;
        historico_base_id: string | null;
        user_id: string | null;
        cidade: string | null;
        estado: string | null;
        status: string | null;
        etapa_atual: number | null;
        step_atual: number | null;
        updated_at: string | null;
        cancelado_em: string | null;
        removido_em: string | null;
        cancelado_motivo: string | null;
        removido_motivo: string | null;
        trava_painel: boolean | null;
        tipo_aquisicao_terreno: string | null;
        numero_franquia: string | null;
        nome_franqueado: string | null;
        nome_condominio: string | null;
        quadra_lote: string | null;
        observacoes: string | null;
      };
      if (parentProc.id) {
      const baseId = parentProc.historico_base_id ?? parentProc.id;

      const createChildIfMissing = async (
        targetEtapa:
          | 'credito_terreno'
          | 'credito_obra'
          | 'contabilidade_incorporadora'
          | 'contabilidade_spe'
          | 'contabilidade_gestora',
        relationField: 'origem_credito_processo_id' | 'origem_contabilidade_processo_id',
      ): Promise<{ ok: true } | { ok: false; error: string }> => {
        const { data: existingChild } = await supabase
          .from('processo_step_one')
          .select('id')
          .eq(relationField, parentProc.id)
          .eq('etapa_painel', targetEtapa)
          .maybeSingle();

        if (existingChild?.id) return { ok: true };

        const ordemNova = await allocNextOrdemColunaPainel(supabase, targetEtapa);

        const { error: insertErr } = await supabase.from('processo_step_one').insert({
          user_id: parentProc.user_id,
          cidade: parentProc.cidade,
          estado: parentProc.estado,
          status: parentProc.status,
          etapa_atual: parentProc.etapa_atual,
          step_atual: parentProc.step_atual,
          updated_at: new Date().toISOString(),
          cancelado_em: parentProc.cancelado_em,
          removido_em: parentProc.removido_em,
          cancelado_motivo: parentProc.cancelado_motivo,
          removido_motivo: parentProc.removido_motivo,
          trava_painel: parentProc.trava_painel,
          tipo_aquisicao_terreno: parentProc.tipo_aquisicao_terreno,
          numero_franquia: parentProc.numero_franquia,
          nome_franqueado: parentProc.nome_franqueado,
          nome_condominio: parentProc.nome_condominio,
          quadra_lote: parentProc.quadra_lote,
          observacoes: parentProc.observacoes,
          etapa_painel: targetEtapa,
          ordem_coluna_painel: ordemNova,
          origem_credito_processo_id: relationField === 'origem_credito_processo_id' ? parentProc.id : null,
          origem_contabilidade_processo_id: relationField === 'origem_contabilidade_processo_id' ? parentProc.id : null,
          historico_base_id: baseId,
        });

        if (insertErr) return { ok: false, error: insertErr.message };
        return { ok: true };
      };

      // Crédito
      if (etapaKey === 'step_3' && parentProc.tipo_aquisicao_terreno !== 'Permuta') {
        const cr = await createChildIfMissing('credito_terreno', 'origem_credito_processo_id');
        if (!cr.ok) return cr;
      }
      if (etapaKey === 'step_6') {
        const cr = await createChildIfMissing('credito_obra', 'origem_credito_processo_id');
        if (!cr.ok) return cr;
      }

      // Contabilidade
      if (etapaKey === 'step_6') {
        const ct = await createChildIfMissing('contabilidade_incorporadora', 'origem_contabilidade_processo_id');
        if (!ct.ok) return ct;
      }

      const idxFrom = PAINEL_COLUMNS.findIndex((c) => c.key === (beforeProc?.etapa_painel as PainelColumnKey));
      const idxTo = PAINEL_COLUMNS.findIndex((c) => c.key === etapaKey);
      const avancouDeStep7 = beforeProc?.etapa_painel === 'step_7' && idxTo > idxFrom;
      if (avancouDeStep7) {
        const ct = await createChildIfMissing('contabilidade_spe', 'origem_contabilidade_processo_id');
        if (!ct.ok) return ct;
      }
      }
    }
  }

  revalidatePath('/painel-novos-negocios');
  revalidatePath('/painel-contabilidade');
  revalidatePath('/painel-credito');
  revalidatePath('/dashboard-novos-negocios');
  return { ok: true };
}

function reorderMoveBefore(global: string[], moving: string, beforeId: string): string[] {
  if (moving === beforeId) return global;
  const g = global.filter((id) => id !== moving);
  const i = g.indexOf(beforeId);
  if (i < 0) return global;
  return [...g.slice(0, i), moving, ...g.slice(i)];
}

function reorderMoveAfter(global: string[], moving: string, afterId: string): string[] {
  if (moving === afterId) return global;
  const g = global.filter((id) => id !== moving);
  const i = g.indexOf(afterId);
  if (i < 0) return global;
  return [...g.slice(0, i + 1), moving, ...g.slice(i + 1)];
}

/** Sobe/desce o card na coluna; `vizinhoId` é o card imediatamente acima (up) ou abaixo (down) na lista que o usuário vê. */
export async function reordenarCardNaColunaPainel(
  processoId: string,
  etapaKey: PainelColumnKey,
  direcao: 'up' | 'down',
  vizinhoId: string,
): Promise<PainelActionResult> {
  const validKeys = new Set(PAINEL_COLUMNS.map((c) => c.key));
  if (!validKeys.has(etapaKey)) return { ok: false, error: 'Etapa inválida.' };

  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data: row } = await supabase
    .from('processo_step_one')
    .select('etapa_painel, trava_painel, status, cancelado_em, removido_em')
    .eq('id', processoId)
    .maybeSingle();
  if (!row) return { ok: false, error: 'Processo não encontrado.' };
  const r = row as {
    etapa_painel?: string | null;
    trava_painel?: boolean | null;
    status?: string | null;
    cancelado_em?: string | null;
    removido_em?: string | null;
  };
  if (r.etapa_painel !== etapaKey) return { ok: false, error: 'Card não está nesta coluna.' };
  if (r.trava_painel) return { ok: false, error: 'Card travado não pode ser reordenado.' };
  const st = String(r.status ?? '').toLowerCase();
  if (st === 'cancelado' || r.cancelado_em) return { ok: false, error: 'Card cancelado não pode ser reordenado.' };
  if (st === 'removido' || r.removido_em) return { ok: false, error: 'Card excluído não pode ser reordenado.' };
  if (st === 'concluido') return { ok: false, error: 'Card concluído não pode ser reordenado.' };

  const { data: vizRow } = await supabase
    .from('processo_step_one')
    .select('etapa_painel')
    .eq('id', vizinhoId)
    .maybeSingle();
  if (!vizRow || (vizRow as { etapa_painel?: string }).etapa_painel !== etapaKey) {
    return { ok: false, error: 'Vizinho inválido.' };
  }

  const { data: allRows } = await supabase
    .from('processo_step_one')
    .select('id')
    .eq('etapa_painel', etapaKey)
    .order('ordem_coluna_painel', { ascending: true })
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true });

  const globalOrder = (allRows ?? []).map((x) => String((x as { id: string }).id));
  if (!globalOrder.includes(processoId) || !globalOrder.includes(vizinhoId)) {
    return { ok: false, error: 'Ordem da coluna desatualizada. Atualize a página.' };
  }

  const nextOrder =
    direcao === 'up'
      ? reorderMoveBefore(globalOrder, processoId, vizinhoId)
      : reorderMoveAfter(globalOrder, processoId, vizinhoId);

  if (nextOrder.join(',') === globalOrder.join(',')) {
    return { ok: false, error: 'Não foi possível alterar a ordem.' };
  }

  const now = new Date().toISOString();
  const results = await Promise.all(
    nextOrder.map((id, idx) =>
      supabase.from('processo_step_one').update({ ordem_coluna_painel: idx, updated_at: now }).eq('id', id),
    ),
  );
  const failed = results.find((x) => x.error);
  if (failed?.error) return { ok: false, error: failed.error.message };

  revalidatePath('/painel-novos-negocios');
  revalidatePath('/painel-contabilidade');
  revalidatePath('/painel-credito');
  revalidatePath('/dashboard-novos-negocios');
  return { ok: true };
}

export async function atualizarFaseContabilidadeDashboard(
  processoId: string,
  fase: FaseContabilidadeDashboard,
): Promise<PainelActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data: row } = await supabase
    .from('processo_step_one')
    .select('etapa_painel')
    .eq('id', processoId)
    .maybeSingle();
  const ep = String((row as { etapa_painel?: string } | null)?.etapa_painel ?? '');
  if (!['contabilidade_incorporadora', 'contabilidade_spe', 'contabilidade_gestora'].includes(ep)) {
    return { ok: false, error: 'Card não está no Kanban Contabilidade.' };
  }

  const { error } = await supabase
    .from('processo_step_one')
    .update({ fase_contabilidade: fase, updated_at: new Date().toISOString() })
    .eq('id', processoId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/painel-contabilidade');
  revalidatePath('/dashboard-novos-negocios');
  return { ok: true };
}

export async function atualizarFaseCreditoDashboard(
  processoId: string,
  fase: FaseCreditoDashboard,
): Promise<PainelActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data: row } = await supabase
    .from('processo_step_one')
    .select('etapa_painel')
    .eq('id', processoId)
    .maybeSingle();
  const ep = String((row as { etapa_painel?: string } | null)?.etapa_painel ?? '');
  if (!['credito_terreno', 'credito_obra'].includes(ep)) {
    return { ok: false, error: 'Card não está no Kanban Crédito.' };
  }

  const { error } = await supabase
    .from('processo_step_one')
    .update({ fase_credito: fase, updated_at: new Date().toISOString() })
    .eq('id', processoId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/painel-credito');
  revalidatePath('/dashboard-novos-negocios');
  return { ok: true };
}

/** Alterna a flag "travado" do card no Painel. */
export async function toggleTravaPainel(processoId: string): Promise<PainelActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data: row, error: fetchErr } = await supabase
    .from('processo_step_one')
    .select('trava_painel')
    .eq('id', processoId)
    .single();

  if (fetchErr || !row) return { ok: false, error: 'Processo não encontrado.' };

  const next = !(row as { trava_painel?: boolean }).trava_painel;
  const { error } = await supabase
    .from('processo_step_one')
    .update({
      trava_painel: next,
      updated_at: new Date().toISOString(),
    })
    .eq('id', processoId);

  if (error) return { ok: false, error: error.message };

  await registrarEventoCard(
    supabase,
    processoId,
    userId,
    autorNome,
    null,
    'card_trava',
    next ? 'Card travado' : 'Card destravado',
    { travado: next, trava_anterior: (row as any)?.trava_painel ?? null },
  );
  revalidatePath('/painel-novos-negocios');
  return { ok: true };
}

export type CancelarProcessoPainelInput = {
  motivoCancelamento: MotivoCancelamento;
  motivoCancelamentoOutro?: string | null;
  motivoReprovacaoComite?: MotivoReprovacaoComite | null;
  motivoReprovacaoOutro?: string | null;
  /** Texto livre adicional (histórico legível) */
  observacao?: string | null;
};

export async function cancelarProcessoPainel(
  processoId: string,
  input: CancelarProcessoPainelInput,
): Promise<MotivoActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const mc = input.motivoCancelamento;
  if (!mc) return { ok: false, error: 'Selecione o motivo do cancelamento.' };
  if (mc === 'Outro' && !(input.motivoCancelamentoOutro ?? '').trim()) {
    return { ok: false, error: 'Descreva o motivo (Outro).' };
  }

  const { data: proc } = await supabase
    .from('processo_step_one')
    .select('etapa_painel, historico_base_id')
    .eq('id', processoId)
    .maybeSingle();
  if (!proc) return { ok: false, error: 'Processo não encontrado.' };

  const etapaPainel = String((proc as { etapa_painel?: string }).etapa_painel ?? 'step_1') as PainelColumnKey;
  const baseId =
    String((proc as { historico_base_id?: string | null }).historico_base_id ?? '').trim() || processoId;

  const { data: comiteRow } = await supabase
    .from('processo_card_comite')
    .select('comite_resultado')
    .eq('processo_id', baseId)
    .maybeSingle();
  const comiteAprovado = String((comiteRow as { comite_resultado?: string } | null)?.comite_resultado ?? '') === 'aprovado';

  const precisaReprov = precisaMotivoReprovacaoComiteNoCancelamento(comiteAprovado, etapaPainel);
  if (precisaReprov) {
    const mr = input.motivoReprovacaoComite;
    if (!mr) return { ok: false, error: 'Selecione o motivo de reprovação em comitê.' };
    if (mr === 'Outro' && !(input.motivoReprovacaoOutro ?? '').trim()) {
      return { ok: false, error: 'Descreva o motivo de reprovação (Outro).' };
    }
  }

  const canceladoMotivoParts: string[] = [`Cancelamento: ${mc}`];
  if (mc === 'Outro' && input.motivoCancelamentoOutro) canceladoMotivoParts.push(input.motivoCancelamentoOutro.trim());
  if (precisaReprov && input.motivoReprovacaoComite) {
    canceladoMotivoParts.push(`Reprovação comitê: ${input.motivoReprovacaoComite}`);
    if (input.motivoReprovacaoComite === 'Outro' && input.motivoReprovacaoOutro) {
      canceladoMotivoParts.push(input.motivoReprovacaoOutro.trim());
    }
  }
  if ((input.observacao ?? '').trim()) canceladoMotivoParts.push(input.observacao!.trim());

  const { error } = await supabase
    .from('processo_step_one')
    .update({
      status: 'cancelado',
      cancelado_em: new Date().toISOString(),
      cancelado_motivo: canceladoMotivoParts.join(' | '),
      motivo_cancelamento: mc,
      motivo_cancelamento_outro: mc === 'Outro' ? (input.motivoCancelamentoOutro ?? '').trim() || null : null,
      motivo_reprovacao_comite: precisaReprov ? input.motivoReprovacaoComite! : null,
      motivo_reprovacao_outro:
        precisaReprov && input.motivoReprovacaoComite === 'Outro'
          ? (input.motivoReprovacaoOutro ?? '').trim() || null
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', processoId);

  if (error) return { ok: false, error: error.message };

  await registrarEventoCard(
    supabase,
    processoId,
    userId,
    autorNome,
    null,
    'card_cancel',
    'Card cancelado',
    {
      motivo_cancelamento: mc,
      motivo_reprovacao_comite: precisaReprov ? input.motivoReprovacaoComite : null,
    },
  );
  revalidatePath('/painel-novos-negocios');
  revalidatePath('/painel-contabilidade');
  revalidatePath('/painel-credito');
  revalidatePath('/dashboard-novos-negocios');
  return { ok: true, mensagem: 'Card cancelado.' };
}

export async function removerProcessoPainel(processoId: string, motivo: string): Promise<MotivoActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;
  if (!motivo.trim()) return { ok: false, error: 'Informe o motivo da remoção.' };

  const { error } = await supabase
    .from('processo_step_one')
    .update({
      status: 'removido',
      removido_em: new Date().toISOString(),
      removido_motivo: motivo.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', processoId);

  if (error) return { ok: false, error: error.message };

  await registrarEventoCard(
    supabase,
    processoId,
    userId,
    autorNome,
    null,
    'card_remove',
    'Card removido',
    { motivo: motivo.trim() },
  );
  revalidatePath('/painel-novos-negocios');
  return { ok: true, mensagem: 'Card removido.' };
}
