import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isAdminRole } from '@/lib/authz';
import { isAppFullyPublic, isPublicRedeNovosNegociosEnabled } from '@/lib/public-rede-novos';
import { fetchRedeFranqueadosRows } from '@/lib/rede-franqueados';
import { TabelaRedeFranqueadosEditavel } from '@/components/TabelaRedeFranqueadosEditavel';
import { contarLinhasSemCard } from './actions';
import { CriarCardsDesdeRedeButton } from './CriarCardsDesdeRedeButton';
import { ImportarRedeCSVButton } from './ImportarRedeCSVButton';
import { ExportarRedeCSVButton } from './ExportarRedeCSVButton';
import { AdicionarRedeECardButton } from './AdicionarRedeECardButton';
import { RedeDashboard } from './RedeDashboard';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function RedeFranqueadosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const publicAccess = isPublicRedeNovosNegociosEnabled();

  let db = supabase;
  if (!user && (publicAccess || isAppFullyPublic())) {
    try {
      db = createAdminClient();
    } catch {
      /* sem service role: RLS pode ocultar linhas */
    }
  }

  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).single()
    : { data: null };
  const role = (profile?.role as string) ?? 'frank';
  const canManage =
    (Boolean(user) && isAdminRole(role)) || publicAccess || isAppFullyPublic();

  const [rows, countResult] = await Promise.all([
    fetchRedeFranqueadosRows(db),
    canManage ? contarLinhasSemCard() : Promise.resolve({ ok: true as const, total: 0 }),
  ]);
  const linhasSemCard = countResult.ok ? countResult.total : 0;

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link href="/" className="text-moni-primary hover:underline">
            ← Início
          </Link>
          <span className="text-stone-400">/</span>
          <span className="font-semibold text-moni-dark">Rede de Franqueados</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-moni-dark">Tabela de Franqueados</h1>
            <p className="mt-1 text-sm text-stone-600">
              Tabela de franqueados gerenciada dentro da ferramenta (fonte: banco de dados).
            </p>
          </div>
        </div>

        {rows && rows.length > 0 && (
          <div className="mb-6">
            <RedeDashboard rows={rows} />
          </div>
        )}

        {canManage && (
          <div className="mb-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <AdicionarRedeECardButton />
            </div>
            <ImportarRedeCSVButton />
            <CriarCardsDesdeRedeButton linhasSemCard={linhasSemCard} />
          </div>
        )}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-stone-800">Tabela de Rede de Franqueados</h2>
          {rows && <ExportarRedeCSVButton rows={rows} />}
        </div>
        {rows ? (
          <TabelaRedeFranqueadosEditavel rows={rows} canEditRows={canManage} />
        ) : (
          <p className="text-sm text-red-600">Erro ao carregar a tabela.</p>
        )}
      </main>
    </div>
  );
}
