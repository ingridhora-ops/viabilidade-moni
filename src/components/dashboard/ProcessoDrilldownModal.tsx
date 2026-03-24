'use client';

import Link from 'next/link';
import type { ProcessoDashRow } from '@/lib/dashboard-novos-negocios/fetchData';
import { getHrefForProcesso } from '@/app/steps-viabilidade/painelColumns';
import type { PainelColumnKey } from '@/app/steps-viabilidade/painelColumns';
import { fmtCompactMillions, fmtInt } from '@/lib/dashboard-novos-negocios/format';
import { parseMoneyText } from '@/lib/dashboard-novos-negocios/parseMoney';

function vgvOf(p: ProcessoDashRow): number {
  return parseMoneyText(p.vgv_pretendido) ?? 0;
}

export function ProcessoDrilldownModal({
  open,
  title,
  subtitle,
  rows,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  rows: ProcessoDashRow[];
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div
        className="relative z-[81] max-h-[85vh] w-full max-w-lg overflow-hidden rounded-t-xl border border-stone-200 bg-white shadow-xl sm:rounded-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drilldown-title"
      >
        <div className="flex items-start justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <div>
            <h2 id="drilldown-title" className="text-sm font-semibold text-stone-900">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p> : null}
            <p className="mt-1 text-xs text-stone-500">{fmtInt(rows.length)} processo(s)</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-stone-600 hover:bg-stone-100"
          >
            Fechar
          </button>
        </div>
        <ul className="max-h-[min(60vh,520px)] overflow-y-auto divide-y divide-stone-100 px-0">
          {rows.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-stone-500">Nenhum processo neste segmento.</li>
          ) : (
            rows.map((p) => {
              const ep = (p.etapa_painel ?? 'step_1') as PainelColumnKey;
              const href = getHrefForProcesso(ep, p.id);
              const label =
                [p.numero_franquia, p.nome_condominio].filter(Boolean).join(' · ') || p.id.slice(0, 8);
              return (
                <li key={p.id} className="px-4 py-2.5 hover:bg-stone-50">
                  <Link
                    href={href}
                    className="block text-sm font-medium text-moni-primary hover:underline"
                    onClick={onClose}
                  >
                    {label}
                  </Link>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {[p.cidade, p.estado].filter(Boolean).join(', ') || '—'} · VGV {fmtCompactMillions(vgvOf(p))}
                  </p>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
