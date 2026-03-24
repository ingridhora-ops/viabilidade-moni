'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import type { PainelColumnKey } from './painelColumns';
import { PainelCard } from './PainelCard';
import { atualizarEtapaPainel } from './actions';
import type { ReactNode } from 'react';

export type ProcessoCard = {
  id: string;
  cidade: string;
  estado: string | null;
  status: string;
  cancelado_motivo?: string | null;
  removido_motivo?: string | null;
  cancelado_em?: string | null;
  removido_em?: string | null;
  etapa_atual: number;
  updated_at: string | null;
  franqueado_nome?: string | null;
  numero_franquia?: string | null;
  nome_condominio?: string | null;
  quadra_lote?: string | null;
  step_atual?: number;
  etapa_painel: PainelColumnKey | string;
  trava_painel?: boolean;
  /** Se = 'Permuta', a etapa Crédito Terreno é desconsiderada (card não aparece na coluna). */
  tipo_aquisicao_terreno?: string | null;
  /** Observações do formulário de abertura. */
  observacoes?: string | null;
  has_atividade_atrasada?: boolean;
  has_atividade_atencao?: boolean;
  has_comite_aprovado?: boolean;
  /** Ordem dentro da coluna `etapa_painel` (menor = mais acima). */
  ordem_coluna_painel?: number | null;
};

export type CardStatusFilter = 'ativos' | 'cancelados' | 'removidos' | 'concluidos' | 'todos';
export type CardTagFilter = 'todas' | 'atrasado' | 'atencao';

export function StepsKanbanColumn({
  title,
  subtitle,
  processos,
  etapaKey,
  step2HeaderActions,
  initialOpenProcessId,
  statusFilter = 'ativos',
  tagFilter = 'todas',
  kanbanReadOnly = false,
}: {
  title: string;
  subtitle?: string;
  processos: ProcessoCard[];
  etapaKey: PainelColumnKey;
  step2HeaderActions?: ReactNode;
  initialOpenProcessId?: string;
  statusFilter?: CardStatusFilter;
  tagFilter?: CardTagFilter;
  /** Sem sessão (ex.: painel público): esconde controles de reordenar. */
  kanbanReadOnly?: boolean;
}) {
  const router = useRouter();

  const processosFiltrados = useMemo(() => {
    return processos.filter((p) => {
      const st = String(p.status ?? '').toLowerCase();
      const isCancelado = st === 'cancelado' || Boolean(p.cancelado_em);
      const isRemovido = st === 'removido' || Boolean(p.removido_em);
      const isConcluido = st === 'concluido';
      if (statusFilter !== 'todos') {
        const wanted = statusFilter;
        if (wanted === 'ativos' && (isCancelado || isRemovido || isConcluido)) return false;
        if (wanted === 'cancelados' && !isCancelado) return false;
        if (wanted === 'removidos' && !isRemovido) return false;
        if (wanted === 'concluidos' && !isConcluido) return false;
      }

      if (tagFilter !== 'todas') {
        // Cards cancelados/removidos/concluídos não exibem tags de prazo.
        if (isCancelado || isRemovido || isConcluido) return false;
        const hasAtrasado = Boolean(p.has_atividade_atrasada);
        const hasAtencao = Boolean(p.has_atividade_atencao) && !hasAtrasado;
        if (tagFilter === 'atrasado' && !hasAtrasado) return false;
        if (tagFilter === 'atencao' && !hasAtencao) return false;
      }

      return true;
    });
  }, [processos, statusFilter, tagFilter]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { processoId?: string; fromEtapa?: string };
      if (!data.processoId) return;
      if (data.fromEtapa === etapaKey) return;
      // Step 1 não pode passar cards para Step 2
      if (data.fromEtapa === 'step_1' && etapaKey === 'step_2') return;
        // Aprovação Moní é obrigatória entre Step 2 e Step 3
        if (data.fromEtapa === 'step_2' && (etapaKey === 'step_3' || etapaKey === 'credito_terreno')) return;
      const res = await atualizarEtapaPainel(data.processoId, etapaKey);
      if (res.ok) router.refresh();
    } catch {
      // ignora drops inválidos
    }
  };

  const isStep1 = etapaKey === 'step_1';
  const isStep2 = etapaKey === 'step_2';

  return (
    <div
      className={`w-72 shrink-0 overflow-hidden rounded-xl border shadow-sm ${
        isStep1
          ? 'border-green-300 bg-green-50/80'
          : 'border-stone-200 bg-white'
      }`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        className={`border-b px-4 py-3 ${isStep1 ? 'border-green-200 bg-green-100' : 'border-stone-200 bg-stone-100'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className={`font-semibold ${isStep1 ? 'text-green-900' : 'text-stone-800'}`}>{title}</h2>
          <div className="flex items-start gap-2">
            {isStep1 && (
              <div className="flex flex-col items-stretch gap-1">
                <Link
                  href="/painel-novos-negocios/novo-step-1"
                  className="shrink-0 rounded-md border border-green-600 bg-green-600 px-2 py-1 text-center text-[11px] font-medium text-white hover:bg-green-700"
                >
                  Novo Step 1
                </Link>
              </div>
            )}
            {isStep2 && (
              <div className="flex flex-col items-stretch gap-1">
                <Link
                  href="/painel-novos-negocios/novo"
                  className="w-full whitespace-nowrap rounded-md bg-moni-primary px-2 py-1 text-center text-[11px] font-medium text-white hover:bg-moni-secondary"
                >
                  Novo Negócio
                </Link>
                {step2HeaderActions ? <div className="w-full">{step2HeaderActions}</div> : null}
              </div>
            )}
          </div>
        </div>
        {subtitle && (
          <p className={`mt-1 text-[10px] leading-tight ${isStep1 ? 'text-green-700' : 'text-stone-500'}`}>{subtitle}</p>
        )}
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={`text-xs ${isStep1 ? 'text-green-700' : 'text-stone-500'}`}>{processosFiltrados.length} processo(s)</p>
        </div>
      </div>
      <div
        className={`max-h-[70vh] space-y-2 overflow-y-auto p-2 ${isStep1 ? 'bg-green-50/50' : ''}`}
      >
        {processosFiltrados.map((p, i) => (
          <PainelCard
            key={p.id}
            p={p}
            etapaKey={etapaKey}
            autoOpen={p.id === initialOpenProcessId}
            vizinhoAcimaId={i > 0 ? processosFiltrados[i - 1]?.id : undefined}
            vizinhoAbaixoId={i < processosFiltrados.length - 1 ? processosFiltrados[i + 1]?.id : undefined}
            kanbanReadOnly={kanbanReadOnly}
          />
        ))}
        {processosFiltrados.length === 0 && (
          <div className="rounded-lg border border-dashed border-stone-200 p-4 text-center text-sm text-stone-400">
            Nenhum processo
          </div>
        )}
      </div>
    </div>
  );
}
