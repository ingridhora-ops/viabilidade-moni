import { guardLoginRequired } from '@/lib/auth-guard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { listJuridicoTickets, listJuridicoDocumentos } from './actions';
import { getStatusLabel } from './constants';
import { MoniFooter } from '@/components/MoniFooter';

export default async function JuridicoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  guardLoginRequired(user);

  const [ticketsResult, docsResult] = await Promise.all([
    listJuridicoTickets(),
    listJuridicoDocumentos(),
  ]);
  const tickets = ticketsResult.ok ? ticketsResult.tickets : [];
  const documentos = docsResult.ok ? docsResult.documentos : [];

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = (profile?.role as string) ?? 'frank';
  const isMoni = role === 'consultor' || role === 'admin';

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 via-white to-stone-50">
      <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link href="/" className="text-moni-primary hover:underline">
            ← Portal
          </Link>
          <span className="text-stone-400">/</span>
          <span className="font-medium text-stone-700">Jurídico</span>
          {isMoni && (
            <Link
              href="/juridico/kanban"
              className="ml-auto rounded-lg bg-moni-primary px-4 py-2 text-sm font-medium text-white hover:bg-moni-secondary"
            >
              Kanban Jurídico
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-bold text-moni-dark">Jurídico</h1>
        <p className="mt-1 text-sm text-stone-600">
          Canal de dúvidas jurídicas: abra tickets, acompanhe o status e acesse os contratos e
          templates da Moní.
        </p>

        <div className="mt-8 flex flex-col gap-8">
          <section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-moni-dark">
                {isMoni ? 'Dúvidas' : 'Minhas dúvidas'}
              </h2>
              {!isMoni && (
                <Link
                  href="/juridico/nova"
                  className="rounded-xl bg-moni-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-moni-secondary hover:shadow"
                >
                  Nova dúvida
                </Link>
              )}
            </div>
            {tickets.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-stone-200/80 bg-white p-6 text-center shadow-sm">
                <p className="text-stone-600">Nenhum ticket ainda.</p>
                {!isMoni ? (
                  <Link
                    href="/juridico/nova"
                    className="mt-4 inline-flex items-center rounded-xl bg-moni-primary px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-moni-secondary"
                  >
                    Abrir nova dúvida
                  </Link>
                ) : (
                  <p className="mt-2 text-sm text-stone-500">
                    Use o Kanban Jurídico para acompanhar as dúvidas dos franqueados.
                  </p>
                )}
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/juridico/${t.id}`}
                      className="flex items-center justify-between rounded-xl border border-stone-200/80 bg-white p-4 shadow-sm transition hover:border-moni-accent/40 hover:shadow"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-stone-800">{t.titulo}</p>
                        {(t.nome_frank || t.nome_condominio || t.lote) && isMoni && (
                          <p className="mt-0.5 text-xs text-stone-500">
                            {[t.nome_frank, t.nome_condominio, t.lote].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <p className="mt-0.5 truncate text-sm text-stone-500">{t.descricao}</p>
                        <p className="mt-1 text-xs text-stone-400">
                          {t.created_at ? new Date(t.created_at).toLocaleString('pt-BR') : ''}
                        </p>
                      </div>
                      <span
                        className={`ml-3 shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                          t.status === 'finalizado'
                            ? 'bg-emerald-100 text-emerald-800'
                            : t.status === 'paralisado'
                              ? 'bg-amber-100 text-amber-800'
                              : t.status === 'em_analise'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        {getStatusLabel(t.status)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold text-moni-dark">
              Documentos e contratos templates
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Contratos e modelos da Casa Moní para uso nos seus empreendimentos.
            </p>
            {documentos.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-stone-200/80 bg-white p-6 text-center text-stone-500 shadow-sm">
                Nenhum documento disponível no momento.
              </div>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {documentos.map((d) => (
                  <li key={d.id}>
                    <a
                      href={d.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-3 rounded-xl border border-stone-200/80 bg-white p-4 shadow-sm transition hover:border-moni-accent/40 hover:shadow"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-moni-light font-semibold text-moni-accent">
                        PDF
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-stone-800">{d.titulo}</p>
                        {d.descricao && (
                          <p className="mt-0.5 line-clamp-2 text-sm text-stone-500">
                            {d.descricao}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-moni-accent">Abrir / Download →</p>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
      <MoniFooter />
    </div>
  );
}
