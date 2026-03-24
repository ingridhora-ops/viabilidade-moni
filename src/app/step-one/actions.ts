'use server';

import { createClient } from '@/lib/supabase/server';
import { STEP2_EM_CASA_CHECKLIST } from '@/lib/painel-step2-em-casa-checklist';
import { createAdminClient } from '@/lib/supabase/admin';
import { getNextFKFromRedeFranqueados } from '@/lib/next-fk-franquia';
import { allocNextOrdemColunaPainel } from '@/lib/painel-coluna-ordem';

const STEP2_NOVO_NEGOCIO_ESTUDOS_DOCS_TITULOS = [
  'BCA',
  'Carta Proposta',
  'Mapa de Competidores + Batalha de Casas',
  'Gadgets',
  'Fotos do Terreno',
  'Fotos do Condomínio',
] as const;

export type CreateProcessoResult = { ok: true; id: string } | { ok: false; error: string };

export type EtapaPainelInicial = 'step_1' | 'step_2';

export type DadosNovoCard = {
  nomeFranqueado?: string | null;
  emailFranqueado?: string | null;
  nomeCondominio?: string | null;
  quadraLote?: string | null;
  tipoNegociacaoTerreno?: string | null;
  valorTerreno?: string | null;
  vgvPretendido?: string | null;
  produtoModeloCasa?: string | null;
  linkPastaDrive?: string | null;
  observacoes?: string | null;
};

/** Dados do formulário Novo Step 1 (Nº franquia, Modalidade, Responsável, Sócios, área de atuação, endereço casa, etc.). */
export type DadosNovoStep1 = {
  numeroFranquia?: string | null;
  modalidade?: string | null;
  nomeCompletoFranqueado?: string | null;
  /** "Em Operação" | "Operação Encerrada" */
  statusFranquia?: string | null;
  /** "Beta" | "Pagante" */
  classificacaoFranqueado?: string | null;
  /** Área de atuação: múltiplos "UF - Cidade" separados por "; " (ex.: "SP - São Paulo; RJ - Rio de Janeiro"). */
  areaAtuacaoFranquia?: string | null;
  emailFrank?: string | null;
  responsavelComercial?: string | null;
  tamanhoCamisetaFrank?: string | null;
  socios?: string | null;
  observacoes?: string | null;
  /** Endereço da casa do franqueado. */
  enderecoCasaRuaFrank?: string | null;
  enderecoCasaNumeroFrank?: string | null;
  enderecoCasaComplementoFrank?: string | null;
  cepCasaFrank?: string | null;
  estadoCasaFrank?: string | null;
  cidadeCasaFrank?: string | null;
  /** Datas e contato (formato data: YYYY-MM-DD). */
  dataAssCof?: string | null;
  dataAssContrato?: string | null;
  dataExpiracaoFranquia?: string | null;
  telefoneFrank?: string | null;
  cpfFrank?: string | null;
  dataNascFrank?: string | null;
};

