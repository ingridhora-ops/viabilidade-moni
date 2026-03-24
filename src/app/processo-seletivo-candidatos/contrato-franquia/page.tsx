import { guardLoginRequired } from '@/lib/auth-guard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function ContratoFranquiaPage() {
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
  if (role !== 'admin' && role !== 'supervisor') redirect('/');

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
          <Link href="/" className="text-moni-primary hover:underline">
            ← Início
          </Link>
          <span className="mx-2 text-stone-400">/</span>
          <Link href="/processo-seletivo-candidatos" className="text-moni-primary hover:underline">
            Processo seletivo candidatos
          </Link>
          <span className="mx-2 text-stone-400">/</span>
          <span className="font-semibold text-moni-dark">Contrato de Franquia</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="card">
          <h1 className="text-xl font-bold text-moni-dark">Contrato de Franquia</h1>
          <p className="mt-2 text-stone-600">
            Contrato de franquia do processo seletivo de candidatos.
          </p>
          <div className="mt-6 rounded-xl border border-dashed border-stone-200 bg-stone-50 p-8 text-center text-sm text-stone-500">
            Conteúdo em construção.
          </div>
        </div>
      </main>
    </div>
  );
}
