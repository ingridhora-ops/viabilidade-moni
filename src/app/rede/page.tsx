import { guardLoginRequired } from '@/lib/auth-guard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { RedeContatosClient } from './RedeContatosClient';

export default async function RedePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  guardLoginRequired(user);

  const { data: contatos } = await supabase
    .from('rede_contatos')
    .select('id, tipo, nome, contato, created_at')
    .eq('user_id', user.id)
    .order('tipo', { ascending: true })
    .order('nome', { ascending: true });

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link href="/" className="text-moni-primary hover:underline">
            ← Início
          </Link>
          <span className="text-stone-500">/</span>
          <span className="font-medium text-stone-700">Rede de contatos</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="card">
          <h1 className="text-xl font-bold text-moni-dark">Rede de contatos</h1>
          <p className="mt-1 text-sm text-stone-600">
            Condomínios, corretores e imobiliárias para acompanhamento da praça.
          </p>
          <RedeContatosClient contatos={contatos ?? []} />
        </div>
      </main>
    </div>
  );
}
