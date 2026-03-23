import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmailViaResend } from '@/lib/email';
import { normalizeAccessRole } from '@/lib/authz';
import type { SupabaseClient } from '@supabase/supabase-js';

function getAllowedDomain() {
  return (process.env.ALLOWED_EMAIL_DOMAIN ?? 'moni.casa').toLowerCase();
}

/** Case-insensitive match; evita falha quando o e-mail no banco não está em minúsculas. */
async function findProfileIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function findProfileIdByUserId(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/** Trigger handle_new_user pode atrasar alguns ms. */
async function waitForProfileByUserId(admin: SupabaseClient, userId: string): Promise<string | null> {
  for (let i = 0; i < 8; i++) {
    const id = await findProfileIdByUserId(admin, userId);
    if (id) return id;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

async function findAuthUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const listUsers = admin.auth.admin.listUsers.bind(admin.auth.admin) as (args: {
    page?: number;
    perPage?: number;
  }) => Promise<{
    data?: { users?: Array<{ id: string; email?: string | null }> };
    error?: { message?: string } | null;
  }>;

  let page = 1;
  const perPage = 1000;
  for (let p = 0; p < 50; p++) {
    const { data, error } = await listUsers({ page, perPage });
    if (error) break;
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (hit) return hit.id;
    if (users.length < perPage) break;
    page += 1;
  }
  return null;
}

function isUserAlreadyRegisteredError(err: { message?: string; status?: number } | null | undefined): boolean {
  const m = (err?.message ?? '').toLowerCase();
  return (
    m.includes('already') ||
    m.includes('registered') ||
    m.includes('exists') ||
    err?.status === 422
  );
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
      const { data: invData, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: '', nome_completo: '', departamento: departamento ?? '' },
      });

      if (!invErr && invData?.user?.id) {
        profileId =
          (await waitForProfileByUserId(admin, invData.user.id)) ?? (await findProfileIdByUserId(admin, invData.user.id));
      }

      if (!profileId) {
        if (invErr && !isUserAlreadyRegisteredError(invErr)) {
          return NextResponse.json({ error: invErr.message ?? 'Falha ao convidar no Auth.' }, { status: 500 });
        }

        const authUserId = invData?.user?.id ?? (await findAuthUserIdByEmail(admin, email));
        if (!authUserId) {
          return NextResponse.json(
            {
              error:
                'Não foi encontrado usuário no Auth para este e-mail. Verifique no Supabase (Authentication → Users) ou tente outro e-mail.',
            },
            { status: 500 },
          );
        }

        profileId = await findProfileIdByUserId(admin, authUserId);
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
      return NextResponse.json({ error: 'Não foi possível criar/obter profile para este e-mail.' }, { status: 500 });
    }

    const { error: upErr } = await admin
      .from('profiles')
      .update({
        role,
        departamento,
        invite_token: token,
        convidado_por: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profileId);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const inviteLink = `${appUrl}/aceitar-convite?token=${encodeURIComponent(token)}`;
    await sendEmailViaResend({
      to: email,
      subject: 'Convite de acesso — Plataforma Moní',
      text: `Você recebeu um convite de acesso.\n\nAcesse: ${inviteLink}`,
      html: `<p>Você recebeu um convite de acesso.</p><p><a href="${inviteLink}">Aceitar convite</a></p>`,
    });

    return NextResponse.json({ ok: true, token, inviteLink });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
