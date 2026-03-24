'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import type { ProcessoDashRow } from '@/lib/dashboard-novos-negocios/fetchData';
import { registerDashboardCharts } from '@/lib/charts/registerCharts';
import { ProcessoDrilldownModal } from '@/components/dashboard/ProcessoDrilldownModal';
import { PALETTE } from '@/lib/dashboard-novos-negocios/palette';
import { fmtCompactMillions, fmtInt, fmtMM, fmtMoneyBRL, fmtPct } from '@/lib/dashboard-novos-negocios/format';
import { fetchDashboardRawData } from '@/lib/dashboard-novos-negocios/fetchData';
import { loadDashboardNovosNegociosData } from './actions';
import {
  buildDashboardModel,
  type DashboardModel,
  type DashboardStatusFilter,
} from '@/lib/dashboard-novos-negocios/model';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 border-b border-stone-200 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
      {children}
    </h2>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-stone-200/80 ${className}`} />;
}

function chartFontColor() {
  return 'rgba(44,44,42,0.75)';
}

const NN_BAR_PALETTE = [
  PALETTE.amber,
  PALETTE.darkGreen,
  PALETTE.petrol,
  PALETTE.red,
  PALETTE.charcoal,
  PALETTE.gold,
  PALETTE.gray,
];
const CONTAB_COLORS = [PALETTE.charcoal, PALETTE.darkGreen, PALETTE.amber];
const CRED_COLORS = [PALETTE.gold, PALETTE.amber];

function cardsFilterCaption(f: DashboardStatusFilter): string {
  switch (f) {
    case 'ativos':
      return 'cards ativos';
    case 'cancelados':
      return 'cancelados';
    case 'removidos':
      return 'excluídos';
    case 'concluidos':
      return 'concluídos';
    case 'todos':
      return 'todos os status';
    default:
      return 'cards';
  }
}

export function DashboardNovosNegociosClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<Awaited<ReturnType<typeof fetchDashboardRawData>> | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [statusFilter, setStatusFilter] = useState<DashboardStatusFilter>('ativos');
  const [seriesOn, setSeriesOn] = useState({
    opcoes: true,
    comites: true,
    condominios: true,
    prefeituras: true,
    creditos: true,
    obras: true,
  });
  const [expandCity, setExpandCity] = useState(false);
  const [expandRank, setExpandRank] = useState(false);
  const [drilldown, setDrilldown] = useState<{
    title: string;
    subtitle?: string;
    rows: ProcessoDashRow[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await loadDashboardNovosNegociosData();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRawData(res.data);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  const model: DashboardModel | null = useMemo(() => {
    if (!rawData) return null;
    return buildDashboardModel(rawData, { statusFilter });
  }, [rawData, statusFilter]);

  useEffect(() => {
    registerDashboardCharts();
    void load();
  }, [load]);

  const ts = updatedAt
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(updatedAt)
    : '—';

  const lineData = useMemo(() => {
    if (!model) return null;
    const keys = model.months;
    const series = [
      { key: 'opcoes' as const, label: 'Opções assinadas', color: PALETTE.petrol, on: seriesOn.opcoes },
      { key: 'comites' as const, label: 'Comitês aprovados', color: PALETTE.darkGreen, on: seriesOn.comites },
      { key: 'condominios' as const, label: 'Condomínios aprovados', color: PALETTE.charcoal, on: seriesOn.condominios },
      { key: 'prefeituras' as const, label: 'Prefeituras aprovadas', color: PALETTE.amber, on: seriesOn.prefeituras },
      { key: 'creditos' as const, label: 'Créditos aprovados', color: PALETTE.gold, on: seriesOn.creditos },
      { key: 'obras' as const, label: 'Obras iniciadas', color: PALETTE.red, on: seriesOn.obras },
    ].filter((s) => s.on);
    return {
      labels: model.monthLabels,
      datasets: series.map((s) => ({
        label: s.label,
        dashboardSeriesKey: s.key,
        data: keys.map((k) => model.monthly[s.key][k] ?? 0),
        borderColor: s.color,
        backgroundColor: `${s.color}33`,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
      })),
    };
  }, [model, seriesOn]);

  const waterfallFloating = useMemo(() => {
    if (!model) return null;
    const seg = model.waterfall.vgvMm;
    let cum = 0;
    const data: [number, number][] = seg.map((v) => {
      const lo = cum;
      cum += v;
      return [lo, cum];
    });
    const totalMm = cum;
    data.push([0, totalMm]);
    const n = seg.length;
    const bg = Array.from({ length: n + 1 }, (_, i) =>
      i < n ? NN_BAR_PALETTE[i % NN_BAR_PALETTE.length] : PALETTE.petrol,
    );
    const borderWidth = Array.from({ length: n + 1 }, (_, i) => (i === n ? 2 : 0));
    const labels = [...model.waterfall.labels, 'TOTAL'];
    return { data, bg, labels, borderWidth };
  }, [model]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error}
        <button type="button" className="ml-3 underline" onClick={() => void load()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div>
      <ProcessoDrilldownModal
        open={Boolean(drilldown)}
        title={drilldown?.title ?? ''}
        subtitle={drilldown?.subtitle}
        rows={drilldown?.rows ?? []}
        onClose={() => setDrilldown(null)}
      />
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Dashboard Novos Negócios</h1>
          <p className="text-sm text-stone-600">
            KPIs e gráficos dos Kanbans Novos Negócios, Contabilidade e Crédito (exclui Step 1).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="status-filter" className="text-xs text-stone-600">
              Cards:
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as DashboardStatusFilter)}
              className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700"
            >
              <option value="ativos">Ativos</option>
              <option value="cancelados">Cancelados</option>
              <option value="removidos">Excluídos</option>
              <option value="concluidos">Concluídos</option>
              <option value="todos">Todos</option>
            </select>
          </div>
          <span className="text-xs text-stone-500">Última atualização: {ts}</span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100 disabled:opacity-50"
          >
            {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* Bloco 1 */}
      <SectionTitle>KPIs</SectionTitle>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {loading || !model ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : (
          <>
            <div className="rounded-md bg-stone-100 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-stone-500">Total de negócios</p>
              <p className="text-2xl font-bold text-stone-900">{fmtInt(model.kpis.totalNegocios)}</p>
              <p className="text-xs text-stone-500">Todos os Kanbans</p>
            </div>
            <div className="rounded-md bg-stone-100 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-stone-500">VGV total pipeline</p>
              <p className="text-2xl font-bold" style={{ color: PALETTE.amber }}>
                {fmtCompactMillions(model.kpis.vgvPipeline)}
              </p>
              <p className="text-xs text-stone-500">Negócios ativos</p>
            </div>
            <div className="rounded-md bg-stone-100 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-stone-500">Em operação</p>
              <p className="text-2xl font-bold" style={{ color: PALETTE.darkGreen }}>
                {fmtInt(model.kpis.emOperacao)}
              </p>
              <p className="text-xs text-stone-500">{fmtPct(model.kpis.pctOperacao, 0)} do total</p>
            </div>
            <div className="rounded-md bg-stone-100 px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-stone-500">Cancelados</p>
              <p className="text-2xl font-bold" style={{ color: PALETTE.red }}>
                {fmtInt(model.kpis.cancelados)}
              </p>
              <p className="text-xs text-stone-500">{fmtPct(model.kpis.pctCancel, 0)} do total</p>
            </div>
          </>
        )}
      </div>

      <SectionTitle>Processos por fase dos Kanbans</SectionTitle>
      <div className="mb-8 space-y-4">
        <div className="rounded-lg border-[0.5px] border-stone-300 bg-white p-4 shadow-sm">
          {loading || !model ? (
            <Skeleton className="h-[320px]" />
          ) : (
            <>
              <p className="text-sm font-semibold text-stone-800">Kanban Novos Negócios — cards por etapa</p>
              <p className="text-xs text-stone-500">
                {fmtInt(model.nnBar.counts.reduce((a, b) => a + b, 0))} · {cardsFilterCaption(statusFilter)} nas
                colunas do painel (mesma lógica do Kanban; Crédito Terreno exclui Permuta).
              </p>
              <div
                className="mt-3 w-full"
                style={{
                  height: `${Math.min(720, Math.max(220, model.nnBar.labels.length * 26))}px`,
                }}
              >
                <Bar
                  options={{
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: (_e, els) => {
                      if (!model || !els.length) return;
                      const i = els[0].index;
                      setDrilldown({
                        title: model.nnBar.labels[i] ?? `Etapa ${i + 1}`,
                        subtitle: 'Kanban Novos Negócios',
                        rows: model.drilldown.nnBar[i] ?? [],
                      });
                    },
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          title(items) {
                            const i = items[0]?.dataIndex ?? 0;
                            const key = model.nnBar.keys?.[i];
                            return key ? `${items[0]?.label ?? ''} (${key})` : String(items[0]?.label ?? '');
                          },
                          label(ctx) {
                            const v = Number(ctx.raw);
                            const t = model.nnBar.counts.reduce((a, b) => a + b, 0) || 1;
                            const pct = fmtPct((100 * v) / t, 0);
                            return `${fmtInt(v)} cards (${pct})`;
                          },
                        },
                      },
                      dataLabels: { isDark: false },
                    },
                    scales: {
                      x: { beginAtZero: true, ticks: { color: chartFontColor(), precision: 0 } },
                      y: {
                        ticks: {
                          color: chartFontColor(),
                          autoSkip: false,
                          font: { size: 10 },
                        },
                      },
                    },
                  }}
                  data={{
                    labels: model.nnBar.labels,
                    datasets: [
                      {
                        data: model.nnBar.counts,
                        backgroundColor: model.nnBar.labels.map(
                          (_, i) => NN_BAR_PALETTE[i % NN_BAR_PALETTE.length],
                        ),
                        borderWidth: 0,
                      },
                    ],
                  }}
                />
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border-[0.5px] border-stone-300 bg-white p-4 shadow-sm">
            {loading || !model ? (
              <Skeleton className="h-[200px]" />
            ) : (
              <>
                <p className="text-sm font-semibold text-stone-800">Kanban Contabilidade — cards por coluna</p>
                <p className="text-xs text-stone-500">
                  Total de {fmtInt(model.contab.total)} · {cardsFilterCaption(statusFilter)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-stone-600">
                  {model.contab.labels.map((label, i) => (
                    <span key={model.contab.keys[i]} className="flex items-center gap-1">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ backgroundColor: CONTAB_COLORS[i % CONTAB_COLORS.length] }}
                      />
                      {label}
                    </span>
                  ))}
                </div>
                <div className="h-[200px]">
                  <Bar
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      onClick: (_e, els) => {
                        if (!model || !els.length) return;
                        const i = els[0].index;
                        setDrilldown({
                          title: model.contab.labels[i] ?? '',
                          subtitle: 'Kanban Contabilidade',
                          rows: model.drilldown.contab[i] ?? [],
                        });
                      },
                      plugins: {
                        legend: { display: false },
                        dataLabels: {
                          isDark: false,
                          skipDataset: () => false,
                        },
                      },
                      scales: {
                        x: { ticks: { color: chartFontColor(), maxRotation: 40 } },
                        y: { beginAtZero: true, ticks: { color: chartFontColor() } },
                      },
                    }}
                    data={{
                      labels: model.contab.labels,
                      datasets: [
                        {
                          data: model.contab.counts,
                          backgroundColor: CONTAB_COLORS,
                          borderWidth: 0,
                          dataLabelFormat: (val: number, i: number) => {
                            const t = model.contab.total || 1;
                            const c = model.contab.counts[i] ?? 0;
                            return `${fmtInt(c)} (${fmtPct((100 * c) / t, 0)})`;
                          },
                        } as never,
                      ],
                    }}
                  />
                </div>
              </>
            )}
          </div>
          <div className="rounded-lg border-[0.5px] border-stone-300 bg-white p-4 shadow-sm">
            {loading || !model ? (
              <Skeleton className="h-[200px]" />
            ) : (
              <>
                <p className="text-sm font-semibold text-stone-800">Kanban Crédito — cards por coluna</p>
                <p className="text-xs text-stone-500">
                  Mesmas colunas do painel (Crédito Terreno e Crédito Obra). Contagem por etapa do card; não usa
                  subfases antigas do checklist. Total: {fmtInt(model.cred.total)} · {cardsFilterCaption(statusFilter)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-stone-600">
                  {model.cred.labels.map((label, i) => (
                    <span key={model.cred.keys[i]} className="flex items-center gap-1">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ backgroundColor: CRED_COLORS[i % CRED_COLORS.length] }}
                      />
                      {label}
                    </span>
                  ))}
                </div>
                <div className="h-[200px]">
                  <Bar
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      onClick: (_e, els) => {
                        if (!model || !els.length) return;
                        const i = els[0].index;
                        setDrilldown({
                          title: model.cred.labels[i] ?? '',
                          subtitle: 'Kanban Crédito',
                          rows: model.drilldown.cred[i] ?? [],
                        });
                      },
                      plugins: { legend: { display: false }, dataLabels: { isDark: false } },
                      scales: {
                        x: { ticks: { color: chartFontColor(), maxRotation: 35 } },
                        y: { beginAtZero: true, ticks: { color: chartFontColor() } },
                      },
                    }}
                    data={{
                      labels: model.cred.labels,
                      datasets: [
                        {
                          data: model.cred.counts,
                          backgroundColor: CRED_COLORS,
                          borderWidth: 0,
                          dataLabelFormat: (val: number, i: number) => {
                            const t = model.cred.total || 1;
                            const c = model.cred.counts[i] ?? 0;
                            return `${fmtInt(c)} (${fmtPct((100 * c) / t, 0)})`;
                          },
                        } as never,
                      ],
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <SectionTitle>Safras de novas casas</SectionTitle>
      <div className="mb-8 rounded-lg border-[0.5px] border-stone-300 bg-white p-4 shadow-sm">
        {loading || !model || !waterfallFloating ? (
          <Skeleton className="h-[280px]" />
        ) : (
          <>
            <p className="text-sm font-semibold text-stone-800">VGV potencial acumulado por fase do pipeline · BRL MM</p>
            <p className="text-xs text-stone-500">
              Colunas do kanban Portfolio + Operações (sem Step 1); barras acumulam VGV por etapa. Total:{' '}
              {fmtInt(model.waterfall.totalN)} · {fmtMM(model.waterfall.totalVgvMm)}
            </p>
            <div
              style={{
                height: `${Math.min(720, Math.max(280, (model.waterfall.labels.length + 1) * 22))}px`,
              }}
            >
              <Bar
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  onClick: (_e, els) => {
                    if (!model || !els.length) return;
                    const i = els[0].index;
                    const n = model.waterfall.counts.length;
                    if (i < n) {
                      setDrilldown({
                        title: model.waterfall.labels[i] ?? '',
                        subtitle: 'VGV por etapa do kanban',
                        rows: model.drilldown.waterfall[i] ?? [],
                      });
                    } else {
                      setDrilldown({
                        title: 'TOTAL (VGV pipeline)',
                        subtitle: 'Processos em alguma coluna do kanban (sem Step 1)',
                        rows: model.drilldown.waterfallTotal,
                      });
                    }
                  },
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label(ctx) {
                          const i = ctx.dataIndex;
                          const n = model.waterfall.counts.length;
                          if (i < n) {
                            const c = model.waterfall.counts[i] ?? 0;
                            const mm = model.waterfall.vgvMm[i] ?? 0;
                            return `${fmtInt(c)} casas · ${fmtMM(mm)}`;
                          }
                          return `Total: ${fmtInt(model.waterfall.totalN)} casas · ${fmtMM(model.waterfall.totalVgvMm)}`;
                        },
                      },
                    },
                  },
                  scales: {
                    x: {
                      ticks: {
                        color: chartFontColor(),
                        maxRotation: 65,
                        minRotation: 45,
                        autoSkip: false,
                        font: { size: 8 },
                      },
                    },
                    y: { beginAtZero: true, ticks: { color: chartFontColor() } },
                  },
                }}
                data={{
                  labels: waterfallFloating.labels,
                  datasets: [
                    {
                      label: 'VGV MM',
                      data: waterfallFloating.data as unknown as [number, number][],
                      backgroundColor: waterfallFloating.bg,
                      borderWidth: waterfallFloating.borderWidth,
                      borderColor: 'rgba(201,169,110,0.4)',
                    },
                  ],
                }}
              />
            </div>
          </>
        )}
      </div>

      <SectionTitle>Evolução mensal do pipeline</SectionTitle>
      <div className="mb-8 rounded-lg border-[0.5px] border-stone-300 bg-white p-4 shadow-sm">
        {loading || !model || !lineData ? (
          <Skeleton className="h-[250px]" />
        ) : (
          <>
            <p className="text-sm font-semibold text-stone-800">Eventos por mês</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ['opcoes', 'Opções assinadas'],
                  ['comites', 'Comitês aprovados'],
                  ['condominios', 'Condomínios aprovados'],
                  ['prefeituras', 'Prefeituras aprovadas'],
                  ['creditos', 'Créditos aprovados'],
                  ['obras', 'Obras iniciadas'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSeriesOn((s) => ({ ...s, [k]: !s[k] }))}
                  className={`rounded-full border px-2 py-1 text-xs ${
                    seriesOn[k] ? 'border-stone-800 bg-stone-800 text-white' : 'border-stone-300 bg-white text-stone-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-stone-600">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-[#0D1F2D]" />
                Opções
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-[#3B6D11]" />
                Comitês
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-[#2C2C2A]" />
                Condomínios
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-[#BA7517]" />
                Prefeituras
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-[#C8B080]" />
                Créditos
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-[#791F1F]" />
                Obras
              </span>
            </div>
            <div className="h-[250px]">
              <Line
                data={lineData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  onClick: (_e, els) => {
                    if (!model || !lineData || !els.length) return;
                    const { index, datasetIndex } = els[0];
                    const ds = lineData.datasets[datasetIndex] as {
                      dashboardSeriesKey?: keyof typeof model.drilldown.monthly;
                      label?: string;
                    };
                    const sk = ds.dashboardSeriesKey;
                    if (!sk) return;
                    const rows = model.drilldown.monthly[sk][index] ?? [];
                    const monthLabel = model.monthLabels[index] ?? model.months[index];
                    setDrilldown({
                      title: `${monthLabel}`,
                      subtitle: ds.label ?? sk,
                      rows,
                    });
                  },
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { ticks: { color: chartFontColor() } },
                    y: { beginAtZero: true, ticks: { color: chartFontColor(), stepSize: 1 } },
                  },
                }}
              />
            </div>
          </>
        )}
      </div>

      <SectionTitle>Sazonalidade histórica</SectionTitle>
      <div className="mb-8 rounded-lg border-[0.5px] border-stone-300 bg-white p-4 shadow-sm">
        {loading || !model ? (
          <Skeleton className="h-40" />
        ) : (
          <>
            <p className="text-sm font-semibold text-stone-800">Média de eventos por mês do ano</p>
            <p className="text-xs text-stone-500">Intensidade baseada no histórico acumulado (tons âmbar).</p>
            <div className="mt-3 w-full max-w-4xl space-y-1">
              <div className="flex gap-1 pl-24">
                {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].map((m) => (
                  <div key={m} className="w-8 shrink-0 text-center text-[10px] text-stone-500">
                    {m}
                  </div>
                ))}
              </div>
              {model.heatRows.map((row, ri) => (
                <div key={row} className="flex items-center gap-1">
                  <div className="w-24 shrink-0 text-[10px] text-stone-600">{row}</div>
                  {model.heatmap[ri].map((v, mi) => {
                    let bg = '#f5f5f4';
                    let tc = '#444';
                    if (v >= 5) {
                      bg = '#633806';
                      tc = '#fff';
                    } else if (v >= 3) {
                      bg = PALETTE.amber;
                      tc = '#fff';
                    } else if (v >= 1) {
                      bg = PALETTE.lightAmber;
                      tc = '#fff';
                    }
                    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                    return (
                      <button
                        type="button"
                        key={`${ri}-${mi}`}
                        className="flex h-[26px] w-8 shrink-0 items-center justify-center rounded text-[11px] font-medium"
                        style={{ backgroundColor: bg, color: tc }}
                        title="Clique para detalhes"
                        onClick={() =>
                          setDrilldown({
                            title: `${row} — ${meses[mi] ?? mi + 1}`,
                            subtitle:
                              'Valor = média histórica de eventos nesse mês do ano (vários anos). Não há lista de processos por célula.',
                            rows: [],
                          })
                        }
                      >
                        {v > 0 ? fmtInt(v) : ''}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <SectionTitle>Funil de novos negócios e eficiência</SectionTitle>
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {loading || !model ? (
          <>
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </>
        ) : (
          <>
            <div className="rounded-lg border-[0.5px] border-stone-300 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-stone-800">Distribuição por fase</p>
              <div className="mt-3 space-y-2">
                {(
                  [
                    ['Pré comitê', model.funnel.pre, PALETTE.amber, 'pre'] as const,
                    ['Aprovado comitê', model.funnel.aprov, PALETTE.darkGreen, 'aprov'] as const,
                    ['Operação em andamento', model.funnel.op, PALETTE.petrol, 'op'] as const,
                    ['Cancelado (Caiu)', model.funnel.caiu, PALETTE.red, 'caiu'] as const,
                  ] as const
                ).map(([label, n, color, fk]) => {
                  const t = model.kpis.totalNegocios || 1;
                  const pct = (100 * Number(n)) / t;
                  return (
                    <button
                      type="button"
                      key={String(label)}
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-1 py-1 text-left text-sm hover:border-stone-200 hover:bg-stone-50"
                      onClick={() =>
                        setDrilldown({
                          title: String(label),
                          subtitle: 'Funil de novos negócios',
                          rows: model.drilldown.funnel[fk],
                        })
                      }
                    >
                      <span className="text-stone-700">{label}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: color }}
                      >
                        {fmtInt(Number(n))} ({fmtPct(pct, 0)})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-lg border-[0.5px] border-stone-300 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-stone-800">Eficiência do funil</p>
              <div className="mt-3 space-y-2 text-xs text-stone-600">
                <div className="rounded-md bg-stone-100 px-3 py-2 text-stone-800">
                  {fmtInt(model.kpis.totalNegocios)} negócios no universo
                </div>
                <p>↓ {fmtPct(model.funnel.pctAprovSobrePipelineNn, 0)} com comitê aprovado ou além (ativos NN)</p>
                <p>↓ {fmtPct(model.funnel.pctOperacaoSobreAprovNn, 0)} em operação sobre aprovados</p>
                <p className="text-[#791F1F]">↓ {fmtPct(model.funnel.pctPerda, 0)} cancelados</p>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
                {[
                  ['Aprov. comitê', model.funnel.pctAprovSobrePipelineNn, 'high'] as const,
                  ['Conv. operação', model.funnel.pctOperacaoSobreAprovNn, 'high'] as const,
                  ['Taxa de perda', model.funnel.pctPerda, 'loss'] as const,
                ].map(([l, v, kind]) => {
                  const n = Number(v);
                  let color: (typeof PALETTE)[keyof typeof PALETTE] = PALETTE.gray;
                  if (kind === 'loss') {
                    color = n >= 30 ? PALETTE.red : n >= 15 ? PALETTE.amber : PALETTE.darkGreen;
                  } else {
                    color = n >= 60 ? PALETTE.darkGreen : n >= 30 ? PALETTE.amber : PALETTE.red;
                  }
                  return (
                    <div key={String(l)} className="rounded-md px-2 py-2 text-white" style={{ backgroundColor: color }}>
                      <div>{l}</div>
                      <div className="text-lg font-bold">{fmtPct(n, 0)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <SectionTitle>Ticket médio por projeto</SectionTitle>
      <div className="mb-8 rounded-lg border-[0.5px] border-stone-300 bg-white p-4 shadow-sm">
        {loading || !model ? (
          <Skeleton className="h-[200px]" />
        ) : (
          <>
            <p className="text-sm font-semibold text-stone-800">VGV pretendido e valor do terreno por projeto (R$ MM)</p>
            <div className="h-[200px]">
              <Bar
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  onClick: (_e, els) => {
                    if (!model || !els.length) return;
                    const i = els[0].index;
                    const row = model.drilldown.ticket[i];
                    if (!row) return;
                    setDrilldown({
                      title: model.ticketRows[i]?.label ?? 'Projeto',
                      subtitle: 'Ticket médio — processo',
                      rows: [row],
                    });
                  },
                  plugins: { legend: { position: 'bottom' }, dataLabels: { isDark: false } },
                  scales: {
                    x: { ticks: { color: chartFontColor(), maxRotation: 45 } },
                    y: { beginAtZero: true, ticks: { color: chartFontColor() } },
                  },
                }}
                data={{
                  labels: model.ticketRows.map((r) => r.label.slice(0, 18)),
                  datasets: [
                    {
                      label: 'VGV pretendido',
                      data: model.ticketRows.map((r) => Number(r.vgv.toFixed(2))),
                      backgroundColor: PALETTE.petrol,
                    },
                    {
                      label: 'Valor terreno',
                      data: model.ticketRows.map((r) => Number(r.terreno.toFixed(2))),
                      backgroundColor: PALETTE.amber,
                    },
                  ],
                }}
              />
            </div>
          </>
        )}
      </div>

      <SectionTitle>Tempo médio por fase</SectionTitle>
      <div className="mb-8 rounded-lg border-[0.5px] border-stone-300 bg-white p-4 shadow-sm">
        {loading || !model ? (
          <Skeleton className="h-[130px]" />
        ) : (
          <>
            <p className="text-xs text-stone-500">Dias médios estimados a partir de movimentações registradas</p>
            <div className="h-[130px]">
              <Bar
                options={{
                  indexAxis: 'y',
                  responsive: true,
                  maintainAspectRatio: false,
                  onClick: () => {
                    setDrilldown({
                      title: 'Tempo médio por fase',
                      subtitle: 'Média de dias entre movimentações; não há lista fixa por processo.',
                      rows: [],
                    });
                  },
                  plugins: { legend: { display: false }, dataLabels: { isDark: false } },
                  scales: {
                    x: { beginAtZero: true, ticks: { color: chartFontColor() } },
                    y: { ticks: { color: chartFontColor() } },
                  },
                }}
                data={{
                  labels: ['Pré comitê', 'Aprovado comitê', 'Operação em and.'],
                  datasets: [
                    {
                      data: [model.tempoFases.pre, model.tempoFases.aprov, model.tempoFases.op],
                      backgroundColor: [PALETTE.amber, PALETTE.darkGreen, PALETTE.petrol],
                    },
                  ],
                }}
              />
            </div>
          </>
        )}
      </div>

      <SectionTitle>Distribuição geográfica</SectionTitle>
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {loading || !model ? (
          <>
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </>
        ) : (
          <>
            <div className="rounded-lg border-[0.5px] border-stone-300 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-stone-800">Negócios por regional</p>
              <div className="mt-3 space-y-2">
                {model.regionalBars.map((r) => (
                  <button
                    type="button"
                    key={r.label}
                    className="block w-full text-left"
                    onClick={() =>
                      setDrilldown({
                        title: `Regional: ${r.label}`,
                        rows: model.drilldown.regional[r.label] ?? [],
                      })
                    }
                  >
                    <div className="flex justify-between text-xs text-stone-600">
                      <span>{r.label}</span>
                      <span>
                        {fmtInt(r.n)} neg. · {fmtPct(r.pct, 0)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded bg-stone-100">
                      <div className="h-full rounded" style={{ width: `${r.pct}%`, backgroundColor: PALETTE.petrol }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg border-[0.5px] border-stone-300 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-stone-800">Negócios por cidade (top 10)</p>
              <div className="mt-3 space-y-2">
                {(expandCity ? model.cityBars : model.cityBars.slice(0, 10)).map((r) => (
                  <button
                    type="button"
                    key={r.label}
                    className="block w-full text-left"
                    onClick={() =>
                      setDrilldown({
                        title: `Cidade: ${r.label}`,
                        rows: model.drilldown.city[r.label] ?? [],
                      })
                    }
                  >
                    <div className="flex justify-between text-xs text-stone-600">
                      <span>{r.label}</span>
                      <span>
                        {fmtInt(r.n)} · {fmtPct(r.pct, 1)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded bg-stone-100">
                      <div className="h-full rounded" style={{ width: `${r.pct}%`, backgroundColor: PALETTE.charcoal }} />
                    </div>
                  </button>
                ))}
              </div>
              {model.cityBars.length > 10 && (
                <button
                  type="button"
                  className="mt-3 w-full rounded border border-stone-300 py-2 text-xs text-stone-700"
                  onClick={() => setExpandCity((e) => !e)}
                >
                  {expandCity ? 'Recolher ↑' : `Ver todas as cidades (${model.cityBars.length}) ↓`}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <SectionTitle>Cobertura geográfica</SectionTitle>
      <div className="mb-8 overflow-x-auto rounded-lg border-[0.5px] border-stone-300 bg-white shadow-sm">
        {loading || !model ? (
          <Skeleton className="h-48" />
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
              <tr>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Franqueados</th>
                <th className="px-3 py-2">Negócios ativos</th>
                <th className="px-3 py-2">VGV</th>
                <th className="px-3 py-2">Cobertura</th>
              </tr>
            </thead>
            <tbody>
              {model.cobertura.map((row) => {
                let badge = { t: 'Sem franqueado', c: PALETTE.gray as string };
                if (row.temFrank && row.temNegocio) badge = { t: 'Com negócio', c: PALETTE.darkGreen };
                else if (row.temFrank && !row.temNegocio) badge = { t: 'Sem negócio', c: PALETTE.amber };
                return (
                  <tr
                    key={row.uf}
                    className="border-b border-stone-100 hover:bg-stone-50"
                    style={
                      !row.temNegocio && row.temFrank ? { backgroundColor: 'rgba(186,117,23,0.05)' } : undefined
                    }
                  >
                    <td className="px-3 py-2 font-medium">{row.uf}</td>
                    <td className="px-3 py-2">{fmtInt(row.franqueados)}</td>
                    <td className="px-3 py-2">{fmtInt(row.negocios)}</td>
                    <td className="px-3 py-2">{fmtCompactMillions(row.vgv)}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: badge.c }}>
                        {badge.t}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <SectionTitle>Ranking de franqueados</SectionTitle>
      <div className="mb-8 space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {loading || !model ? (
            <>
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </>
          ) : (
            <>
              <RankBarCard
                title="Por número de negócios"
                color={PALETTE.charcoal}
                formatValue={(v) => fmtInt(v)}
                rows={(expandRank ? model.rankingN : model.rankingN.slice(0, 10)).map((r) => ({
                  label: r.nome.slice(0, 28),
                  v: r.n,
                  userId: r.userId,
                }))}
                total={model.rankingN.length}
                expanded={expandRank}
                onToggle={() => setExpandRank((x) => !x)}
                onRowClick={(row) =>
                  setDrilldown({
                    title: `Franqueado: ${row.label}`,
                    subtitle: 'Negócios no universo filtrado',
                    rows: model.drilldown.byUserId[row.userId ?? ''] ?? [],
                  })
                }
              />
              <RankBarCard
                title="Por VGV total (R$ MM)"
                color={PALETTE.darkGreen}
                formatValue={(v) => fmtMoneyBRL(v)}
                rows={(expandRank ? model.rankingVgv : model.rankingVgv.slice(0, 10)).map((r) => ({
                  label: r.nome.slice(0, 28),
                  v: Number((r.vgv / 1e6).toFixed(2)),
                  userId: r.userId,
                }))}
                total={model.rankingVgv.length}
                expanded={expandRank}
                onToggle={() => setExpandRank((x) => !x)}
                onRowClick={(row) =>
                  setDrilldown({
                    title: `Franqueado: ${row.label}`,
                    subtitle: 'Negócios no universo filtrado',
                    rows: model.drilldown.byUserId[row.userId ?? ''] ?? [],
                  })
                }
              />
            </>
          )}
        </div>
        {loading || !model ? (
          <Skeleton className="h-64" />
        ) : (
          <RankBarCard
            title="Por VGV médio por negócio (R$ MM) — negócios ativos"
            color={PALETTE.amber}
            formatValue={(v) => fmtMoneyBRL(v)}
            rows={(expandRank ? model.rankingMedio : model.rankingMedio.slice(0, 10)).map((r) => ({
              label: r.nome.slice(0, 28),
              v: Number(r.med.toFixed(2)),
              userId: r.userId,
            }))}
            total={model.rankingMedio.length}
            expanded={expandRank}
            onToggle={() => setExpandRank((x) => !x)}
            fullWidth
            onRowClick={(row) =>
              setDrilldown({
                title: `Franqueado: ${row.label}`,
                subtitle: 'Negócios ativos no universo filtrado',
                rows: model.drilldown.byUserId[row.userId ?? ''] ?? [],
              })
            }
          />
        )}
      </div>

      <SectionTitle>Reincidência de franqueados</SectionTitle>
      <div className="mb-8 overflow-x-auto rounded-lg border-[0.5px] border-stone-300 bg-white shadow-sm">
        {loading || !model ? (
          <Skeleton className="h-32" />
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
              <tr>
                <th className="px-3 py-2">Franqueado</th>
                <th className="px-3 py-2">Cancelados</th>
                <th className="px-3 py-2">Ativos</th>
                <th className="px-3 py-2">VGV ativo</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {model.reincidencia.map((r) => (
                <tr key={r.nome} className="border-b border-stone-100 hover:bg-stone-50">
                  <td className="px-3 py-2">{r.nome}</td>
                  <td className="px-3 py-2">{fmtInt(r.cancelados)}</td>
                  <td className="px-3 py-2">{fmtInt(r.ativos)}</td>
                  <td className="px-3 py-2">{fmtCompactMillions(r.vgvAtivo)}</td>
                  <td className="px-3 py-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs text-white"
                      style={{ backgroundColor: PALETTE.darkGreen }}
                    >
                      Reincidente ativo
                    </span>
                  </td>
                </tr>
              ))}
              {model.reincidencia.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-stone-500">
                    Nenhum franqueado com cancelamentos e ativos simultâneos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <SectionTitle>Cancelamentos e reprovações</SectionTitle>
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {loading || !model ? (
          <>
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </>
        ) : (
          <>
            <DonutCard
              title="Motivos de cancelamento"
              entries={Array.from(model.motivoCancelCount.entries()).map(([k, n]) => ({ k, n }))}
              colors={[PALETTE.red, PALETTE.amber, PALETTE.gray, PALETTE.charcoal, PALETTE.darkGreen]}
              onSliceClick={(entry) =>
                setDrilldown({
                  title: `Cancelamento: ${entry.k}`,
                  subtitle: 'Processos cancelados com este motivo',
                  rows: model.drilldown.motivoCancel[entry.k] ?? [],
                })
              }
            />
            <div className="rounded-lg border-[0.5px] border-stone-300 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-stone-800">Motivos de reprovação em comitê</p>
              {model.motivoReproCount.size === 0 ? (
                <p className="mt-2 text-sm text-stone-500">
                  Campo criado. Aguardando preenchimento — sem dados consolidados ainda.
                </p>
              ) : (
                <DonutInner
                  entries={Array.from(model.motivoReproCount.entries()).map(([k, n]) => ({ k, n }))}
                  colors={[PALETTE.red, PALETTE.amber, PALETTE.gray, PALETTE.charcoal, PALETTE.darkGreen]}
                  onSliceClick={(entry) =>
                    setDrilldown({
                      title: `Reprovação em comitê: ${entry.k}`,
                      subtitle: 'Processos com este motivo',
                      rows: model.drilldown.motivoRepro[entry.k] ?? [],
                    })
                  }
                />
              )}
            </div>
          </>
        )}
      </div>

      <SectionTitle>Prazos</SectionTitle>
      <div className="mb-8 overflow-x-auto rounded-lg border-[0.5px] border-stone-300 bg-white shadow-sm">
        {loading || !model ? (
          <Skeleton className="h-40" />
        ) : (
          <table className="min-w-[720px] text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500">
              <tr>
                <th className="px-2 py-2">Projeto</th>
                <th className="px-2 py-2">Aprov. Condomínio</th>
                <th className="px-2 py-2">Aprov. Prefeitura</th>
                <th className="px-2 py-2">Alvará</th>
                <th className="px-2 py-2">Aprov. Crédito</th>
                <th className="px-2 py-2">Início de Obra</th>
              </tr>
            </thead>
            <tbody>
              {model.prazosRows.slice(0, 40).map((r) => (
                <tr key={r.projeto} className="border-b border-stone-100 hover:bg-stone-50">
                  <td className="max-w-[200px] truncate px-2 py-2">{r.projeto}</td>
                  <td className="px-2 py-2">{pillData(r.condominio)}</td>
                  <td className="px-2 py-2">{pillData(r.prefeitura)}</td>
                  <td className="px-2 py-2">{pillData(r.alvara)}</td>
                  <td className="px-2 py-2">{pillData(r.credito)}</td>
                  <td className="px-2 py-2">{pillObra(r.obra)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SectionTitle>Gargalos detectados</SectionTitle>
      <div className="mb-12 rounded-lg border-[0.5px] border-stone-300 bg-white p-4 shadow-sm">
        {loading || !model ? (
          <Skeleton className="h-[230px]" />
        ) : (
          <div className="h-[230px]">
            <Bar
              options={{
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                onClick: (_e, els) => {
                  if (!model || !els.length) return;
                  const i = els[0].index;
                  const g = model.gargalos[i];
                  if (!g) return;
                  setDrilldown({
                    title: g.key,
                    subtitle: 'Processos ativos com este gargalo',
                    rows: model.drilldown.gargalos[g.key] ?? [],
                  });
                },
                plugins: { legend: { display: false }, dataLabels: { isDark: false } },
                scales: {
                  x: { beginAtZero: true, ticks: { color: chartFontColor() } },
                  y: { ticks: { color: chartFontColor() } },
                },
              }}
              data={{
                labels: model.gargalos.map((g) => g.key),
                datasets: [
                  {
                    data: model.gargalos.map((g) => g.n),
                    backgroundColor: model.gargalos.map((g) => (g.n >= 3 ? PALETTE.red : PALETTE.amber)),
                  },
                ],
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function pillData(iso: string | null) {
  if (!iso) return <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-600">—</span>;
  const d = new Date(iso + 'T12:00:00');
  if (!Number.isFinite(d.getTime())) return <span className="text-xs">{iso}</span>;
  const today = new Date();
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  let bg: (typeof PALETTE)[keyof typeof PALETTE] = PALETTE.petrol;
  let label = iso;
  if (diff < 30) bg = PALETTE.red;
  else if (diff <= 90) bg = PALETTE.amber;
  return (
    <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: bg }}>
      {label}
    </span>
  );
}

function pillObra(d: Date | null) {
  if (!d)
    return <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-600">Pendente</span>;
  const iso = d.toISOString().slice(0, 10);
  return pillData(iso);
}

function RankBarCard({
  title,
  color,
  formatValue,
  rows,
  total,
  expanded,
  onToggle,
  fullWidth,
  onRowClick,
}: {
  title: string;
  color: string;
  formatValue: (v: number) => string;
  rows: { label: string; v: number; userId?: string }[];
  total: number;
  expanded: boolean;
  onToggle: () => void;
  fullWidth?: boolean;
  onRowClick?: (row: { label: string; v: number; userId?: string }) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  const h = rows.length * 28 + 60;
  return (
    <div
      className={`rounded-lg border-[0.5px] border-stone-300 bg-white p-4 shadow-sm transition-all duration-300 ${
        fullWidth ? 'lg:col-span-2' : ''
      }`}
      style={{ minHeight: expanded ? h : Math.min(h, 10 * 28 + 60) }}
    >
      <p className="text-sm font-semibold text-stone-800">{title}</p>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <button
            type="button"
            key={r.label}
            className={`flex w-full items-center gap-2 rounded text-left ${onRowClick ? 'hover:bg-stone-50' : ''}`}
            onClick={() => onRowClick?.(r)}
            disabled={!onRowClick}
          >
            <div className="w-[40%] truncate text-xs text-stone-700">{r.label}</div>
            <div className="relative h-6 flex-1 rounded bg-stone-100">
              <div
                className="absolute left-0 top-0 h-6 rounded"
                style={{ width: `${(100 * r.v) / max}%`, backgroundColor: color }}
              />
            </div>
            <div className="w-14 shrink-0 text-right text-xs text-stone-700">{formatValue(r.v)}</div>
          </button>
        ))}
      </div>
      {total > 10 && (
        <button
          type="button"
          className="mt-3 w-full rounded border border-stone-300 py-2 text-xs text-stone-700"
          onClick={onToggle}
        >
          {expanded ? 'Recolher ↑' : `Ver todos (${total}) ↓`}
        </button>
      )}
    </div>
  );
}

function DonutCard({
  title,
  entries,
  colors,
  onSliceClick,
}: {
  title: string;
  entries: { k: string; n: number }[];
  colors: string[];
  onSliceClick?: (entry: { k: string; n: number }, index: number) => void;
}) {
  return (
    <div className="rounded-lg border-[0.5px] border-stone-300 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-stone-800">{title}</p>
      <DonutInner entries={entries} colors={colors} onSliceClick={onSliceClick} />
    </div>
  );
}

function DonutInner({
  entries,
  colors,
  total: totalIn,
  onSliceClick,
}: {
  entries: { k: string; n: number }[];
  colors: string[];
  total?: number;
  onSliceClick?: (entry: { k: string; n: number }, index: number) => void;
}) {
  const total = totalIn ?? (entries.reduce((s, e) => s + e.n, 0) || 1);
  if (entries.length === 0) {
    return <p className="mt-4 text-sm text-stone-500">Sem dados.</p>;
  }
  return (
    <>
      <div className="mx-auto h-48 w-48">
        <Doughnut
          data={{
            labels: entries.map((e) => e.k),
            datasets: [
              {
                data: entries.map((e) => e.n),
                backgroundColor: entries.map((_, i) => colors[i % colors.length]),
                borderWidth: 0,
              },
            ],
          }}
          options={{
            cutout: '62%',
            plugins: { legend: { display: false } },
            onClick: (_evt, elements) => {
              if (!elements.length || !onSliceClick) return;
              const i = elements[0].index;
              const entry = entries[i];
              if (entry) onSliceClick(entry, i);
            },
          }}
        />
      </div>
      <ul className="mt-3 space-y-1 text-xs text-stone-700">
        {entries.map((e, i) => (
          <li key={e.k} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: colors[i % colors.length] }} />
            {e.k} — {fmtInt(e.n)} ({fmtPct((100 * e.n) / total, 0)})
          </li>
        ))}
      </ul>
    </>
  );
}
