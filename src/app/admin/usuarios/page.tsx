import { guardLoginRequired } from '@/lib/auth-guard';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { normalizeAccessRole } from '@/lib/authz';
import { updateUserRoleFormAction } from './actions';
import { ConvidarPendentesButton } from './ConvidarPendentesButton';
import { EnviarConviteForm } from './EnviarConviteForm';

export default async function AdminUsuariosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  guardLoginRequired(user);

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (normalizeAccessRole((me as { role?: string } | null)?.role) !== 'admin') {
    redirect('/rede-franqueados');
  }

  const { data: rows } = await supabase
    .from('profiles')
    .select(
      'id, full_name, nome_completo, email, departamento, role, created_at, aprovado_em, invite_token, invite_email_sent_at, invite_accepted_at',
    )
    .order('created_at', { ascending: false });

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
          <Link href="/" className="text-moni-primary hover:underline">
            ← Início
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <h1 className="text-xl font-bold text-moni-dark">Gerenciar Usuários</h1>
        <p className="mt-1 text-sm text-stone-600">Aprovação e ajuste de papéis de acesso.</p>
        <div className="mt-4 space-y-4">
          <EnviarConviteForm />
          <ConvidarPendentesButton />
        </div>
        <div className="mt-4 overflow-auto rounded-lg border border-stone-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-50 text-left text-stone-600">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">E-mail</th>
                <th className="px-3 py-2">Departamento</th>
                <th className="px-3 py-2">Role</th>
                <th
                  className="px-3 py-2"
                  title="Convite pendente (token), envio por Resend, ou utilizador que já aceitou o convite e definiu senha."
                >
                  Convite ativo
                </th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r: any) => (
                <tr key={r.id} className="border-t border-stone-100">
                  <td className="px-3 py-2">{r.nome_completo ?? r.full_name ?? '—'}</td>
                  <td className="px-3 py-2">{r.email ?? '—'}</td>
                  <td className="px-3 py-2">{r.departamento ?? '—'}</td>
                  <td className="px-3 py-2">{r.role ?? 'pending'}</td>
                  <td className="px-3 py-2 text-stone-600">
                    {r.invite_token ? (
                      r.invite_email_sent_at ? (
                        <span className="text-emerald-800" title={String(r.invite_email_sent_at)}>
                          Sim — e-mail enviado (Resend)
                        </span>
                      ) : (
                        <span
                          className="text-amber-900"
                          title="Há link de convite, mas o envio não foi registado. Configure RESEND_API_KEY e RESEND_FROM na Vercel e reenvie o convite."
                        >
                          Link ativo — e-mail não enviado
                        </span>
                      )
                    ) : r.invite_accepted_at ? (
                      <span className="text-sky-900" title={`Convite aceito em ${String(r.invite_accepted_at)}`}>
                        Usuário Logado
                      </span>
                    ) : (
                      <span className="text-stone-400">Não</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <form action={updateUserRoleFormAction.bind(null, r.id, 'team')} className="inline-block">
                      <button className="mr-2 rounded border px-2 py-1 hover:bg-stone-50">Team</button>
                    </form>
                    <form action={updateUserRoleFormAction.bind(null, r.id, 'admin')} className="inline-block">
                      <button className="mr-2 rounded border px-2 py-1 hover:bg-stone-50">Admin</button>
                    </form>
                    <form action={updateUserRoleFormAction.bind(null, r.id, 'blocked')} className="inline-block">
                      <button className="rounded border px-2 py-1 text-red-700 hover:bg-red-50">Bloquear</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

