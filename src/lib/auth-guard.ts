import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { isAppFullyPublic } from '@/lib/public-rede-novos';

/**
 * Sem sessão: login (app fechada) ou início `/` (app aberta — rotas que ainda não suportam visitante).
 * Depois disto, `user` está definido (TypeScript).
 */
export function guardLoginRequired(user: User | null): asserts user is User {
  if (!user && !isAppFullyPublic()) redirect('/login');
  if (!user && isAppFullyPublic()) redirect('/');
}
