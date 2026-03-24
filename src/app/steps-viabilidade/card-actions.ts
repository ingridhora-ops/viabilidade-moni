'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { getPainelDbForPublicEdit } from '@/lib/painel-public-edit';
import type { PainelColumnKey } from './painelColumns';
import { PAINEL_COLUMNS } from './painelColumns';

export type CardActionResult = { ok: true } | { ok: false; error: string };
export type ShareFormType = 'legal' | 'credito';

const STEP1_AREAS_ETAPAS = [
  'Dados da Cidade',
  'Lista de Condomínios',
  'Listagem de lotes',
  'Rede',
] as const;
const CHECKLIST_ANEXOS_TITULOS_POR_ETAPA: Record<string, string[]> = {
  step_4: ['Planialtimétrico'],
  step_5: ['Material para o Comitê'],
  projeto_legal: ['Projeto Legal', 'ART de Projeto', 'RRT de Execução', 'Demais RRTs'],
  aprovacao_condominio: ['Protocolo do Condomínio', 'Aprovação do Condomínio'],
  aprovacao_prefeitura: ['Protocolo da Prefeitura', 'Aprovação do Prefeitura', 'Alvará de Obra'],
  acoplamento: ['Modelagem do terreno', 'Modelagem da casa', 'Gbox', 'Validação do Acoplamento', 'Alterações do acoplamento'],
};

function isChecklistAnexosEstrutural(etapaPainel: string | null | undefined, titulo: string | null | undefined): boolean {
  const etapa = String(etapaPainel ?? '').trim();
  const nome = String(titulo ?? '').trim();
  if (!etapa || !nome) return false;
  const lista = CHECKLIST_ANEXOS_TITULOS_POR_ETAPA[etapa] ?? [];
  if (lista.includes(nome)) return true;
  if (etapa === 'aprovacao_condominio' && /^Comunique-se Condom[ií]nio\s+\d+$/i.test(nome)) return true;
  if (etapa === 'aprovacao_prefeitura' && /^Comunique-se Prefeitura\s+\d+$/i.test(nome)) return true;
  return false;
}

function erroStatusFaltando(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '').toLowerCase();
  // Mensagem típica do supabase-js (schema cache): "Could not find the 'status' column of 'processo_card_checklist' in the schema cache"
  return msg.includes('processo_card_checklist') && msg.includes("'status'") && msg.includes('column');
}

function erroTimeFaltando(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '').toLowerCase();
  return msg.includes('processo_card_checklist') && msg.includes("'time_nome'") && msg.includes('column');
}

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
    // O histórico não deve bloquear o fluxo do usuário.
  }
}

function isChecklistAnexosTipo(tipo: string): boolean {
  return (
    tipo.startsWith('checklist_') ||
    tipo.startsWith('step1_') ||
    tipo.startsWith('document_') ||
    tipo.startsWith('documento_')
  );
}

function parseAreasAtuacao(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return String(raw)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getOrCreatePublicFormLink(
  processoId: string,
  formType: ShareFormType,
): Promise<
  | { ok: true; token: string; expires_at: string }
  | { ok: false; error: string }
> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const nowIso = new Date().toISOString();
  const { data: existing, error: findErr } = await supabase
    .from('processo_public_form_links')
    .select('id, token, expires_at, revoked_at')
    .eq('processo_id', processoId)
    .eq('form_type', formType)
    .is('revoked_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    const msg = String(findErr.message ?? '');
    if (msg.toLowerCase().includes('processo_public_form_links')) {
      return {
        ok: false,
        error:
          'Links públicos ainda não estão habilitados no banco. Aplique a migration 079 e tente novamente.',
      };
    }
    return { ok: false, error: findErr.message };
  }
  if (existing?.token && existing?.expires_at) {
    return { ok: true, token: String(existing.token), expires_at: String(existing.expires_at) };
  }

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const { error: insErr } = await supabase.from('processo_public_form_links').insert({
    processo_id: processoId,
    form_type: formType,
    token,
    expires_at: expiresAt,
    created_by: userId,
  });
  if (insErr) {
    const msg = String(insErr.message ?? '');
    if (msg.toLowerCase().includes('processo_public_form_links')) {
      return {
        ok: false,
        error:
          'Links públicos ainda não estão habilitados no banco. Aplique a migration 079 e tente novamente.',
      };
    }
    return { ok: false, error: insErr.message };
  }
  return { ok: true, token, expires_at: expiresAt };
}

/** Comentários do card */
export async function getComentariosCard(processoId: string): Promise<
  | { ok: true; comentarios: Array<{ id: string; autor_nome: string | null; texto: string; created_at: string }> }
  | { ok: false; error: string }
> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const baseId = await resolveHistoricoBaseId(supabase, processoId);
  const { data, error } = await supabase
    .from('processo_card_comentarios')
    .select('id, autor_nome, texto, created_at')
    .eq('processo_id', baseId)
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, comentarios: (data ?? []).map((c) => ({ ...c, created_at: (c as { created_at: string }).created_at })) };
}

export async function getCardChecklistAnexosHistory(processoId: string): Promise<
  | {
      ok: true;
      eventos: Array<{
        id: string;
        autor_nome: string | null;
        etapa_painel: string | null;
        tipo: string;
        descricao: string | null;
        created_at: string;
      }>;
    }
  | { ok: false; error: string }
> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const baseId = await resolveHistoricoBaseId(supabase, processoId);
  const { data, error } = await supabase
    .from('processo_card_eventos')
    .select('id, autor_nome, etapa_painel, tipo, descricao, created_at')
    .eq('processo_id', baseId)
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: error.message };

  const eventos = (data ?? [])
    .filter((e: any) => isChecklistAnexosTipo(String(e.tipo ?? '')))
    .map((e: any) => ({
      ...e,
      created_at: e.created_at as string,
      autor_nome: (e.autor_nome ?? null) as string | null,
      etapa_painel: (e.etapa_painel ?? null) as string | null,
      descricao: (e.descricao ?? null) as string | null,
      tipo: String(e.tipo ?? ''),
      id: String(e.id),
    }));

  return { ok: true, eventos };
}

export async function getCardActionsHistory(processoId: string): Promise<
  | {
      ok: true;
      eventos: Array<{
        id: string;
        autor_nome: string | null;
        etapa_painel: string | null;
        tipo: string;
        descricao: string | null;
        created_at: string;
      }>;
    }
  | { ok: false; error: string }
> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const baseId = await resolveHistoricoBaseId(supabase, processoId);
  const { data, error } = await supabase
    .from('processo_card_eventos')
    .select('id, autor_nome, etapa_painel, tipo, descricao, created_at')
    .eq('processo_id', baseId)
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: error.message };

  const eventos = (data ?? [])
    .filter((e: any) => String(e.tipo ?? '') !== 'comentario_add')
    .map((e: any) => ({
      ...e,
      created_at: e.created_at as string,
      autor_nome: (e.autor_nome ?? null) as string | null,
      etapa_painel: (e.etapa_painel ?? null) as string | null,
      descricao: (e.descricao ?? null) as string | null,
      tipo: String(e.tipo ?? ''),
      id: String(e.id),
    }));

  return { ok: true, eventos };
}

/** Participantes para @ (dono do processo, consultor, carteira do consultor). */
async function getParticipantesProcesso(supabase: Awaited<ReturnType<typeof createClient>>, processoId: string): Promise<Array<{ id: string; nome: string }>> {
  const { data: processo } = await supabase
    .from('processo_step_one')
    .select('user_id')
    .eq('id', processoId)
    .single();
  if (!processo) return [];
  const ids = new Set<string>([(processo as { user_id: string }).user_id]);
  const { data: ownerProfile } = await supabase.from('profiles').select('consultor_id').eq('id', (processo as { user_id: string }).user_id).single();
  if (ownerProfile && (ownerProfile as { consultor_id?: string }).consultor_id) ids.add((ownerProfile as { consultor_id: string }).consultor_id);
  const me = (await supabase.auth.getUser()).data.user;
  if (me) {
    const { data: meProfile } = await supabase.from('profiles').select('consultor_id, role').eq('id', me.id).single();
    if (meProfile && (meProfile as { role?: string }).role === 'consultor') {
      const { data: carteira } = await supabase.from('profiles').select('id, full_name').eq('consultor_id', me.id);
      for (const p of carteira ?? []) ids.add(p.id);
    }
  }
  const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', [...ids]);
  return (profiles ?? []).map((p) => ({ id: p.id, nome: ((p as { full_name: string | null }).full_name ?? '').trim() || 'Sem nome' }));
}

/** Enviar comentário no card. Parse @nome e cria alertas para menções. */
export async function enviarComentarioCard(processoId: string, texto: string): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const textoTrim = texto?.trim();
  if (!textoTrim) return { ok: false, error: 'Digite um comentário.' };

  const baseId = await resolveHistoricoBaseId(supabase, processoId);
  const participantes = await getParticipantesProcesso(supabase, baseId);
  const mencoesIds: string[] = [];
  const regex = /@(\p{L}[\p{L}\s]*)/gu;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(textoTrim)) !== null) {
    const nomeBusca = match[1].trim().toLowerCase();
    const found = participantes.find(
      (p) => p.nome.toLowerCase().includes(nomeBusca) || nomeBusca.includes(p.nome.toLowerCase()),
    );
    if (found && !mencoesIds.includes(found.id)) mencoesIds.push(found.id);
  }

  const { error: insertErr } = await supabase.from('processo_card_comentarios').insert({
    processo_id: baseId,
    autor_id: userId,
    autor_nome: autorNome,
    texto: textoTrim,
    mencoes: mencoesIds.length > 0 ? mencoesIds : [],
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  await registrarEventoCard(
    supabase,
    processoId,
    userId,
    autorNome,
    null,
    'comentario_add',
    'Comentário adicionado',
    { texto: textoTrim },
  );

  const { data: proc } = await supabase.from('processo_step_one').select('cidade, estado').eq('id', baseId).single();
  const cardLabel = proc ? `${(proc as { cidade?: string }).cidade ?? ''}${(proc as { estado?: string }).estado ? `, ${(proc as { estado: string }).estado}` : ''}` : 'Card';

  for (const uid of mencoesIds) {
    if (uid === userId) continue;
    await supabase.from('alertas').insert({
      user_id: uid,
      tipo: 'mencao_card',
      mensagem: `${autorNome} mencionou você no processo ${cardLabel}: "${textoTrim.slice(0, 80)}${textoTrim.length > 80 ? '…' : ''}"`,
    });
  }

  // Não revalidar a rota aqui para evitar fechar o modal do card ao adicionar atividade.
  // A lista local já é atualizada via loadChecklist() no cliente.
  return { ok: true };
}

/** Checklist do card por etapa */
export async function getChecklistCard(processoId: string, etapaPainel: string): Promise<
  | {
      ok: true;
      itens: Array<{
        id: string;
        titulo: string;
        prazo: string | null;
        time_nome: string | null;
        responsavel_nome: string | null;
        status: 'nao_iniciada' | 'em_andamento' | 'concluido';
        concluido: boolean;
        ordem: number;
      }>;
    }
  | { ok: false; error: string }
> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const baseId = await resolveHistoricoBaseId(supabase, processoId);
  try {
    const { data, error } = await supabase
      .from('processo_card_checklist')
      .select('id, titulo, prazo, time_nome, responsavel_nome, concluido, status, ordem')
      .eq('processo_id', baseId)
      .eq('etapa_painel', etapaPainel)
      .order('ordem', { ascending: true });

    if (error) return { ok: false, error: error.message };
    return { ok: true, itens: (data ?? []) as any };
  } catch (err) {
    if (!erroStatusFaltando(err) && !erroTimeFaltando(err)) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    try {
      // Fallback: sem coluna status e/ou time_nome.
      const { data, error } = await supabase
        .from('processo_card_checklist')
        .select('id, titulo, prazo, time_nome, responsavel_nome, concluido, ordem')
        .eq('processo_id', baseId)
        .eq('etapa_painel', etapaPainel)
        .order('ordem', { ascending: true });

      if (error) return { ok: false, error: error.message };

      const itens = (data ?? []).map((it: any) => ({
        ...it,
        status: it.concluido ? 'concluido' : 'nao_iniciada',
      }));
      return { ok: true, itens };
    } catch (err2) {
      if (!erroTimeFaltando(err2) && !erroStatusFaltando(err2)) {
        return { ok: false, error: err2 instanceof Error ? err2.message : String(err2) };
      }
      const { data, error } = await supabase
        .from('processo_card_checklist')
        .select('id, titulo, prazo, responsavel_nome, concluido, ordem')
        .eq('processo_id', baseId)
        .eq('etapa_painel', etapaPainel)
        .order('ordem', { ascending: true });
      if (error) return { ok: false, error: error.message };
      const itens = (data ?? []).map((it: any) => ({
        ...it,
        time_nome: null,
        status: it.concluido ? 'concluido' : 'nao_iniciada',
      }));
      return { ok: true, itens };
    }
  }
}