export async function createProcesso(
  cidade: string,
  estado: string,
  tipoAquisicaoTerreno?: string | null,
  observacoes?: string | null,
  etapaPainel?: EtapaPainelInicial,
  dadosNovoCard?: DadosNovoCard | null,
  dadosNovoStep1?: DadosNovoStep1 | null,
): Promise<CreateProcessoResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'Faça login para iniciar um processo.' };
  }

  const payload: Record<string, unknown> = {
    user_id: user.id,
    cidade: cidade.trim(),
    estado: estado.trim() || null,
    status: 'em_andamento',
    etapa_atual: 1,
    etapa_painel: etapaPainel ?? 'step_1',
  };
  const tipo = dadosNovoCard?.tipoNegociacaoTerreno ?? tipoAquisicaoTerreno;
  if (tipo != null && String(tipo).trim() !== '') {
    payload.tipo_aquisicao_terreno = String(tipo).trim();
  }
  const obs = dadosNovoCard?.observacoes ?? dadosNovoStep1?.observacoes ?? observacoes;
  if (obs != null && String(obs).trim() !== '') {
    payload.observacoes = String(obs).trim();
  }
  if (dadosNovoStep1) {
    const numeroTrim = dadosNovoStep1.numeroFranquia != null ? String(dadosNovoStep1.numeroFranquia).trim() : '';
    if (numeroTrim) {
      payload.numero_franquia = numeroTrim;
    } else {
      // Auto-preenchimento do Nº da franquia (FKxxxx) para Novo Step 1.
      try {
        const admin = createAdminClient();
        payload.numero_franquia = await getNextFKFromRedeFranqueados(admin as any);
      } catch {
        // deixa sem preencher se falhar
      }
    }
    if (dadosNovoStep1.modalidade != null && String(dadosNovoStep1.modalidade).trim() !== '') {
      payload.modalidade = String(dadosNovoStep1.modalidade).trim();
    }
    if (dadosNovoStep1.nomeCompletoFranqueado != null && String(dadosNovoStep1.nomeCompletoFranqueado).trim() !== '') {
      payload.nome_franqueado = String(dadosNovoStep1.nomeCompletoFranqueado).trim();
    }
    if (dadosNovoStep1.statusFranquia != null && String(dadosNovoStep1.statusFranquia).trim() !== '') {
      payload.status_franquia = String(dadosNovoStep1.statusFranquia).trim();
    }
    if (dadosNovoStep1.classificacaoFranqueado != null && String(dadosNovoStep1.classificacaoFranqueado).trim() !== '') {
      payload.classificacao_franqueado = String(dadosNovoStep1.classificacaoFranqueado).trim();
    }
    if (dadosNovoStep1.areaAtuacaoFranquia != null && String(dadosNovoStep1.areaAtuacaoFranquia).trim() !== '') {
      payload.area_atuacao_franquia = String(dadosNovoStep1.areaAtuacaoFranquia).trim();
    }
    if (dadosNovoStep1.emailFrank != null && String(dadosNovoStep1.emailFrank).trim() !== '') {
      payload.email_franqueado = String(dadosNovoStep1.emailFrank).trim();
    }
    if (dadosNovoStep1.responsavelComercial != null && String(dadosNovoStep1.responsavelComercial).trim() !== '') {
      payload.responsavel_comercial = String(dadosNovoStep1.responsavelComercial).trim();
    }
    if (dadosNovoStep1.tamanhoCamisetaFrank != null && String(dadosNovoStep1.tamanhoCamisetaFrank).trim() !== '') {
      payload.tamanho_camiseta_frank = String(dadosNovoStep1.tamanhoCamisetaFrank).trim();
    }
    if (dadosNovoStep1.socios != null && String(dadosNovoStep1.socios).trim() !== '') {
      payload.socios = String(dadosNovoStep1.socios).trim();
    }
    if (dadosNovoStep1.enderecoCasaRuaFrank != null && String(dadosNovoStep1.enderecoCasaRuaFrank).trim() !== '') {
      payload.endereco_casa_frank = String(dadosNovoStep1.enderecoCasaRuaFrank).trim();
    }
    if (dadosNovoStep1.enderecoCasaNumeroFrank != null && String(dadosNovoStep1.enderecoCasaNumeroFrank).trim() !== '') {
      payload.endereco_casa_frank_numero = String(dadosNovoStep1.enderecoCasaNumeroFrank).trim();
    }
    if (dadosNovoStep1.enderecoCasaComplementoFrank != null && String(dadosNovoStep1.enderecoCasaComplementoFrank).trim() !== '') {
      payload.endereco_casa_frank_complemento = String(dadosNovoStep1.enderecoCasaComplementoFrank).trim();
    }
    if (dadosNovoStep1.cepCasaFrank != null && String(dadosNovoStep1.cepCasaFrank).trim() !== '') {
      payload.cep_casa_frank = String(dadosNovoStep1.cepCasaFrank).trim();
    }
    if (dadosNovoStep1.estadoCasaFrank != null && String(dadosNovoStep1.estadoCasaFrank).trim() !== '') {
      payload.estado_casa_frank = String(dadosNovoStep1.estadoCasaFrank).trim();
    }
    if (dadosNovoStep1.cidadeCasaFrank != null && String(dadosNovoStep1.cidadeCasaFrank).trim() !== '') {
      payload.cidade_casa_frank = String(dadosNovoStep1.cidadeCasaFrank).trim();
    }
    if (dadosNovoStep1.dataAssCof != null && String(dadosNovoStep1.dataAssCof).trim() !== '') {
      payload.data_ass_cof = String(dadosNovoStep1.dataAssCof).trim();
    }
    if (dadosNovoStep1.dataAssContrato != null && String(dadosNovoStep1.dataAssContrato).trim() !== '') {
      payload.data_ass_contrato = String(dadosNovoStep1.dataAssContrato).trim();
    }
    if (dadosNovoStep1.dataExpiracaoFranquia != null && String(dadosNovoStep1.dataExpiracaoFranquia).trim() !== '') {
      payload.data_expiracao_franquia = String(dadosNovoStep1.dataExpiracaoFranquia).trim();
    }
    if (dadosNovoStep1.telefoneFrank != null && String(dadosNovoStep1.telefoneFrank).trim() !== '') {
      payload.telefone_frank = String(dadosNovoStep1.telefoneFrank).trim();
    }
    if (dadosNovoStep1.cpfFrank != null && String(dadosNovoStep1.cpfFrank).trim() !== '') {
      payload.cpf_frank = String(dadosNovoStep1.cpfFrank).trim();
    }
    if (dadosNovoStep1.dataNascFrank != null && String(dadosNovoStep1.dataNascFrank).trim() !== '') {
      payload.data_nasc_frank = String(dadosNovoStep1.dataNascFrank).trim();
    }
  }
  if (dadosNovoCard) {
    if (dadosNovoCard.nomeFranqueado != null && String(dadosNovoCard.nomeFranqueado).trim() !== '') {
      payload.nome_franqueado = String(dadosNovoCard.nomeFranqueado).trim();
    }
    if (dadosNovoCard.emailFranqueado != null && String(dadosNovoCard.emailFranqueado).trim() !== '') {
      payload.email_franqueado = String(dadosNovoCard.emailFranqueado).trim();
    }
    if (dadosNovoCard.nomeCondominio != null && String(dadosNovoCard.nomeCondominio).trim() !== '') {
      payload.nome_condominio = String(dadosNovoCard.nomeCondominio).trim();
    }
    if (dadosNovoCard.quadraLote != null && String(dadosNovoCard.quadraLote).trim() !== '') {
      payload.quadra_lote = String(dadosNovoCard.quadraLote).trim();
    }
    if (dadosNovoCard.valorTerreno != null && String(dadosNovoCard.valorTerreno).trim() !== '') {
      payload.valor_terreno = String(dadosNovoCard.valorTerreno).trim();
    }
    if (dadosNovoCard.vgvPretendido != null && String(dadosNovoCard.vgvPretendido).trim() !== '') {
      payload.vgv_pretendido = String(dadosNovoCard.vgvPretendido).trim();
    }
    if (dadosNovoCard.produtoModeloCasa != null && String(dadosNovoCard.produtoModeloCasa).trim() !== '') {
      payload.produto_modelo_casa = String(dadosNovoCard.produtoModeloCasa).trim();
    }
    if (dadosNovoCard.linkPastaDrive != null && String(dadosNovoCard.linkPastaDrive).trim() !== '') {
      payload.link_pasta_drive = String(dadosNovoCard.linkPastaDrive).trim();
    }
  }

  const etapaPainelStr = String(payload.etapa_painel ?? 'step_1');
  payload.ordem_coluna_painel = await allocNextOrdemColunaPainel(supabase, etapaPainelStr);

  const { data: processo, error: errProcesso } = await supabase
    .from('processo_step_one')
    .insert(payload)
    .select('id')
    .single();

  if (errProcesso) {
    return { ok: false, error: errProcesso.message };
  }
  if (!processo?.id) {
    return { ok: false, error: 'Processo não foi criado.' };
  }

  const etapas = Array.from({ length: 11 }, (_, i) => ({
    user_id: user.id,
    processo_id: processo.id,
    etapa_id: i + 1,
    status: 'nao_iniciada' as const,
    tentativas: 0,
  }));

  const { error: errEtapas } = await supabase.from('etapa_progresso').insert(etapas);

  if (errEtapas) {
    return { ok: false, error: errEtapas.message };
  }

  // Seed do checklist "Em Casa" na etapa Step 2 (Novo Negócio).
  if (String(payload.etapa_painel) === 'step_2') {
    const { data: existing } = await supabase
      .from('processo_card_checklist')
      .select('titulo, ordem')
      .eq('processo_id', processo.id)
      .eq('etapa_painel', 'step_2');

    const existingTitles = new Set((existing ?? []).map((r) => r.titulo));
    const maxOrdem = Math.max(...(existing ?? []).map((r) => (typeof r.ordem === 'number' ? r.ordem : 0)), 0);
    const missing = STEP2_EM_CASA_CHECKLIST.filter((it) => !existingTitles.has(it.titulo));

    if (missing.length > 0) {
      const rows = missing.map((it, idx) => ({
        processo_id: processo.id,
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
      .eq('processo_id', processo.id)
      .eq('etapa_painel', 'step_2');

    const existingDocTitles = new Set((existingDocs ?? []).map((r) => r.titulo));
    const maxDocOrdem = Math.max(...(existingDocs ?? []).map((r) => (typeof r.ordem === 'number' ? r.ordem : 0)), 0);
    const missingDocs = STEP2_NOVO_NEGOCIO_ESTUDOS_DOCS_TITULOS.filter((t) => !existingDocTitles.has(t));

    if (missingDocs.length > 0) {
      const docRows = missingDocs.map((titulo, idx) => ({
        processo_id: processo.id,
        etapa_painel: 'step_2',
        titulo,
        ordem: maxDocOrdem + idx + 1,
      }));
      const { error: seedDocsErr } = await supabase.from('processo_card_documentos').insert(docRows);
      if (seedDocsErr) return { ok: false, error: seedDocsErr.message };
    }
  }

  return { ok: true, id: processo.id };
}
