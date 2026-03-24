import { guardLoginRequired } from '@/lib/auth-guard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function PreObraPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  guardLoginRequired(user);

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
          <Link href="/" className="text-moni-primary hover:underline">
            ← Início
          </Link>
          <span className="mx-2 text-stone-400">/</span>
          <span className="font-semibold text-moni-dark">Pré Obra</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="card">
          <h1 className="text-xl font-bold text-moni-dark">Pré Obra</h1>
          <p className="mt-2 text-stone-600">Conteúdo em construção.</p>
          <div className="mt-6 rounded-xl border border-dashed border-stone-200 bg-stone-50 p-8 text-center text-sm text-stone-500">
            Em breve você poderá acessar esta seção aqui.
          </div>
        </div>
      </main>
    </div>
  );
}
