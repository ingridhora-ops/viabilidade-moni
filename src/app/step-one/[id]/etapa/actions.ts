'use server';

import { createHash } from 'node:crypto';
import { getPublicAppUrl } from '@/lib/app-url';
import { createClient } from '@/lib/supabase/server';
import { buscarMunicipioIbge } from '@/lib/ibge';
import type { MunicipioIbge } from '@/lib/ibge';
import { mapZapItemToCasa, type ZapListingItem } from '@/lib/apify-zap';
import type { BcaInputs } from '@/lib/bca-calc';

export type SaveEtapa1Result = { ok: true } | { ok: false; error: string };

export async function saveEtapa1(
  processoId: string,
  data: { narrativa?: string; concluida?: boolean },
): Promise<SaveEtapa1Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login para salvar.' };

  const { data: row } = await supabase
    .from('etapa_progresso')
    .select('iniciada_em, dados_json')
    .eq('processo_id', processoId)
    .eq('etapa_id', 1)
    .eq('user_id', user.id)
    .single();

  const currentJson = (row?.dados_json as Record<string, unknown> | null) ?? {};
  const dadosJson =
    data.narrativa !== undefined ? { ...currentJson, narrativa: data.narrativa } : undefined;

  const updates: Record<string, unknown> = {
    status: data.concluida ? 'concluida' : 'em_andamento',
    updated_at: new Date().toISOString(),
  };
  if (dadosJson) updates.dados_json = dadosJson;
  if (data.concluida) updates.concluida_em = new Date().toISOString();
  if (!row?.iniciada_em) updates.iniciada_em = new Date().toISOString();

  const { error } = await supabase
    .from('etapa_progresso')
    .update(updates)
    .eq('processo_id', processoId)
    .eq('etapa_id', 1)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };

  if (data.concluida) {
    await supabase
      .from('processo_step_one')
      .update({ etapa_atual: 2, updated_at: new Date().toISOString() })
      .eq('id', processoId)
      .eq('user_id', user.id);
  }

  return { ok: true };
}

/** Busca dados do IBGE para a praça e grava em etapa_progresso (etapa 1). */
export async function fetchAndSaveDadosIbgeEtapa1(
  processoId: string,
  cidade: string,
  estado: string | null,
): Promise<SaveEtapa1Result & { data?: MunicipioIbge }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const result = await buscarMunicipioIbge(cidade, estado);
  if (!result.ok) return result;

  const { data: row } = await supabase
    .from('etapa_progresso')
    .select('dados_json, iniciada_em')
    .eq('processo_id', processoId)
    .eq('etapa_id', 1)
    .eq('user_id', user.id)
    .single();

  const currentJson = (row?.dados_json as Record<string, unknown> | null) ?? {};
  const updates: Record<string, unknown> = {
    dados_json: { ...currentJson, analise_ibge: result.data },
    updated_at: new Date().toISOString(),
  };
  if (!row?.iniciada_em) updates.iniciada_em = new Date().toISOString();

  const { error } = await supabase
    .from('etapa_progresso')
    .update(updates)
    .eq('processo_id', processoId)
    .eq('etapa_id', 1)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: result.data };
}

export type AnexoEtapa1 = { url: string; nome: string };

/** Etapa 1 — Dados da cidade: salva observações, anexos, código IBGE e/ou URL do PDF. */
export async function saveEtapa1Praca(
  processoId: string,
  data: {
    observacoes_praca?: string | null;
    cidade_ibge_cod?: string | null;
    anexos_etapa1?: AnexoEtapa1[] | null;
    pdf_url_etapa1?: string | null;
  },
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.observacoes_praca !== undefined) updates.observacoes_praca = data.observacoes_praca;
  if (data.cidade_ibge_cod !== undefined) updates.cidade_ibge_cod = data.cidade_ibge_cod;
  if (data.anexos_etapa1 !== undefined) updates.anexos_etapa1 = data.anexos_etapa1;
  if (data.pdf_url_etapa1 !== undefined) updates.pdf_url_etapa1 = data.pdf_url_etapa1;

  const { error } = await supabase
    .from('processo_step_one')
    .update(updates)
    .eq('id', processoId)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// --- Etapa 2: Condomínios e checklist ---

export type CondominioEtapa2 = {
  id: string;
  nome: string;
  qtd_casas: number | null;
  preco_medio: number | null;
  m2_medio: number | null;
};

export type ChecklistCondominioInput = {
  lotes_total?: number | null;
  lotes_disponiveis?: number | null;
  lotes_tamanho_medio?: number | null;
  lotes_preco_m2?: number | null;
  lotes_area_valorizada?: string | null;
  casas_prontas?: number | null;
  casas_construindo?: number | null;
  casas_construindo_venda?: number | null;
  casas_construindo_cliente?: number | null;
  casas_para_venda?: number | null;
  casas_preco_m2?: number | null;
  casas_tempo_medio_venda?: number | null;
  casas_vendidas_12m?: number | null;
  casas_remanescentes_motivo?: string | null;
  casas_impacto_negativo?: string | null;
  casas_erros_projeto?: string | null;
  casas_caracteristicas_elogiadas?: string | null;
  casas_caracteristicas_buscadas?: string | null;
  locacao_exemplos?: string | null;
};

