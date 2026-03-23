'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function atualizarChaveAutentique(
  apiKey: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const role = profile?.role ?? 'frank';
  if (role !== 'consultor' && role !== 'admin' && role !== 'supervisor')
    return { ok: false, error: 'Apenas consultores e administradores podem configurar a chave do Autentique.' };

  const value = apiKey?.trim() || null;
  const { error } = await supabase
    .from('profiles')
    .update({
      autentique_api_key: value,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/perfil');
  return { ok: true };
}

export async function atualizarPerfilBasico(input: {
  nome_completo: string;
  departamento: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login.' };

  const nome = input.nome_completo.trim();
  const departamento = input.departamento.trim();
  if (!nome || !departamento) {
    return { ok: false, error: 'Preencha nome e departamento.' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      nome_completo: nome,
      full_name: nome,
      departamento,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/perfil');
  return { ok: true };
}
