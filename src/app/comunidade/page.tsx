import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fetchRedeFranqueados } from '@/lib/rede-franqueados';
import { TabelaRedeFranqueados } from '@/components/TabelaRedeFranqueados';
import { TimelineComunidade } from './TimelineComunidade';

export default async function ComunidadePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const data = await fetchRedeFranqueados(supabase);

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
          <Link href="/" className="text-moni-primary hover:underline">
            ← Início
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8">
        <div className="card">
          <h1 className="text-xl font-bold text-moni-dark">COMUNIDADE Moní</h1>
          <p className="mt-2 text-stone-600">
            Espaço onde franqueados compartilham assuntos em timelines públicas. Outros franqueados
            podem ver e curtir as publicações.
          </p>
          <div className="mt-6">
            <TimelineComunidade />
          </div>
        </div>

        <section className="card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-moni-dark">Rede de Franqueados</h2>
              <p className="mt-1 text-sm text-stone-600">
                Tabela de franqueados gerenciada dentro da ferramenta.
              </p>
            </div>
            {data && (
              <div className="shrink-0 rounded-xl border-2 border-moni-primary bg-moni-primary/5 px-6 py-4 text-right">
                <p className="text-sm font-medium text-stone-600">Franqueados ativos</p>
                <p className="mt-0.5 text-2xl font-bold text-moni-dark">{data.activeCount}</p>
              </div>
            )}
          </div>
          <div className="mt-4">
            <TabelaRedeFranqueados data={data} compact />
          </div>
        </section>
      </main>
    </div>
  );
}
