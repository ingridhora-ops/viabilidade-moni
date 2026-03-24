import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPublicRedeNovosNegociosEnabled } from '@/lib/public-rede-novos';

export const PUBLIC_VISITANTE_NOME = 'Visitante (link público)';

async function resolveAutorNomePainel(
  supabase: SupabaseClient,
  userId: string,
  fallbackEmail?: string,
): Promise<string> {
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId).single();
  const nome = (profile?.full_name as string | null | undefined)?.trim();
  if (nome) return nome;
  const fallback = fallbackEmail?.split('@')?.[0]?.trim();
  return fallback || 'Usuário';
}

/**
 * UUID em Auth para atribuir eventos/checklists quando não há login mas o modo
 * público permite edição (opcional; senão usa o primeiro admin em `profiles`).
 */
function actorIdFromEnv(): string | null {
  const v = process.env.PUBLIC_LINK_ACTOR_USER_ID?.trim();
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

async function resolvePublicActorUserId(db: SupabaseClient): Promise<string | null> {
  const envId = actorIdFromEnv();
  if (envId) {
    const { data } = await db.from('profiles').select('id').eq('id', envId).maybeSingle();
    if ((data as { id?: string } | null)?.id) return envId;
  }
  const { data: admin } = await db.from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle();
  if ((admin as { id?: string } | null)?.id) return (admin as { id: string }).id;
  const { data: anyP } = await db.from('profiles').select('id').limit(1).maybeSingle();
  return (anyP as { id?: string } | null)?.id ?? null;
}

export type PainelDbAuthOk = {
  ok: true;
  supabase: SupabaseClient;
  user: User | null;
  /** id do utilizador logado, ou actor público (para FKs / filtros "minhas"). */
  userId: string;
  autorNome: string;
  /** true = service role (sem sessão, modo link público). */
  isServiceRole: boolean;
};

export type PainelDbAuth = PainelDbAuthOk | { ok: false; error: string };

/**
 * Utilizador autenticado: cliente normal + RLS.
 * Sem login e `NEXT_PUBLIC_PUBLIC_REDE_NOVOS_NEGOCIOS`: service role para permitir ver/editar como no painel (cuidado: URL + flag expõem dados).
 */
export async function getPainelDbForPublicEdit(): Promise<PainelDbAuth> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const autorNome = await resolveAutorNomePainel(supabase, user.id, user.email ?? undefined);
    return { ok: true, supabase, user, userId: user.id, autorNome, isServiceRole: false };
  }
  if (!isPublicRedeNovosNegociosEnabled()) {
    return { ok: false, error: 'Faça login.' };
  }
  try {
    const admin = createAdminClient();
    const actorId = await resolvePublicActorUserId(admin);
    if (!actorId) {
      return {
        ok: false,
        error:
          'Edição por link público: crie um utilizador em Auth/Profiles ou defina PUBLIC_LINK_ACTOR_USER_ID.',
      };
    }
    return {
      ok: true,
      supabase: admin,
      user: null,
      userId: actorId,
      autorNome: PUBLIC_VISITANTE_NOME,
      isServiceRole: true,
    };
  } catch {
    return { ok: false, error: 'Edição por link público indisponível (SUPABASE_SERVICE_ROLE_KEY).' };
  }
}
