import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isAppFullyPublic } from '@/lib/public-rede-novos';
import { FormularioInicioProcesso } from './FormularioInicioProcesso';

export default async function IniciarProcessoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isAppFullyPublic()) {
    redirect(`/login?next=${encodeURIComponent('/iniciar-processo')}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <Link href="/" className="font-medium text-moni-primary hover:text-moni-secondary">
            ← Início
          </Link>
          <span className="mx-2 text-stone-300">/</span>
          <span className="text-stone-600">Iniciar processo</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <FormularioInicioProcesso sharePath="/iniciar-processo" />
      </main>
    </div>
  );
}
