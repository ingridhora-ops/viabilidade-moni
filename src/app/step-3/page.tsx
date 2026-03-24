import { guardLoginRequired } from '@/lib/auth-guard';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listStep3Instances, getStep3TemplateUrl } from './actions';
import { RevisaoDocumentoCard } from '@/app/documentos-revisao/RevisaoDocumentoCard';

type PageProps = { searchParams: Promise<{ processoId?: string }> };

export default async function Step3Page({ searchParams }: PageProps) {
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
    step_atual: number;
    user_id: string;
  } | null = null;
  let isOwner = false;

  if ((role === 'consultor' || role === 'admin') && processoIdParam) {
    const { data: p } = await supabase
      .from('processo_step_one')
      .select('id, cidade, estado, step_atual, user_id')
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
      .select('id, cidade, estado, step_atual, user_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    processo = p;
    isOwner = true;
  }

  if (!processo) redirect('/painel-novos-negocios');

  const [tplResult, instances] = await Promise.all([
    getStep3TemplateUrl(),
    listStep3Instances(processo.id),
  ]);

  const templateUrl = tplResult.ok ? tplResult.url : null;
  const backHref = processoIdParam ? '/painel' : '/painel-novos-negocios';
  const backLabel = processoIdParam ? '← Painel Moní' : '← Painel Novos Negócios';

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <Link href={backHref} className="font-medium text-moni-primary hover:underline">
            {backLabel}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="card">
          <h1 className="text-2xl font-bold text-moni-dark">Step 3: Opções</h1>
          <p className="mt-1 text-sm text-stone-500">
            Processo em {processo.cidade} - {processo.estado}
            {isOwner && ` · Step atual: ${processo.step_atual}`}
            {!isOwner && ' · Revisão Moní'}
          </p>

          <section className="mt-6 border-t border-stone-200 pt-4">
            <h2 className="text-lg font-semibold text-stone-800">Documento de Opções</h2>
            <p className="mt-1 text-sm text-stone-600">
              {isOwner
                ? '1) Baixe o template, 2) preencha as informações em aberto, 3) anexe o documento preenchido.'
                : 'Revise os documentos enviados: visualize as divergências, aprove ou reprove e informe o parecer.'}
            </p>

            {isOwner && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <DownloadTemplateButton url={templateUrl} />
                <UploadStep3Form processoId={processo.id} />
              </div>
            )}

            <div className="mt-6">
              <h3 className="text-sm font-medium text-stone-800">
                {isOwner ? 'Envios deste processo' : 'Documentos enviados'}
              </h3>
              {instances.length === 0 ? (
                <p className="mt-2 text-sm text-stone-500">Nenhum documento enviado ainda.</p>
              ) : isOwner ? (
                <ul className="mt-2 space-y-1 text-sm text-stone-700">
                  {instances.map((inst) => (
                    <li key={inst.id} className="rounded border border-stone-200 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span>
                          Versão {inst.versao} ·{' '}
                          <span className="text-xs font-semibold uppercase text-stone-500">
                            {inst.status}
                          </span>
                        </span>
                        <span className="text-xs text-stone-400">
                          {new Date(inst.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      {inst.status === 'reprovado' && inst.motivo_reprovacao && (
                        <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                          Parecer: {inst.motivo_reprovacao}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="mt-2 space-y-3">
                  {instances.map((inst) => (
                    <li key={inst.id}>
                      <RevisaoDocumentoCard
                        instance={{
                          id: inst.id,
                          versao: inst.versao,
                          status: inst.status,
                          created_at: inst.created_at,
                          diff_json: inst.diff_json,
                          motivo_reprovacao: inst.motivo_reprovacao,
                          arquivo_assinado_path: inst.arquivo_assinado_path,
                        }}
                        stepLabel="Step 3: Opções"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-6 text-right">
              <Link
                href={backHref}
                className="inline-block text-sm font-medium text-moni-accent hover:underline"
              >
                Voltar
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function DownloadTemplateButton({ url }: { url: string | null }) {
  if (!url) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center rounded-lg border border-stone-200 bg-stone-100 px-3 py-1.5 text-sm text-stone-400"
      >
        Template não configurado
      </button>
    );
  }
  return (
    <a
      href={url}
      className="inline-flex items-center rounded-lg border border-moni-accent bg-white px-3 py-1.5 text-sm font-medium text-moni-accent hover:bg-moni-accent/5"
    >
      Baixar template
    </a>
  );
}

function UploadStep3Form({ processoId }: { processoId: string }) {
  return (
    <form
      action="/api/step-3/upload"
      method="POST"
      encType="multipart/form-data"
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      <input type="hidden" name="processoId" value={processoId} />
      <input
        name="file"
        type="file"
        accept=".pdf,.docx,.doc"
        className="block w-64 cursor-pointer text-xs text-stone-600 file:mr-2 file:rounded-md file:border-0 file:bg-moni-accent file:px-2 file:py-1 file:text-xs file:font-medium file:text-white hover:file:bg-moni-accent/90"
        required
      />
      <button
        type="submit"
        className="inline-flex items-center rounded-lg bg-moni-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-moni-accent/90"
      >
        Enviar documento preenchido
      </button>
    </form>
  );
}
