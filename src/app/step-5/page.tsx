import { guardLoginRequired } from '@/lib/auth-guard';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getComiteData } from './actions';
import { ComiteApresentacao } from './ComiteApresentacao';

type PageProps = { searchParams: Promise<{ processoId?: string }> };

/** Ordem pré-cetada dos documentos na apresentação do Comitê */
const ORDEM_COMITE = [
  { key: 'prospeccao' as const, titulo: '1. Prospecção da Cidade' },
  { key: 'score_batalha' as const, titulo: '2. Score e Batalha de Casas' },
  { key: 'resumo' as const, titulo: '3. Resumo e Hipóteses' },
];

export default async function Step5ComitePage({ searchParams }: PageProps) {
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
  const params = await searchParams;
  const processoIdParam = params.processoId;

  let processo: {
    id: string;
    cidade: string | null;
    estado: string | null;
    user_id: string;
  } | null = null;
  let isOwner = false;

  if ((role === 'consultor' || role === 'admin') && processoIdParam) {
    const { data: p } = await supabase
      .from('processo_step_one')
      .select('id, cidade, estado, user_id')
      .eq('id', processoIdParam)
      .single();
    if (p) {
      if (role === 'admin') {
        processo = p;
        isOwner = false;
      } else {
        const { data: frank } = await supabase
          .from('profiles')
          .select('id')
          .eq('consultor_id', user.id)
          .eq('id', p.user_id)
          .single();
        if (frank) {
          processo = p;
          isOwner = false;
        }
      }
    }
  }

  if (!processo) {
    const { data: p } = await supabase
      .from('processo_step_one')
      .select('id, cidade, estado, user_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    processo = p;
    isOwner = true;
  }

  if (!processo) redirect('/painel-novos-negocios');

  const ownerUserId = isOwner ? undefined : processo.user_id;
  const comiteData = await getComiteData(processo.id, ownerUserId);
  if (!comiteData) redirect('/painel-novos-negocios');

  const backHref = processoIdParam ? '/painel' : '/painel-novos-negocios';
  const backLabel = processoIdParam ? '← Painel Moní' : '← Painel Novos Negócios';

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white print:hidden">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link href={backHref} className="font-medium text-moni-primary hover:underline">
            {backLabel}
          </Link>
          <span className="text-stone-500">/</span>
          <span className="font-medium text-stone-700">Step 5: Comitê</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 print:hidden">
          <h1 className="text-2xl font-bold text-moni-dark">Step 5: Comitê</h1>
          <p className="mt-1 text-sm text-stone-600">
            Apresentação do processo — {comiteData.processoCidade ?? '—'}
            {comiteData.processoEstado ? `, ${comiteData.processoEstado}` : ''}
          </p>
          <p className="mt-2 text-sm text-stone-500">
            Documentos na ordem: {ORDEM_COMITE.map((o) => o.titulo).join(' → ')}
          </p>
        </div>

        <ComiteApresentacao data={comiteData} />
      </main>
    </div>
  );
}