export async function buscarCondominiosViaZap(processoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const { data: processo } = await supabase
    .from('processo_step_one')
    .select('cidade, estado')
    .eq('id', processoId)
    .eq('user_id', user.id)
    .single();

  if (!processo) return { ok: false, error: 'Processo não encontrado.' };
  const cidade = (processo.cidade as string | null) ?? '';
  const estado = (processo.estado as string | null) ?? '';
  if (!cidade.trim() || !estado.trim()) {
    return { ok: false, error: 'Cidade e estado são obrigatórios para buscar condomínios no ZAP.' };
  }

  const baseUrl = getPublicAppUrl();
  const url = new URL('/api/apify-zap', baseUrl).toString();
  console.log('[Etapa2] Chamando /api/apify-zap:', url, { cidade, estado });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cidade, estado }),
  });
  const json = (await res.json()) as { ok?: boolean; error?: string; items?: ZapListingItem[] };
  if (!json.ok || !Array.isArray(json.items)) {
    return { ok: false, error: json.error || 'Falha ao buscar dados no ZAP.' };
  }

  const casas = json.items.map((item) => mapZapItemToCasa(item, cidade, estado));
  const byCondo = new Map<
    string,
    { qtd: number; somaPreco: number; somaM2: number; qtdComPreco: number; qtdComM2: number }
  >();

  for (const casa of casas) {
    const nome = (casa.condominio || '').trim();
    if (!nome) continue;
    let agg = byCondo.get(nome);
    if (!agg) {
      agg = { qtd: 0, somaPreco: 0, somaM2: 0, qtdComPreco: 0, qtdComM2: 0 };
      byCondo.set(nome, agg);
    }
    agg.qtd += 1;
    if (casa.preco != null) {
      agg.somaPreco += casa.preco;
      agg.qtdComPreco += 1;
    }
    if (casa.area_casa_m2 != null) {
      agg.somaM2 += casa.area_casa_m2;
      agg.qtdComM2 += 1;
    }
  }

  console.log('[Etapa2] condomínios agregados:', byCondo.size);

  // Limpa registros anteriores deste processo para manter lista consistente
  const { error: delErrChecklist } = await supabase
    .from('checklist_condominios')
    .delete()
    .eq('processo_id', processoId);
  if (delErrChecklist) {
    console.log('[Etapa2] Erro ao limpar checklist_condominios:', delErrChecklist.message);
  }
  const { error: delErrCond } = await supabase
    .from('condominios_etapa2')
    .delete()
    .eq('processo_id', processoId);
  if (delErrCond) {
    console.log('[Etapa2] Erro ao limpar condominios_etapa2:', delErrCond.message);
  }

  if (byCondo.size === 0) {
    return {
      ok: false,
      error: 'Nenhum condomínio encontrado na ZAP para esta cidade (casas acima de 5 MM).',
    };
  }

  const rows = Array.from(byCondo.entries()).map(([nome, agg]) => ({
    processo_id: processoId,
    nome,
    qtd_casas: agg.qtd,
    preco_medio: agg.qtdComPreco > 0 ? agg.somaPreco / agg.qtdComPreco : null,
    m2_medio: agg.qtdComM2 > 0 ? agg.somaM2 / agg.qtdComM2 : null,
  }));

  const { error } = await supabase.from('condominios_etapa2').insert(rows);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

export async function saveChecklistCondominio(
  processoId: string,
  condominioId: string,
  input: ChecklistCondominioInput,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const payload: Record<string, unknown> = { processo_id: processoId, condominio_id: condominioId };
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) payload[key] = value;
  }

  const { data: existing, error: selErr } = await supabase
    .from('checklist_condominios')
    .select('id')
    .eq('processo_id', processoId)
    .eq('condominio_id', condominioId)
    .maybeSingle();
  if (selErr) return { ok: false, error: selErr.message };

  if (existing?.id) {
    const { error } = await supabase
      .from('checklist_condominios')
      .update(payload)
      .eq('id', existing.id as string);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from('checklist_condominios').insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function saveEtapa2(
  processoId: string,
  data: { concluida?: boolean },
): Promise<SaveEtapa1Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const { data: row } = await supabase
    .from('etapa_progresso')
    .select('iniciada_em')
    .eq('processo_id', processoId)
    .eq('etapa_id', 2)
    .eq('user_id', user.id)
    .single();

  const updates: Record<string, unknown> = {
    status: data.concluida ? 'concluida' : 'em_andamento',
    updated_at: new Date().toISOString(),
  };
  if (data.concluida) updates.concluida_em = new Date().toISOString();
  if (!row?.iniciada_em) updates.iniciada_em = new Date().toISOString();

  const { error } = await supabase
    .from('etapa_progresso')
    .update(updates)
    .eq('processo_id', processoId)
    .eq('etapa_id', 2)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  if (data.concluida) {
    await supabase
      .from('processo_step_one')
      .update({ etapa_atual: 3, updated_at: new Date().toISOString() })
      .eq('id', processoId)
      .eq('user_id', user.id);
  }
  return { ok: true };
}

