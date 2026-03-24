import { PAINEL_COLUMNS, PAINEL_KANBAN_CREDITO_KEYS, type PainelColumnKey } from '@/app/steps-viabilidade/painelColumns';
import {
  ETAPAS_KANBAN_NN,
  isEtapaKanbanNovosNegocios,
  isEtapaOperacaoDashboard,
} from '@/lib/painel/dashboard-etapas';
import { ufsFromRedeFranqueado } from '@/lib/rede-area-atuacao';
import { parseMoneyText } from './parseMoney';
import { regionalPorUF } from './regioes';
import type { fetchDashboardRawData, ProcessoDashRow } from './fetchData';

type Raw = Awaited<ReturnType<typeof fetchDashboardRawData>>;
export type DashboardStatusFilter = 'ativos' | 'cancelados' | 'removidos' | 'concluidos' | 'todos';

function isRemovido(p: { removido_em?: string | null; status?: string | null }) {
  return Boolean(p.removido_em) || String(p.status ?? '').toLowerCase() === 'removido';
}

function isCancelado(p: { cancelado_em?: string | null; status?: string | null }) {
  return Boolean(p.cancelado_em) || String(p.status ?? '').toLowerCase() === 'cancelado';
}

function isConcluido(p: { status?: string | null }) {
  return String(p.status ?? '').toLowerCase() === 'concluido';
}

function vgvOf(p: { vgv_pretendido?: string | null }): number {
  return parseMoneyText(p.vgv_pretendido) ?? 0;
}

function terrenoOf(p: { valor_terreno?: string | null }): number {
  return parseMoneyText(p.valor_terreno) ?? 0;
}

function buildComiteAprovadoMap(processos: Raw['processos'], comites: Raw['comites']): Map<string, boolean> {
  const byBase = new Map<string, boolean>();
  for (const c of comites) {
    if (c.comite_resultado === 'aprovado') byBase.set(c.processo_id, true);
  }
  const out = new Map<string, boolean>();
  for (const p of processos) {
    const base = String(p.historico_base_id ?? p.id);
    out.set(p.id, Boolean(byBase.get(base)));
  }
  return out;
}

function parseDataFlex(s: string | null | undefined): Date | null {
  if (!s) return null;
  const t = String(s).trim();
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const d = new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00`);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? d : null;
}

function monthKey18(): string[] {
  const keys: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 17; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const y = x.getFullYear();
    const m = x.getMonth() + 1;
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return keys;
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const short = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${short[(m ?? 1) - 1]}/${String(y).slice(2)}`;
}

const CONTAB_ETAPAS = new Set(['contabilidade_incorporadora', 'contabilidade_spe', 'contabilidade_gestora']);
/** Subfases de `fase_contabilidade` que não entram no gráfico (só colunas de abertura / trabalho ativo nas 3 colunas do kanban). */
const CONTAB_FASE_EXCLUIR_GRAFICO = new Set(['em_andamento', 'encerrado']);
/** Subfase `fase_credito` que não entra no gráfico (encerrado não é coluna do kanban). */
const CRED_FASE_EXCLUIR_GRAFICO = new Set(['encerrado']);
const ETAPAS_POS_STEP7: ReadonlySet<string> = new Set([
  'passagem_wayser',
  'planialtimetrico',
  'sondagem',
  'projeto_legal',
  'aprovacao_condominio',
  'aprovacao_prefeitura',
  'revisao_bca',
  'processos_cartorarios',
  'aguardando_credito',
  'em_obra',
  'moni_care',
]);

type BuildDashboardOptions = {
  statusFilter?: DashboardStatusFilter;
};

