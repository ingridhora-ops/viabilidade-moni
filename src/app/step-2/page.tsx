import { guardLoginRequired } from '@/lib/auth-guard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Step2Form } from './Step2Form';

export default async function Step2Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  guardLoginRequired(user);

  const { data: processos } = await supabase
    .from('processo_step_one')
    .select('id, cidade, estado, status, etapa_atual, updated_at')
    .eq('user_id', user.id)
    .eq('status', 'concluido')
    .order('updated_at', { ascending: false });

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 via-white to-moni-light/20">
      <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
          <Link href="/" className="font-medium text-moni-primary hover:text-moni-secondary">
            ← Voltar
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-12">
        <div className="card">
          <h1 className="moni-heading text-2xl">Iniciar Processo Step 2</h1>
          <p className="mt-2 text-stone-600">
            O Step 2 é o estudo de viabilidade. Aqui você <strong>não refaz</strong> as etapas
            iniciais do Step 1: primeiro <strong>puxa</strong> um Step 1 (banco de informações já
            preenchido) e, a partir dele, faz escolha do lote, listagem de casas (com escolha dos 3
            modelos e batalha), BCA e PDF para viabilizar o empreendimento.
          </p>
          <Step2Form processos={processos ?? []} />
        </div>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-stone-800">
            Estudos finalizados (disponíveis para Step 2)
          </h2>
          <p className="mb-3 text-sm text-stone-500">
            Só estudos Step 1 finalizados aparecem aqui. Clique para abrir o estudo de viabilidade.
          </p>
          {!processos?.length ? (
            <p className="text-sm italic text-stone-500">
              Nenhum estudo finalizado. Finalize um estudo na etapa 5 do Step 1 para usá-lo aqui.
            </p>
          ) : (
            <ul className="space-y-2">
              {(processos ?? []).map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/step-2/${p.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white p-3 transition hover:border-moni-accent/40 hover:shadow-sm"
                  >
                    <span className="font-medium text-stone-900">
                      {p.cidade ?? 'Sem cidade'}
                      {p.estado ? `, ${p.estado}` : ''}
                    </span>
                    <span className="text-xs text-stone-500">
                      {p.updated_at
                        ? `Finalizado · ${new Date(p.updated_at).toLocaleDateString('pt-BR')}`
                        : 'Finalizado'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-8 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
          <strong>Fluxo do Step 2:</strong> (1) Puxar um Step 1 — (2) Selecionar um lote da tabela
          de lotes — (3) Usar a listagem de casas já existente desse Step 1, escolher os 3 modelos e
          batalha — (4) BCA — (5) PDF de hipóteses.
        </div>
      </main>
    </div>
  );
}
