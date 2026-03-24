import { guardLoginRequired } from '@/lib/auth-guard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function Step6Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  guardLoginRequired(user);

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <Link href="/painel-novos-negocios" className="font-medium text-moni-primary hover:underline">
            ← Painel Novos Negócios
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-12">
        <div className="card">
          <h1 className="text-2xl font-bold text-moni-dark">Step 06: Diligência</h1>
          <p className="mt-2 text-stone-600">Etapa de diligência do fluxo de viabilidade.</p>
          <div className="mt-6 rounded-xl border border-dashed border-stone-200 bg-stone-50 p-8 text-center text-sm text-stone-500">
            Conteúdo em construção.
          </div>
          <Link
            href="/painel-novos-negocios"
            className="mt-4 inline-block font-medium text-moni-accent hover:underline"
          >
            Voltar ao Painel →
          </Link>
        </div>
      </main>
    </div>
  );
}