export async function addChecklistItem(
  processoId: string,
  etapaPainel: string,
  titulo: string,
  prazo?: string | null,
  timeNome?: string | null,
  responsavelNome?: string | null,
  status: 'nao_iniciada' | 'em_andamento' | 'concluido' = 'nao_iniciada',
): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;
  const baseId = await resolveHistoricoBaseId(supabase, processoId);
  const { data: max } = await supabase
    .from('processo_card_checklist')
    .select('ordem')
    .eq('processo_id', baseId)
    .eq('etapa_painel', etapaPainel)
    .order('ordem', { ascending: false })
    .limit(1)
    .single();
  const ordem = ((max as { ordem?: number })?.ordem ?? -1) + 1;
  const concluido = status === 'concluido';
  try {
    const { error } = await supabase.from('processo_card_checklist').insert({
      processo_id: baseId,
      etapa_painel: etapaPainel,
      titulo: titulo.trim(),
      prazo: prazo && prazo.trim() !== '' ? prazo.trim() : null,
      time_nome: timeNome && timeNome.trim() !== '' ? timeNome.trim() : null,
      responsavel_nome: responsavelNome && responsavelNome.trim() !== '' ? responsavelNome.trim() : null,
      concluido,
      status,
      ordem,
    });
    if (error) return { ok: false, error: error.message };
  } catch (err) {
    if (!erroStatusFaltando(err) && !erroTimeFaltando(err)) return { ok: false, error: err instanceof Error ? err.message : String(err) };
    try {
      const { error } = await supabase.from('processo_card_checklist').insert({
        processo_id: baseId,
        etapa_painel: etapaPainel,
        titulo: titulo.trim(),
        prazo: prazo && prazo.trim() !== '' ? prazo.trim() : null,
        time_nome: timeNome && timeNome.trim() !== '' ? timeNome.trim() : null,
        responsavel_nome: responsavelNome && responsavelNome.trim() !== '' ? responsavelNome.trim() : null,
        concluido,
        ordem,
      });
      if (error) return { ok: false, error: error.message };
    } catch (err2) {
      if (!erroTimeFaltando(err2)) return { ok: false, error: err2 instanceof Error ? err2.message : String(err2) };
      const { error } = await supabase.from('processo_card_checklist').insert({
        processo_id: baseId,
        etapa_painel: etapaPainel,
        titulo: titulo.trim(),
        prazo: prazo && prazo.trim() !== '' ? prazo.trim() : null,
        responsavel_nome: responsavelNome && responsavelNome.trim() !== '' ? responsavelNome.trim() : null,
        concluido,
        ordem,
      });
      if (error) return { ok: false, error: error.message };
    }
  }
  revalidatePath('/painel-novos-negocios');

  await registrarEventoCard(
    supabase,
    processoId,
    userId,
    autorNome,
    etapaPainel,
    'checklist_add',
    `Atividade adicionada`,
    { titulo: titulo.trim(), prazo: prazo ?? null, time_nome: timeNome ?? null, responsavel_nome: responsavelNome ?? null, status },
  );
  return { ok: true };
}

export async function toggleChecklistItem(itemId: string, concluido: boolean): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data: before } = await supabase
    .from('processo_card_checklist')
    .select('processo_id, titulo, etapa_painel, concluido')
    .eq('id', itemId)
    .maybeSingle();

  const status = concluido ? 'concluido' : 'nao_iniciada';
  try {
    const { error } = await supabase
      .from('processo_card_checklist')
      .update({ concluido, status, updated_at: new Date().toISOString() })
      .eq('id', itemId);
    if (error) return { ok: false, error: error.message };
  } catch (err) {
    if (!erroStatusFaltando(err)) return { ok: false, error: err instanceof Error ? err.message : String(err) };
    const { error } = await supabase
      .from('processo_card_checklist')
      .update({ concluido, updated_at: new Date().toISOString() })
      .eq('id', itemId);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath('/painel-novos-negocios');

  await registrarEventoCard(
    supabase,
    String((before as any)?.processo_id ?? ''),
    userId,
    autorNome,
    (before as any)?.etapa_painel,
    'checklist_toggle',
    `Atividade ${concluido ? 'concluída' : 'reaberta'}`,
    { item_id: itemId, titulo: (before as any)?.titulo ?? null, concluido },
  );
  return { ok: true };
}