// --- Etapa 3: Tabela resumo e conclusão ---
export type ResumoCondominioRow = {
  estoque_casas?: string;
  ticket_lote?: string;
  ticket_casas?: string;
  ticket_casas_m2?: string;
  estimativa_vendidas_ano?: string;
};
export type ConclusaoEtapa3 = {
  mais_promissores?: string;
  faixa_preco?: string;
  produto_mais_vende?: string;
  erros?: string;
  oportunidade?: string;
};

export async function saveEtapa3(
  processoId: string,
  data: {
    resumo_condominios?: Record<string, ResumoCondominioRow>;
    conclusao?: ConclusaoEtapa3;
    concluida?: boolean;
  },
): Promise<SaveEtapa1Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const { data: row } = await supabase
    .from('etapa_progresso')
    .select('iniciada_em, dados_json')
    .eq('processo_id', processoId)
    .eq('etapa_id', 3)
    .eq('user_id', user.id)
    .single();

  const currentJson = (row?.dados_json as Record<string, unknown> | null) ?? {};
  const updates: Record<string, unknown> = {
    status: data.concluida ? 'concluida' : 'em_andamento',
    updated_at: new Date().toISOString(),
  };
  if (data.resumo_condominios !== undefined || data.conclusao !== undefined) {
    updates.dados_json = {
      ...currentJson,
      ...(data.resumo_condominios !== undefined && { resumo_condominios: data.resumo_condominios }),
      ...(data.conclusao !== undefined && { conclusao: data.conclusao }),
    };
  }
  if (data.concluida) updates.concluida_em = new Date().toISOString();
  if (!row?.iniciada_em) updates.iniciada_em = new Date().toISOString();

  const { error } = await supabase
    .from('etapa_progresso')
    .update(updates)
    .eq('processo_id', processoId)
    .eq('etapa_id', 3)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  if (data.concluida) {
    await supabase
      .from('processo_step_one')
      .update({ etapa_atual: 4, updated_at: new Date().toISOString() })
      .eq('id', processoId)
      .eq('user_id', user.id);
  }
  return { ok: true };
}

