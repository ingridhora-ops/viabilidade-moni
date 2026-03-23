'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { MoniFooter } from '@/components/MoniFooter';
import { normalizeAccessRole } from '@/lib/authz';
import { TEAM_SEED_BY_EMAIL } from '@/lib/team-seed-signup';
import { notifySignupComplete } from './actions';

type TabKey = 'entrar' | 'cadastro';

function supabaseNetworkErrorHint(message: string | undefined): string {
  const msg = message ?? '';
  if (msg === 'Failed to fetch' || msg === 'NetworkError when attempting to fetch resource.') {
    return `${msg} — Não foi possível conectar ao servidor. Confira NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY, se o projeto Supabase não está pausado e se firewall ou VPN não bloqueiam.`;
  }
  return msg;
}

const ALLOWED_EMAIL_DOMAIN = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? 'moni.casa';

/** GoTrue: "For security purposes, you can only request this after N seconds." */
function mapAuthRateLimitMessage(raw: string): string | null {
  const m = (raw ?? '').trim();
  const lower = m.toLowerCase();
  if (!lower.includes('for security purposes') || !lower.includes('only request')) return null;
  const match = m.match(/after\s+(\d+)\s*seconds?/i);
  if (match) {
    return `Por segurança, aguarde ${match[1]} segundos antes de tentar novamente.`;
  }
  return 'Por segurança, aguarde alguns segundos antes de tentar novamente.';
}

/** Mensagens conhecidas do Auth (Supabase / GoTrue); ajuste se o texto do servidor mudar. */
function mapKnownSignupAuthMessages(raw: string): string | null {
  const m = (raw ?? '').trim();
  const lower = m.toLowerCase();

  const rate = mapAuthRateLimitMessage(m);
  if (rate) return rate;

  if (lower.includes('email not confirmed')) {
    return 'Verifique seu e-mail para confirmar o cadastro.';
  }
  if (
    lower.includes('user already registered') ||
    lower.includes('already registered') ||
    lower.includes('email address already') ||
    lower.includes('already been registered')
  ) {
    return 'Este e-mail já está cadastrado. Use a opção Entrar.';
  }
  if (lower.includes('email domain not allowed') || (lower.includes('domain') && lower.includes('not allowed'))) {
    return `Use um e-mail @${ALLOWED_EMAIL_DOMAIN} para se cadastrar.`;
  }
  if (lower.includes('password should be at least') || /password.*at least\s*\d+/i.test(m)) {
    return 'A senha deve ter no mínimo 8 caracteres.';
  }
  return null;
}

function signupErrorUserMessage(raw: string | undefined): string {
  const mapped = mapKnownSignupAuthMessages(raw ?? '');
  if (mapped) return mapped;
  return supabaseNetworkErrorHint(raw);
}

