import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAppFullyPublic } from '@/lib/public-rede-novos';
import { getMonitorTopicosPorTime } from '../actions';
import { MonitorFiltroTipo } from './MonitorFiltroTipo';

const STATUS_LABEL: Record<string, string> = {
  nao_iniciado: 'Não iniciado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído (aguardando aprovação)',
  aprovado: 'Aprovado',
};

type SearchParams = { tipo?: string };

export default async function SireneMonitorPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filtroTipo =
    params.tipo === 'padrao' || params.tipo === 'hdm' ? params.tipo : undefined;
  const result = await getMonitorTopicosPorTime(filtroTipo ?? 'todos');
  if (!result.ok) {
    if (!isAppFullyPublic()) redirect('/login');
    return (
      <main className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-sm text-stone-600">
          {(result as { error?: string }).error ?? 'Não foi possível carregar o monitor.'}
        </p>
      </main>
    );
  }
  if (!result.isBombeiro) redirect('/sirene');

  const { porTime } = result;
  const times = Object.keys(porTime).sort();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Monitor dos times</h1>
          <p className="mt-1 text-stone-400">
            Visão do Bombeiro: o que está com cada time (tópicos não aprovados). Clique no chamado
            para aprovar/reprovar ou ver detalhes.
          </p>
        </div>
        <MonitorFiltroTipo tipoAtual={filtroTipo ?? 'todos'} />
      </div>

      {times.length === 0 ? (
        <div className="mt-6 rounded-xl border border-stone-700 bg-stone-800/60 p-6 text-center text-stone-400">
          Nenhum tópico pendente nos times no momento.
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {times.map((time) => {
            const itens = porTime[time];
            return (
              <section
                key={time}
                className="rounded-xl border border-stone-700 bg-stone-800/80 p-4"
              >
                <h2 className="text-lg font-semibold text-stone-100">
                  Time: {time}
                  <span className="ml-2 text-sm font-normal text-stone-400">
                    ({itens.length} {itens.length === 1 ? 'tópico' : 'tópicos'})
                  </span>
                </h2>
                <ul className="mt-4 space-y-3">
                  {itens.map((t) => (
                    <li key={t.topicoId}>
                      <Link
                        href={`/sirene/${t.chamadoId}`}
                        className="block rounded-lg border border-stone-600 bg-stone-900/80 p-3 transition hover:border-amber-500/50 hover:bg-stone-800/80"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-amber-400">#{t.numero}</span>
                          {t.trava && (
                            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-400">
                              Trava
                            </span>
                          )}
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs ${
                              t.status === 'concluido'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : t.status === 'em_andamento'
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-stone-600 text-stone-300'
                            }`}
                          >
                            {STATUS_LABEL[t.status] ?? t.status}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-stone-300">{t.incendio}</p>
                        <p className="mt-0.5 text-xs text-stone-400">
                          Tópico: {t.descricao}
                          {t.frank_nome && ` · Frank: ${t.frank_nome}`}
                          {t.data_inicio && ` · Início previsto: ${t.data_inicio}`}
                          {t.data_fim && ` · Fim previsto: ${t.data_fim}`}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
