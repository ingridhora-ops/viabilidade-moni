'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { parseAndMapRedeCSV, type RedeFranqueadoRow } from '@/lib/import-rede-csv';
import { REDE_FRANQUEADOS_DB_KEYS, type RedeFranqueadoDbKey } from '@/lib/rede-franqueados';
import { fixRedeCsvSociosHeadersTextFromSheets, normalizeRedeCsvHeadersFromSheets } from '@/lib/fix-rede-csv-socios-headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { getNextFKFromRedeFranqueados } from '@/lib/next-fk-franquia';
import { gerarRegistroFranquiaPdf } from '@/lib/registro-franquia-pdf';
import { getRegistroFranquiaRecipients, sendRegistroFranquiaEmail } from '@/lib/email';
import { allocNextOrdemColunaPainel } from '@/lib/painel-coluna-ordem';
import { getPainelDbForPublicEdit } from '@/lib/painel-public-edit';

async function requireRedeAdminOrPublicLink(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string }
  | { ok: false; error: string }
> {
  const auth = await getPainelDbForPublicEdit();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, userId, isServiceRole } = auth;
  if (isServiceRole) return { ok: true, supabase, userId };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single();
  const role = (profile?.role as string) ?? 'frank';
  if (role !== 'admin') return { ok: false, error: 'Apenas administradores.' };
  return { ok: true, supabase, userId };
}

export type CriarCardsDesdeRedeResult =
  | { ok: true; criados: number; mensagem: string }
  | { ok: false; error: string };

export type CriarLinhaRedeECardResult =
  | { ok: true; redeId: string; processoId: string; mensagem: string }
  | { ok: false; error: string };

const MAX_POR_VEZ = 100;

