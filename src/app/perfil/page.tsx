import { guardLoginRequired } from '@/lib/auth-guard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AutentiqueKeyForm } from './AutentiqueKeyForm';
import { PerfilForm } from './PerfilForm';

export default async function PerfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  guardLoginRequired(user);

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, nome_completo, departamento, email, role, aprovado_em, autentique_api_key')
    .eq('id', user.id)
    .single();
  const fullName = (profile as any)?.nome_completo ?? profile?.full_name ?? user.email ?? '';
  const departamento = (profile as any)?.departamento ?? '';
  const role = (profile?.role as string) ?? 'frank';
  const aprovadoEm = ((profile as any)?.aprovado_em ?? null) as string | null;
  const podeConfigurarAutentique =
    role === 'consultor' || role === 'admin' || role === 'supervisor';
  const temChaveAutentique = Boolean((profile?.autentique_api_key as string)?.trim());

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
        <div className="card">
          <h1 className="text-xl font-bold text-moni-dark">Perfil</h1>
          <p className="mt-2 text-stone-600">
            Dados pessoais e configurações da sua conta.
          </p>
          <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50 p-4">
            <p className="text-sm font-medium text-stone-500">Nome</p>
            <p className="mt-0.5 text-stone-900">{fullName || '—'}</p>
            <p className="mt-3 text-sm font-medium text-stone-500">E-mail</p>
            <p className="mt-0.5 text-stone-900">{user.email ?? '—'}</p>
            <p className="mt-3 text-sm font-medium text-stone-500">Perfil</p>
            <p className="mt-0.5 text-stone-900">{role}</p>
          </div>

          <PerfilForm
            initialNome={fullName}
            initialDepartamento={departamento}
            email={user.email ?? ''}
            role={role}
            aprovadoEm={aprovadoEm}
          />

          {podeConfigurarAutentique && (
            <div className="mt-6">
              <AutentiqueKeyForm temChaveConfigurada={temChaveAutentique} />
            </div>
          )}

          {!podeConfigurarAutentique && (
            <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm font-medium text-stone-700">Chave do Autentique</p>
              <p className="mt-1 text-sm text-stone-600">
                A seção para configurar a chave do Autentique (envio de documentos para assinatura) está
                disponível apenas para perfis <strong>consultor</strong>, <strong>admin</strong> ou{' '}
                <strong>supervisor</strong>. Seu perfil atual é <strong>{role}</strong>.
              </p>
              <p className="mt-2 text-sm text-stone-500">
                Para usar essa função, faça login com uma conta de consultor, admin ou supervisor, ou
                peça a um administrador para alterar seu perfil.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