/** Erros de signIn (Entrar) — texto em português + orientação. */
function mapLoginAuthErrorMessage(raw: string | undefined): string {
  const m = (raw ?? '').trim();
  const lower = m.toLowerCase();
  const rate = mapAuthRateLimitMessage(m);
  if (rate) return rate;
  if (lower.includes('email not confirmed')) {
    return 'O Supabase ainda não tem este e-mail como confirmado. Abra o link do e-mail de cadastro ou peça a um administrador para confirmar o utilizador em Supabase → Authentication → Users. Se já confirmou antes, confira se o site usa o mesmo projeto Supabase (produção vs desenvolvimento).';
  }
  return supabaseNetworkErrorHint(raw);
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/rede-franqueados';
  const status = searchParams.get('status');
  const tabParam = searchParams.get('tab');

  const [tab, setTab] = useState<TabKey>(() =>
    tabParam === 'cadastro' || tabParam === 'signup' ? 'cadastro' : 'entrar',
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [fullName, setFullName] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'cadastro' || t === 'signup') setTab('cadastro');
    if (t === 'entrar' || t === 'login') setTab('entrar');
  }, [searchParams]);

  const setTabAndUrl = (t: TabKey) => {
    setTab(t);
    const params = new URLSearchParams(searchParams.toString());
    if (t === 'cadastro') params.set('tab', 'cadastro');
    else params.delete('tab');
    const q = params.toString();
    router.replace(q ? `/login?${q}` : '/login', { scroll: false });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const emailDomain = email.trim().toLowerCase().split('@')[1] ?? '';
      if (emailDomain !== ALLOWED_EMAIL_DOMAIN) {
        setError(`Use um e-mail @${ALLOWED_EMAIL_DOMAIN}.`);
        setLoading(false);
        return;
      }
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(
          err.message === 'Invalid login credentials'
            ? 'E-mail ou senha incorretos.'
            : mapLoginAuthErrorMessage(err.message),
        );
        setLoading(false);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('Sessão não encontrada após login.');
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      const role = normalizeAccessRole((profile as { role?: string | null } | null)?.role);
      if (role === 'pending') {
        router.push('/login?status=pending');
        router.refresh();
        setLoading(false);
        return;
      }
      if (role === 'blocked') {
        router.push('/login?status=blocked');
        router.refresh();
        setLoading(false);
        return;
      }
      router.push(role === 'admin' ? (next || '/dashboard-novos-negocios') : '/rede-franqueados');
      router.refresh();
    } catch {
      setError('Erro ao entrar. Tente de novo.');
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const emailLower = email.trim().toLowerCase();
      const emailDomain = emailLower.split('@')[1] ?? '';
      if (emailDomain !== ALLOWED_EMAIL_DOMAIN) {
        setError(`Use um e-mail @${ALLOWED_EMAIL_DOMAIN}.`);
        setLoading(false);
        return;
      }
      if (password.length < 8) {
        setError('A senha deve ter no mínimo 8 caracteres.');
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Senha e confirmação não conferem.');
        setLoading(false);
        return;
      }
      const supabase = createClient();
      const { error: err } = await supabase.auth.signUp({
        email: emailLower,
        password,
        options: { data: { full_name: fullName, nome_completo: fullName, departamento } },
      });
      if (err) {
        console.error('[login/signup] signUp error (mensagem Supabase):', err.message, err);
        setError(signupErrorUserMessage(err.message));
        setLoading(false);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const seeded = TEAM_SEED_BY_EMAIL[emailLower];
      if (user?.id) {
        const role = seeded?.role ?? 'pending';
        const dept = seeded?.departamento ?? departamento.trim();
        await supabase
          .from('profiles')
          .update({
            role,
            full_name: fullName,
            nome_completo: fullName,
            departamento: dept,
            // Sem seed na lista → pending (sem aprovação); com seed → já liberado
            aprovado_em: seeded ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);
      }

      await notifySignupComplete();

      if (!seeded) {
        router.push('/login?status=pending');
      } else {
        const role = normalizeAccessRole(seeded.role);
        router.push(role === 'admin' ? '/dashboard-novos-negocios' : '/rede-franqueados');
      }
      router.refresh();
    } catch (unknownErr) {
      const raw =
        unknownErr instanceof Error
          ? unknownErr.message
          : typeof unknownErr === 'string'
            ? unknownErr
            : String(unknownErr);
      console.error('[login/signup] cadastro exceção (mensagem bruta):', raw, unknownErr);
      setError(signupErrorUserMessage(raw) || raw || 'Erro ao cadastrar.');
    } finally {
      setLoading(false);
    }
  };

  const tabBtn = (active: boolean) =>
    `flex-1 rounded-t-xl px-4 py-2.5 text-sm font-semibold transition ${
      active
        ? 'bg-white text-moni-dark shadow-sm ring-1 ring-stone-200'
        : 'bg-stone-100/80 text-stone-600 hover:text-moni-dark hover:bg-stone-100'
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-stone-50 to-moni-light/20">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="card w-full max-w-md overflow-hidden p-0">
          <div className="flex border-b border-stone-200 bg-stone-50/90 px-2 pt-2">
            <button type="button" className={tabBtn(tab === 'entrar')} onClick={() => setTabAndUrl('entrar')}>
              Entrar
            </button>
            <button
              type="button"
              className={tabBtn(tab === 'cadastro')}
              onClick={() => setTabAndUrl('cadastro')}
            >
              Cadastrar
            </button>
          </div>

          <div className="p-6 pt-5">
            {tab === 'entrar' ? (
              <>
                <h1 className="text-xl font-bold text-moni-dark">Entrar</h1>
                <p className="mt-2 text-sm text-stone-600">
                  Use seu e-mail e senha para acessar o sistema.
                </p>
                {status === 'pending' && (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Seu cadastro está pendente de aprovação do administrador.
                  </p>
                )}
                {status === 'blocked' && (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    Seu acesso está bloqueado. Fale com o administrador.
                  </p>
                )}
                <form onSubmit={handleLogin} className="mt-6 space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-stone-700">
                      E-mail
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 focus:border-moni-accent focus:outline-none focus:ring-2 focus:ring-moni-accent/20"
                      required
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="password" className="block text-sm font-medium text-stone-700">
                        Senha
                      </label>
                      <Link href="/esqueci-senha" className="text-sm text-moni-accent hover:underline">
                        Esqueci minha senha
                      </Link>
                    </div>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 focus:border-moni-accent focus:outline-none focus:ring-2 focus:ring-moni-accent/20"
                      required
                    />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button type="submit" disabled={loading} className="btn-primary w-full">
                    {loading ? 'Entrando…' : 'Entrar'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold text-moni-dark">Cadastrar</h1>
                <p className="mt-2 text-sm text-stone-600">
                  Crie sua conta com e-mail @{ALLOWED_EMAIL_DOMAIN}.
                </p>
                <form onSubmit={handleSignup} className="mt-6 space-y-4">
                  <div>
                    <label htmlFor="fullName" className="block text-sm font-medium text-stone-700">
                      Nome completo
                    </label>
                    <input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Seu nome"
                      className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 focus:border-moni-accent focus:outline-none focus:ring-1 focus:ring-moni-accent"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="email-cad" className="block text-sm font-medium text-stone-700">
                      E-mail
                    </label>
                    <input
                      id="email-cad"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 focus:border-moni-accent focus:outline-none focus:ring-1 focus:ring-moni-accent"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="departamento" className="block text-sm font-medium text-stone-700">
                      Departamento
                    </label>
                    <input
                      id="departamento"
                      type="text"
                      value={departamento}
                      onChange={(e) => setDepartamento(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 focus:border-moni-accent focus:outline-none focus:ring-1 focus:ring-moni-accent"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="password-cad" className="block text-sm font-medium text-stone-700">
                      Senha (mín. 8 caracteres)
                    </label>
                    <input
                      id="password-cad"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={8}
                      className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 focus:border-moni-accent focus:outline-none focus:ring-1 focus:ring-moni-accent"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-stone-700">
                      Confirmar senha
                    </label>
                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      minLength={8}
                      className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 focus:border-moni-accent focus:outline-none focus:ring-1 focus:ring-moni-accent"
                      required
                    />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button type="submit" disabled={loading} className="btn-primary w-full">
                    {loading ? 'Cadastrando…' : 'Cadastrar'}
                  </button>
                </form>
              </>
            )}

            <Link href="/" className="mt-6 inline-block text-sm text-moni-accent hover:underline">
              ← Voltar ao início
            </Link>
          </div>
        </div>
      </div>
      <MoniFooter />
    </div>
  );
}