// --- Sprint 4: Etapa 4 (lotes), 5 (casas), 7 (lote escolhido) ---

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function addCasaListing(
  processoId: string,
  data: {
    cidade?: string;
    estado?: string;
    status?: 'a_venda' | 'despublicado';
    condominio?: string;
    localizacao_condominio?: string;
    area_lote_m2?: number;
    area_casa_m2?: number;
    quartos?: number;
    suites?: number;
    banheiros?: number;
    vagas?: number;
    piscina?: boolean;
    marcenaria?: boolean;
    preco?: number;
    preco_m2?: number;
    compatibilidade_moni?: string;
    data_coleta?: string;
    link?: string;
  },
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };
  const { error } = await supabase.from('listings_casas').insert({
    processo_id: processoId,
    manual: true,
    cidade: data.cidade || null,
    estado: data.estado || null,
    status: data.status ?? 'a_venda',
    condominio: data.condominio || null,
    localizacao_condominio: data.localizacao_condominio || null,
    area_lote_m2: data.area_lote_m2 ?? null,
    area_casa_m2: data.area_casa_m2 ?? null,
    quartos: data.quartos ?? null,
    suites: data.suites ?? null,
    banheiros: data.banheiros ?? null,
    vagas: data.vagas ?? null,
    piscina: data.piscina ?? false,
    marcenaria: data.marcenaria ?? false,
    preco: data.preco ?? null,
    preco_m2: data.preco_m2 ?? null,
    compatibilidade_moni: data.compatibilidade_moni || null,
    data_coleta: data.data_coleta || null,
    link: data.link || null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type RunZapEtapa4Result =
  | { ok: true; inserted: number; updated: number; despublicados: number }
  | { ok: false; error: string };

/**
 * Aplica atualização ZAP na listagem de casas (upsert por link + marcar como despublicado os que não vêm na resposta).
 * Usada pelo front (saveZapItemsEtapa4) e pelo cron de atualização mensal. Não altera registros manuais.
 */
export async function applyZapCasasUpdate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  processoId: string,
  items: ZapListingItem[],
  cidade: string,
  estado: string,
): Promise<{ inserted: number; updated: number; despublicados: number }> {
  const cidadeNorm = cidade.trim();
  const estadoNorm = estado.trim().slice(0, 2).toUpperCase();
  const rows = (items ?? [])
    .filter((i) => i?.url)
    .map((i) => mapZapItemToCasa(i as ZapListingItem, cidadeNorm, estadoNorm))
    .filter((r) => r.link);

  const linksFromZap = new Set(rows.map((r) => r.link as string));

  const { data: existing } = await supabase
    .from('listings_casas')
    .select('id, link, manual')
    .eq('processo_id', processoId);

  let despublicados = 0;
  const now = new Date().toISOString().slice(0, 10);
  for (const row of existing ?? []) {
    if (row.manual) continue;
    const link = row.link as string | null;
    if (!link || linksFromZap.has(link)) continue;
    const { error: upErr } = await supabase
      .from('listings_casas')
      .update({ status: 'despublicado', data_despublicado: now })
      .eq('id', row.id);
    if (!upErr) despublicados++;
  }

  const existingByLink = new Map<string | null, { id: string }>();
  for (const row of existing ?? []) {
    if (row.manual) continue;
    if (row.link) existingByLink.set(row.link, { id: row.id });
  }

  let inserted = 0;
  let updated = 0;
  for (const r of rows) {
    const payload = {
      processo_id: processoId,
      manual: false,
      cidade: r.cidade,
      estado: r.estado,
      status: 'a_venda' as const,
      condominio: r.condominio,
      localizacao_condominio: r.localizacao_condominio,
      quartos: r.quartos,
      banheiros: r.banheiros,
      vagas: r.vagas,
      piscina: r.piscina,
      marcenaria: r.marcenaria,
      preco: r.preco,
      area_casa_m2: r.area_casa_m2,
      preco_m2: r.preco_m2,
      link: r.link,
      foto_url: r.foto_url,
      data_publicacao: r.data_publicacao,
    };
    const existingRow = r.link ? existingByLink.get(r.link) : null;
    if (existingRow) {
      const { error: upErr } = await supabase
        .from('listings_casas')
        .update({ ...payload, data_despublicado: null })
        .eq('id', existingRow.id);
      if (!upErr) updated++;
    } else {
      const { error: insErr } = await supabase.from('listings_casas').insert(payload);
      if (!insErr) inserted++;
    }
  }

  return { inserted, updated, despublicados };
}

/**
 * Persiste os itens retornados pela API /api/apify-zap.
 * - Itens já existentes (por link) são atualizados; novos são inseridos. Registros manuais não são alterados.
 * - Itens que estavam no processo e não vêm mais na ZAP são marcados como despublicado (não removidos).
 */
export async function saveZapItemsEtapa4(
  processoId: string,
  items: ZapListingItem[],
  cidade: string,
  estado: string,
): Promise<RunZapEtapa4Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const { data: processo } = await supabase
    .from('processo_step_one')
    .select('id')
    .eq('id', processoId)
    .eq('user_id', user.id)
    .single();
  if (!processo) return { ok: false, error: 'Processo não encontrado.' };

  const { inserted, updated, despublicados } = await applyZapCasasUpdate(
    supabase,
    processoId,
    items,
    cidade,
    estado,
  );
  return { ok: true, inserted, updated, despublicados };
}