export async function criarLinhaRedeECard(
  input: Partial<Record<RedeFranqueadoDbKey, string | null>>,
  cardCidade?: string | null,
  cardEstado?: string | null,
): Promise<CriarLinhaRedeECardResult> {
  const gate = await requireRedeAdminOrPublicLink();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase, userId } = gate;

  const allow = new Set<string>(REDE_FRANQUEADOS_DB_KEYS as unknown as string[]);
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input ?? {})) {
    if (!allow.has(k)) continue;
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    clean[k] = s;
  }

  // Auto-preenchimento do Nº da franquia (FKxxxx)
  // Se o usuário não informou `n_franquia`, calculamos com base no último da tabela.
  if (!clean.n_franquia) {
    try {
      const admin = createAdminClient();
      const next = await getNextFKFromRedeFranqueados(admin as any);
      clean.n_franquia = next;
    } catch {
      // fallback silencioso: deixa sem preencher (o banco poderá rejeitar/ajustar)
    }
  }

  // Próxima ordem
  const { data: last } = await supabase
    .from('rede_franqueados')
    .select('ordem')
    .order('ordem', { ascending: false })
    .limit(1)
    .maybeSingle();
  const proximaOrdem = ((last as { ordem?: number } | null)?.ordem ?? 0) + 1;

  const { data: rede, error: errRede } = await supabase
    .from('rede_franqueados')
    .insert({ ordem: proximaOrdem, ...clean })
    .select('id')
    .single();
  if (errRede || !rede?.id) return { ok: false, error: errRede?.message ?? 'Erro ao criar linha na rede.' };

  try {
    const recipients = getRegistroFranquiaRecipients(
      clean.email_frank != null ? String(clean.email_frank) : undefined,
    );
    if (recipients.length > 0) {
      const pdf = await gerarRegistroFranquiaPdf({
        nomeFranqueado: String(clean.nome_completo ?? '').trim(),
        dataAssinaturaContrato: String(clean.data_ass_contrato ?? '').trim(),
        numeroFranquia: String(clean.n_franquia ?? '').trim(),
      });
      const emailRes = await sendRegistroFranquiaEmail({
        to: recipients,
        nomeFranqueado: String(clean.nome_completo ?? '').trim() || '-',
        numeroFranquia: String(clean.n_franquia ?? '').trim() || '-',
        dataAssinaturaContrato: String(clean.data_ass_contrato ?? '').trim() || '-',
        pdfBytes: pdf,
      });
      if (!emailRes.ok) console.error('sendRegistroFranquiaEmail (criarLinhaRedeECard)', emailRes.error);
    }
  } catch {
    // não quebra o fluxo de criação
  }

  const cidade = (cardCidade && String(cardCidade).trim()) || String(clean.cidade_casa_frank ?? '').trim() || 'A definir';
  const estado = (cardEstado && String(cardEstado).trim()) || (clean.estado_casa_frank && String(clean.estado_casa_frank).trim()) || null;

  const payload: Record<string, unknown> = {
    user_id: userId,
    cidade,
    estado,
    status: 'em_andamento',
    etapa_atual: 1,
    etapa_painel: 'step_1',
    origem_rede_franqueados_id: rede.id,
  };

  // Copiar campos relevantes para o processo
  if (clean.n_franquia) payload.numero_franquia = clean.n_franquia;
  if (clean.modalidade) payload.modalidade = clean.modalidade;
  if (clean.nome_completo) payload.nome_franqueado = clean.nome_completo;
  if (clean.status_franquia) payload.status_franquia = clean.status_franquia;
  if (clean.classificacao_franqueado) payload.classificacao_franqueado = clean.classificacao_franqueado;
  if (clean.area_atuacao) payload.area_atuacao_franquia = clean.area_atuacao;
  if (clean.email_frank) payload.email_franqueado = clean.email_frank;
  if (clean.responsavel_comercial) payload.responsavel_comercial = clean.responsavel_comercial;
  if (clean.telefone_frank) payload.telefone_frank = clean.telefone_frank;
  if (clean.cpf_frank) payload.cpf_frank = clean.cpf_frank;
  if (clean.data_nasc_frank) payload.data_nasc_frank = clean.data_nasc_frank;
  if (clean.data_ass_cof) payload.data_ass_cof = clean.data_ass_cof;
  if (clean.data_ass_contrato) payload.data_ass_contrato = clean.data_ass_contrato;
  if (clean.data_expiracao_franquia) payload.data_expiracao_franquia = clean.data_expiracao_franquia;
  if (clean.endereco_casa_frank) payload.endereco_casa_frank = clean.endereco_casa_frank;
  if (clean.endereco_casa_frank_numero) payload.endereco_casa_frank_numero = clean.endereco_casa_frank_numero;
  if (clean.endereco_casa_frank_complemento) payload.endereco_casa_frank_complemento = clean.endereco_casa_frank_complemento;
  if (clean.cep_casa_frank) payload.cep_casa_frank = clean.cep_casa_frank;
  if (clean.tamanho_camisa_frank) payload.tamanho_camiseta_frank = clean.tamanho_camisa_frank;
  if (clean.socios) payload.socios = clean.socios;

  payload.ordem_coluna_painel = await allocNextOrdemColunaPainel(supabase, 'step_1');

  const { data: processo, error: errProc } = await supabase
    .from('processo_step_one')
    .insert(payload)
    .select('id')
    .single();
  if (errProc || !processo?.id) return { ok: false, error: errProc?.message ?? 'Erro ao criar card.' };

  const etapas = Array.from({ length: 11 }, (_, i) => ({
    user_id: userId,
    processo_id: processo.id,
    etapa_id: i + 1,
    status: 'nao_iniciada' as const,
    tentativas: 0,
  }));
  const { error: errEtapas } = await supabase.from('etapa_progresso').insert(etapas);
  if (errEtapas) return { ok: false, error: `Erro ao criar etapas: ${errEtapas.message}` };

  const { error: errLink } = await supabase
    .from('rede_franqueados')
    .update({ processo_id: processo.id })
    .eq('id', rede.id);
  if (errLink) return { ok: false, error: `Erro ao vincular processo à rede: ${errLink.message}` };

  revalidatePath('/rede-franqueados');
  revalidatePath('/painel-novos-negocios');
  return { ok: true, redeId: rede.id, processoId: processo.id, mensagem: 'Linha criada e card gerado no Step 1.' };
}

/**
 * Endpoint/Server Action para o frontend pré-preencher o próximo FKxxxx.
 * (Usado no modal de adicionar franqueado e no formulário do Novo Step 1.)
 */
