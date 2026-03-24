'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import type { PainelColumnKey } from './painelColumns';
import { CardDetalheModal } from './CardDetalheModal';
import type { ProcessoCard } from './StepsKanbanColumn';
import { reordenarCardNaColunaPainel } from './actions';

export function PainelCard({
  p,
  etapaKey,
  autoOpen = false,
  vizinhoAcimaId,
  vizinhoAbaixoId,
  kanbanReadOnly = false,
}: {
  p: ProcessoCard;
  etapaKey: PainelColumnKey;
  autoOpen?: boolean;
  /** Card exibido imediatamente acima (lista filtrada); usado para subir. */
  vizinhoAcimaId?: string;
  /** Card exibido imediatamente abaixo; usado para descer. */
  vizinhoAbaixoId?: string;
  kanbanReadOnly?: boolean;
}) {
  const router = useRouter();
  const [reorderPending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);
  /** Mesma estrutura do Step 2 (Nº franquia - condomínio - quadra/lote) em todo o fluxo após Step 1, inclusive Contabilidade e Crédito. */
  const usesNovoNegocioCardTitle = etapaKey !== 'step_1';
  const st = String(p.status ?? '').toLowerCase();
  const isCancelado = st === 'cancelado' || Boolean(p.cancelado_em);
  const isRemovido = st === 'removido' || Boolean(p.removido_em);
  const isConcluido = st === 'concluido';
  const motivoCancelado = p.cancelado_motivo ?? null;
  const motivoRemovido = p.removido_motivo ?? null;
  const processoLabel = `${p.cidade ?? 'Sem cidade'}${p.estado ? `, ${p.estado}` : ''}`;

  const numeroFranquia = p.numero_franquia ?? '—';
  const tituloCartao =
    etapaKey === 'step_1'
      ? `${numeroFranquia}`
      : `${numeroFranquia} - ${p.nome_condominio ?? '—'}${p.quadra_lote ? ` - ${p.quadra_lote}` : ''}`;

  const reorderEnabled = !kanbanReadOnly && !p.trava_painel && !isCancelado && !isRemovido;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (p.trava_painel || isCancelado || isRemovido) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ processoId: p.id, fromEtapa: etapaKey }),
    );
  };

  const hasAtrasado = Boolean(p.has_atividade_atrasada);
  const hasAtencao = Boolean(p.has_atividade_atencao) && !hasAtrasado;
  const hasComiteAprovado = Boolean(p.has_comite_aprovado);

  useEffect(() => {
    if (!autoOpen || autoOpened) return;
    setModalOpen(true);
    setAutoOpened(true);
  }, [autoOpen, autoOpened]);

  const handleReorder = (dir: 'up' | 'down', vizinhoId: string | undefined) => {
    if (!vizinhoId || reorderPending) return;
    startTransition(() => {
      void (async () => {
        const res = await reordenarCardNaColunaPainel(p.id, etapaKey, dir, vizinhoId);
        if (res.ok) router.refresh();
      })();
    });
  };

  return (
    <>
      <div
        className={`relative rounded-lg border p-3 shadow-sm transition ${
          p.trava_painel
            ? 'border-amber-400 bg-amber-50/80'
            : etapaKey === 'step_1' && p.status === 'concluido'
              ? 'border-green-500 bg-green-50'
              : 'border-stone-200 bg-white'
        }`}
        onClick={() => setModalOpen(true)}
        draggable={!p.trava_painel && !isCancelado && !isRemovido && !isConcluido}
        onDragStart={handleDragStart}
      >
        {reorderEnabled ? (
          <div className="absolute left-2 top-2 flex flex-col gap-0">
            <button
              type="button"
              disabled={!vizinhoAcimaId || reorderPending}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleReorder('up', vizinhoAcimaId);
              }}
              className="rounded p-0.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700 disabled:pointer-events-none disabled:opacity-30"
              title="Mover para cima na coluna"
              aria-label="Mover card para cima na coluna"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={!vizinhoAbaixoId || reorderPending}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleReorder('down', vizinhoAbaixoId);
              }}
              className="rounded p-0.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700 disabled:pointer-events-none disabled:opacity-30"
              title="Mover para baixo na coluna"
              aria-label="Mover card para baixo na coluna"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        <div className="absolute right-2 top-2 flex gap-0.5">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setModalOpen(true); }}
            className="rounded p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
            title="Comentários, atividades e tópicos"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className={`block pr-10 ${reorderEnabled ? 'pl-7' : ''}`}>
          {p.trava_painel && (
            <span className="mb-1 inline-block rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
              Travado
            </span>
          )}
          {etapaKey === 'step_1' && p.status === 'concluido' && (
            <span className="mb-1 inline-block rounded bg-green-200 px-1.5 py-0.5 text-[10px] font-medium text-green-900">
              Finalizado
            </span>
          )}
          {!isCancelado && !isRemovido && hasAtrasado && (
            <span className="mb-1 ml-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
              Atrasado
            </span>
          )}
          {!isCancelado && !isRemovido && hasAtencao && (
            <span className="mb-1 ml-1 inline-block rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-800">
              Atenção
            </span>
          )}
          {!isCancelado && !isRemovido && hasComiteAprovado && (
            <span className="mb-1 ml-1 inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
              Aprovado em Comitê
            </span>
          )}
          {isCancelado && (
            <span
              className="mb-1 ml-1 inline-block rounded bg-red-200 px-1.5 py-0.5 text-[10px] font-medium text-red-900"
              title={motivoCancelado ?? 'Cancelado'}
            >
              Cancelado
            </span>
          )}
          {isRemovido && (
            <span
              className="mb-1 ml-1 inline-block rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-900"
              title={motivoRemovido ?? 'Excluído'}
            >
              Excluído
            </span>
          )}
          <p className="text-sm font-medium text-stone-800">
            {tituloCartao}
          </p>
          {p.franqueado_nome && (
            <p className="mt-0.5 text-xs text-stone-400">{p.franqueado_nome}</p>
          )}
          {((!['step_1', 'step_2'].includes(etapaKey) && !usesNovoNegocioCardTitle) || !p.franqueado_nome) && (
            <p className="mt-0.5 text-xs text-stone-500">
              {p.cidade ?? 'Sem cidade'}
              {p.estado ? `, ${p.estado}` : ''}
            </p>
          )}
          {p.tipo_aquisicao_terreno && (
            <p className="mt-0.5 text-xs text-stone-500">Tipo: {p.tipo_aquisicao_terreno}</p>
          )}
          {p.observacoes && (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-stone-500" title={p.observacoes}>
              {p.observacoes.length > 80 ? `${p.observacoes.slice(0, 80)}…` : p.observacoes}
            </p>
          )}
          <p className="mt-1 text-xs text-stone-400">
            {isCancelado ? 'Cancelado' : isRemovido ? 'Excluído' : p.status === 'concluido' ? 'Concluído' : p.status === 'em_andamento' ? 'Em andamento' : 'Rascunho'}
            {p.updated_at ? ` · ${new Date(p.updated_at).toLocaleDateString('pt-BR')}` : ''}
          </p>
          {isCancelado && motivoCancelado ? (
            <p className="mt-1 text-[11px] text-red-700 line-clamp-2" title={motivoCancelado}>
              Motivo: {motivoCancelado}
            </p>
          ) : null}
          {isRemovido && motivoRemovido ? (
            <p className="mt-1 text-[11px] text-amber-700 line-clamp-2" title={motivoRemovido}>
              Motivo: {motivoRemovido}
            </p>
          ) : null}
        </div>
        <div className="mt-2 border-t border-stone-100 pt-2 text-[10px] text-stone-400">
          {reorderEnabled
            ? 'Arraste para mudar de etapa. Setas para ordem na coluna.'
            : 'Arraste o card para mudar de etapa.'}
        </div>
      </div>
      {modalOpen && (
        <CardDetalheModal
          processoId={p.id}
          etapaKey={etapaKey}
          processoLabel={processoLabel}
          tipoAquisicaoTerreno={p.tipo_aquisicao_terreno ?? null}
          status={p.status}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