export async function updateCasaCompatibilidadeMoni(
  casaId: string,
  compatibilidade_moni: string | null,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };
  const { error } = await supabase
    .from('listings_casas')
    .update({ compatibilidade_moni: compatibilidade_moni || null })
    .eq('id', casaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Atualiza apenas o status de uma casa (uso: casas manuais — só o status é editável). */
export async function updateCasaStatus(
  casaId: string,
  status: 'a_venda' | 'despublicado',
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from('listings_casas')
    .update({
      status,
      data_despublicado: status === 'despublicado' ? today : null,
    })
    .eq('id', casaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Marca que o franqueado validou o status das casas manuais hoje (dispensa alerta mensal). */
export async function validarStatusCasasManuais(processoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from('processo_step_one')
    .update({ ultima_validacao_casas_manuais_em: today })
    .eq('id', processoId)
    .eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type ZapLoteItem = {
  condominio?: string;
  area_lote_m2?: number;
  preco?: number;
  preco_m2?: number;
  link?: string;
  valor_condominio?: number;
  iptu?: number;
  caracteristicas_condominio?: string;
  caracteristicas?: string | null;
};

export type RunZapEtapa5Result = { ok: true; inserted: number } | { ok: false; error: string };

/**
 * Persiste os itens retornados pela API /api/apify-zap-lotes: deleta todos os lotes do processo e insere os novos (etapa 4 - listagem de lotes).
 */
export async function saveZapItemsEtapa5(
  processoId: string,
  items: ZapLoteItem[],
): Promise<RunZapEtapa5Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const { data: processo } = await supabase
    .from('processo_step_one')
    .select('id')
    .eq('id', processoId)
    .eq('user_id', user.id)
    .single();
  if (!processo) return { ok: false, error: 'Processo não encontrado.' };

  const { error: deleteError } = await supabase
    .from('listings_lotes')
    .delete()
    .eq('processo_id', processoId);

  if (deleteError) return { ok: false, error: deleteError.message };

  if (items.length === 0) {
    return { ok: true, inserted: 0 };
  }

  const payloads = items.map((i) => ({
    processo_id: processoId,
    condominio: i.condominio ?? null,
    area_lote_m2: i.area_lote_m2 ?? null,
    preco: i.preco ?? null,
    preco_m2: i.preco_m2 ?? null,
    link: i.link ?? null,
    valor_condominio: i.valor_condominio ?? null,
    iptu: i.iptu ?? null,
    caracteristicas_condominio: i.caracteristicas_condominio ?? null,
    caracteristicas: i.caracteristicas ?? null,
    manual: false,
  }));

  const { error: insertError } = await supabase.from('listings_lotes').insert(payloads);

  if (insertError) return { ok: false, error: insertError.message };

  return { ok: true, inserted: payloads.length };
}

export async function addLoteListing(
  processoId: string,
  data: {
    condominio?: string;
    area_lote_m2?: number;
    preco?: number;
    link?: string;
    valor_condominio?: number;
    iptu?: number;
    caracteristicas_condominio?: string;
  },
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };
  const { error } = await supabase.from('listings_lotes').insert({
    processo_id: processoId,
    condominio: data.condominio || null,
    area_lote_m2: data.area_lote_m2 ?? null,
    preco: data.preco ?? null,
    link: data.link || null,
    valor_condominio: data.valor_condominio ?? null,
    iptu: data.iptu ?? null,
    caracteristicas_condominio: data.caracteristicas_condominio ?? null,
    manual: true,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type CasaEscolhidaEtapa5 = {
  id: string;
  catalogo_casa_id: string;
};

export type BatalhaCasaRow = {
  casa_escolhida_id: string;
  listing_id: string;
  nota_preco: number;
  nota_produto: number;
  nota_localizacao: number;
  nota_final: number;
  /** Respostas SIM/NÃO dos atributos do lote (nota_localizacao = soma dos scores) */
  atributos_lote_json?: Record<string, boolean> | null;
  preco_dados_json?: Record<string, unknown> | null;
  produto_dados_json?: Record<string, unknown> | null;
};

/** Salva até 3 casas do catálogo Moní escolhidas para batalha na Etapa 5 (limpa escolhas e batalhas anteriores). */
export async function saveCasasEscolhidasEtapa5(
  processoId: string,
  catalogoCasaIds: string[],
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const ids = Array.from(new Set(catalogoCasaIds)).filter(Boolean);
  if (ids.length === 0) {
    return { ok: false, error: 'Selecione pelo menos uma casa do catálogo.' };
  }
  if (ids.length > 3) {
    return { ok: false, error: 'Selecione no máximo 3 casas do catálogo para a batalha.' };
  }

  const { error: delEscolhidas } = await supabase
    .from('casas_escolhidas_etapa5')
    .delete()
    .eq('processo_id', processoId);
  if (delEscolhidas) return { ok: false, error: delEscolhidas.message };

  const inserts = ids.map((catalogo_casa_id) => ({
    processo_id: processoId,
    catalogo_casa_id,
  }));
  const { error: insEscolhidas } = await supabase.from('casas_escolhidas_etapa5').insert(inserts);
  if (insEscolhidas) return { ok: false, error: insEscolhidas.message };

  const { error: delBatalhas } = await supabase
    .from('batalha_casas')
    .delete()
    .eq('processo_id', processoId);
  if (delBatalhas) return { ok: false, error: delBatalhas.message };

  return { ok: true };
}

/** Salva as notas de batalha da Etapa 5 (substitui todas as linhas anteriores do processo). */
export async function saveBatalhaCasasEtapa5(
  processoId: string,
  rows: BatalhaCasaRow[],
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const cleaned = rows.filter(
    (r) =>
      r.atributos_lote_json != null ||
      r.preco_dados_json != null ||
      r.produto_dados_json != null ||
      Number.isFinite(r.nota_localizacao),
  );
  if (cleaned.length === 0) {
    return {
      ok: false,
      error:
        'Preencha pelo menos um critério (Atributos do Lote, Preço ou Produto) antes de salvar a batalha.',
    };
  }

  const { error: del } = await supabase
    .from('batalha_casas')
    .delete()
    .eq('processo_id', processoId);
  if (del) return { ok: false, error: del.message };

  const payloads = cleaned.map((r) => ({
    processo_id: processoId,
    casa_escolhida_id: r.casa_escolhida_id,
    listing_id: r.listing_id,
    nota_preco: r.nota_preco,
    nota_produto: r.nota_produto,
    nota_localizacao: r.nota_localizacao,
    nota_final: r.nota_final,
    ...(r.atributos_lote_json !== undefined && { atributos_lote_json: r.atributos_lote_json }),
    ...(r.preco_dados_json !== undefined && { preco_dados_json: r.preco_dados_json }),
    ...(r.produto_dados_json !== undefined && { produto_dados_json: r.produto_dados_json }),
  }));

  const { error: ins } = await supabase.from('batalha_casas').insert(payloads);
  if (ins) return { ok: false, error: ins.message };

  return { ok: true };
}

/** Armazena a URL do PDF Score & Batalha na etapa 6 (Listagem, modelo e batalha). */
export async function saveScoreBatalhaPdfUrl(
  processoId: string,
  pdfUrl: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const { data: row } = await supabase
    .from('etapa_progresso')
    .select('id, dados_json')
    .eq('processo_id', processoId)
    .eq('etapa_id', 6)
    .eq('user_id', user.id)
    .maybeSingle();

  const currentJson = (row?.dados_json as Record<string, unknown> | null) ?? {};
  const newJson = { ...currentJson, pdf_url: pdfUrl, pdf_created_at: new Date().toISOString() };

  if (row) {
    const { error } = await supabase
      .from('etapa_progresso')
      .update({ dados_json: newJson, updated_at: new Date().toISOString() })
      .eq('processo_id', processoId)
      .eq('etapa_id', 6)
      .eq('user_id', user.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from('etapa_progresso').insert({
      processo_id: processoId,
      etapa_id: 6,
      user_id: user.id,
      status: 'em_andamento',
      iniciada_em: new Date().toISOString(),
      dados_json: newJson,
    });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Exclui um lote apenas se for manual (lotes da ZAP não podem ser alterados). */
export async function deleteLoteListing(processoId: string, loteId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };
  const { data: row } = await supabase
    .from('listings_lotes')
    .select('id, manual')
    .eq('id', loteId)
    .eq('processo_id', processoId)
    .single();
  if (!row) return { ok: false, error: 'Lote não encontrado.' };
  if (row.manual !== true)
    return { ok: false, error: 'Só é possível excluir lotes adicionados manualmente.' };
  const { error } = await supabase
    .from('listings_lotes')
    .delete()
    .eq('id', loteId)
    .eq('processo_id', processoId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Etapa 4: define o lote escolhido (1 por processo) na listagem de lotes. */
export async function saveLoteEscolhidoEtapa4(
  processoId: string,
  listingLoteId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };
  const { data: existing } = await supabase
    .from('lote_escolhido')
    .select('id')
    .eq('processo_id', processoId)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from('lote_escolhido')
      .update({ listing_lote_id: listingLoteId, updated_at: new Date().toISOString() })
      .eq('processo_id', processoId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from('lote_escolhido').insert({
      processo_id: processoId,
      listing_lote_id: listingLoteId,
    });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function saveLoteEscolhido(
  processoId: string,
  data: {
    cidade?: string;
    condominio?: string;
    recuos_permitidos?: string;
    localizacao_condominio?: string;
    area_lote_m2?: number;
    topografia?: string;
    frente_m?: number;
    fundo_m?: number;
    preco?: number;
    preco_m2?: number;
  },
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };
  const { data: existing } = await supabase
    .from('lote_escolhido')
    .select('listing_lote_id')
    .eq('processo_id', processoId)
    .maybeSingle();
  const row = {
    processo_id: processoId,
    cidade: data.cidade || null,
    condominio: data.condominio || null,
    recuos_permitidos: data.recuos_permitidos || null,
    localizacao_condominio: data.localizacao_condominio || null,
    area_lote_m2: data.area_lote_m2 ?? null,
    topografia: data.topografia || null,
    frente_m: data.frente_m ?? null,
    fundo_m: data.fundo_m ?? null,
    preco: data.preco ?? null,
    preco_m2: data.preco_m2 ?? null,
    ...(existing?.listing_lote_id != null && { listing_lote_id: existing.listing_lote_id }),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('lote_escolhido').upsert(row, {
    onConflict: 'processo_id',
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// --- Etapa 8: Batalhas ---
export async function saveBatalha(
  processoId: string,
  listingCasaId: string,
  catalogoCasaId: string,
  data: { nota_preco?: number; nota_produto?: number; nota_localizacao?: number },
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };
  const row = {
    processo_id: processoId,
    listing_casa_id: listingCasaId,
    catalogo_casa_id: catalogoCasaId,
    nota_preco: data.nota_preco ?? null,
    nota_produto: data.nota_produto ?? null,
    nota_localizacao: data.nota_localizacao ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('batalhas').upsert(row, {
    onConflict: 'processo_id,listing_casa_id,catalogo_casa_id',
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// --- Escolher 3 modelos do catálogo Moní (batalham com todas as casas ZAP e usados no BCA) ---
export async function saveCatalogoEscolhidos(
  processoId: string,
  catalogoCasaIds: [string, string, string],
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };
  const uniq = [...new Set(catalogoCasaIds)];
  if (uniq.length !== 3)
    return { ok: false, error: 'Selecione exatamente 3 modelos do catálogo diferentes.' };

  await supabase.from('catalogo_escolhidos').delete().eq('processo_id', processoId);
  const { error } = await supabase.from('catalogo_escolhidos').insert([
    { processo_id: processoId, catalogo_casa_id: catalogoCasaIds[0], ordem: 1 },
    { processo_id: processoId, catalogo_casa_id: catalogoCasaIds[1], ordem: 2 },
    { processo_id: processoId, catalogo_casa_id: catalogoCasaIds[2], ordem: 3 },
  ]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// --- Etapa 5: Justificativas do ranking final (por modelo) ---
export async function saveEtapa5JustificativasRanking(
  processoId: string,
  justificativasPorModelo: Record<string, string>,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const { data: row } = await supabase
    .from('etapa_progresso')
    .select('id, iniciada_em, dados_json')
    .eq('processo_id', processoId)
    .eq('etapa_id', 5)
    .eq('user_id', user.id)
    .maybeSingle();

  const currentJson = (row?.dados_json as Record<string, unknown> | null) ?? {};
  const newJson = { ...currentJson, justificativas_ranking: justificativasPorModelo };

  if (row) {
    const { error } = await supabase
      .from('etapa_progresso')
      .update({
        dados_json: newJson,
        updated_at: new Date().toISOString(),
        ...(!row.iniciada_em && { iniciada_em: new Date().toISOString(), status: 'em_andamento' }),
      })
      .eq('processo_id', processoId)
      .eq('etapa_id', 5)
      .eq('user_id', user.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from('etapa_progresso').insert({
      processo_id: processoId,
      etapa_id: 5,
      user_id: user.id,
      status: 'em_andamento',
      iniciada_em: new Date().toISOString(),
      dados_json: newJson,
    });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

// --- Etapa 9: Ranking do catálogo ---
export async function saveEtapa9(
  processoId: string,
  data: { justificativas?: Record<string, string>; concluida?: boolean },
): Promise<SaveEtapa1Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const { data: row } = await supabase
    .from('etapa_progresso')
    .select('iniciada_em, dados_json')
    .eq('processo_id', processoId)
    .eq('etapa_id', 9)
    .eq('user_id', user.id)
    .single();

  const currentJson = (row?.dados_json as Record<string, unknown> | null) ?? {};
  const updates: Record<string, unknown> = {
    status: data.concluida ? 'concluida' : 'em_andamento',
    updated_at: new Date().toISOString(),
  };
  if (data.justificativas !== undefined)
    updates.dados_json = { ...currentJson, justificativas: data.justificativas };
  if (data.concluida) updates.concluida_em = new Date().toISOString();
  if (!row?.iniciada_em) updates.iniciada_em = new Date().toISOString();

  const { error } = await supabase
    .from('etapa_progresso')
    .update(updates)
    .eq('processo_id', processoId)
    .eq('etapa_id', 9)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  if (data.concluida) {
    await supabase
      .from('processo_step_one')
      .update({ etapa_atual: 10, updated_at: new Date().toISOString() })
      .eq('id', processoId)
      .eq('user_id', user.id);
  }
  return { ok: true };
}

// --- Etapa 10: BCA (3 opções) ---
export type BcaOpcao = { catalogo_casa_id: string; titulo: string; descricao?: string };
export async function saveEtapa10(
  processoId: string,
  data: { opcoes?: BcaOpcao[]; concluida?: boolean },
): Promise<SaveEtapa1Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const { data: row } = await supabase
    .from('etapa_progresso')
    .select('iniciada_em, dados_json')
    .eq('processo_id', processoId)
    .eq('etapa_id', 10)
    .eq('user_id', user.id)
    .single();

  const currentJson = (row?.dados_json as Record<string, unknown> | null) ?? {};
  const updates: Record<string, unknown> = {
    status: data.concluida ? 'concluida' : 'em_andamento',
    updated_at: new Date().toISOString(),
  };
  if (data.opcoes !== undefined) updates.dados_json = { ...currentJson, opcoes: data.opcoes };
  if (data.concluida) updates.concluida_em = new Date().toISOString();
  if (!row?.iniciada_em) updates.iniciada_em = new Date().toISOString();

  const { error } = await supabase
    .from('etapa_progresso')
    .update(updates)
    .eq('processo_id', processoId)
    .eq('etapa_id', 10)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  if (data.concluida) {
    await supabase
      .from('processo_step_one')
      .update({ etapa_atual: 11, updated_at: new Date().toISOString() })
      .eq('id', processoId)
      .eq('user_id', user.id);
  }
  return { ok: true };
}

// --- BCA inputs (tabela bca_inputs; obra_mes8 e vgv_planta não são salvos) ---
export async function getBcaInputs(processoId: string): Promise<Partial<BcaInputs> | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('bca_inputs')
    .select('*')
    .eq('processo_id', processoId)
    .maybeSingle();
  if (error) return null;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const out: Partial<BcaInputs> = {};
  const keys: (keyof BcaInputs)[] = [
    'nome_condominio',
    'nome_casa',
    'area_vendas_m2',
    'custo_terreno',
    'itbi_percentual',
    'custo_casa',
    'mes_inicio_obra',
    'obra_mes1',
    'obra_mes2',
    'obra_mes3',
    'obra_mes4',
    'obra_mes5',
    'obra_mes6',
    'obra_mes7',
    'obra_mes9',
    'obra_mes10',
    'comissao_vendas',
    'impostos',
    'taxa_plataforma',
    'taxa_gestao_frank',
    'projetos_taxa_obra',
    'capital_giro_inicial',
    'vgv_target',
    'vgv_liquidacao',
    'vgv_recompra',
    'permuta_planta',
    'permuta_target',
    'permuta_liquidacao',
    'permuta_recompra',
    'percentual_funding',
    'cdi_an',
  ];
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null)
      (out as Record<string, unknown>)[k] = Number(row[k]) === row[k] ? Number(row[k]) : row[k];
  }
  return out;
}

export async function saveBcaInputs(
  processoId: string,
  inputs: Partial<BcaInputs>,
): Promise<SaveEtapa1Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const row: Record<string, unknown> = {
    processo_id: processoId,
    updated_at: new Date().toISOString(),
  };
  const keys: (keyof BcaInputs)[] = [
    'nome_condominio',
    'nome_casa',
    'area_vendas_m2',
    'custo_terreno',
    'itbi_percentual',
    'custo_casa',
    'mes_inicio_obra',
    'obra_mes1',
    'obra_mes2',
    'obra_mes3',
    'obra_mes4',
    'obra_mes5',
    'obra_mes6',
    'obra_mes7',
    'obra_mes9',
    'obra_mes10',
    'comissao_vendas',
    'impostos',
    'taxa_plataforma',
    'taxa_gestao_frank',
    'projetos_taxa_obra',
    'capital_giro_inicial',
    'vgv_target',
    'vgv_liquidacao',
    'vgv_recompra',
    'permuta_planta',
    'permuta_target',
    'permuta_liquidacao',
    'permuta_recompra',
    'percentual_funding',
    'cdi_an',
  ];
  for (const k of keys) {
    if (inputs[k] !== undefined) row[k] = inputs[k];
  }

  const { error } = await supabase.from('bca_inputs').upsert(row, {
    onConflict: 'processo_id',
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// --- Etapa 11: PDF de hipóteses ---
export async function saveEtapa11(
  processoId: string,
  data: { concluida?: boolean },
): Promise<SaveEtapa1Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const { data: row } = await supabase
    .from('etapa_progresso')
    .select('iniciada_em')
    .eq('processo_id', processoId)
    .eq('etapa_id', 11)
    .eq('user_id', user.id)
    .single();

  const updates: Record<string, unknown> = {
    status: data.concluida ? 'concluida' : 'em_andamento',
    updated_at: new Date().toISOString(),
  };
  if (data.concluida) updates.concluida_em = new Date().toISOString();
  if (!row?.iniciada_em) updates.iniciada_em = new Date().toISOString();

  const { error } = await supabase
    .from('etapa_progresso')
    .update(updates)
    .eq('processo_id', processoId)
    .eq('etapa_id', 11)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Marca o processo Step 1 como concluído (finalizado). Só estudos finalizados podem ser usados no Step 2. */
export async function finalizarEstudoStep1(processoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login para finalizar.' };

  const { error } = await supabase
    .from('processo_step_one')
    .update({ status: 'concluido', updated_at: new Date().toISOString() })
    .eq('id', processoId)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Cancela o processo (a partir do Step 2). Só o dono pode cancelar. */
export async function cancelarProcesso(processoId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const { data: row } = await supabase
    .from('processo_step_one')
    .select('id, user_id, step_atual, status, cancelado_em')
    .eq('id', processoId)
    .single();

  if (!row || row.user_id !== user.id) return { ok: false, error: 'Processo não encontrado.' };
  const stepAtual = (row as { step_atual?: number }).step_atual ?? 1;
  if (stepAtual < 2)
    return { ok: false, error: 'Cancelamento permitido apenas a partir do Step 2.' };
  if ((row as { cancelado_em?: string }).cancelado_em)
    return { ok: false, error: 'Processo já está cancelado.' };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('processo_step_one')
    .update({ status: 'cancelado', cancelado_em: now, updated_at: now })
    .eq('id', processoId)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Avançar para o próximo Step (ex.: ao concluir última etapa do Step 2, ir para Step 3). */
export async function avancarParaProximoStep(
  processoId: string,
  proximoStep: number,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const { error } = await supabase
    .from('processo_step_one')
    .update({
      step_atual: proximoStep,
      updated_at: new Date().toISOString(),
    })
    .eq('id', processoId)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export async function registerPdfExport(
  processoId: string,
  payload: { hipotese?: string; modelo_escolhido?: string },
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const now = new Date().toISOString();
  const payloadStr = `${processoId}|${user.id}|${now}|${payload.hipotese ?? ''}|${payload.modelo_escolhido ?? ''}`;
  const file_hash = sha256Hex(payloadStr);

  const { error } = await supabase.from('pdf_exports').insert({
    user_id: user.id,
    processo_id: processoId,
    hipotese: payload.hipotese ?? 'Hipótese Step One',
    modelo_escolhido: payload.modelo_escolhido ?? null,
    file_hash,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
