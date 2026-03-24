'use client';

import { useState } from 'react';
import {
  inviteAllPendingUsers,
  inviteAllUsersNotLoggedIn,
  resendInviteEmailsPreviouslyConfirmed,
  sendInviteEmailForActiveTokensNeverDelivered,
} from './actions';

function skippedDiag(noEmail: number, wrongDomain: number): string {
  const parts: string[] = [];
  if (noEmail > 0) parts.push(`sem e-mail no perfil: ${noEmail}`);
  if (wrongDomain > 0) parts.push(`fora do domínio permitido: ${wrongDomain}`);
  return parts.length ? ` Ignorados (${parts.join('; ')}).` : '';
}

export function ConvidarPendentesButton() {
  const [loading, setLoading] = useState(false);
  const [loadingNotLogged, setLoadingNotLogged] = useState(false);
  const [loadingFirst, setLoadingFirst] = useState(false);
  const [loadingResend, setLoadingResend] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageNotLogged, setMessageNotLogged] = useState<string | null>(null);
  const [messageFirst, setMessageFirst] = useState<string | null>(null);
  const [messageResend, setMessageResend] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-moni-dark">Convites em lote</h2>

      <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
        <h3 className="text-sm font-semibold text-sky-950">Todos exceto &quot;Usuário Logado&quot;</h3>
        <p className="mt-1 text-xs text-stone-700">
          Envia de novo o e-mail de cadastro (link <code className="rounded bg-white/80 px-1">/aceitar-convite</code>) para{' '}
          <strong>quem ainda não concluiu</strong> esse fluxo — ou seja, sem data em{' '}
          <code className="rounded bg-white/80 px-1">invite_accepted_at</code> (coluna &quot;Usuário Logado&quot; vazia na prática).
          Inclui <strong>team</strong>, <strong>admin</strong>, <strong>pending</strong>, etc.; exclui apenas <strong>blocked</strong> e
          e-mails fora do domínio permitido. Gera <strong>token novo</strong> para cada um.
        </p>
        <button
          type="button"
          disabled={loadingNotLogged}
          onClick={async () => {
            setMessageNotLogged(null);
            setLoadingNotLogged(true);
            try {
              const r = await inviteAllUsersNotLoggedIn();
              if (!r.ok) {
                setMessageNotLogged(r.error ?? 'Falha.');
              } else {
                const extraFail =
                  r.failures.length > 0
                    ? ` Falhas: ${r.failures.length} (${r.failures.slice(0, 5).join(', ')}${r.failures.length > 5 ? '…' : ''}).`
                    : '';
                const resendNote =
                  r.skippedResend > 0
                    ? ` Sem RESEND_API_KEY: ${r.skippedResend} (tokens atualizados; configure na Vercel).`
                    : '';
                const extraSkip =
                  r.candidates === 0
                    ? ' Ninguém sem convite aceite — todos já são &quot;Usuário Logado&quot; ou não há perfis elegíveis.'
                    : '';
                setMessageNotLogged(
                  `Perfis sem cadastro concluído: ${r.candidates}. Enviados via Resend: ${r.sent}.${skippedDiag(r.skippedNoEmail, r.skippedDomain)}${extraSkip}${resendNote}${extraFail}`.trim(),
                );
              }
            } catch {
              setMessageNotLogged('Erro inesperado.');
            } finally {
              setLoadingNotLogged(false);
            }
          }}
          className="btn-primary mt-2 text-sm disabled:opacity-60"
        >
          {loadingNotLogged ? 'Enviando…' : 'Reenviar e-mail de cadastro a quem não é Usuário Logado'}
        </button>
        {messageNotLogged && <p className="mt-2 text-sm text-stone-800">{messageNotLogged}</p>}
      </div>

      <p className="mt-4 text-xs text-stone-600">
        <strong>Só pendentes (role)</strong>: abaixo, convite apenas para papel{' '}
        <code className="rounded bg-stone-100 px-1">pending</code> — útil quando não queres incluir team/admin.
      </p>
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          setMessage(null);
          setLoading(true);
          try {
            const r = await inviteAllPendingUsers();
            if (!r.ok) {
              setMessage(r.error ?? 'Falha ao convidar.');
            } else {
              const extraFail =
                r.failures.length > 0
                  ? ` Falhas de envio: ${r.failures.length} (${r.failures.slice(0, 5).join(', ')}${r.failures.length > 5 ? '…' : ''}).`
                  : '';
              const extraSkip =
                r.candidates === 0
                  ? ' Nenhum perfil com papel pending — confira na tabela a coluna Role ou no Supabase (profiles.role).'
                  : '';
              const resendNote =
                r.skippedResend > 0
                  ? ` Sem RESEND_API_KEY: ${r.skippedResend} (tokens atualizados; configure a chave na Vercel para enviar e-mail).`
                  : '';
              const diag =
                skippedDiag(r.skippedNoEmail, r.skippedDomain) + extraSkip + resendNote + extraFail;
              setMessage(
                `Perfis elegíveis: ${r.candidates}. Enviados via Resend: ${r.sent}.${diag}`.trim(),
              );
            }
          } catch {
            setMessage('Erro inesperado.');
          } finally {
            setLoading(false);
          }
        }}
        className="btn-primary mt-3 text-sm disabled:opacity-60"
      >
        {loading ? 'Enviando…' : 'Convidar todos os pendentes'}
      </button>
      {message && <p className="mt-2 text-sm text-stone-700">{message}</p>}

      <div className="mt-6 border-t border-stone-100 pt-4">
        <h3 className="text-sm font-semibold text-moni-dark">Enviar e-mail (link já gerado, âmbar)</h3>
        <p className="mt-1 text-xs text-stone-600">
          Para linhas <span className="text-amber-900">Link ativo — e-mail não enviado</span>: envia o <strong>primeiro</strong> e-mail via
          Resend com o <strong>mesmo</strong> token (não invalida o link). Use depois de configurar <code className="rounded bg-stone-100 px-1">RESEND_API_KEY</code> na Vercel.
        </p>
        <button
          type="button"
          disabled={loadingFirst}
          onClick={async () => {
            setMessageFirst(null);
            setLoadingFirst(true);
            try {
              const r = await sendInviteEmailForActiveTokensNeverDelivered();
              if (!r.ok) {
                setMessageFirst(r.error ?? 'Falha ao enviar.');
              } else {
                const extraFail =
                  r.failures.length > 0
                    ? ` Falhas: ${r.failures.length} (${r.failures.slice(0, 5).join(', ')}${r.failures.length > 5 ? '…' : ''}).`
                    : '';
                const resendNote =
                  r.skippedResend > 0
                    ? ` Sem RESEND_API_KEY: ${r.skippedResend} (nada enviado; configure na Vercel).`
                    : '';
                const extraSkip =
                  r.candidates === 0
                    ? ' Nenhum perfil com token e sem envio confirmado.'
                    : '';
                setMessageFirst(
                  `Elegíveis: ${r.candidates}. Enviados agora: ${r.sent}.${skippedDiag(r.skippedNoEmail, r.skippedDomain)}${extraSkip}${resendNote}${extraFail}`.trim(),
                );
              }
            } catch {
              setMessageFirst('Erro inesperado.');
            } finally {
              setLoadingFirst(false);
            }
          }}
          className="mt-3 rounded border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950 hover:bg-amber-50 disabled:opacity-60"
        >
          {loadingFirst ? 'Enviando…' : 'Enviar primeiro e-mail a quem tem link mas ainda sem Resend'}
        </button>
        {messageFirst && <p className="mt-2 text-sm text-stone-700">{messageFirst}</p>}
      </div>

      <div className="mt-6 border-t border-stone-100 pt-4">
        <h3 className="text-sm font-semibold text-moni-dark">Reenviar lembretes</h3>
        <p className="mt-1 text-xs text-stone-600">
          Para perfis com <strong>convite ativo</strong> e coluna verde &quot;e-mail enviado (Resend)&quot;: envia de novo o mesmo link (não gera
          token novo). Útil após falha de caixa de entrada ou para lembrar quem ainda não aceitou.
        </p>
        <button
          type="button"
          disabled={loadingResend}
          onClick={async () => {
            setMessageResend(null);
            setLoadingResend(true);
            try {
              const r = await resendInviteEmailsPreviouslyConfirmed();
              if (!r.ok) {
                setMessageResend(r.error ?? 'Falha ao reenviar.');
              } else {
                const extraFail =
                  r.failures.length > 0
                    ? ` Falhas: ${r.failures.length} (${r.failures.slice(0, 5).join(', ')}${r.failures.length > 5 ? '…' : ''}).`
                    : '';
                const resendNote =
                  r.skippedResend > 0
                    ? ` Sem RESEND_API_KEY: ${r.skippedResend} (nada enviado; configure na Vercel).`
                    : '';
                const extraSkip =
                  r.candidates === 0
                    ? ' Ninguém com token + envio confirmado — só aparecem linhas verdes na tabela.'
                    : '';
                setMessageResend(
                  `Elegíveis (já enviados antes): ${r.candidates}. Reenviados agora: ${r.sent}.${skippedDiag(r.skippedNoEmail, r.skippedDomain)}${extraSkip}${resendNote}${extraFail}`.trim(),
                );
              }
            } catch {
              setMessageResend('Erro inesperado.');
            } finally {
              setLoadingResend(false);
            }
          }}
          className="mt-3 rounded border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 hover:bg-stone-50 disabled:opacity-60"
        >
          {loadingResend ? 'Reenviando…' : 'Reenviar e-mail a quem já tinha envio confirmado'}
        </button>
        {messageResend && <p className="mt-2 text-sm text-stone-700">{messageResend}</p>}
      </div>
    </div>
  );
}
