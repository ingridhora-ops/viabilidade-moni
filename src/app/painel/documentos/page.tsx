import { guardLoginRequired } from '@/lib/auth-guard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listInstancesAguardandoRevisao } from './actions';

/**
 * Lista documentos aguardando revisão e redireciona para a etapa (Step 3 ou Step 7)
 * onde a Moní faz a revisão (divergências, aprovar, reprovar, parecer).
 */
export default async function PainelDocumentosPage() {
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
  const role = profile?.role ?? 'frank';
  if (role !== 'consultor' && role !== 'admin') redirect('/');

  const instances = await listInstancesAguardandoRevisao();

  // Agrupar por (processo_id, step) para mostrar um link por processo/etapa
  const keys = new Map<
    string,
    { processo_id: string; step: number; cidade: string | null; estado: string | null }
  >();
  for (const inst of instances) {
    const key = `${inst.processo_id}-${inst.step}`;
    if (!keys.has(key)) {
      keys.set(key, {
        processo_id: inst.processo_id,
        step: inst.step,
        cidade: inst.processo_cidade,
        estado: inst.processo_estado,
      });
    }
  }
  const entries = Array.from(keys.values());

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link href="/painel" className="text-moni-primary hover:underline">
            ← Painel Moní
          </Link>
          <span className="text-stone-500">/</span>
          <span className="font-medium text-stone-700">Documentos para revisão</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-moni-dark">Documentos para revisão</h1>
        <p className="mt-1 text-sm text-stone-600">
          Clique no link para abrir a etapa do documento (Step 3 ou Step 7), onde você visualiza as
          divergências, aprova, reprova e escreve o parecer.
        </p>

        {entries.length === 0 ? (
          <p className="mt-6 rounded-lg border border-stone-200 bg-white p-6 text-center text-stone-500">
            Nenhum documento aguardando revisão no momento.
          </p>
        ) : (
          <ul className="mt-6 space-y-2">
            {entries.map((e) => {
              const stepPath = e.step === 3 ? '/step-3' : '/step-7';
              const stepLabel = e.step === 3 ? 'Step 3: Opções' : 'Step 7: Contrato do Terreno';
              const href = `${stepPath}?processoId=${e.processo_id}`;
              const label = `${e.cidade ?? '—'}${e.estado ? `, ${e.estado}` : ''} · ${stepLabel}`;
              return (
                <li key={`${e.processo_id}-${e.step}`}>
                  <Link
                    href={href}
                    className="block rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-moni-accent hover:bg-moni-accent/5"
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-6">
          <Link href="/painel" className="text-sm text-moni-accent hover:underline">
            Voltar ao Painel Moní
          </Link>
        </p>
      </main>
    </div>
  );
}