export async function updateChecklistItemStatus(itemId: string, status: 'nao_iniciada' | 'em_andamento' | 'concluido'): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const concluido = status === 'concluido';

  const { data: before } = await supabase
    .from('processo_card_checklist')
    .select('processo_id, titulo, etapa_painel')
    .eq('id', itemId)
    .maybeSingle();

  try {
    const { error } = await supabase
      .from('processo_card_checklist')
      .update({
        status,
        concluido,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId);

    if (error) return { ok: false, error: error.message };
  } catch (err) {
    if (!erroStatusFaltando(err)) return { ok: false, error: err instanceof Error ? err.message : String(err) };
    // Sem coluna status: reduz pra boolean concluido.
    const { error } = await supabase
      .from('processo_card_checklist')
      .update({
        concluido,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath('/painel-novos-negocios');

  await registrarEventoCard(
    supabase,
    String((before as any)?.processo_id ?? ''),
    userId,
    autorNome,
    (before as any)?.etapa_painel,
    'checklist_status',
    `Status alterado para ${status}`,
    { item_id: itemId, titulo: (before as any)?.titulo ?? null, status },
  );
  return { ok: true };
}

export async function getChecklistPareceres(itemIds: string[]): Promise<
  | { ok: true; pareceres: Record<string, string> }
  | { ok: false; error: string }
> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;
  const ids = [...new Set((itemIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { ok: true, pareceres: {} };

  const { data, error } = await supabase
    .from('processo_card_checklist_pareceres')
    .select('checklist_item_id, texto')
    .in('checklist_item_id', ids);
  if (error) return { ok: false, error: error.message };

  const pareceres: Record<string, string> = {};
  for (const row of data ?? []) {
    const id = String((row as any).checklist_item_id ?? '');
    if (!id) continue;
    pareceres[id] = String((row as any).texto ?? '');
  }
  return { ok: true, pareceres };
}

export async function upsertChecklistParecer(itemId: string, texto: string | null): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;
  const { data: before } = await supabase
    .from('processo_card_checklist')
    .select('processo_id, etapa_painel, titulo')
    .eq('id', itemId)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Item de checklist não encontrado.' };

  const { error } = await supabase.from('processo_card_checklist_pareceres').upsert(
    {
      checklist_item_id: itemId,
      texto: (texto ?? '').trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'checklist_item_id' },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath('/painel-novos-negocios');
  await registrarEventoCard(
    supabase,
    String((before as any).processo_id),
    userId,
    autorNome,
    (before as any).etapa_painel,
    'checklist_parecer_update',
    'Parecer do checklist atualizado',
    { item_id: itemId, titulo: (before as any).titulo ?? null, texto: (texto ?? '').trim() || null },
  );
  return { ok: true };
}

export async function removeChecklistItem(itemId: string): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data: before } = await supabase
    .from('processo_card_checklist')
    .select('processo_id, titulo, etapa_painel')
    .eq('id', itemId)
    .maybeSingle();

  const { error } = await supabase.from('processo_card_checklist').delete().eq('id', itemId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/painel-novos-negocios');

  await registrarEventoCard(
    supabase,
    String((before as any)?.processo_id ?? ''),
    userId,
    autorNome,
    (before as any)?.etapa_painel,
    'checklist_remove',
    `Atividade removida`,
    { item_id: itemId, titulo: (before as any)?.titulo ?? null },
  );
  return { ok: true };
}

/** Step 1: checklist por áreas de atuação (espelho de rede_franqueados). */
export async function getStep1AreasChecklist(processoId: string): Promise<
  | {
      ok: true;
      itens: Array<{
        id: string;
        area_nome: string;
        area_ordem: number;
        etapa_nome: string;
        concluido: boolean;
        link_url: string | null;
        storage_path: string | null;
        nome_original: string | null;
        ativo_na_rede: boolean;
      }>;
    }
  | { ok: false; error: string }
> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const baseId = await resolveHistoricoBaseId(supabase, processoId);
  const { data: processo, error: processoErr } = await supabase
    .from('processo_step_one')
    .select('id, numero_franquia, area_atuacao_franquia')
    .eq('id', baseId)
    .single();
  if (processoErr) return { ok: false, error: processoErr.message };

  let areasAtuais: string[] = [];
  const numeroFranquia = (processo as { numero_franquia?: string | null }).numero_franquia ?? null;
  if (numeroFranquia && String(numeroFranquia).trim() !== '') {
    const { data: redeRows } = await supabase
      .from('rede_franqueados')
      .select('area_atuacao')
      .eq('n_franquia', numeroFranquia)
      .order('created_at', { ascending: false })
      .limit(1);
    const areaRede = (redeRows?.[0] as { area_atuacao?: string | null } | undefined)?.area_atuacao ?? null;
    areasAtuais = parseAreasAtuacao(areaRede);
  }
  if (areasAtuais.length === 0) {
    areasAtuais = parseAreasAtuacao((processo as { area_atuacao_franquia?: string | null }).area_atuacao_franquia ?? null);
  }

  const activeSet = new Set(areasAtuais);

  const { data: existentes, error: exErr } = await supabase
    .from('processo_step1_area_checklist')
    .select('id, area_nome, area_ordem, etapa_nome, concluido, link_url, storage_path, nome_original, ativo_na_rede')
    .eq('processo_id', baseId);
  if (exErr) return { ok: false, error: exErr.message };

  const existentesList = existentes ?? [];
  const existentesMap = new Map<string, (typeof existentesList)[number]>(
    existentesList.map((r: any) => [`${String(r.area_nome)}::${String(r.etapa_nome)}`, r]),
  );

  const inserts: Array<{ processo_id: string; area_nome: string; area_ordem: number; etapa_nome: string; ativo_na_rede: boolean }> = [];
  for (let i = 0; i < areasAtuais.length; i += 1) {
    const area = areasAtuais[i];
    for (const etapaNome of STEP1_AREAS_ETAPAS) {
      const key = `${area}::${etapaNome}`;
      if (!existentesMap.has(key)) {
        inserts.push({
          processo_id: baseId,
          area_nome: area,
          area_ordem: i,
          etapa_nome: etapaNome,
          ativo_na_rede: true,
        });
      }
    }
  }
  if (inserts.length > 0) {
    const { error } = await supabase.from('processo_step1_area_checklist').insert(inserts);
    if (error) return { ok: false, error: error.message };
  }

  // Atualiza espelhamento: áreas ausentes na rede ficam inativas e vão ao fim no front.
  for (const row of existentesList) {
    const shouldBeActive = activeSet.has(String((row as any).area_nome ?? ''));
    if (Boolean((row as any).ativo_na_rede) !== shouldBeActive) {
      await supabase
        .from('processo_step1_area_checklist')
        .update({ ativo_na_rede: shouldBeActive, updated_at: new Date().toISOString() })
        .eq('id', (row as any).id);
    }
  }

  // Atualiza ordem para áreas ativas atuais.
  for (let i = 0; i < areasAtuais.length; i += 1) {
    const area = areasAtuais[i];
    await supabase
      .from('processo_step1_area_checklist')
      .update({ area_ordem: i, ativo_na_rede: true, updated_at: new Date().toISOString() })
      .eq('processo_id', baseId)
      .eq('area_nome', area);
  }

  const { data, error } = await supabase
    .from('processo_step1_area_checklist')
    .select('id, area_nome, area_ordem, etapa_nome, concluido, link_url, storage_path, nome_original, ativo_na_rede')
    .eq('processo_id', baseId)
    .order('area_ordem', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, itens: (data ?? []) as any };
}

export async function updateStep1AreaChecklistConcluido(itemId: string, concluido: boolean): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data: before } = await supabase
    .from('processo_step1_area_checklist')
    .select('processo_id, area_nome, etapa_nome, ativo_na_rede, concluido')
    .eq('id', itemId)
    .maybeSingle();

  const { error } = await supabase
    .from('processo_step1_area_checklist')
    .update({ concluido, updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) return { ok: false, error: error.message };

  await registrarEventoCard(
    supabase,
    String((before as any)?.processo_id ?? ''),
    userId,
    autorNome,
    null,
    'step1_area_toggle',
    `Checklist ${concluido ? 'concluído' : 'marcado como não iniciado'}: ${(before as any)?.etapa_nome ?? 'Item'}`,
    {
      item_id: itemId,
      area_nome: (before as any)?.area_nome ?? null,
      etapa_nome: (before as any)?.etapa_nome ?? null,
      ativo_na_rede: (before as any)?.ativo_na_rede ?? null,
      concluido,
    },
  );
  return { ok: true };
}

export async function updateStep1AreaChecklistLink(itemId: string, linkUrl: string | null): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;
  const value = linkUrl && String(linkUrl).trim() !== '' ? String(linkUrl).trim() : null;

  const { data: before } = await supabase
    .from('processo_step1_area_checklist')
    .select('processo_id, area_nome, etapa_nome, link_url')
    .eq('id', itemId)
    .maybeSingle();

  const { error } = await supabase
    .from('processo_step1_area_checklist')
    .update({ link_url: value, updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) return { ok: false, error: error.message };

  await registrarEventoCard(
    supabase,
    String((before as any)?.processo_id ?? ''),
    userId,
    autorNome,
    null,
    'step1_area_link_update',
    `Link atualizado`,
    {
      item_id: itemId,
      area_nome: (before as any)?.area_nome ?? null,
      etapa_nome: (before as any)?.etapa_nome ?? null,
      link_url: value,
    },
  );
  return { ok: true };
}

export async function updateStep1AreaChecklistAnexo(
  itemId: string,
  storagePath: string | null,
  nomeOriginal: string | null,
): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data: before } = await supabase
    .from('processo_step1_area_checklist')
    .select('processo_id, area_nome, etapa_nome, nome_original, storage_path')
    .eq('id', itemId)
    .maybeSingle();

  const { error } = await supabase
    .from('processo_step1_area_checklist')
    .update({
      storage_path: storagePath && String(storagePath).trim() !== '' ? String(storagePath).trim() : null,
      nome_original: nomeOriginal && String(nomeOriginal).trim() !== '' ? String(nomeOriginal).trim() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);
  if (error) return { ok: false, error: error.message };

  await registrarEventoCard(
    supabase,
    String((before as any)?.processo_id ?? ''),
    userId,
    autorNome,
    null,
    'step1_area_anexo_update',
    'Anexo atualizado',
    {
      item_id: itemId,
      area_nome: (before as any)?.area_nome ?? null,
      etapa_nome: (before as any)?.etapa_nome ?? null,
      nome_original: nomeOriginal ?? null,
      storage_path: storagePath ?? null,
    },
  );
  return { ok: true };
}

/** Alinhado a PainelCard: não listar tarefas de cards cancelados ou removidos. */
function isProcessoChecklistPainelExcluido(p: {
  status?: string | null;
  cancelado_em?: string | null;
  removido_em?: string | null;
} | undefined): boolean {
  if (!p) return false;
  const st = String(p.status ?? '').toLowerCase();
  return (
    st === 'cancelado' ||
    Boolean(p.cancelado_em) ||
    st === 'removido' ||
    Boolean(p.removido_em)
  );
}

/** processo_id do checklist é o id base; a linha raiz pode não vir no SELECT (ex.: só filhos com historico_base_id = B). */
function resolveLineageRowForBase(B: string, roots: any[], children: any[]): any | undefined {
  const root = roots.find((p: any) => String(p.id) === B);
  if (root) return root;
  return children.find((p: any) => String(p.historico_base_id) === B);
}

const PROCESSO_BATCH_CHECKLIST_PAINEL = 80;

async function fetchProcessosParaLinhaChecklist(
  supabase: SupabaseClient,
  baseIds: string[],
): Promise<{ roots: any[]; children: any[]; error?: string }> {
  const sel =
    'id, historico_base_id, cidade, estado, numero_franquia, nome_franqueado, nome_condominio, status, cancelado_em, removido_em';
  const roots: any[] = [];
  const children: any[] = [];
  for (let i = 0; i < baseIds.length; i += PROCESSO_BATCH_CHECKLIST_PAINEL) {
    const slice = baseIds.slice(i, i + PROCESSO_BATCH_CHECKLIST_PAINEL);
    const { data: byId, error: e1 } = await supabase.from('processo_step_one').select(sel).in('id', slice);
    const { data: byBase, error: e2 } = await supabase.from('processo_step_one').select(sel).in('historico_base_id', slice);
    if (e1) return { roots: [], children: [], error: e1.message };
    if (e2) return { roots: [], children: [], error: e2.message };
    roots.push(...(byId ?? []));
    children.push(...(byBase ?? []));
  }
  return { roots, children };
}

type AtividadesChecklistPainelOk = {
  ok: true;
  tarefas: Array<{
    id: string;
    processo_id: string;
    etapa_painel: string;
    titulo: string;
    prazo: string | null;
    time_nome: string | null;
    responsavel_nome: string | null;
    status: 'nao_iniciada' | 'em_andamento' | 'concluido';
    processo_cidade: string;
    processo_estado: string | null;
    numero_franquia: string | null;
    nome_franqueado: string | null;
    nome_condominio: string | null;
  }>;
};

async function montarAtividadesChecklistPainel(supabase: SupabaseClient): Promise<AtividadesChecklistPainelOk | { ok: false; error: string }> {
  let checklistRows: any[] = [];

  try {
    const { data, error } = await supabase
      .from('processo_card_checklist')
      .select('id, processo_id, etapa_painel, titulo, prazo, time_nome, responsavel_nome, status, concluido')
      .order('ordem', { ascending: true });

    if (error) return { ok: false, error: error.message };
    checklistRows = data ?? [];
  } catch (err) {
    if (!erroStatusFaltando(err) && !erroTimeFaltando(err)) return { ok: false, error: err instanceof Error ? err.message : String(err) };
    try {
      const { data, error } = await supabase
        .from('processo_card_checklist')
        .select('id, processo_id, etapa_painel, titulo, prazo, time_nome, responsavel_nome, concluido')
        .order('ordem', { ascending: true });

      if (error) return { ok: false, error: error.message };

      checklistRows = (data ?? []).map((r: any) => ({
        ...r,
        status: r.concluido ? 'concluido' : 'nao_iniciada',
      }));
    } catch (err2) {
      if (!erroTimeFaltando(err2) && !erroStatusFaltando(err2)) return { ok: false, error: err2 instanceof Error ? err2.message : String(err2) };
      const { data, error } = await supabase
        .from('processo_card_checklist')
        .select('id, processo_id, etapa_painel, titulo, prazo, responsavel_nome, concluido')
        .order('ordem', { ascending: true });
      if (error) return { ok: false, error: error.message };
      checklistRows = (data ?? []).map((r: any) => ({
        ...r,
        time_nome: null,
        status: r.concluido ? 'concluido' : 'nao_iniciada',
      }));
    }
  }

  /** Checklist grava `processo_id` = base do histórico; cancelar/remover atualiza a linha do card atual (filho). */
  const baseIds = [...new Set(checklistRows.map((r) => r.processo_id).filter(Boolean))] as string[];
  let roots: any[] = [];
  let children: any[] = [];
  if (baseIds.length > 0) {
    const fetched = await fetchProcessosParaLinhaChecklist(supabase, baseIds);
    if (fetched.error) return { ok: false, error: fetched.error };
    roots = fetched.roots;
    children = fetched.children;
  }

  const lineageByRowId = new Map<string, any>();
  for (const r of [...roots, ...children]) {
    if (r?.id) lineageByRowId.set(String(r.id), r);
  }

  const excludedBases = new Set<string>();
  for (const B of baseIds) {
    const directRow = resolveLineageRowForBase(B, roots, children);
    if (isProcessoChecklistPainelExcluido(directRow)) excludedBases.add(B);
    for (const r of lineageByRowId.values()) {
      const belongs = String(r.id) === B || String(r.historico_base_id ?? '') === B;
      if (belongs && isProcessoChecklistPainelExcluido(r)) {
        excludedBases.add(B);
        break;
      }
    }
  }

  const procMap = new Map<string, any>();
  for (const B of baseIds) {
    if (excludedBases.has(B)) continue;
    const root = roots.find((p: any) => String(p.id) === B);
    if (root) procMap.set(B, root);
    else {
      const anyRow = children.find((p: any) => String(p.historico_base_id) === B);
      if (anyRow) procMap.set(B, anyRow);
    }
  }

  const tarefas = (checklistRows ?? [])
    .filter((r: any) => !isChecklistAnexosEstrutural(r.etapa_painel, r.titulo))
    .filter((r: any) => !excludedBases.has(String(r.processo_id)))
    .map((r: any) => {
    const p = procMap.get(r.processo_id);
    return {
      id: String(r.id),
      processo_id: String(r.processo_id),
      etapa_painel: String(r.etapa_painel ?? ''),
      titulo: String(r.titulo ?? ''),
      prazo: (r.prazo as string | null) ?? null,
      time_nome: (r.time_nome as string | null) ?? null,
      responsavel_nome: (r.responsavel_nome as string | null) ?? null,
      status: (r.status as any) ?? (r.concluido ? 'concluido' : 'nao_iniciada'),
      processo_cidade: (p as { cidade?: string } | undefined)?.cidade ?? '',
      processo_estado: (p as { estado?: string | null } | undefined)?.estado ?? null,
      numero_franquia: (p as { numero_franquia?: string | null } | undefined)?.numero_franquia ?? null,
      nome_franqueado: (p as { nome_franqueado?: string | null } | undefined)?.nome_franqueado ?? null,
      nome_condominio: (p as { nome_condominio?: string | null } | undefined)?.nome_condominio ?? null,
    };
    });

  return { ok: true, tarefas };
}

/**
 * Painel de Tarefas: lista agregada de todas as atividades (checklist) de todos os cards.
 * Preferência: service role (visão completa). Se SUPABASE_SERVICE_ROLE_KEY não existir ou falhar,
 * usa sessão + RLS (útil em dev local ou quando a Vercel ainda não tem a env).
 */
export async function getAtividadesChecklistPainel(): Promise<
  AtividadesChecklistPainelOk | { ok: false; error: string }
> {
  let supabase: SupabaseClient;
  try {
    supabase = createAdminClient();
  } catch {
    const s = await createClient();
    const {
      data: { user },
    } = await s.auth.getUser();
    if (!user) {
      return {
        ok: false,
        error:
          'Painel agregado: defina SUPABASE_SERVICE_ROLE_KEY no servidor (ex.: Vercel) ou entre com uma conta. Sem a chave, visitantes não veem todas as atividades.',
      };
    }
    return montarAtividadesChecklistPainel(s);
  }
  return montarAtividadesChecklistPainel(supabase);
}

/** Documentos (anexo + link) por card e etapa */
export async function getDocumentosCard(
  processoId: string,
  etapaPainel: string,
): Promise<
  | {
      ok: true;
      itens: Array<{
        id: string;
        titulo: string;
        storage_path: string | null;
        nome_original: string | null;
        link_url: string | null;
        texto_livre: string | null;
        anexos_json: Array<{ storage_path: string | null; nome_original: string | null }>;
        ordem: number;
      }>;
    }
  | { ok: false; error: string }
> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const baseId = await resolveHistoricoBaseId(supabase, processoId);
  const { data, error } = await supabase
    .from('processo_card_documentos')
    .select('id, titulo, storage_path, nome_original, link_url, texto_livre, anexos_json, ordem')
    .eq('processo_id', baseId)
    .eq('etapa_painel', etapaPainel)
    .order('ordem', { ascending: true });

  if (error) return { ok: false, error: error.message };
  const itens = (data ?? []).map((row: any) => ({
    ...row,
    texto_livre: (row?.texto_livre ?? null) as string | null,
    anexos_json: Array.isArray(row?.anexos_json) ? row.anexos_json : [],
  }));
  return { ok: true, itens };
}

