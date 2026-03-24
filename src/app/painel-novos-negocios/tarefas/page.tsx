import Link from 'next/link';
import { TarefasPainelConteudo } from '@/app/steps-viabilidade/tarefas/TarefasPainelConteudo';

export default async function PainelTarefasPage() {
  return (
    <div className="min-h-screen bg-stone-100">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link href="/painel-novos-negocios" className="text-moni-primary hover:underline">
            ← Painel Novos Negócios
          </Link>
          <span className="text-stone-400">/</span>
          <span className="font-medium text-stone-700">Painel de Tarefas</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-2 text-xl font-bold text-stone-900">Painel de Tarefas</h1>
        <p className="mb-4 text-sm text-stone-600">
          Tópicos/tarefas por etapa dos processos. Filtre por todas ou apenas as que você é responsável.
        </p>
        <TarefasPainelConteudo basePath="/painel-novos-negocios" />
      </main>
    </div>
  );
}
