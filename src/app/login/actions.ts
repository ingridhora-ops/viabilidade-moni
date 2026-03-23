'use server';

import { createClient } from '@/lib/supabase/server';
import { normalizeAccessRole } from '@/lib/authz';
import { sendSignupNotifications } from '@/lib/email';

/**
 * Dispara e-mails (Resend) após cadastro: confirmação ao usuário se pending e aviso aos admins.
 * Deve ser chamado na sequência do signUp, com sessão já estabelecida.
 */
export async function notifySignupComplete() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return { ok: false as const, error: 'Sessão não encontrada.' };

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, nome_completo, full_name, departamento')
      .eq('id', user.id)
      .maybeSingle();

    const accessRole = normalizeAccessRole((profile as { role?: string | null } | null)?.role);
    await sendSignupNotifications({
      userEmail: user.email.trim(),
      userName: String(
        (profile as { nome_completo?: string; full_name?: string } | null)?.nome_completo ??
          (profile as { full_name?: string } | null)?.full_name ??
          '',
      ).trim(),
      departamento: String((profile as { departamento?: string | null } | null)?.departamento ?? '').trim(),
      accessRole,
    });
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao notificar cadastro.';
    return { ok: false as const, error: msg };
  }
}
