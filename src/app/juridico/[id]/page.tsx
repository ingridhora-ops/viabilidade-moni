import { guardLoginRequired } from '@/lib/auth-guard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getJuridicoTicket, listJuridicoAnexos, listJuridicoComentariosInternos } from '../actions';
import { getStatusLabel } from '../constants';
import { MoniFooter } from '@/components/MoniFooter';
import { AnexoDownloadLink } from './AnexoDownloadLink';
import { JuridicoTicketDetailClient } from './JuridicoTicketDetailClient';

export default async function JuridicoTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  guardLoginRequired(user);

  const ticketResult = await getJuridicoTicket(id);
  if (!ticketResult.ok) {
    if (ticketResult.error === 'Ticket não encontrado.') notFound();
    redirect('/juridico');
  }
  const { ticket } = ticketResult;

  const anexosResult = await listJuridicoAnexos(id);
  const anexos = anexosResult.ok ? anexosResult.anexos : [];

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = (profile?.role as string) ?? 'frank';
  const isMoni = role === 'consultor' || role === 'admin';

  let comentarios: Array<{ id: string; texto: string; created_at: string }> = [];
  if (isMoni) {
    const comRes = await listJuridicoComentariosInternos(id);
    if (comRes.ok) comentarios = comRes.comentarios;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 via-white to-stone-50">
      <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link
            href={isMoni ? '/juridico/kanban' : '/juridico'}
            className="text-moni-primary hover:underline"
          >
            ← {isMoni ? 'Kanban Jurídico' : 'Jurídico'}
          </Link>
          <span className="text-stone-400">/</span>
          <span className="truncate font-medium text-stone-700">{ticket.titulo}</span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
          <div className="border-b border-stone-200 bg-stone-50/80 px-5 py-4">
            <h1 className="text-lg font-semibold text-moni-dark">{ticket.titulo}</h1>
            {(ticket.nome_frank || ticket.nome_condominio || ticket.lote) && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600">
                {ticket.nome_frank && (
                  <span>
                    <strong>Nome:</strong> {ticket.nome_frank}
                  </span>
                )}
                {ticket.nome_condominio && (
                  <span>
                    <strong>Condomínio:</strong> {ticket.nome_condominio}
                  </span>
                )}
                {ticket.lote && (
                  <span>
                    <strong>Lote:</strong> {ticket.lote}
                  </span>
                )}
              </div>
            )}
            <p className="mt-2 text-sm text-stone-500">
              {ticket.created_at ? new Date(ticket.created_at).toLocaleString('pt-BR') : ''}
            </p>
            <span
              className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ${
                ticket.status === 'finalizado'
                  ? 'bg-emerald-100 text-emerald-800'
                  : ticket.status === 'paralisado'
                    ? 'bg-amber-100 text-amber-800'
                    : ticket.status === 'em_analise'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-stone-100 text-stone-700'
              }`}
            >
              {getStatusLabel(ticket.status)}
            </span>
          </div>
          <div className="space-y-5 p-5">
            <div>
              <h2 className="text-sm font-medium text-stone-600">Descrição da dúvida</h2>
              <p className="mt-1 whitespace-pre-wrap text-stone-800">{ticket.descricao}</p>
            </div>
            {ticket.resposta_publica && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <h2 className="text-sm font-medium text-emerald-800">Resposta da Moní</h2>
                <p className="mt-1 whitespace-pre-wrap text-emerald-900">
                  {ticket.resposta_publica}
                </p>
                {ticket.resposta_publica_em && (
                  <p className="mt-2 text-xs text-emerald-600">
                    {new Date(ticket.resposta_publica_em).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            )}
            <div>
              <h2 className="mb-2 text-sm font-medium text-stone-600">Anexos</h2>
              {anexos.length === 0 ? (
                <p className="text-sm text-stone-500">Nenhum anexo.</p>
              ) : (
                <ul className="space-y-1">
                  {anexos.map((a) => (
                    <li key={a.id} className="flex items-center gap-2 text-sm">
                      <span className={a.lado === 'moni' ? 'text-emerald-600' : 'text-stone-600'}>
                        {a.lado === 'moni' ? 'Moní' : 'Você'}:
                      </span>
                      <AnexoDownloadLink anexoId={a.id} fileName={a.file_name} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <JuridicoTicketDetailClient
          ticketId={id}
          isMoni={isMoni}
          status={ticket.status}
          comentarios={comentarios}
        />
      </main>
      <MoniFooter />
    </div>
  );
}