export async function addDocumentoCard(
  processoId: string,
  etapaPainel: string,
  titulo: string,
): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;
  const baseId = await resolveHistoricoBaseId(supabase, processoId);
  const { data: max } = await supabase
    .from('processo_card_documentos')
    .select('ordem')
    .eq('processo_id', baseId)
    .eq('etapa_painel', etapaPainel)
    .order('ordem', { ascending: false })
    .limit(1)
    .single();

  const ordem = ((max as { ordem?: number })?.ordem ?? -1) + 1;

  const { error } = await supabase.from('processo_card_documentos').insert({
    processo_id: baseId,
    etapa_painel: etapaPainel,
    titulo: (titulo ?? '').trim() || 'Documento',
    storage_path: null,
    nome_original: null,
    link_url: null,
    texto_livre: null,
    anexos_json: [],
    ordem,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath('/painel-novos-negocios');

  await registrarEventoCard(
    supabase,
    processoId,
    userId,
    autorNome,
    etapaPainel,
    'document_add',
    `Documento adicionado`,
    { titulo: (titulo ?? '').trim() || 'Documento' },
  );
  return { ok: true };
}

export async function updateDocumentoCardTitulo(
  documentoId: string,
  titulo: string,
): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data: before } = await supabase
    .from('processo_card_documentos')
    .select('processo_id, etapa_painel, titulo')
    .eq('id', documentoId)
    .maybeSingle();

  const { error } = await supabase.from('processo_card_documentos').update({
    titulo: (titulo ?? '').trim() || 'Documento',
    updated_at: new Date().toISOString(),
  }).eq('id', documentoId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/painel-novos-negocios');

  await registrarEventoCard(
    supabase,
    String((before as any)?.processo_id ?? ''),
    userId,
    autorNome,
    (before as any)?.etapa_painel,
    'document_title_update',
    'Título do documento atualizado',
    { documento_id: documentoId, antes: (before as any)?.titulo ?? null, depois: (titulo ?? '').trim() || 'Documento' },
  );
  return { ok: true };
}