export async function getProximoNFranquia(): Promise<{ ok: true; valor: string } | { ok: false; error: string }> {
  try {
    const admin = createAdminClient();
    const valor = await getNextFKFromRedeFranqueados(admin as any);
    return { ok: true, valor };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Cria um card (processo Step 1) no Painel para cada linha da Rede de Franqueados
 * que ainda não tem processo_id. Apenas admin.
 */
export async function criarCardsDesdeRedeFranqueados(): Promise<CriarCardsDesdeRedeResult> {
  const gate = await requireRedeAdminOrPublicLink();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase, userId } = gate;

  const { data: rows, error: errSelect } = await supabase
    .from('rede_franqueados')
    .select(
      'id, n_franquia, modalidade, nome_completo, status_franquia, classificacao_franqueado, area_atuacao, email_frank, responsavel_comercial, tamanho_camisa_frank, socios, cidade_casa_frank, estado_casa_frank, telefone_frank, cpf_frank, data_nasc_frank, data_ass_cof, data_ass_contrato, data_expiracao_franquia, endereco_casa_frank, endereco_casa_frank_numero, endereco_casa_frank_complemento, cep_casa_frank',
    )
    .is('processo_id', null)
    .limit(MAX_POR_VEZ);

  if (errSelect) return { ok: false, error: errSelect.message ?? 'Erro ao ler a tabela.' };
  if (!rows?.length) {
    return {
      ok: true,
      criados: 0,
      mensagem: 'Nenhuma linha sem card. Todas as linhas da Rede já possuem um card no Painel.',
    };
  }

  let criados = 0;
  for (const row of rows) {
    const cidade = String(row.cidade_casa_frank ?? '').trim() || 'A definir';
    const estado = (row.estado_casa_frank && String(row.estado_casa_frank).trim()) || null;

    const payload: Record<string, unknown> = {
      user_id: userId,
      cidade,
      estado,
      status: 'em_andamento',
      etapa_atual: 1,
      etapa_painel: 'step_1',
      origem_rede_franqueados_id: row.id,
    };
    if (row.n_franquia != null && String(row.n_franquia).trim() !== '')
      payload.numero_franquia = String(row.n_franquia).trim();
    if (row.modalidade != null && String(row.modalidade).trim() !== '')
      payload.modalidade = String(row.modalidade).trim();
    if (row.nome_completo != null && String(row.nome_completo).trim() !== '')
      payload.nome_franqueado = String(row.nome_completo).trim();
    if (row.status_franquia != null && String(row.status_franquia).trim() !== '')
      payload.status_franquia = String(row.status_franquia).trim();
    if (row.classificacao_franqueado != null && String(row.classificacao_franqueado).trim() !== '')
      payload.classificacao_franqueado = String(row.classificacao_franqueado).trim();
    if (row.area_atuacao != null && String(row.area_atuacao).trim() !== '')
      payload.area_atuacao_franquia = String(row.area_atuacao).trim();
    if (row.email_frank != null && String(row.email_frank).trim() !== '')
      payload.email_franqueado = String(row.email_frank).trim();
    if (row.responsavel_comercial != null && String(row.responsavel_comercial).trim() !== '')
      payload.responsavel_comercial = String(row.responsavel_comercial).trim();
    if (row.telefone_frank != null && String(row.telefone_frank).trim() !== '')
      payload.telefone_frank = String(row.telefone_frank).trim();
    if (row.cpf_frank != null && String(row.cpf_frank).trim() !== '')
      payload.cpf_frank = String(row.cpf_frank).trim();
    if (row.data_nasc_frank != null && String(row.data_nasc_frank).trim() !== '')
      payload.data_nasc_frank = String(row.data_nasc_frank).trim();
    if (row.data_ass_cof != null && String(row.data_ass_cof).trim() !== '')
      payload.data_ass_cof = String(row.data_ass_cof).trim();
    if (row.data_ass_contrato != null && String(row.data_ass_contrato).trim() !== '')
      payload.data_ass_contrato = String(row.data_ass_contrato).trim();
    if (row.data_expiracao_franquia != null && String(row.data_expiracao_franquia).trim() !== '')
      payload.data_expiracao_franquia = String(row.data_expiracao_franquia).trim();
    if (row.endereco_casa_frank != null && String(row.endereco_casa_frank).trim() !== '')
      payload.endereco_casa_frank = String(row.endereco_casa_frank).trim();
    if (row.endereco_casa_frank_numero != null && String(row.endereco_casa_frank_numero).trim() !== '')
      payload.endereco_casa_frank_numero = String(row.endereco_casa_frank_numero).trim();
    if (row.endereco_casa_frank_complemento != null && String(row.endereco_casa_frank_complemento).trim() !== '')
      payload.endereco_casa_frank_complemento = String(row.endereco_casa_frank_complemento).trim();
    if (row.cep_casa_frank != null && String(row.cep_casa_frank).trim() !== '')
      payload.cep_casa_frank = String(row.cep_casa_frank).trim();
    if (row.tamanho_camisa_frank != null && String(row.tamanho_camisa_frank).trim() !== '')
      payload.tamanho_camiseta_frank = String(row.tamanho_camisa_frank).trim();
    if (row.socios != null && String(row.socios).trim() !== '') payload.socios = String(row.socios).trim();

    payload.ordem_coluna_painel = await allocNextOrdemColunaPainel(supabase, 'step_1');

    const { data: processo, error: errInsert } = await supabase
      .from('processo_step_one')
      .insert(payload)
      .select('id')
      .single();

    if (errInsert) {
      return { ok: false, error: `Erro ao criar card para linha ${row.n_franquia ?? row.nome_completo ?? row.id}: ${errInsert.message}` };
    }
    if (!processo?.id) continue;

    const etapas = Array.from({ length: 11 }, (_, i) => ({
      user_id: userId,
      processo_id: processo.id,
      etapa_id: i + 1,
      status: 'nao_iniciada' as const,
      tentativas: 0,
    }));
    const { error: errEtapas } = await supabase.from('etapa_progresso').insert(etapas);
    if (errEtapas) {
      return { ok: false, error: `Erro ao criar etapas do processo: ${errEtapas.message}` };
    }

    const { error: errUpdate } = await supabase
      .from('rede_franqueados')
      .update({ processo_id: processo.id })
      .eq('id', row.id);
    if (errUpdate) {
      return { ok: false, error: `Erro ao vincular processo à rede: ${errUpdate.message}` };
    }
    criados += 1;
  }

  revalidatePath('/rede-franqueados');
  revalidatePath('/painel-novos-negocios');
  return {
    ok: true,
    criados,
    mensagem: criados === 1 ? '1 card criado no Painel.' : `${criados} cards criados no Painel.`,
  };
}

/**
 * Retorna quantas linhas da Rede ainda não têm card (processo_id nulo).
 */
export async function contarLinhasSemCard(): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const gate = await requireRedeAdminOrPublicLink();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  const { count, error } = await supabase
    .from('rede_franqueados')
    .select('*', { count: 'exact', head: true })
    .is('processo_id', null);

  if (error) return { ok: false, error: error.message };
  return { ok: true, total: count ?? 0 };
}

