import { NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPublicAppUrl } from '@/lib/app-url';
import { humanizeResendError, sendEmailViaResend } from '@/lib/email';
import { normalizeAccessRole } from '@/lib/authz';
import type { SupabaseClient } from '@supabase/supabase-js';

function getAllowedDomain() {
  return (process.env.ALLOWED_EMAIL_DOMAIN ?? 'moni.casa').toLowerCase();
}

/**
 * `maybeSingle()` falha se houver mais de uma linha; emails duplicados em profiles
 * faziam a query devolver erro e "sumir" o perfil.
 */
async function findProfileIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data, error } = await admin.from('profiles').select('id').ilike('email', email).limit(1);
  if (error) return null;
  const row = data?.[0] as { id?: string } | undefined;
  return row?.id ?? null;
}

async function findProfileIdByUserId(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function waitForProfileByUserId(admin: SupabaseClient, userId: string): Promise<string | null> {
  for (let i = 0; i < 12; i++) {
    const id = await findProfileIdByUserId(admin, userId);
    if (id) return id;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

/** GoTrue: GET /auth/v1/admin/users?page=&per_page= — mais fiável que o shape do SDK em alguns deploys. */
async function findAuthUserIdByEmailHttp(email: string): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return null;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    apikey: key,
  };

  let page = 1;
  const perPage = 1000;
  for (let i = 0; i < 100; i++) {
    const url = `${base}/auth/v1/admin/users?page=${page}&per_page=${perPage}`;
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as
      | { users?: Array<{ id: string; email?: string | null }> }
      | Array<{ id: string; email?: string | null }>;

    const users = Array.isArray(json) ? json : json.users ?? [];
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (hit) return hit.id;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

async function findAuthUserIdByEmailSdk(admin: SupabaseClient, email: string): Promise<string | null> {
  let page = 1;
  const perPage = 1000;
  for (let p = 0; p < 50; p++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) break;
    const users = (data?.users ?? []) as Array<{ id: string; email?: string | null }>;
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (hit) return hit.id;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

function extractInviteUserId(invData: unknown): string | null {
  if (!invData || typeof invData !== 'object') return null;
  const o = invData as { user?: { id?: string }; id?: string };
  if (o.user?.id) return o.user.id;
  if (typeof o.id === 'string') return o.id;
  return null;
}

function isRateLimitError(err: { message?: string; status?: number } | null | undefined): boolean {
  const m = (err?.message ?? '').toLowerCase();
  return m.includes('rate limit') || m.includes('too many emails') || err?.status === 429;
}

/** Senha aleatória só para satisfazer createUser; o convidado define senha em /aceitar-convite. */
function randomBootstrapPassword(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Cria utilizador no Auth sem enviar e-mail (evita rate limit do inviteUserByEmail).
 * Se já existir, devolve null e o chamador deve fazer lookup por e-mail.
 */
async function createAuthUserWithoutEmail(
  admin: SupabaseClient,
  email: string,
  departamento: string | null,
): Promise<{ userId: string } | { error: string } | null> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: randomBootstrapPassword(),
    email_confirm: false,
    user_metadata: {
      full_name: '',
      nome_completo: '',
      departamento: departamento ?? '',
    },
  });
  if (!error && data?.user?.id) {
    return { userId: data.user.id };
  }
  const msg = (error?.message ?? '').toLowerCase();
  if (msg.includes('already') || msg.includes('registered') || msg.includes('exists') || msg.includes('duplicate')) {
    return null;
  }
  return { error: error?.message ?? 'createUser falhou.' };
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (normalizeAccessRole((me as { role?: string | null } | null)?.role) !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const role = (String(body?.role ?? 'team').trim().toLowerCase() === 'admin' ? 'admin' : 'team') as 'admin' | 'team';
    const departamento = String(body?.departamento ?? '').trim() || null;
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 });
    }
    const domain = email.split('@')[1] ?? '';
    if (domain !== getAllowedDomain()) {
      return NextResponse.json({ error: `Use e-mail @${getAllowedDomain()}.` }, { status: 400 });
    }

    const admin = createAdminClient();
    const token = randomUUID();

    let profileId = await findProfileIdByEmail(admin, email);

    if (!profileId) {
      /** 1) Utilizador já no Auth → não chamar inviteUserByEmail (evita rate limit e e-mail duplicado do Supabase). */
      let authUserId =
        (await findAuthUserIdByEmailHttp(email)) ?? (await findAuthUserIdByEmailSdk(admin, email));

      if (!authUserId) {
        const { data: invData, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: '', nome_completo: '', departamento: departamento ?? '' },
        });

        if (invErr) {
          if (isRateLimitError(invErr)) {
            const created = await createAuthUserWithoutEmail(admin, email, departamento);
            if (created && 'userId' in created) {
              authUserId = created.userId;
            } else if (created && 'error' in created) {
              return NextResponse.json({ error: created.error }, { status: 500 });
            } else {
              authUserId =
                (await findAuthUserIdByEmailHttp(email)) ?? (await findAuthUserIdByEmailSdk(admin, email));
              if (!authUserId) {
                return NextResponse.json(
                  {
                    error:
                      'Limite de e-mails do Supabase (rate limit) e não foi possível criar o utilizador. Aguarde alguns minutos, configure SMTP em Authentication → Emails, ou confira o e-mail digitado.',
                  },
                  { status: 429 },
                );
              }
            }
          } else {
            authUserId =
              extractInviteUserId(invData) ??
              (await findAuthUserIdByEmailHttp(email)) ??
              (await findAuthUserIdByEmailSdk(admin, email));
            if (!authUserId) {
              return NextResponse.json(
                {
                  error:
                    invErr.message ??
                    'Não foi possível convidar este e-mail. Verifique o endereço e em Supabase → Authentication → Users.',
                },
                { status: 500 },
              );
            }
          }
        } else {
          const invUserId = extractInviteUserId(invData);
          if (invUserId) {
            profileId =
              (await waitForProfileByUserId(admin, invUserId)) ?? (await findProfileIdByUserId(admin, invUserId));
            if (!profileId) {
              authUserId = invUserId;
            }
          } else {
            authUserId =
              (await findAuthUserIdByEmailHttp(email)) ?? (await findAuthUserIdByEmailSdk(admin, email));
          }
        }
      }

      if (!profileId && authUserId) {
        profileId =
          (await waitForProfileByUserId(admin, authUserId)) ?? (await findProfileIdByUserId(admin, authUserId));
        if (!profileId) {
          const { error: insErr } = await admin.from('profiles').insert({
            id: authUserId,
            email,
            role,
            departamento,
            full_name: '',
            nome_completo: '',
            updated_at: new Date().toISOString(),
          });
          if (insErr) {
            const retry = await findProfileIdByUserId(admin, authUserId);
            if (retry) profileId = retry;
            else return NextResponse.json({ error: insErr.message }, { status: 500 });
          } else {
            profileId = authUserId;
          }
        }
      }
    }

    if (!profileId) {
      return NextResponse.json(
        {
          error:
            'Não foi possível associar este e-mail a um perfil. Confira se o usuário existe em Authentication e se SUPABASE_SERVICE_ROLE_KEY está configurada na Vercel.',
        },
        { status: 500 },
      );
    }

    const { error: upErr } = await admin
      .from('profiles')
      .update({
        role,
        departamento,
        invite_token: token,
        invite_email_sent_at: null,
        invite_accepted_at: null,
        convidado_por: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const appUrl = getPublicAppUrl();
    const inviteLink = `${appUrl}/aceitar-convite?token=${encodeURIComponent(token)}`;
    const mail = await sendEmailViaResend({
      to: email,
      subject: 'Convite de acesso — Plataforma Moní',
      text: `Você recebeu um convite de acesso.\n\nAcesse: ${inviteLink}`,
      html: `<p>Você recebeu um convite de acesso.</p><p><a href="${inviteLink}">Aceitar convite</a></p>`,
    });
    if (!mail.ok) {
      return NextResponse.json(
        {
          error: humanizeResendError(mail.error),
          inviteLink,
          resendFailed: true,
        },
        { status: 502 },
      );
    }
    if (!mail.skipped) {
      const { error: sentErr } = await admin
        .from('profiles')
        .update({ invite_email_sent_at: new Date().toISOString() })
        .eq('id', profileId);
      if (sentErr) return NextResponse.json({ error: sentErr.message }, { status: 500 });
    }

    const isProd = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
    return NextResponse.json({
      ok: true,
      token,
      inviteLink,
      resendEmailId: mail.resendEmailId,
      emailSkipped: mail.skipped === true,
      ...(mail.skipped
        ? {
            warning: isProd
              ? 'RESEND_API_KEY não configurada — o e-mail não foi enviado. Copie o link abaixo e envie manualmente ao convidado, ou configure a chave na Vercel.'
              : 'Sem RESEND_API_KEY — e-mail não enviado (normal em dev). Use o link abaixo para testar.',
          }
        : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
