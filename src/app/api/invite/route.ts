import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmailViaResend } from '@/lib/email';
import { normalizeAccessRole } from '@/lib/authz';

function getAllowedDomain() {
  return (process.env.ALLOWED_EMAIL_DOMAIN ?? 'moni.casa').toLowerCase();
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

    let profile = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    if (!profile.data?.id) {
      await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: '', nome_completo: '', departamento: departamento ?? '' } });
      profile = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    }
    const profileId = (profile.data as { id?: string } | null)?.id;
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