export type AtualizarRedeFranqueadoResult =
  | { ok: true; mensagem: string }
  | { ok: false; error: string };

export type ExcluirRedeFranqueadoResult =
  | { ok: true; mensagem: string }
  | { ok: false; error: string };

export async function excluirRedeFranqueado(id: string): Promise<ExcluirRedeFranqueadoResult> {
  const gate = await requireRedeAdminOrPublicLink();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  if (!id) return { ok: false, error: 'ID inválido.' };

  // Evita falha por FK: desvincula origem no processo_step_one antes de apagar.
  await supabase.from('processo_step_one').update({ origem_rede_franqueados_id: null }).eq('origem_rede_franqueados_id', id);

  const { error } = await supabase.from('rede_franqueados').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/rede-franqueados');
  revalidatePath('/painel-novos-negocios');
  return { ok: true, mensagem: 'Linha excluída.' };
}

export async function atualizarRedeFranqueado(
  id: string,
  patch: Partial<Record<RedeFranqueadoDbKey, string | null>>,
): Promise<AtualizarRedeFranqueadoResult> {
  const gate = await requireRedeAdminOrPublicLink();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase } = gate;

  if (!id) return { ok: false, error: 'ID inválido.' };

  const allow = new Set<string>(REDE_FRANQUEADOS_DB_KEYS as unknown as string[]);
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (!allow.has(k)) continue;
    clean[k] = v === '' ? null : v;
  }
  if (Object.keys(clean).length === 0) return { ok: false, error: 'Nada para atualizar.' };

  const { error } = await supabase
    .from('rede_franqueados')
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/rede-franqueados');
  revalidatePath('/comunidade');
  return { ok: true, mensagem: 'Linha atualizada.' };
}

