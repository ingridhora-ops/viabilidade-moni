'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { PAINEL_COLUMNS, type PainelColumnKey } from './painelColumns';
import { PainelFlowBoard } from './PainelFlowBoard';
import type { CardStatusFilter, CardTagFilter, ProcessoCard } from './StepsKanbanColumn';
import { NovoNegocioBatchUploader } from '../painel-novos-negocios/NovoNegocioBatchUploader';

function normalizarParaBusca(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function cardCumpreBusca(p: ProcessoCard, buscaNorm: string): boolean {
  if (!buscaNorm) return true;
  const texto =
    [p.numero_franquia, p.franqueado_nome, p.nome_condominio]
      .filter(Boolean)
      .join(' ') || '';
  return normalizarParaBusca(texto).includes(buscaNorm);
}

type Props = {
  byEtapa: Record<PainelColumnKey, ProcessoCard[]>;
  initialOpenProcessId?: string;
  kanbanReadOnly?: boolean;
};

export function PainelNovosNegociosClient({ byEtapa, initialOpenProcessId, kanbanReadOnly = false }: Props) {
  const [busca, setBusca] = useState('');
  const [statusFilter, setStatusFilter] = useState<CardStatusFilter>('ativos');
  const [tagFilter, setTagFilter] = useState<CardTagFilter>('todas');

  const filteredByEtapa = useMemo(() => {
    const buscaNorm = normalizarParaBusca(busca);
    return (PAINEL_COLUMNS as { key: PainelColumnKey }[]).reduce(
      (acc, col) => {
        const list = (byEtapa[col.key] ?? []).filter((p) => cardCumpreBusca(p, buscaNorm));
        acc[col.key] = list;
        return acc;
      },
      {} as Record<PainelColumnKey, ProcessoCard[]>,
    );
  }, [byEtapa, busca]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por Nº franquia, nome do franqueado ou condomínio"
            className="w-full rounded-lg border border-stone-300 py-2 pl-9 pr-3 text-sm text-stone-800 placeholder:text-stone-400 focus:border-moni-primary focus:outline-none focus:ring-1 focus:ring-moni-primary"
          />
        </div>
        <Link
          href="/painel-novos-negocios/tarefas"
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          Painel de Tarefas
        </Link>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CardStatusFilter)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700"
          aria-label="Filtrar status dos cards"
        >
          <option value="ativos">Ativos</option>
          <option value="cancelados">Cancelados</option>
          <option value="removidos">Excluídos</option>
          <option value="concluidos">Concluídos</option>
          <option value="todos">Todos</option>
        </select>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value as CardTagFilter)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700"
          aria-label="Filtrar tags dos cards"
        >
          <option value="todas">Tags: todas</option>
          <option value="atrasado">Tag: Atrasado</option>
          <option value="atencao">Tag: Atenção</option>
        </select>
      </div>
      <PainelFlowBoard
        byEtapa={filteredByEtapa}
        initialOpenProcessId={initialOpenProcessId}
        statusFilter={statusFilter}
        tagFilter={tagFilter}
        kanbanReadOnly={kanbanReadOnly}
        step2HeaderActions={
          <NovoNegocioBatchUploader
            onCreated={() => {
              // Apenas visual; o refresh real será no próprio componente.
            }}
          />
        }
      />
    </>
  );
}