export async function updateDocumentoCardLink(
  documentoId: string,
  linkUrl: string,
): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const normalized = (linkUrl ?? '').trim();
  const link = normalized === '' ? null : normalized;

  const { data: before } = await supabase
    .from('processo_card_documentos')
    .select('processo_id, etapa_painel, titulo, link_url')
    .eq('id', documentoId)
    .maybeSingle();

  const { error } = await supabase.from('processo_card_documentos').update({
    link_url: link,
    updated_at: new Date().toISOString(),
  }).eq('id', documentoId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/painel-novos-negocios');

  await registrarEventoCard(
    supabase,
    String((before as any)?.processo_id ?? ''),
    userId,
    autorNome,
    (before as any)?.etapa_painel,
    'document_link_update',
    'Link do documento atualizado',
    { documento_id: documentoId, antes: (before as any)?.link_url ?? null, depois: link },
  );
  return { ok: true };
}

export async function updateDocumentoCardAnexo(
  documentoId: string,
  storagePath: string,
  nomeOriginal: string,
): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data: before } = await supabase
    .from('processo_card_documentos')
    .select('processo_id, etapa_painel, titulo, storage_path, nome_original')
    .eq('id', documentoId)
    .maybeSingle();

  const { error } = await supabase.from('processo_card_documentos').update({
    storage_path: storagePath,
    nome_original: nomeOriginal ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', documentoId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/painel-novos-negocios');

  await registrarEventoCard(
    supabase,
    String((before as any)?.processo_id ?? ''),
    userId,
    autorNome,
    (before as any)?.etapa_painel,
    'document_anexo_update',
    'Anexo do documento atualizado',
    {
      documento_id: documentoId,
      titulo: (before as any)?.titulo ?? null,
      antes_nome: (before as any)?.nome_original ?? null,
      depois_nome: nomeOriginal ?? null,
      antes_storage_path: (before as any)?.storage_path ?? null,
      depois_storage_path: storagePath ?? null,
    },
  );
  return { ok: true };
}

