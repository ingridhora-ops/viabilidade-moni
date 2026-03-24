import { redirect } from 'next/navigation';
import { isAppFullyPublic } from '@/lib/public-rede-novos';
import { getDashboardData } from './actions';
import { DashboardSirene } from './DashboardSirene';

export default async function SirenePage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const params = await searchParams;
  const filtroTipoParam = params.tipo === 'padrao' || params.tipo === 'hdm' ? params.tipo : 'todos';

  const result = await getDashboardData(filtroTipoParam);
  if (!result.ok) {
    if (!isAppFullyPublic()) redirect('/login');
    return (
      <main className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-sm text-stone-600">
          {(result as { error?: string }).error ?? 'Não foi possível carregar o Sirene.'}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <DashboardSirene
        emAberto={result.emAberto}
        emAndamento={result.emAndamento}
        concluidos={result.concluidos}
        tempoMedioPrimeiroAtendimento={result.tempoMedioPrimeiroAtendimento}
        porStatus={result.porStatus}
        satisfacaoPct={result.satisfacaoPct}
        chamadosComTrava={result.chamadosComTrava}
        recentesComTrava={result.recentesComTrava}
        minhasTarefas={result.minhasTarefas}
        filtroTipo={filtroTipoParam}
      />
    </main>
  );
}
