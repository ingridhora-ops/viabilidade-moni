import { guardLoginRequired } from '@/lib/auth-guard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listJuridicoTickets } from '../actions';
import { MoniFooter } from '@/components/MoniFooter';
import { KanbanColumn } from './KanbanColumn';

const COLUMNS = [
  { key: 'nova_duvida', label: 'Nova Dúvida' },
  { key: 'em_analise', label: 'Em análise com Jurídico' },
  { key: 'paralisado', label: 'Paralisado' },
  { key: 'finalizado', label: 'Finalizado' },
] as const;

export default async function JuridicoKanbanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  guardLoginRequired(user);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = (profile?.role as string) ?? 'frank';
  if (role !== 'consultor' && role !== 'admin') redirect('/juridico');

  const result = await listJuridicoTickets();
  const tickets = result.ok ? result.tickets : [];
  const byStatus = COLUMNS.reduce(
    (acc, col) => {
      acc[col.key] = tickets.filter((t) => t.status === col.key);
      return acc;
    },
    {} as Record<string, typeof tickets>,
  );

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link href="/juridico" className="text-moni-primary hover:underline">
            ← Canal jurídico
          </Link>
          <span className="text-stone-400">/</span>
          <span className="font-medium text-stone-700">Kanban Jurídico</span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl overflow-x-auto px-4 py-6">
        <h1 className="mb-4 text-xl font-bold text-moni-dark">Kanban Jurídico</h1>
        <div className="flex min-w-max gap-4">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.key}
              columnKey={col.key}
              title={col.label}
              tickets={byStatus[col.key] ?? []}
            />
          ))}
        </div>
      </main>
      <MoniFooter />
    </div>
  );
}