export async function updateDocumentoCardTexto(
  documentoId: string,
  textoLivre: string,
): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data: before } = await supabase
    .from('processo_card_documentos')
    .select('processo_id, etapa_painel, titulo, texto_livre')
    .eq('id', documentoId)
    .maybeSingle();

  const normalized = (textoLivre ?? '').trim();
  const { error } = await supabase
    .from('processo_card_documentos')
    .update({
      texto_livre: normalized === '' ? null : normalized,
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentoId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/painel-novos-negocios');

  await registrarEventoCard(
    supabase,
    String((before as any)?.processo_id ?? ''),
    userId,
    autorNome,
    (before as any)?.etapa_painel,
    'document_text_update',
    'Texto do documento atualizado',
    {
      documento_id: documentoId,
      titulo: (before as any)?.titulo ?? null,
      antes: (before as any)?.texto_livre ?? null,
      depois: normalized === '' ? null : normalized,
    },
  );
  return { ok: true };
}

export async function updateDocumentoCardAnexos(
  documentoId: string,
  anexos: Array<{ storage_path: string; nome_original: string | null }>,
): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data: before } = await supabase
    .from('processo_card_documentos')
    .select('processo_id, etapa_painel, titulo, anexos_json')
    .eq('id', documentoId)
    .maybeSingle();

  const normalized = (anexos ?? [])
    .filter((a) => Boolean(a?.storage_path))
    .map((a) => ({
      storage_path: String(a.storage_path).trim(),
      nome_original: a.nome_original ? String(a.nome_original).trim() : null,
    }));

  const { error } = await supabase
    .from('processo_card_documentos')
    .update({
      anexos_json: normalized,
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentoId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/painel-novos-negocios');

  await registrarEventoCard(
    supabase,
    String((before as any)?.processo_id ?? ''),
    userId,
    autorNome,
    (before as any)?.etapa_painel,
    'document_anexos_update',
    'Anexos do documento atualizados',
    {
      documento_id: documentoId,
      titulo: (before as any)?.titulo ?? null,
      quantidade: normalized.length,
    },
  );
  return { ok: true };
}

export async function removeDocumentoCard(documentoId: string): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data: before } = await supabase
    .from('processo_card_documentos')
    .select('processo_id, etapa_painel, titulo')
    .eq('id', documentoId)
    .maybeSingle();

  const { error } = await supabase.from('processo_card_documentos').delete().eq('id', documentoId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/painel-novos-negocios');

  await registrarEventoCard(
    supabase,
    String((before as any)?.processo_id ?? ''),
    userId,
    autorNome,
    (before as any)?.etapa_painel,
    'document_remove',
    'Documento removido',
    { documento_id: documentoId, titulo: (before as any)?.titulo ?? null },
  );
  return { ok: true };
}

/** Step 5 - dados de Comitê Moní (parecer, link, anexo) */
export async function getDadosComiteCard(
  processoId: string,
): Promise<
  | {
      ok: true;
      data: {
        id: string;
        comite_moni_concluido: boolean;
        comite_resultado: 'pendente' | 'aprovado' | 'reprovado' | null;
        parecer_texto: string | null;
        link_url: string | null;
        storage_path: string | null;
        nome_original: string | null;
      } | null;
    }
  | { ok: false; error: string }
> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const baseId = await resolveHistoricoBaseId(supabase, processoId);
  const { data, error } = await supabase
    .from('processo_card_comite')
    .select('id, comite_moni_concluido, comite_resultado, parecer_texto, link_url, storage_path, nome_original')
    .eq('processo_id', baseId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, data: null };
  return {
    ok: true,
    data: {
      id: String((data as any).id),
      comite_moni_concluido: Boolean((data as any).comite_moni_concluido),
      comite_resultado: (((data as any).comite_resultado ?? null) as 'pendente' | 'aprovado' | 'reprovado' | null),
      parecer_texto: ((data as any).parecer_texto ?? null) as string | null,
      link_url: ((data as any).link_url ?? null) as string | null,
      storage_path: ((data as any).storage_path ?? null) as string | null,
      nome_original: ((data as any).nome_original ?? null) as string | null,
    },
  };
}

