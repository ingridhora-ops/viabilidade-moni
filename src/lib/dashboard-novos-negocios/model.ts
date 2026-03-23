import { PAINEL_COLUMNS, type PainelColumnKey } from '@/app/steps-viabilidade/painelColumns';
import {
  ETAPAS_KANBAN_NN,
  isEtapaKanbanNovosNegocios,
  isEtapaOperacaoDashboard,
} from '@/lib/painel/dashboard-etapas';
import { ufsFromRedeFranqueado } from '@/lib/rede-area-atuacao';
import { parseMoneyText } from './parseMoney';
import { regionalPorUF } from './regioes';
import type { fetchDashboardRawData } from './fetchData';

type Raw = Awaited<ReturnType<typeof fetchDashboardRawData>>;
export type DashboardStatusFilter = 'ativos' | 'cancelados' | 'todos';

function isRemovido(p: { removido_em?: string | null; status?: string | null }) {
  return Boolean(p.removido_em) || String(p.status ?? '').toLowerCase() === 'removido';
}

function isCancelado(p: { cancelado_em?: string | null; status?: string | null }) {
  return Boolean(p.cancelado_em) || String(p.status ?? '').toLowerCase() === 'cancelado';
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
const CRED_ETAPAS = new Set(['credito_terreno', 'credito_obra']);

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
  const statusFilter: DashboardStatusFilter = options?.statusFilter ?? 'todos';

  const universeBase = raw.processos.filter((p) => !isRemovido(p) && String(p.etapa_painel ?? '') !== 'step_1');
  const universe = universeBase.filter((p) => {
    if (statusFilter === 'ativos') return !isCancelado(p);
    if (statusFilter === 'cancelados') return isCancelado(p);
    return true;
  });
  const universeIds = new Set(universe.map((p) => p.id));
  const comiteOk = buildComiteAprovadoMap(raw.processos, raw.comites);

  const totalNegocios = universe.length;
  const cancelados = universe.filter(isCancelado);
  const canceladosN = cancelados.length;
  const pctCancel = totalNegocios ? (100 * canceladosN) / totalNegocios : 0;

  const ativos = universe.filter((p) => !isCancelado(p));
  const vgvPipeline = ativos.reduce((s, p) => s + vgvOf(p), 0);
  const emOperacao = ativos.filter(
    (p) => isEtapaOperacaoDashboard(p.etapa_painel ?? '') && !CONTAB_ETAPAS.has(p.etapa_painel ?? ''),
  ).length;
  const pctOperacao = totalNegocios ? (100 * emOperacao) / totalNegocios : 0;

  let nnPre = 0,
    nnAprov = 0,
    nnOp = 0,
    nnCaiu = 0;
  for (const p of universe) {
    const ep = p.etapa_painel ?? '';
    if (isCancelado(p)) {
      nnCaiu += 1;
      continue;
    }
    if (!isEtapaKanbanNovosNegocios(ep)) continue;
    const ap = comiteOk.get(p.id) ?? false;
    if (!ap) nnPre += 1;
    else if (!isEtapaOperacaoDashboard(ep)) nnAprov += 1;
    else nnOp += 1;
  }

  /** Uma barra por coluna do Kanban Novos Negócios (mesma ordem do painel), só cards ativos. */
  const nnKanbanCols = PAINEL_COLUMNS.filter(
    (c) => c.key !== 'step_1' && isEtapaKanbanNovosNegocios(c.key),
  );
  const nnBarCounts = nnKanbanCols.map((col) => {
    let list = ativos.filter((p) => (p.etapa_painel ?? '') === col.key);
    if (col.key === 'credito_terreno') {
      list = list.filter((p) => (p.tipo_aquisicao_terreno ?? '') !== 'Permuta');
    }
    return list.length;
  });
  const nnBar = {
    labels: nnKanbanCols.map((c) => c.title),
    counts: nnBarCounts,
    keys: nnKanbanCols.map((c) => c.key),
  };

  const faseContabLabels: Record<string, string> = {
    abertura_incorporadora: 'Ab. Incorporadora',
    abertura_spe: 'Ab. SPE',
    abertura_gestora: 'Ab. Gestora',
    em_andamento: 'Em andamento',
    encerrado: 'Encerrado',
  };
  const faseContabOrder = ['abertura_incorporadora', 'abertura_spe', 'abertura_gestora', 'em_andamento', 'encerrado'];
  const contabCounts: Record<string, number> = Object.fromEntries(faseContabOrder.map((k) => [k, 0]));
  for (const p of universe) {
    if (!isCancelado(p) && CONTAB_ETAPAS.has(p.etapa_painel ?? '')) {
      let f = p.fase_contabilidade ?? '';
      if (!f) {
        if (p.etapa_painel === 'contabilidade_incorporadora') f = 'abertura_incorporadora';
        else if (p.etapa_painel === 'contabilidade_spe') f = 'abertura_spe';
        else if (p.etapa_painel === 'contabilidade_gestora') f = 'abertura_gestora';
      }
      if (f && f in contabCounts) contabCounts[f] += 1;
    }
  }
  const contabTotal = Object.values(contabCounts).reduce((a, b) => a + b, 0);

  const faseCredLabels: Record<string, string> = {
    check_legal_mais_credito: 'Check Legal + Crédito',
    contratacao_credito: 'Contratação Crédito',
    credito_aprovado: 'Crédito Aprovado',
    encerrado: 'Encerrado',
  };
  const faseCredOrder = ['check_legal_mais_credito', 'contratacao_credito', 'credito_aprovado', 'encerrado'];
  const credCounts: Record<string, number> = Object.fromEntries(faseCredOrder.map((k) => [k, 0]));
  for (const p of universe) {
    if (!isCancelado(p) && CRED_ETAPAS.has(p.etapa_painel ?? '')) {
      let f = p.fase_credito ?? '';
      if (!f) {
        if (p.etapa_painel === 'credito_terreno') f = 'check_legal_mais_credito';
        else if (p.etapa_painel === 'credito_obra') f = 'contratacao_credito';
      }
      if (f && f in credCounts) credCounts[f] += 1;
    }
  }
  const credTotal = Object.values(credCounts).reduce((a, b) => a + b, 0);

  // Waterfall buckets (mutually exclusive, non-cancelled)
  let w1 = 0,
    w2 = 0,
    w3 = 0,
    w4 = 0,
    v1 = 0,
    v2 = 0,
    v3 = 0,
    v4 = 0;
  for (const p of ativos) {
    const ep = p.etapa_painel ?? '';
    const ap = comiteOk.get(p.id) ?? false;
    const v = vgvOf(p);
    const prefeituraOk = Boolean(p.data_aprovacao_prefeitura);
    if (prefeituraOk && isEtapaOperacaoDashboard(ep)) {
      w1 += 1;
      v1 += v;
    } else if (ap && ETAPAS_POS_STEP7.has(ep)) {
      w2 += 1;
      v2 += v;
    } else if (ap) {
      w3 += 1;
      v3 += v;
    } else {
      w4 += 1;
      v4 += v;
    }
  }
  const wTotalN = w1 + w2 + w3 + w4;
  const wTotalV = v1 + v2 + v3 + v4;

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
  for (const p of ativos) {
    const r = regionalPorUF(p.estado);
    if (r === '—') continue;
    regionalCount.set(r, (regionalCount.get(r) ?? 0) + 1);
  }
  const regTotal = Array.from(regionalCount.values()).reduce((a, b) => a + b, 0) || 1;
  const regionalBars = Array.from(regionalCount.entries())
    .map(([label, n]) => ({ label, n, pct: (100 * n) / regTotal }))
    .sort((a, b) => b.n - a.n);

  const cityCount = new Map<string, number>();
  for (const p of ativos) {
    const c = String(p.cidade ?? '').trim();
    if (!c) continue;
    const uf = String(p.estado ?? '').trim();
    const key = uf ? `${c}/${uf}` : c;
    cityCount.set(key, (cityCount.get(key) ?? 0) + 1);
  }
  const cityTotal = Array.from(cityCount.values()).reduce((a, b) => a + b, 0) || 1;
  const cityBars = Array.from(cityCount.entries())
    .map(([label, n]) => ({ label, n, pct: (100 * n) / cityTotal }))
    .sort((a, b) => b.n - a.n);

  const franqByUser = new Map<string, { nome: string; n: number; vgv: number; ativos: number; cancel: number }>();
  for (const p of universe) {
    const uid = p.user_id;
    const nome = (p.nome_franqueado ?? '').trim() || uid;
    const cur = franqByUser.get(uid) ?? { nome, n: 0, vgv: 0, ativos: 0, cancel: 0 };
    cur.n += 1;
    if (!isCancelado(p)) {
      cur.ativos += 1;
      cur.vgv += vgvOf(p);
    } else cur.cancel += 1;
    franqByUser.set(uid, cur);
  }
  const rankingN = Array.from(franqByUser.values())
    .filter((x) => x.ativos > 0 || x.cancel > 0)
    .sort((a, b) => b.n - a.n);
  const rankingVgv = [...franqByUser.values()].sort((a, b) => b.vgv - a.vgv);
  const rankingMedio = [...franqByUser.values()]
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
  for (const p of cancelados) {
    const m = p.motivo_cancelamento ?? '—';
    motivoCancelCount.set(m, (motivoCancelCount.get(m) ?? 0) + 1);
  }
  const motivoReproCount = new Map<string, number>();
  for (const p of universe) {
    if (!p.motivo_reprovacao_comite) continue;
    const m = p.motivo_reprovacao_comite;
    motivoReproCount.set(m, (motivoReproCount.get(m) ?? 0) + 1);
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
  const g: Record<string, number> = {
    'Checklist Legal não preenchido': 0,
    'Checklist Crédito não preenchido': 0,
    'SPT não anexado': 0,
    'Matrícula não anexada': 0,
    'Alvará pendente': 0,
    'Aprovação prefeitura pendente': 0,
    'Aprovação condomínio pendente': 0,
    'Crédito não aprovado': 0,
    'Sem data de início de obra': 0,
  };

  for (const p of ativos) {
    const ep = p.etapa_painel ?? '';
    if (legalByProc.get(p.id) !== true) g['Checklist Legal não preenchido'] += 1;
    const ck = creditoByProc.get(p.id);
    if (!ck) g['Checklist Crédito não preenchido'] += 1;
    if (ck && !String(ck.upload_matricula ?? '').trim()) g['Matrícula não anexada'] += 1;
    if (ck && !String(ck.upload_projeto_aprovado ?? '').trim()) g['SPT não anexado'] += 1;
    if (!p.data_emissao_alvara && ETAPAS_POS_STEP7.has(ep)) g['Alvará pendente'] += 1;
    if (!p.data_aprovacao_prefeitura && (ep === 'aprovacao_prefeitura' || ep === 'projeto_legal'))
      g['Aprovação prefeitura pendente'] += 1;
    if (!p.data_aprovacao_condominio && ep === 'aprovacao_condominio') g['Aprovação condomínio pendente'] += 1;
    if (!p.data_aprovacao_credito && (ep === 'credito_terreno' || ep === 'credito_obra')) g['Crédito não aprovado'] += 1;
    if (!parseDataFlex(p.previsao_inicio_obra ?? null) && isEtapaOperacaoDashboard(ep)) g['Sem data de início de obra'] += 1;
  }

  const gargalos: Gargalo[] = Object.entries(g)
    .map(([key, n]) => ({ key, n }))
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
    contab: { counts: contabCounts, labels: faseContabLabels, order: faseContabOrder, total: contabTotal },
    cred: { counts: credCounts, labels: faseCredLabels, order: faseCredOrder, total: credTotal },
    waterfall: {
      labels: [
        'Em operação / aprov. prefeitura',
        'Terreno contratado',
        'Aprovado em comitê',
        'Pré-comitê de novas casas',
        'TOTAL',
      ],
      counts: [w1, w2, w3, w4, wTotalN],
      vgvMm: [v1 / 1e6, v2 / 1e6, v3 / 1e6, v4 / 1e6, wTotalV / 1e6],
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
  };
}

export type DashboardModel = ReturnType<typeof buildDashboardModel>;
