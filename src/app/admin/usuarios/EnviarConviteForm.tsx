'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function EnviarConviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [role, setRole] = useState<'team' | 'admin'>('team');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const em = email.trim().toLowerCase();
    if (!em || !em.includes('@')) {
      setError('Informe um e-mail válido.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: em,
          role,
          departamento: departamento.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(json?.error ?? 'Falha ao enviar convite.'));
        return;
      }
      if (json?.emailSkipped) {
        setMessage(
          `${String(json?.warning ?? 'E-mail não enviado pelo Resend.')} Link para enviar manualmente: ${String(json?.inviteLink ?? '')}`,
        );
      } else {
        let msg = `Convite processado para ${em}. O convidado deve receber o e-mail com o link.`;
        if (json?.resendEmailId) {
          msg += ` ID no Resend: ${json.resendEmailId} — em resend.com/emails podes confirmar entrega ou falhas.`;
        }
        setMessage(msg);
      }
      setEmail('');
      setDepartamento('');
      router.refresh();
    } catch {
      setError('Erro de rede. Tente de novo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-moni-dark">Enviar convite (uma pessoa)</h2>
      <p className="mt-1 text-xs text-stone-600">
        E-mail no domínio permitido (ex.: @moni.casa). O convidado recebe o link para definir nome e senha.
      </p>
      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[200px] flex-1">
          <label htmlFor="invite-email" className="block text-xs font-medium text-stone-600">
            E-mail
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@moni.casa"
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            required
            autoComplete="off"
          />
        </div>
        <div className="min-w-[160px] flex-1">
          <label htmlFor="invite-dept" className="block text-xs font-medium text-stone-600">
            Departamento
          </label>
          <input
            id="invite-dept"
            type="text"
            value={departamento}
            onChange={(e) => setDepartamento(e.target.value)}
            placeholder="Opcional"
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="min-w-[120px]">
          <label htmlFor="invite-role" className="block text-xs font-medium text-stone-600">
            Papel
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'team' | 'admin')}
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          >
            <option value="team">Team</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" disabled={loading} className="btn-primary text-sm disabled:opacity-60">
          {loading ? 'Enviando…' : 'Enviar convite'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-2 text-sm text-green-800">{message}</p>}
    </div>
  );
}