export async function upsertDadosComiteCard(
  processoId: string,
  patch: {
    comite_moni_concluido?: boolean;
    comite_resultado?: 'pendente' | 'aprovado' | 'reprovado' | null;
    parecer_texto?: string | null;
    link_url?: string | null;
    storage_path?: string | null;
    nome_original?: string | null;
  },
): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;
  const baseId = await resolveHistoricoBaseId(supabase, processoId);
  const { data: current } = await supabase
    .from('processo_card_comite')
    .select('id, comite_moni_concluido, comite_resultado, parecer_texto, link_url, storage_path, nome_original')
    .eq('processo_id', baseId)
    .maybeSingle();

  const next = {
    processo_id: baseId,
    etapa_painel: 'step_5',
    comite_moni_concluido: (patch.comite_moni_concluido ?? (current as any)?.comite_moni_concluido ?? false) as boolean,
    comite_resultado: (patch.comite_resultado ?? (current as any)?.comite_resultado ?? 'pendente') as 'pendente' | 'aprovado' | 'reprovado',
    parecer_texto: (patch.parecer_texto ?? (current as any)?.parecer_texto ?? null) as string | null,
    link_url: (patch.link_url ?? (current as any)?.link_url ?? null) as string | null,
    storage_path: (patch.storage_path ?? (current as any)?.storage_path ?? null) as string | null,
    nome_original: (patch.nome_original ?? (current as any)?.nome_original ?? null) as string | null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('processo_card_comite').upsert(next, { onConflict: 'processo_id' });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/painel-novos-negocios');
  await registrarEventoCard(
    supabase,
    processoId,
    userId,
    autorNome,
    'step_5',
    'checklist_comite_update',
    'Checklist Comitê Moní atualizado',
    patch as Record<string, unknown>,
  );
  return { ok: true };
}

/** Tópicos da etapa (tarefas com prioridade, responsável, data, status) */
export async function getTopicosEtapa(processoId: string, etapaPainel: string): Promise<
  | {
      ok: true;
      topicos: Array<{
        id: string;
        titulo: string;
        prioridade: string;
        responsavel_id: string | null;
        responsavel_nome: string | null;
        data_entrega: string | null;
        status: string;
        resposta: string | null;
        created_at: string;
      }>;
    }
  | { ok: false; error: string }
> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data, error } = await supabase
    .from('processo_etapa_topicos')
    .select('id, titulo, prioridade, responsavel_id, responsavel_nome, data_entrega, status, resposta, created_at')
    .eq('processo_id', processoId)
    .eq('etapa_painel', etapaPainel)
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, topicos: (data ?? []).map((t) => ({ ...t, data_entrega: (t as { data_entrega: string | null }).data_entrega, resposta: (t as { resposta: string | null }).resposta })) };
}

export async function criarTopicoEtapa(
  processoId: string,
  etapaPainel: string,
  titulo: string,
  prioridade: string,
  responsavelId: string | null,
  responsavelNome: string | null,
  dataEntrega: string | null,
): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { error } = await supabase.from('processo_etapa_topicos').insert({
    processo_id: processoId,
    etapa_painel: etapaPainel,
    titulo: titulo.trim(),
    prioridade: prioridade || 'media',
    responsavel_id: responsavelId || null,
    responsavel_nome: responsavelNome || null,
    data_entrega: dataEntrega || null,
    status: 'pendente',
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/painel-novos-negocios');
  revalidatePath('/painel-novos-negocios/tarefas');
  return { ok: true };
}

export async function atualizarTopicoEtapaStatus(topicoId: string, status: string): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;
  if (!['pendente', 'em_andamento', 'concluido'].includes(status)) return { ok: false, error: 'Status inválido.' };
  const { error } = await supabase
    .from('processo_etapa_topicos')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', topicoId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/painel-novos-negocios');
  revalidatePath('/painel-novos-negocios/tarefas');
  return { ok: true };
}

export async function atualizarTopicoEtapaResposta(topicoId: string, resposta: string): Promise<CardActionResult> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;
  const { error } = await supabase
    .from('processo_etapa_topicos')
    .update({ resposta: resposta.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', topicoId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/painel-novos-negocios');
  revalidatePath('/painel-novos-negocios/tarefas');
  return { ok: true };
}

/** Lista de usuários para atribuir responsável (carteira + consultores) */
export async function getUsuariosParaResponsavel(): Promise<
  | { ok: true; usuarios: Array<{ id: string; nome: string }> }
  | { ok: false; error: string }
> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user, userId, autorNome } = auth;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role, consultor_id')
    .or('role.eq.consultor,role.eq.admin,consultor_id.not.is.null');

  const list = (profiles ?? []).map((p) => ({
    id: p.id,
    nome: ((p as { full_name: string | null }).full_name ?? '').trim() || (p as { id: string }).id.slice(0, 8),
  }));
  return { ok: true, usuarios: list };
}

/** Painel de Tarefas: tópicos (tarefas) com filtro por responsável ou todas */
export async function getTarefasPainel(filtroResponsavel: 'todas' | 'minhas'): Promise<
  | {
      ok: true;
      tarefas: Array<{
        id: string;
        processo_id: string;
        etapa_painel: string;
        titulo: string;
        prioridade: string;
        responsavel_id: string | null;
        responsavel_nome: string | null;
        data_entrega: string | null;
        status: string;
        resposta: string | null;
        processo_cidade: string;
        processo_estado: string | null;
      }>;
    }
  | { ok: false; error: string }
> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, userId, isServiceRole } = auth;

  let query = supabase
    .from('processo_etapa_topicos')
    .select('id, processo_id, etapa_painel, titulo, prioridade, responsavel_id, responsavel_nome, data_entrega, status, resposta');

  if (filtroResponsavel === 'minhas' && !isServiceRole) {
    query = query.eq('responsavel_id', userId);
  }

  const { data: topicos, error } = await query.order('data_entrega', { ascending: true, nullsFirst: false });

  if (error) return { ok: false, error: error.message };
  if (!topicos?.length) return { ok: true, tarefas: [] };

  const processoIds = [...new Set(topicos.map((t) => t.processo_id))];
  const { data: processos } = await supabase
    .from('processo_step_one')
    .select('id, cidade, estado, status, cancelado_em, removido_em')
    .in('id', processoIds);

  const procMap = new Map((processos ?? []).map((p) => [p.id, p]));

  const tarefas = topicos
    .filter((t) => {
      const p = procMap.get(t.processo_id) as
        | { status?: string | null; cancelado_em?: string | null; removido_em?: string | null }
        | undefined;
      return !isProcessoChecklistPainelExcluido(p);
    })
    .map((t) => {
    const p = procMap.get(t.processo_id);
    return {
      id: t.id,
      processo_id: t.processo_id,
      etapa_painel: t.etapa_painel,
      titulo: t.titulo,
      prioridade: t.prioridade,
      responsavel_id: t.responsavel_id ?? null,
      responsavel_nome: t.responsavel_nome ?? null,
      data_entrega: t.data_entrega ?? null,
      status: t.status,
      resposta: t.resposta ?? null,
      processo_cidade: (p as { cidade?: string })?.cidade ?? '',
      processo_estado: (p as { estado?: string | null })?.estado ?? null,
    };
    });

  return { ok: true, tarefas };
}
