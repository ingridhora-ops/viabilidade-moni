import { guardLoginRequired } from '@/lib/auth-guard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { MarcarLidoButton } from './MarcarLidoButton';

export default async function AlertasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  guardLoginRequired(user);

  const { data: alertas } = await supabase
    .from('alertas')
    .select('id, tipo, mensagem, lido, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link href="/" className="text-moni-primary hover:underline">
            ← Início
          </Link>
          <span className="text-stone-500">/</span>
          <span className="font-medium text-stone-700">Minhas alertas</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="card">
          <h1 className="text-xl font-bold text-moni-dark">Minhas alertas</h1>
          <p className="mt-1 text-sm text-stone-600">
            Avisos sobre seus processos (inatividade, PDF não enviado, etc.). Quando houver
            integrações, novos tipos de alerta poderão aparecer aqui.
          </p>
          {!alertas?.length ? (
            <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-600">
              Nenhum alerta no momento.
            </div>
          ) : (
            <ul className="mt-6 space-y-2">
              {alertas.map((a) => (
                <li
                  key={a.id}
                  className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${a.lido ? 'border-stone-100 bg-stone-50/50' : 'border-amber-200 bg-amber-50/50'}`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-stone-700">{a.tipo}</span>
                    {a.mensagem && <p className="mt-0.5 text-stone-600">{a.mensagem}</p>}
                    <p className="mt-1 text-xs text-stone-400">
                      {a.created_at ? new Date(a.created_at).toLocaleString('pt-BR') : ''}
                    </p>
                  </div>
                  {!a.lido && <MarcarLidoButton alertaId={a.id} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