const REDE_INSERT_COLUMNS = [
  'ordem', 'n_franquia', 'modalidade', 'nome_completo', 'status_franquia', 'classificacao_franqueado',
  'data_ass_cof', 'data_ass_contrato', 'data_expiracao_franquia', 'regional', 'area_atuacao',
  'email_frank', 'responsavel_comercial', 'telefone_frank', 'cpf_frank', 'data_nasc_frank', 'endereco_casa_frank', 'endereco_casa_frank_numero', 'endereco_casa_frank_complemento',
  'cep_casa_frank', 'estado_casa_frank', 'cidade_casa_frank', 'tamanho_camisa_frank', 'socios',
  'data_recebimento_kit_boas_vindas',
] as const;

export type ImportarRedeCSVResult =
  | { ok: true; inseridos: number; mensagem: string }
  | { ok: false; error: string };

/**
 * Importa linhas a partir de um CSV (ex.: exportado do Google Sheets) para a tabela rede_franqueados. Apenas admin.
 */
export async function importarRedeFranqueadosCSV(csvText: string): Promise<ImportarRedeCSVResult> {
  const gate = await requireRedeAdminOrPublicLink();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { supabase, userId } = gate;

  // (BUG 1) Normaliza cabeçalhos exportados pelo Sheets (trim + canonicalização)
  const normalizedHeaders = normalizeRedeCsvHeadersFromSheets(csvText);
  if (!normalizedHeaders.ok) return { ok: false, error: normalizedHeaders.error };

  // Mantém também a correção específica das colunas 23..28 ("Sócios")
  const fixed = fixRedeCsvSociosHeadersTextFromSheets(normalizedHeaders.csvText);
  if (!fixed.ok) return { ok: false, error: fixed.error };

  const parsed = parseAndMapRedeCSV(fixed.csvText);
  if (!parsed || parsed.records.length === 0) {
    return { ok: false, error: 'CSV inválido ou sem linhas de dados. Use cabeçalho na primeira linha.' };
  }

  if (parsed.meta.badRows.length > 0) {
    return {
      ok: false,
      error:
        `CSV desalinhado: o cabeçalho tem ${parsed.meta.headerLen} colunas, ` +
        `mas encontrei linhas com ${parsed.meta.minLen} a ${parsed.meta.maxLen} colunas. ` +
        `Linhas com problema (amostra): ${parsed.meta.badRows.join(', ')}.\n\n` +
        `Isso normalmente acontece quando algum valor contém vírgula (,) sem estar entre aspas ("). ` +
        `Ex.: endereço "Rua X, 123".\n\n` +
        `Como corrigir: exporte direto do Google Sheets (Arquivo → Fazer download → .csv) ` +
        `ou coloque aspas em qualquer campo que tenha vírgula, ou remova as vírgulas dos valores.`,
    };
  }

  // Se o delimitador do CSV vier como ";" (comum em pt-BR), o parser antigo separava errado.
  // Agora o parser autodetecta, mas deixamos uma mensagem amigável caso o cabeçalho venha com 1 coluna só.
  if (parsed.meta.headerLen <= 2) {
    return {
      ok: false,
      error:
        `CSV parece estar com delimitador diferente (ex.: ";" em vez de ","). ` +
        `Reexporte do Google Sheets como CSV e não abra/salve no Excel antes de importar.`,
    };
  }

  const BATCH = 50;
  let inseridos = 0;
  const insertedIds: string[] = [];
  for (let i = 0; i < parsed.records.length; i += BATCH) {
    const batch = parsed.records.slice(i, i + BATCH).map((r) => {
      const row: Record<string, unknown> = {};
      for (const col of REDE_INSERT_COLUMNS) {
        const v = r[col];
        if (v !== undefined && v !== null && v !== '') row[col] = v;
      }
      if (typeof row.ordem !== 'number') row.ordem = 0;
      return row;
    });
    const { data, error } = await supabase.from('rede_franqueados').insert(batch).select('id');
    if (error) return { ok: false, error: `Erro ao inserir: ${error.message}` };
    inseridos += (data ?? []).length;
    for (const r of data ?? []) {
      const id = (r as { id?: string }).id;
      if (id) insertedIds.push(id);
    }
  }

  // Envio do Registro de Franquia para as linhas inseridas (durante testes: sempre para o e-mail fixo)
  if (insertedIds.length > 0) {
    try {
      const { data: insertedRows } = await supabase
        .from('rede_franqueados')
        .select('id, nome_completo, n_franquia, data_ass_contrato, email_frank')
        .in('id', insertedIds);

      for (const r of insertedRows ?? []) {
        const row = r as {
          nome_completo?: string | null;
          data_ass_contrato?: string | null;
          n_franquia?: string | null;
          email_frank?: string | null;
        };
        const recipients = getRegistroFranquiaRecipients(row.email_frank);
        if (recipients.length === 0) continue;
        const pdf = await gerarRegistroFranquiaPdf({
          nomeFranqueado: String(row.nome_completo ?? '').trim(),
          dataAssinaturaContrato: String(row.data_ass_contrato ?? '').trim(),
          numeroFranquia: String(row.n_franquia ?? '').trim(),
        });
        const emailRes = await sendRegistroFranquiaEmail({
          to: recipients,
          nomeFranqueado: String(row.nome_completo ?? '').trim() || '-',
          numeroFranquia: String(row.n_franquia ?? '').trim() || '-',
          dataAssinaturaContrato: String(row.data_ass_contrato ?? '').trim() || '-',
          pdfBytes: pdf,
        });
        if (!emailRes.ok) console.error('sendRegistroFranquiaEmail (importarRedeFranqueadosCSV)', emailRes.error);
      }
    } catch {
      // não quebra o fluxo de importação
    }
  }

  // Depois de importar, criar cards Step 1 automaticamente para as linhas importadas
  if (insertedIds.length > 0) {
    const { data: rows, error: errSelect } = await supabase
      .from('rede_franqueados')
      .select(
        'id, n_franquia, modalidade, nome_completo, status_franquia, classificacao_franqueado, area_atuacao, email_frank, responsavel_comercial, tamanho_camisa_frank, socios, cidade_casa_frank, estado_casa_frank, telefone_frank, cpf_frank, data_nasc_frank, data_ass_cof, data_ass_contrato, data_expiracao_franquia, endereco_casa_frank, endereco_casa_frank_numero, endereco_casa_frank_complemento, cep_casa_frank',
      )
      .in('id', insertedIds);
    if (errSelect) return { ok: false, error: `Erro ao ler linhas importadas: ${errSelect.message}` };

    let criados = 0;
    for (const row of rows ?? []) {
      // pular se já tiver processo_id por algum motivo
      const { data: already } = await supabase
        .from('rede_franqueados')
        .select('processo_id')
        .eq('id', row.id)
        .maybeSingle();
      if ((already as { processo_id?: string | null } | null)?.processo_id) continue;

      const cidade = String(row.cidade_casa_frank ?? '').trim() || 'A definir';
      const estado = (row.estado_casa_frank && String(row.estado_casa_frank).trim()) || null;

      const payload: Record<string, unknown> = {
        user_id: userId,
        cidade,
        estado,
        status: 'em_andamento',
        etapa_atual: 1,
        etapa_painel: 'step_1',
        origem_rede_franqueados_id: row.id,
      };
      if (row.n_franquia != null && String(row.n_franquia).trim() !== '') payload.numero_franquia = String(row.n_franquia).trim();
      if (row.modalidade != null && String(row.modalidade).trim() !== '') payload.modalidade = String(row.modalidade).trim();
      if (row.nome_completo != null && String(row.nome_completo).trim() !== '') payload.nome_franqueado = String(row.nome_completo).trim();
      if (row.status_franquia != null && String(row.status_franquia).trim() !== '') payload.status_franquia = String(row.status_franquia).trim();
      if (row.classificacao_franqueado != null && String(row.classificacao_franqueado).trim() !== '') payload.classificacao_franqueado = String(row.classificacao_franqueado).trim();
      if (row.area_atuacao != null && String(row.area_atuacao).trim() !== '') payload.area_atuacao_franquia = String(row.area_atuacao).trim();
      if (row.email_frank != null && String(row.email_frank).trim() !== '') payload.email_franqueado = String(row.email_frank).trim();
      if (row.responsavel_comercial != null && String(row.responsavel_comercial).trim() !== '') payload.responsavel_comercial = String(row.responsavel_comercial).trim();
      if (row.telefone_frank != null && String(row.telefone_frank).trim() !== '') payload.telefone_frank = String(row.telefone_frank).trim();
      if (row.cpf_frank != null && String(row.cpf_frank).trim() !== '') payload.cpf_frank = String(row.cpf_frank).trim();
      if (row.data_nasc_frank != null && String(row.data_nasc_frank).trim() !== '') payload.data_nasc_frank = String(row.data_nasc_frank).trim();
      if (row.data_ass_cof != null && String(row.data_ass_cof).trim() !== '') payload.data_ass_cof = String(row.data_ass_cof).trim();
      if (row.data_ass_contrato != null && String(row.data_ass_contrato).trim() !== '') payload.data_ass_contrato = String(row.data_ass_contrato).trim();
      if (row.data_expiracao_franquia != null && String(row.data_expiracao_franquia).trim() !== '') payload.data_expiracao_franquia = String(row.data_expiracao_franquia).trim();
      if (row.endereco_casa_frank != null && String(row.endereco_casa_frank).trim() !== '') payload.endereco_casa_frank = String(row.endereco_casa_frank).trim();
      if (row.endereco_casa_frank_numero != null && String(row.endereco_casa_frank_numero).trim() !== '') payload.endereco_casa_frank_numero = String(row.endereco_casa_frank_numero).trim();
      if (row.endereco_casa_frank_complemento != null && String(row.endereco_casa_frank_complemento).trim() !== '') payload.endereco_casa_frank_complemento = String(row.endereco_casa_frank_complemento).trim();
      if (row.cep_casa_frank != null && String(row.cep_casa_frank).trim() !== '') payload.cep_casa_frank = String(row.cep_casa_frank).trim();
      if (row.tamanho_camisa_frank != null && String(row.tamanho_camisa_frank).trim() !== '') payload.tamanho_camiseta_frank = String(row.tamanho_camisa_frank).trim();
      if (row.socios != null && String(row.socios).trim() !== '') payload.socios = String(row.socios).trim();

      const { data: processo, error: errInsert } = await supabase
        .from('processo_step_one')
        .insert(payload)
        .select('id')
        .single();
      if (errInsert) return { ok: false, error: `Erro ao criar card: ${errInsert.message}` };
      if (!processo?.id) continue;

      const etapas = Array.from({ length: 11 }, (_, i) => ({
        user_id: userId,
        processo_id: processo.id,
        etapa_id: i + 1,
        status: 'nao_iniciada' as const,
        tentativas: 0,
      }));
      const { error: errEtapas } = await supabase.from('etapa_progresso').insert(etapas);
      if (errEtapas) return { ok: false, error: `Erro ao criar etapas do processo: ${errEtapas.message}` };

      const { error: errUpdate } = await supabase
        .from('rede_franqueados')
        .update({ processo_id: processo.id })
        .eq('id', row.id);
      if (errUpdate) return { ok: false, error: `Erro ao vincular processo à rede: ${errUpdate.message}` };

      criados += 1;
    }

    revalidatePath('/painel-novos-negocios');
    revalidatePath('/rede-franqueados');
    return {
      ok: true,
      inseridos,
      mensagem:
        inseridos === 1
          ? `1 linha importada. ${criados} card(s) criado(s) no Step 1.`
          : `${inseridos} linhas importadas. ${criados} card(s) criado(s) no Step 1.`,
    };
  }

  revalidatePath('/rede-franqueados');
  return {
    ok: true,
    inseridos,
    mensagem: inseridos === 1 ? '1 linha importada.' : `${inseridos} linhas importadas.`,
  };
}
