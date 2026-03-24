import { guardLoginRequired } from '@/lib/auth-guard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function PainelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  guardLoginRequired(user);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  const role = profile?.role ?? 'frank';
  if (role !== 'consultor' && role !== 'admin') {
    redirect('/');
  }

  let processos: {
    id: string;
    cidade: string | null;
    estado: string | null;
    status: string | null;
    etapa_atual: number;
    updated_at: string | null;
    user_id: string;
  }[] = [];
  if (role === 'admin') {
    const { data } = await supabase
      .from('processo_step_one')
      .select('id, cidade, estado, status, etapa_atual, updated_at, user_id')
      .order('updated_at', { ascending: false })
      .limit(100);
    processos = (data ?? []) as typeof processos;
  } else {
    const { data: franks } = await supabase
      .from('profiles')
      .select('id')
      .eq('consultor_id', user.id);
    const frankIds = (franks ?? []).map((f) => f.id);
    if (frankIds.length > 0) {
      const { data } = await supabase
        .from('processo_step_one')
        .select('id, cidade, estado, status, etapa_atual, updated_at, user_id')
        .in('user_id', frankIds)
        .order('updated_at', { ascending: false })
        .limit(100);
      processos = (data ?? []) as typeof processos;
    }
  }

  const processoIds = processos.map((p) => p.id);
  let pdfs: {
    id: string;
    processo_id: string;
    hipotese: string | null;
    modelo_escolhido: string | null;
    file_hash: string | null;
    created_at: string;
  }[] = [];
  if (processoIds.length > 0) {
    const { data: pdfList } = await supabase
      .from('pdf_exports')
      .select('id, processo_id, hipotese, modelo_escolhido, file_hash, created_at')
      .in('processo_id', processoIds)
      .order('created_at', { ascending: false })
      .limit(30);
    pdfs = (pdfList ?? []) as typeof pdfs;
  }
  const processoById = new Map(processos.map((p) => [p.id, p]));

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link href="/" className="text-moni-primary hover:underline">
            ← Início
          </Link>
          <span className="text-stone-500">/</span>
          <span className="font-medium text-stone-700">Painel Moní</span>
          <span className="text-xs text-stone-500">
            ({role === 'admin' ? 'Admin' : 'Consultor'})
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-bold text-moni-dark">Painel Moní</h1>
        <p className="mt-1 text-sm text-stone-600">
          {role === 'admin'
            ? 'Todos os processos (funil por Frank, uso Apify e atividades em expansão).'
            : 'Processos da sua carteira de Franks.'}
        </p>

        <p className="mt-4 text-sm text-stone-600">
          Para revisar documentos (Step 3 e Step 7), abra o processo do franqueado e use a seção{' '}
          <strong>Documentos</strong> nas etapas.
        </p>

        <div className="mt-6 overflow-hidden rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-100">
                <th className="p-2 text-left">Cidade / Estado</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-center">Etapa</th>
                <th className="p-2 text-left">Atualizado</th>
                <th className="p-2 text-left">Ação</th>
              </tr>
            </thead>
            <tbody>
              {processos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-stone-500">
                    Nenhum processo encontrado.
                  </td>
                </tr>
              ) : (
                processos.map((p) => (
                  <tr key={p.id} className="border-b border-stone-100">
                    <td className="p-2 font-medium">
                      {p.cidade ?? '—'}
                      {p.estado ? `, ${p.estado}` : ''}
                    </td>
                    <td className="p-2">
                      {p.status === 'em_andamento'
                        ? 'Em andamento'
                        : p.status === 'concluido'
                          ? 'Concluído'
                          : 'Rascunho'}
                    </td>
                    <td className="p-2 text-center">{p.etapa_atual}/11</td>
                    <td className="p-2 text-stone-500">
                      {p.updated_at ? new Date(p.updated_at).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="p-2">
                      <Link href={`/step-one/${p.id}`} className="text-moni-accent hover:underline">
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pdfs.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-moni-dark">PDFs gerados</h2>
            <p className="mt-1 text-sm text-stone-600">
              Últimos registros de exportação de hipóteses.
            </p>
            <div className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-100">
                    <th className="p-2 text-left">Processo</th>
                    <th className="p-2 text-left">Hipótese</th>
                    <th className="p-2 text-left">Modelo</th>
                    <th className="p-2 text-left">Data</th>
                    <th className="p-2 text-left">Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {pdfs.map((pdf) => {
                    const p = processoById.get(pdf.processo_id);
                    return (
                      <tr key={pdf.id} className="border-b border-stone-100">
                        <td className="p-2">
                          <Link
                            href={`/step-one/${pdf.processo_id}`}
                            className="text-moni-accent hover:underline"
                          >
                            {p
                              ? `${p.cidade ?? '—'}${p.estado ? `, ${p.estado}` : ''}`
                              : pdf.processo_id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="p-2 text-stone-700">{pdf.hipotese ?? '—'}</td>
                        <td className="p-2 text-stone-600">{pdf.modelo_escolhido ?? '—'}</td>
                        <td className="p-2 text-stone-500">
                          {pdf.created_at ? new Date(pdf.created_at).toLocaleString('pt-BR') : '—'}
                        </td>
                        <td
                          className="max-w-[120px] truncate p-2 font-mono text-xs text-stone-400"
                          title={pdf.file_hash ?? ''}
                        >
                          {pdf.file_hash ? `${pdf.file_hash.slice(0, 12)}…` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <p className="mt-6 text-xs text-stone-500">
          Uso Apify e relatórios de atividades serão incorporados quando a integração estiver
          disponível.
        </p>
      </main>
    </div>
  );
}
