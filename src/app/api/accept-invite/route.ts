import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeAccessRole } from '@/lib/authz';

export async function POST(req: Request) {
  try {
    const { token, nome, password } = await req.json();
    const inviteToken = String(token ?? '').trim();
    const nomeCompleto = String(nome ?? '').trim();
    const senha = String(password ?? '');
    if (!inviteToken) return NextResponse.json({ error: 'Token inválido.' }, { status: 400 });
    if (!nomeCompleto) return NextResponse.json({ error: 'Nome obrigatório.' }, { status: 400 });
    if (senha.length < 8) return NextResponse.json({ error: 'Senha mínima de 8 caracteres.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: profile, error } = await admin
      .from('profiles')
      .select('id, role, email')
      .eq('invite_token', inviteToken)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!profile?.id) return NextResponse.json({ error: 'Convite inválido ou expirado.' }, { status: 400 });

    const { error: authErr } = await admin.auth.admin.updateUserById(profile.id, {
      password: senha,
      user_metadata: { full_name: nomeCompleto, nome_completo: nomeCompleto },
      email_confirm: true,
    });
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });

    const role = normalizeAccessRole((profile as { role?: string | null }).role);
    const now = new Date().toISOString();
    const { error: upErr } = await admin
      .from('profiles')
      .update({
        full_name: nomeCompleto,
        nome_completo: nomeCompleto,
        invite_token: null,
        invite_email_sent_at: null,
        invite_accepted_at: now,
        aprovado_em: role === 'pending' ? null : now,
        updated_at: now,
      })
      .eq('id', profile.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, role, email: (profile as { email?: string | null }).email ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

