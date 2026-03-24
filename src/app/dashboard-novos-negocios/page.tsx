import Link from 'next/link';
import { DashboardNovosNegociosClient } from './DashboardNovosNegociosClient';

export default async function DashboardNovosNegociosPage() {
  return (
    <div className="min-h-screen bg-white text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2 text-sm">
            <Link href="/" className="text-moni-primary hover:underline">
              ← Início
            </Link>
            <span className="text-stone-400">/</span>
            <span className="font-medium text-stone-800">Dashboard Novos Negócios</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <DashboardNovosNegociosClient />
      </main>
    </div>
  );
}
