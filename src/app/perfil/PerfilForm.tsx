'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Props = {
  initialNome: string;
  initialDepartamento: string;
  email: string;
  role: string;
  aprovadoEm: string | null;
};

export function PerfilForm({
  initialNome,
  initialDepartamento,
  email,
  role,
  aprovadoEm,
}: Props) {
  const [nome, setNome] = useState(initialNome);
  const [departamento, setDepartamento] = useState(initialDepartamento);
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setError('');
    setLoading(true);
    try {
      if (!nome.trim() || !departamento.trim()) {
        setError('Preencha nome e departamento.');
        setLoading(false);
        return;
      }
      if (senha || confirmar) {
        if (senha.length < 8) {
          setError('A senha deve ter no mínimo 8 caracteres.');
          setLoading(false);
          return;
        }
        if (senha !== confirmar) {
          setError('Senha e confirmação não conferem.');
          setLoading(false);
          return;
        }
      }
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('Faça login novamente.');
        setLoading(false);
        return;
      }
      const { error: updErr } = await supabase
        .from('profiles')
        .update({
          nome_completo: nome.trim(),
          full_name: nome.trim(),
          departamento: departamento.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (updErr) {
        setError(updErr.message);
        setLoading(false);
        return;
      }
      if (senha) {
        const { error: passErr } = await supabase.auth.updateUser({ password: senha });
        if (passErr) {
          setError(passErr.message);
          setLoading(false);
          return;
        }
      }
      setMsg('Perfil atualizado com sucesso.');
      setSenha('');
      setConfirmar('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSave} className="mt-6 space-y-4 rounded-lg border border-stone-200 bg-white p-4">
      <div>
        <label className="block text-sm font-medium text-stone-700">Nome completo</label>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700">Departamento</label>
        <input
          value={departamento}
          onChange={(e) => setDepartamento(e.target.value)}
          className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-stone-700">E-mail (somente leitura)</label>
          <input value={email} disabled className="mt-1 w-full rounded border border-stone-200 bg-stone-100 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700">Role (somente leitura)</label>
          <input value={role} disabled className="mt-1 w-full rounded border border-stone-200 bg-stone-100 px-3 py-2" />
        </div>
      </div>
      <div className="text-xs text-stone-500">
        Aprovado em: {aprovadoEm ? new Date(aprovadoEm).toLocaleString('pt-BR') : '—'}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-stone-700">Nova senha</label>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700">Confirmar nova senha</label>
          <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      <button disabled={loading} className="btn-primary">
        {loading ? 'Salvando...' : 'Salvar perfil'}
      </button>
    </form>
  );
}

