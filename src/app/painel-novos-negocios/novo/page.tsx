import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isAppFullyPublic } from '@/lib/public-rede-novos';
import { FormularioInicioProcesso } from '@/app/iniciar-processo/FormularioInicioProcesso';

export default async function NovoProcessoNoPainelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isAppFullyPublic()) {
    redirect(`/login?next=${encodeURIComponent('/painel-novos-negocios/novo')}`);
  }

  const { data: profile } = user
    ? await supabase.from('profiles').select('full_name').eq('id', user.id).single()
    : { data: null as { full_name: string | null } | null };

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <Link href="/painel-novos-negocios" className="font-medium text-moni-primary hover:text-moni-secondary">
            ← Painel Novos Negócios
          </Link>
          <span className="mx-2 text-stone-300">/</span>
          <span className="text-stone-600">Novo Negócio</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <FormularioInicioProcesso
          sharePath="/painel-novos-negocios/novo"
          destinoEtapa="step_2"
          titulo="Novo Negócio"
          descricao="Preencha o formulário. O novo negócio aparecerá na fase Step 2 e exibirá as informações preenchidas."
          user={{ full_name: profile?.full_name ?? null, email: user?.email ?? null }}
        />
      </main>
    </div>
  );
}

