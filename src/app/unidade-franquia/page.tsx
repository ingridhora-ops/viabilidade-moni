import { guardLoginRequired } from '@/lib/auth-guard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function UnidadeFranquiaPage() {
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
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="space-y-8">
          <div>
            <h1 className="text-xl font-bold text-moni-dark">Cadastro da Unidade de Franquia</h1>
            <p className="mt-2 text-stone-600">Dados da unidade, empresas e empreendimentos.</p>
          </div>

          <section id="dados-franquia" className="card scroll-mt-4">
            <h2 className="text-lg font-semibold text-stone-800">Dados da Franquia</h2>
            <p className="mt-2 text-sm text-stone-600">
              Informações da unidade de franquia (razão social, CNPJ, endereço, etc.).
            </p>
            <p className="mt-3 text-sm italic text-stone-500">Formulário em construção.</p>
          </section>

          <section id="incorporadora-gestora" className="card scroll-mt-4">
            <h2 className="text-lg font-semibold text-stone-800">
              Dados das empresas Incorporadora e Gestora
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              Dados da empresa incorporadora e da gestora vinculadas à unidade.
            </p>
            <p className="mt-3 text-sm italic text-stone-500">Formulário em construção.</p>
          </section>

          <section id="empreendimentos" className="card scroll-mt-4">
            <h2 className="text-lg font-semibold text-stone-800">Dados dos Empreendimentos</h2>
            <p className="mt-2 text-sm text-stone-600">
              Cadastro dos empreendimentos da unidade de franquia.
            </p>
            <p className="mt-3 text-sm italic text-stone-500">Formulário em construção.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
