import { guardLoginRequired } from '@/lib/auth-guard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { NovaDuvidaForm } from './NovaDuvidaForm';
import { MoniFooter } from '@/components/MoniFooter';

export default async function JuridicoNovaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  guardLoginRequired(user);

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();
  const defaultNome =
    (profile?.full_name as string)?.trim() || (user.email?.split('@')[0] ?? '') || '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 via-white to-stone-50">
      <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link href="/juridico" className="text-moni-primary hover:underline">
            ← Jurídico
          </Link>
          <span className="text-stone-400">/</span>
          <span className="font-medium text-stone-700">Nova dúvida</span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-bold text-moni-dark">Nova dúvida jurídica</h1>
        <p className="mt-1 text-sm text-stone-600">
          Descreva sua dúvida. Você poderá anexar documentos na próxima tela.
        </p>
        <NovaDuvidaForm defaultNome={defaultNome} />
      </main>
      <MoniFooter />
    </div>
  );
}
