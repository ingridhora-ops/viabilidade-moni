'use client';

import { PAINEL_COLUMNS, PAINEL_FLOW_ROWS, type PainelColumnKey } from './painelColumns';
import { StepsKanbanColumn, type CardStatusFilter, type CardTagFilter, type ProcessoCard } from './StepsKanbanColumn';
import type { ReactNode } from 'react';

type Props = {
  byEtapa: Record<PainelColumnKey, ProcessoCard[]>;
  step2HeaderActions?: ReactNode;
  initialOpenProcessId?: string;
  statusFilter?: CardStatusFilter;
  tagFilter?: CardTagFilter;
  kanbanReadOnly?: boolean;
};

export function PainelFlowBoard({
  byEtapa,
  step2HeaderActions,
  initialOpenProcessId,
  statusFilter,
  tagFilter,
  kanbanReadOnly = false,
}: Props) {
  return (
    <div className="flex items-stretch gap-4 overflow-x-auto pb-4 pt-2">
      {PAINEL_FLOW_ROWS.map((row, rowIndex) => {
        const isParallel = row.type === 'parallel' && row.keys.length > 1;
        const keys = row.keys;

        if (isParallel) {
          return (
            <div key={rowIndex} className="flex items-stretch gap-4">
              {keys.map((key) => {
                const col = PAINEL_COLUMNS.find((c) => c.key === key);
                if (!col) return null;
                return (
                  <StepsKanbanColumn
                    key={key}
                    title={col.title}
                    subtitle={col.subtitle}
                    processos={byEtapa[key] ?? []}
                    etapaKey={key}
                    step2HeaderActions={step2HeaderActions}
                    initialOpenProcessId={initialOpenProcessId}
                    statusFilter={statusFilter}
                    tagFilter={tagFilter}
                    kanbanReadOnly={kanbanReadOnly}
                  />
                );
              })}
            </div>
          );
        }

        return (
          <div key={rowIndex} className="flex items-stretch gap-4">
            {keys.map((key) => {
              const col = PAINEL_COLUMNS.find((c) => c.key === key);
              if (!col) return null;
              return (
                <StepsKanbanColumn
                  key={key}
                  title={col.title}
                  subtitle={col.subtitle}
                  processos={byEtapa[key] ?? []}
                  etapaKey={key}
                  step2HeaderActions={step2HeaderActions}
                  initialOpenProcessId={initialOpenProcessId}
                  statusFilter={statusFilter}
                  tagFilter={tagFilter}
                  kanbanReadOnly={kanbanReadOnly}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
