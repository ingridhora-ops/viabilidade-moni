'use server';

import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { normalizeAccessRole } from '@/lib/authz';
import { getPublicAppUrl } from '@/lib/app-url';
import { sendEmailViaResend } from '@/lib/email';

type UpdatableRole = 'admin' | 'team' | 'pending' | 'blocked';

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Faça login.' };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (normalizeAccessRole((profile as { role?: string } | null)?.role) !== 'admin') {
    return { ok: false as const, error: 'Apenas admin.' };
  }
  return { ok: true as const, supabase, actorId: user.id };
}

export async function updateUserRole(profileId: string, role: UpdatableRole) {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const { supabase, actorId } = guard;
  const patch: Record<string, unknown> = {
    role,
    updated_at: new Date().toISOString(),
  };
  if (role === 'admin' || role === 'team') {
    patch.aprovado_em = new Date().toISOString();
    patch.aprovado_por = actorId;
  }
  const { error } = await supabase.from('profiles').update(patch).eq('id', profileId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath('/admin/usuarios');
  return { ok: true as const };
}

/**
 * Wrapper para `<form action={...}>`: o React 19 tipa a ação como
 * `(formData: FormData) => void | Promise<void>` — não pode retornar o objeto de `updateUserRole`.
 */
export async function updateUserRoleFormAction(
  profileId: string,
  role: UpdatableRole,
  _formData: FormData,
): Promise<void> {
  await updateUserRole(profileId, role);
}

function allowedEmailDomain() {
  return (process.env.ALLOWED_EMAIL_DOMAIN ?? 'moni.casa').toLowerCase();
}

/**
 * Envia e-mail de convite/cadastro (novo token) a todos os perfis que ainda não concluíram
 * o fluxo em /aceitar-convite (`invite_accepted_at` vazio), exceto `blocked`.
 * Quem já aparece como "Usuário Logado" na tabela não entra.
 */
export async function inviteAllUsersNotLoggedIn() {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const domain = allowedEmailDomain();
  const admin = createAdminClient();
  const { data: rows, error: qErr } = await admin
    .from('profiles')
    .select('id, email, nome_completo, full_name, role')
    .is('invite_accepted_at', null)
    .neq('role', 'blocked');
  if (qErr) return { ok: false as const, error: qErr.message };

  const list = rows ?? [];
  const appUrl = getPublicAppUrl();
  let sent = 0;
  let skippedResend = 0;
  let skippedNoEmail = 0;
  let skippedDomain = 0;
  const failures: string[] = [];

  for (const row of list) {
    const email = String((row as { email?: string | null }).email ?? '')
      .trim()
      .toLowerCase();
    if (!email || !email.includes('@')) {
      skippedNoEmail++;
      continue;
    }
    if ((email.split('@')[1] ?? '') !== domain) {
      skippedDomain++;
      continue;
    }

    const token = randomUUID();
    const { error: upErr } = await admin
      .from('profiles')
      .update({
        invite_token: token,
        invite_email_sent_at: null,
        invite_accepted_at: null,
        convidado_por: guard.actorId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', (row as { id: string }).id);
    if (upErr) {
      failures.push(email);
      continue;
    }

    const inviteLink = `${appUrl}/aceitar-convite?token=${encodeURIComponent(token)}`;
    const mail = await sendEmailViaResend({
      to: email,
      subject: 'Convite de acesso — Plataforma Moní',
      text:
        'Você possui cadastro na plataforma Moní. Use o link abaixo para concluir o acesso (nome e senha).\n\n' +
        `${inviteLink}\n`,
      html:
        '<p>Use o link abaixo para <strong>concluir o cadastro</strong> na plataforma Moní (nome e senha).</p>' +
        `<p><a href="${inviteLink}">Aceitar convite e definir senha</a></p>`,
    });
    if (!mail.ok) failures.push(email);
    else if (mail.skipped) skippedResend++;
    else {
      const { error: sentErr } = await admin
        .from('profiles')
        .update({ invite_email_sent_at: new Date().toISOString() })
        .eq('id', (row as { id: string }).id);
      if (sentErr) failures.push(email);
      else sent++;
    }
  }

  revalidatePath('/admin/usuarios');
  return {
    ok: true as const,
    sent,
    skippedResend,
    skippedNoEmail,
    skippedDomain,
    candidates: list.length,
    failures,
  };
}

/**
 * Envia e-mail de convite (link /aceitar-convite) para perfis com `role = pending` no banco.
 */
export async function inviteAllPendingUsers() {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const domain = allowedEmailDomain();
  const admin = createAdminClient();
  const { data: pending, error: qErr } = await admin
    .from('profiles')
    .select('id, email, nome_completo, full_name, role')
    .eq('role', 'pending');
  if (qErr) return { ok: false as const, error: qErr.message };

  const rows = pending ?? [];
  const appUrl = getPublicAppUrl();
  let sent = 0;
  let skippedResend = 0;
  let skippedNoEmail = 0;
  let skippedDomain = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const email = String((row as { email?: string | null }).email ?? '')
      .trim()
      .toLowerCase();
    if (!email || !email.includes('@')) {
      skippedNoEmail++;
      continue;
    }
    if ((email.split('@')[1] ?? '') !== domain) {
      skippedDomain++;
      continue;
    }

    const token = randomUUID();
    const { error: upErr } = await admin
      .from('profiles')
      .update({
        invite_token: token,
        invite_email_sent_at: null,
        invite_accepted_at: null,
        convidado_por: guard.actorId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', (row as { id: string }).id);
    if (upErr) {
      failures.push(email);
      continue;
    }

    const inviteLink = `${appUrl}/aceitar-convite?token=${encodeURIComponent(token)}`;
    const mail = await sendEmailViaResend({
      to: email,
      subject: 'Convite de acesso — Plataforma Moní',
      text:
        'Você possui cadastro pendente na plataforma Moní.\n\n' +
        `Acesse o link para concluir o acesso:\n${inviteLink}\n`,
      html: `<p>Você possui cadastro <strong>pendente</strong> na plataforma Moní.</p><p><a href="${inviteLink}">Aceitar convite e definir senha</a></p>`,
    });
    if (!mail.ok) failures.push(email);
    else if (mail.skipped) skippedResend++;
    else {
      const { error: sentErr } = await admin
        .from('profiles')
        .update({ invite_email_sent_at: new Date().toISOString() })
        .eq('id', (row as { id: string }).id);
      if (sentErr) failures.push(email);
      else sent++;
    }
  }

  revalidatePath('/admin/usuarios');
  return {
    ok: true as const,
    sent,
    skippedResend,
    skippedNoEmail,
    skippedDomain,
    candidates: rows.length,
    failures,
  };
}

/**
 * Reenvia o e-mail de convite (mesmo link/token) a perfis que já tinham
 * `invite_email_sent_at` — lembrete para quem já recebeu o primeiro envio via Resend.
 */
export async function resendInviteEmailsPreviouslyConfirmed() {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const domain = allowedEmailDomain();
  const admin = createAdminClient();
  const { data: rows, error: qErr } = await admin
    .from('profiles')
    .select('id, email, invite_token')
    .not('invite_token', 'is', null)
    .not('invite_email_sent_at', 'is', null);
  if (qErr) return { ok: false as const, error: qErr.message };

  const list = rows ?? [];
  const appUrl = getPublicAppUrl();
  let sent = 0;
  let skippedResend = 0;
  let skippedNoEmail = 0;
  let skippedDomain = 0;
  const failures: string[] = [];

  for (const row of list) {
    const email = String((row as { email?: string | null }).email ?? '')
      .trim()
      .toLowerCase();
    const token = String((row as { invite_token?: string | null }).invite_token ?? '').trim();
    if (!token) continue;
    if (!email || !email.includes('@')) {
      skippedNoEmail++;
      continue;
    }
    if ((email.split('@')[1] ?? '') !== domain) {
      skippedDomain++;
      continue;
    }

    const inviteLink = `${appUrl}/aceitar-convite?token=${encodeURIComponent(token)}`;
    const mail = await sendEmailViaResend({
      to: email,
      subject: 'Lembrete — convite de acesso — Plataforma Moní',
      text:
        'Este é um lembrete do seu convite de acesso à plataforma Moní.\n\n' +
        `Use o mesmo link para concluir o cadastro:\n${inviteLink}\n`,
      html:
        '<p>Este é um <strong>lembrete</strong> do seu convite de acesso à plataforma Moní.</p>' +
        `<p><a href="${inviteLink}">Aceitar convite e definir senha</a></p>`,
    });
    if (!mail.ok) failures.push(email);
    else if (mail.skipped) skippedResend++;
    else {
      const { error: sentErr } = await admin
        .from('profiles')
        .update({ invite_email_sent_at: new Date().toISOString() })
        .eq('id', (row as { id: string }).id);
      if (sentErr) failures.push(email);
      else sent++;
    }
  }

  revalidatePath('/admin/usuarios');
  return {
    ok: true as const,
    sent,
    skippedResend,
    skippedNoEmail,
    skippedDomain,
    candidates: list.length,
    failures,
  };
}

/**
 * Primeiro envio via Resend para perfis com `invite_token` mas sem `invite_email_sent_at`
 * (ex.: token gerado antes de configurar RESEND). Mantém o mesmo token/link.
 */
export async function sendInviteEmailForActiveTokensNeverDelivered() {
  const guard = await assertAdmin();
  if (!guard.ok) return guard;
  const domain = allowedEmailDomain();
  const admin = createAdminClient();
  const { data: rows, error: qErr } = await admin
    .from('profiles')
    .select('id, email, invite_token')
    .not('invite_token', 'is', null)
    .is('invite_email_sent_at', null);
  if (qErr) return { ok: false as const, error: qErr.message };

  const list = rows ?? [];
  const appUrl = getPublicAppUrl();
  let sent = 0;
  let skippedResend = 0;
  let skippedNoEmail = 0;
  let skippedDomain = 0;
  const failures: string[] = [];

  for (const row of list) {
    const email = String((row as { email?: string | null }).email ?? '')
      .trim()
      .toLowerCase();
    const token = String((row as { invite_token?: string | null }).invite_token ?? '').trim();
    if (!token) continue;
    if (!email || !email.includes('@')) {
      skippedNoEmail++;
      continue;
    }
    if ((email.split('@')[1] ?? '') !== domain) {
      skippedDomain++;
      continue;
    }

    const inviteLink = `${appUrl}/aceitar-convite?token=${encodeURIComponent(token)}`;
    const mail = await sendEmailViaResend({
      to: email,
      subject: 'Convite de acesso — Plataforma Moní',
      text:
        'Você recebeu um convite de acesso à plataforma Moní.\n\n' +
        `Acesse o link para concluir o cadastro:\n${inviteLink}\n`,
      html:
        '<p>Você recebeu um <strong>convite de acesso</strong> à plataforma Moní.</p>' +
        `<p><a href="${inviteLink}">Aceitar convite e definir senha</a></p>`,
    });
    if (!mail.ok) failures.push(email);
    else if (mail.skipped) skippedResend++;
    else {
      const { error: sentErr } = await admin
        .from('profiles')
        .update({ invite_email_sent_at: new Date().toISOString() })
        .eq('id', (row as { id: string }).id);
      if (sentErr) failures.push(email);
      else sent++;
    }
  }

  revalidatePath('/admin/usuarios');
  return {
    ok: true as const,
    sent,
    skippedResend,
    skippedNoEmail,
    skippedDomain,
    candidates: list.length,
    failures,
  };
}