export function buildDashboardModel(raw: Raw, options?: BuildDashboardOptions) {
  const statusFilter: DashboardStatusFilter = options?.statusFilter ?? 'ativos';

  const universeBase = raw.processos.filter((p) => String(p.etapa_painel ?? '') !== 'step_1');
  const universe = universeBase.filter((p) => {
    if (statusFilter === 'ativos') return !isCancelado(p) && !isRemovido(p) && !isConcluido(p);
    if (statusFilter === 'cancelados') return isCancelado(p);
    if (statusFilter === 'removidos') return isRemovido(p);
    if (statusFilter === 'concluidos') return isConcluido(p);
    return true;
  });
  const universeIds = new Set(universe.map((p) => p.id));
  const comiteOk = buildComiteAprovadoMap(raw.processos, raw.comites);

  const totalNegocios = universe.length;
  const cancelados = universe.filter(isCancelado);
  const canceladosN = cancelados.length;
  const pctCancel = totalNegocios ? (100 * canceladosN) / totalNegocios : 0;

  /** Cards em aberto dentro do conjunto filtrado (com “todos”, exclui cancelados/excluídos/concluídos). */
  const ativos = universe.filter((p) => !isCancelado(p) && !isRemovido(p) && !isConcluido(p));
  const vgvPipeline = ativos.reduce((s, p) => s + vgvOf(p), 0);
  const emOperacao = ativos.filter(
    (p) => isEtapaOperacaoDashboard(p.etapa_painel ?? '') && !CONTAB_ETAPAS.has(p.etapa_painel ?? ''),
  ).length;
  const pctOperacao = totalNegocios ? (100 * emOperacao) / totalNegocios : 0;

  let nnPre = 0,
    nnAprov = 0,
    nnOp = 0,
    nnCaiu = 0;
  const funnelPre: ProcessoDashRow[] = [];
  const funnelAprov: ProcessoDashRow[] = [];
  const funnelOp: ProcessoDashRow[] = [];
  const funnelCaiu: ProcessoDashRow[] = [];
  for (const p of universe) {
    const ep = p.etapa_painel ?? '';
    if (isCancelado(p)) {
      nnCaiu += 1;
      funnelCaiu.push(p);
      continue;
    }
    if (isRemovido(p) || isConcluido(p)) continue;
    if (!isEtapaKanbanNovosNegocios(ep)) continue;
    const ap = comiteOk.get(p.id) ?? false;
    if (!ap) {
      nnPre += 1;
      funnelPre.push(p);
    } else if (!isEtapaOperacaoDashboard(ep)) {
      nnAprov += 1;
      funnelAprov.push(p);
    } else {
      nnOp += 1;
      funnelOp.push(p);
    }
  }

  /** Uma barra por coluna do Kanban Novos Negócios (mesma ordem do painel), conforme o filtro de cards. */
  const nnKanbanCols = PAINEL_COLUMNS.filter(
    (c) => c.key !== 'step_1' && isEtapaKanbanNovosNegocios(c.key),
  );
  const nnBarLists: ProcessoDashRow[][] = nnKanbanCols.map((col) => {
    let list = universe.filter((p) => (p.etapa_painel ?? '') === col.key);
    if (col.key === 'credito_terreno') {
      list = list.filter((p) => (p.tipo_aquisicao_terreno ?? '') !== 'Permuta');
    }
    return list;
  });
  const nnBarCounts = nnBarLists.map((l) => l.length);
  const nnBar = {
    labels: nnKanbanCols.map((c) => c.title),
    counts: nnBarCounts,
    keys: nnKanbanCols.map((c) => c.key),
  };

  const contabKanbanCols = [
    PAINEL_COLUMNS.find((c) => c.key === 'contabilidade_incorporadora')!,
    PAINEL_COLUMNS.find((c) => c.key === 'contabilidade_spe')!,
    PAINEL_COLUMNS.find((c) => c.key === 'contabilidade_gestora')!,
  ];
  const contabLists = contabKanbanCols.map((col) =>
    universe.filter((p) => {
      if ((p.etapa_painel ?? '') !== col.key) return false;
      const fase = String(p.fase_contabilidade ?? '').trim();
      if (fase && CONTAB_FASE_EXCLUIR_GRAFICO.has(fase)) return false;
      return true;
    }),
  );
  const contabBarCounts = contabLists.map((l) => l.length);
  const contabTotal = contabBarCounts.reduce((a, b) => a + b, 0);
  const contab = {
    labels: contabKanbanCols.map((c) => c.title),
    counts: contabBarCounts,
    keys: contabKanbanCols.map((c) => c.key),
    total: contabTotal,
  };

  const credKanbanCols = PAINEL_KANBAN_CREDITO_KEYS.map((key) => PAINEL_COLUMNS.find((c) => c.key === key)!);
  const credLists = credKanbanCols.map((col) => {
    let list = universe.filter((p) => {
      if ((p.etapa_painel ?? '') !== col.key) return false;
      const fase = String(p.fase_credito ?? '').trim();
      if (fase && CRED_FASE_EXCLUIR_GRAFICO.has(fase)) return false;
      return true;
    });
    if (col.key === 'credito_terreno') {
      list = list.filter((p) => (p.tipo_aquisicao_terreno ?? '') !== 'Permuta');
    }
    return list;
  });
  const credBarCounts = credLists.map((l) => l.length);
  const credTotal = credBarCounts.reduce((a, b) => a + b, 0);
  const cred = {
    labels: credKanbanCols.map((c) => c.title),
    counts: credBarCounts,
    keys: credKanbanCols.map((c) => c.key),
    total: credTotal,
  };

  /** VGV por coluna do kanban Portfolio + Operações (mesma ordem do painel), sem Step 1; Crédito Terreno exclui Permuta. */
  const waterfallCols = PAINEL_COLUMNS.filter((c) => c.key !== 'step_1');
  const waterfallLists: ProcessoDashRow[][] = [];
  const waterfallCounts: number[] = [];
  const waterfallVgvMm: number[] = [];
  for (const col of waterfallCols) {
    let list = ativos.filter((p) => (p.etapa_painel ?? '') === col.key);
    if (col.key === 'credito_terreno') {
      list = list.filter((p) => (p.tipo_aquisicao_terreno ?? '') !== 'Permuta');
    }
    waterfallLists.push(list);
    waterfallCounts.push(list.length);
    waterfallVgvMm.push(list.reduce((s, p) => s + vgvOf(p), 0) / 1e6);
  }
  const waterfallTotalN = waterfallCounts.reduce((a, b) => a + b, 0);
  const waterfallTotalVgvMm = waterfallVgvMm.reduce((a, b) => a + b, 0);
  const waterfallUnionAll: ProcessoDashRow[] = Array.from(
    new Map(waterfallLists.flat().map((p) => [p.id, p])).values(),
  );

  const months = monthKey18();
  const seriesKeys = ['opcoes', 'comites', 'condominios', 'prefeituras', 'creditos', 'obras'] as const;
  const monthly: Record<(typeof seriesKeys)[number], Record<string, number>> = {
    opcoes: {},
    comites: {},
    condominios: {},
    prefeituras: {},
    creditos: {},
    obras: {},
  };
  for (const k of months) {
    for (const s of seriesKeys) monthly[s][k] = 0;
  }

  for (const p of universe) {
    const c = parseDataFlex(p.created_at ?? null);
    if (c) {
      const mk = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}`;
      if (monthly.opcoes[mk] !== undefined) monthly.opcoes[mk] += 1;
    }
  }
  for (const c of raw.comites) {
    if (!universeIds.has(c.processo_id)) continue;
    if (c.comite_resultado !== 'aprovado') continue;
    const d = parseDataFlex(c.updated_at ?? null);
    if (!d) continue;
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthly.comites[mk] !== undefined) monthly.comites[mk] += 1;
  }
  for (const p of universe) {
    const d1 = parseDataFlex(p.data_aprovacao_condominio ?? null);
    if (d1) {
      const mk = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}`;
      if (monthly.condominios[mk] !== undefined) monthly.condominios[mk] += 1;
    }
    const d2 = parseDataFlex(p.data_aprovacao_prefeitura ?? null);
    if (d2) {
      const mk = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}`;
      if (monthly.prefeituras[mk] !== undefined) monthly.prefeituras[mk] += 1;
    }
    const d3 = parseDataFlex(p.data_aprovacao_credito ?? null);
    if (d3) {
      const mk = `${d3.getFullYear()}-${String(d3.getMonth() + 1).padStart(2, '0')}`;
      if (monthly.creditos[mk] !== undefined) monthly.creditos[mk] += 1;
    }
    const d4 = parseDataFlex(p.data_emissao_alvara ?? null);
    if (d4) {
      const mk = `${d4.getFullYear()}-${String(d4.getMonth() + 1).padStart(2, '0')}`;
      if (monthly.obras[mk] !== undefined) monthly.obras[mk] += 1;
    }
  }

  const monthlyDrill: Record<(typeof seriesKeys)[number], ProcessoDashRow[][]> = {
    opcoes: months.map(() => []),
    comites: months.map(() => []),
    condominios: months.map(() => []),
    prefeituras: months.map(() => []),
    creditos: months.map(() => []),
    obras: months.map(() => []),
  };
  const comiteMonthSeen = new Set<string>();
  for (const p of universe) {
    const c = parseDataFlex(p.created_at ?? null);
    if (c) {
      const mk = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}`;
      const idx = months.indexOf(mk);
      if (idx >= 0) monthlyDrill.opcoes[idx].push(p);
    }
  }
  for (const c of raw.comites) {
    if (!universeIds.has(c.processo_id)) continue;
    if (c.comite_resultado !== 'aprovado') continue;
    const d = parseDataFlex(c.updated_at ?? null);
    if (!d) continue;
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const idx = months.indexOf(mk);
    if (idx < 0) continue;
    const dedupeKey = `${idx}:${c.processo_id}`;
    if (comiteMonthSeen.has(dedupeKey)) continue;
    comiteMonthSeen.add(dedupeKey);
    const proc = raw.processos.find((x) => x.id === c.processo_id);
    if (proc) monthlyDrill.comites[idx].push(proc);
  }
  for (const p of universe) {
    const d1 = parseDataFlex(p.data_aprovacao_condominio ?? null);
    if (d1) {
      const mk = `${d1.getFullYear()}-${String(d1.getMonth() + 1).padStart(2, '0')}`;
      const idx = months.indexOf(mk);
      if (idx >= 0) monthlyDrill.condominios[idx].push(p);
    }
    const d2 = parseDataFlex(p.data_aprovacao_prefeitura ?? null);
    if (d2) {
      const mk = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}`;
      const idx = months.indexOf(mk);
      if (idx >= 0) monthlyDrill.prefeituras[idx].push(p);
    }
    const d3 = parseDataFlex(p.data_aprovacao_credito ?? null);
    if (d3) {
      const mk = `${d3.getFullYear()}-${String(d3.getMonth() + 1).padStart(2, '0')}`;
      const idx = months.indexOf(mk);
      if (idx >= 0) monthlyDrill.creditos[idx].push(p);
    }
    const d4 = parseDataFlex(p.data_emissao_alvara ?? null);
    if (d4) {
      const mk = `${d4.getFullYear()}-${String(d4.getMonth() + 1).padStart(2, '0')}`;
      const idx = months.indexOf(mk);
      if (idx >= 0) monthlyDrill.obras[idx].push(p);
    }
  }

  const heatRows = ['Opções', 'Comitês', 'Condomínios', 'Prefeituras', 'Obras'] as const;
  const heatSource = [
    monthly.opcoes,
    monthly.comites,
    monthly.condominios,
    monthly.prefeituras,
    monthly.obras,
  ];
  const heatmap: number[][] = heatRows.map((_, ri) => {
    const src = heatSource[ri];
    const byMonthIndex = new Array(12).fill(0);
    const counts = new Array(12).fill(0);
    Object.entries(src).forEach(([ym, val]) => {
      const m = Number(ym.split('-')[1]);
      if (m >= 1 && m <= 12) {
        byMonthIndex[m - 1] += val;
        counts[m - 1] += 1;
      }
    });
    return byMonthIndex.map((sum, i) => (counts[i] ? Math.round(sum / counts[i]) : 0));
  });

  const nnActivosSom = nnPre + nnAprov + nnOp;
  const pctAprovSobrePipelineNn = nnActivosSom > 0 ? (100 * (nnAprov + nnOp)) / nnActivosSom : 0;
  const pctOperacaoSobreAprovNn = nnAprov + nnOp > 0 ? (100 * nnOp) / (nnAprov + nnOp) : 0;

  const ticketRows = ativos
    .map((p) => ({
      id: p.id,
      label: [p.nome_condominio, p.numero_franquia].filter(Boolean).join(' · ') || p.id.slice(0, 8),
      vgv: vgvOf(p) / 1e6,
      terreno: terrenoOf(p) / 1e6,
    }))
    .sort((a, b) => b.vgv - a.vgv)
    .slice(0, 8);

  const procById = new Map(raw.processos.map((p) => [p.id, p]));
  const ticketDrill = ticketRows.map((tr) => procById.get(tr.id)).filter((x): x is ProcessoDashRow => Boolean(x));

  const legalByProc = new Map(raw.checklistLegal.map((r) => [r.processo_id, r.completo]));
  const creditoByProc = new Map<string, ChecklistCreditoRow>();
  for (const r of raw.checklistCredito) {
    if (r.processo_id) creditoByProc.set(r.processo_id, r);
  }
  type ChecklistCreditoRow = (typeof raw.checklistCredito)[number];

  const durPre: number[] = [];
  const durAprov: number[] = [];
  const durOp: number[] = [];
  const byProcEv = new Map<string, typeof raw.eventos>();
  for (const e of raw.eventos) {
    if (!universeIds.has(e.processo_id)) continue;
    const arr = byProcEv.get(e.processo_id) ?? [];
    arr.push(e);
    byProcEv.set(e.processo_id, arr);
  }
  for (const [, evs] of byProcEv) {
    const sorted = [...evs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let prev = sorted[0] ? new Date(sorted[0].created_at).getTime() : null;
    let prevGroup: 'pre' | 'aprov' | 'op' | null = null;
    for (let i = 0; i < sorted.length; i++) {
      const det = (sorted[i].detalhes ?? {}) as { to?: string; from?: string };
      const to = String(det.to ?? '');
      const t = new Date(sorted[i].created_at).getTime();
      if (prev != null && prevGroup) {
        const days = Math.max(0, Math.round((t - prev) / 86400000));
        if (prevGroup === 'pre') durPre.push(days);
        if (prevGroup === 'aprov') durAprov.push(days);
        if (prevGroup === 'op') durOp.push(days);
      }
      prev = t;
      const ap = comiteOk.get(sorted[i].processo_id) ?? false;
      if (ETAPAS_KANBAN_NN.has(to as PainelColumnKey) && !isEtapaOperacaoDashboard(to)) {
        prevGroup = ap ? 'aprov' : 'pre';
      } else if (isEtapaOperacaoDashboard(to)) prevGroup = 'op';
      else prevGroup = 'pre';
    }
  }
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  const regionalCount = new Map<string, number>();
  const regionalLists = new Map<string, ProcessoDashRow[]>();
  for (const p of ativos) {
    const r = regionalPorUF(p.estado);
    if (r === '—') continue;
    regionalCount.set(r, (regionalCount.get(r) ?? 0) + 1);
    if (!regionalLists.has(r)) regionalLists.set(r, []);
    regionalLists.get(r)!.push(p);
  }
  const regTotal = Array.from(regionalCount.values()).reduce((a, b) => a + b, 0) || 1;
  const regionalBars = Array.from(regionalCount.entries())
    .map(([label, n]) => ({ label, n, pct: (100 * n) / regTotal }))
    .sort((a, b) => b.n - a.n);

  const cityCount = new Map<string, number>();
  const cityLists = new Map<string, ProcessoDashRow[]>();
  for (const p of ativos) {
    const c = String(p.cidade ?? '').trim();
    if (!c) continue;
    const uf = String(p.estado ?? '').trim();
    const key = uf ? `${c}/${uf}` : c;
    cityCount.set(key, (cityCount.get(key) ?? 0) + 1);
    if (!cityLists.has(key)) cityLists.set(key, []);
    cityLists.get(key)!.push(p);
  }
  const cityTotal = Array.from(cityCount.values()).reduce((a, b) => a + b, 0) || 1;
  const cityBars = Array.from(cityCount.entries())
    .map(([label, n]) => ({ label, n, pct: (100 * n) / cityTotal }))
    .sort((a, b) => b.n - a.n);

  const byUserId: Record<string, ProcessoDashRow[]> = {};
  for (const p of universe) {
    if (!byUserId[p.user_id]) byUserId[p.user_id] = [];
    byUserId[p.user_id].push(p);
  }

  const franqByUser = new Map<string, { nome: string; n: number; vgv: number; ativos: number; cancel: number }>();
  for (const p of universe) {
    const uid = p.user_id;
    const nome = (p.nome_franqueado ?? '').trim() || uid;
    const cur = franqByUser.get(uid) ?? { nome, n: 0, vgv: 0, ativos: 0, cancel: 0 };
    cur.n += 1;
    if (!isCancelado(p) && !isRemovido(p) && !isConcluido(p)) {
      cur.ativos += 1;
      cur.vgv += vgvOf(p);
    } else if (isCancelado(p)) cur.cancel += 1;
    franqByUser.set(uid, cur);
  }
  const rankingN = Array.from(franqByUser.entries())
    .map(([userId, x]) => ({ ...x, userId }))
    .filter((x) => x.ativos > 0 || x.cancel > 0)
    .sort((a, b) => b.n - a.n);
  const rankingVgv = Array.from(franqByUser.entries())
    .map(([userId, x]) => ({ ...x, userId }))
    .sort((a, b) => b.vgv - a.vgv);
  const rankingMedio = Array.from(franqByUser.entries())
    .map(([userId, x]) => ({ ...x, userId }))
    .filter((x) => x.ativos > 0)
    .map((x) => ({ ...x, med: x.vgv / x.ativos / 1e6 }))
    .sort((a, b) => b.med - a.med);

  const reincidencia = Array.from(franqByUser.values())
    .filter((x) => x.cancel >= 1 && x.ativos >= 1)
    .sort((a, b) => b.cancel - a.cancel)
    .map((x) => ({
      nome: x.nome,
      cancelados: x.cancel,
      ativos: x.ativos,
      vgvAtivo: x.vgv,
    }));

  const motivoCancelCount = new Map<string, number>();
  const motivoCancelDrill = new Map<string, ProcessoDashRow[]>();
  for (const p of cancelados) {
    const m = p.motivo_cancelamento ?? '—';
    motivoCancelCount.set(m, (motivoCancelCount.get(m) ?? 0) + 1);
    if (!motivoCancelDrill.has(m)) motivoCancelDrill.set(m, []);
    motivoCancelDrill.get(m)!.push(p);
  }
  const motivoReproCount = new Map<string, number>();
  const motivoReproDrill = new Map<string, ProcessoDashRow[]>();
  for (const p of universe) {
    if (!p.motivo_reprovacao_comite) continue;
    const m = p.motivo_reprovacao_comite;
    motivoReproCount.set(m, (motivoReproCount.get(m) ?? 0) + 1);
    if (!motivoReproDrill.has(m)) motivoReproDrill.set(m, []);
    motivoReproDrill.get(m)!.push(p);
  }

  const estadoFranq = new Map<string, Set<string>>();
  for (const r of raw.rede) {
    for (const st of ufsFromRedeFranqueado(r)) {
      if (!estadoFranq.has(st)) estadoFranq.set(st, new Set());
      estadoFranq.get(st)!.add(r.id);
    }
  }
  const estadoNeg = new Map<string, { n: number; vgv: number }>();
  for (const p of ativos) {
    const st = String(p.estado ?? '').toUpperCase().trim();
    if (!st || st.length !== 2) continue;
    const cur = estadoNeg.get(st) ?? { n: 0, vgv: 0 };
    cur.n += 1;
    cur.vgv += vgvOf(p);
    estadoNeg.set(st, cur);
  }
  const cobertura = [...new Set([...Array.from(estadoFranq.keys()), ...Array.from(estadoNeg.keys())])]
    .map((uf) => {
      const fr = estadoFranq.get(uf)?.size ?? 0;
      const ng = estadoNeg.get(uf) ?? { n: 0, vgv: 0 };
      return {
        uf,
        franqueados: fr,
        negocios: ng.n,
        vgv: ng.vgv,
        temNegocio: ng.n > 0,
        temFrank: fr > 0,
      };
    })
    .sort((a, b) => b.vgv - a.vgv);

  const prazosRows = ativos
    .map((p) => {
      const projeto =
        [p.nome_franqueado, p.nome_condominio].filter(Boolean).join(' — ') || p.numero_franquia || p.id.slice(0, 8);
      return {
        projeto,
        condominio: p.data_aprovacao_condominio,
        prefeitura: p.data_aprovacao_prefeitura,
        alvara: p.data_emissao_alvara,
        credito: p.data_aprovacao_credito,
        obra: parseDataFlex(p.previsao_inicio_obra ?? null),
      };
    })
    .map((row) => {
      const datas = [
        row.condominio,
        row.prefeitura,
        row.alvara,
        row.credito,
        row.obra ? row.obra.toISOString().slice(0, 10) : null,
      ]
        .map((x) => (x ? parseDataFlex(String(x)) : null))
        .filter(Boolean) as Date[];
      const minT = datas.length ? Math.min(...datas.map((d) => d.getTime())) : null;
      return { ...row, sortKey: minT };
    })
    .sort((a, b) => {
      if (a.sortKey == null && b.sortKey == null) return 0;
      if (a.sortKey == null) return 1;
      if (b.sortKey == null) return -1;
      return a.sortKey - b.sortKey;
    });

  type Gargalo = { key: string; n: number };
  const gListKeys = [
    'Checklist Legal não preenchido',
    'Checklist Crédito não preenchido',
    'SPT não anexado',
    'Matrícula não anexada',
    'Alvará pendente',
    'Aprovação prefeitura pendente',
    'Aprovação condomínio pendente',
    'Crédito não aprovado',
    'Sem data de início de obra',
  ] as const;
  const gLists = Object.fromEntries(gListKeys.map((k) => [k, [] as ProcessoDashRow[]])) as Record<
    (typeof gListKeys)[number],
    ProcessoDashRow[]
  >;

  for (const p of ativos) {
    const ep = p.etapa_painel ?? '';
    if (legalByProc.get(p.id) !== true) gLists['Checklist Legal não preenchido'].push(p);
    const ck = creditoByProc.get(p.id);
    if (!ck) gLists['Checklist Crédito não preenchido'].push(p);
    if (ck && !String(ck.upload_matricula ?? '').trim()) gLists['Matrícula não anexada'].push(p);
    if (ck && !String(ck.upload_projeto_aprovado ?? '').trim()) gLists['SPT não anexado'].push(p);
    if (!p.data_emissao_alvara && ETAPAS_POS_STEP7.has(ep)) gLists['Alvará pendente'].push(p);
    if (!p.data_aprovacao_prefeitura && (ep === 'aprovacao_prefeitura' || ep === 'projeto_legal'))
      gLists['Aprovação prefeitura pendente'].push(p);
    if (!p.data_aprovacao_condominio && ep === 'aprovacao_condominio') gLists['Aprovação condomínio pendente'].push(p);
    if (!p.data_aprovacao_credito && (ep === 'credito_terreno' || ep === 'credito_obra'))
      gLists['Crédito não aprovado'].push(p);
    if (!parseDataFlex(p.previsao_inicio_obra ?? null) && isEtapaOperacaoDashboard(ep))
      gLists['Sem data de início de obra'].push(p);
  }

  const gargalos: Gargalo[] = gListKeys
    .map((key) => ({ key, n: gLists[key].length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  return {
    kpis: {
      totalNegocios,
      vgvPipeline,
      emOperacao,
      pctOperacao,
      cancelados: canceladosN,
      pctCancel,
    },
    nnBar,
    contab,
    cred,
    waterfall: {
      labels: waterfallCols.map((c) => c.title),
      keys: waterfallCols.map((c) => c.key),
      counts: waterfallCounts,
      vgvMm: waterfallVgvMm,
      totalN: waterfallTotalN,
      totalVgvMm: waterfallTotalVgvMm,
    },
    months,
    monthLabels: months.map(formatMonthLabel),
    monthly,
    heatmap,
    heatRows,
    funnel: {
      pre: nnPre,
      aprov: nnAprov,
      op: nnOp,
      caiu: nnCaiu,
      pctAprovSobrePipelineNn,
      pctOperacaoSobreAprovNn,
      pctPerda: pctCancel,
    },
    ticketRows,
    tempoFases: {
      pre: Math.round(avg(durPre)) || 0,
      aprov: Math.round(avg(durAprov)) || 0,
      op: Math.round(avg(durOp)) || 0,
    },
    regionalBars,
    cityBars,
    rankingN,
    rankingVgv,
    rankingMedio,
    reincidencia,
    motivoCancelCount,
    motivoReproCount,
    cobertura,
    prazosRows,
    gargalos,
    drilldown: {
      nnBar: nnBarLists,
      contab: contabLists,
      cred: credLists,
      waterfall: waterfallLists,
      waterfallTotal: waterfallUnionAll,
      monthly: monthlyDrill,
      funnel: {
        pre: funnelPre,
        aprov: funnelAprov,
        op: funnelOp,
        caiu: funnelCaiu,
      },
      ticket: ticketDrill,
      gargalos: Object.fromEntries(gListKeys.map((k) => [k, gLists[k]])) as Record<string, ProcessoDashRow[]>,
      motivoCancel: Object.fromEntries(motivoCancelDrill) as Record<string, ProcessoDashRow[]>,
      motivoRepro: Object.fromEntries(motivoReproDrill) as Record<string, ProcessoDashRow[]>,
      regional: Object.fromEntries(regionalLists) as Record<string, ProcessoDashRow[]>,
      city: Object.fromEntries(cityLists) as Record<string, ProcessoDashRow[]>,
      byUserId,
    },
  };
}

export type DashboardModel = ReturnType<typeof buildDashboardModel>;
