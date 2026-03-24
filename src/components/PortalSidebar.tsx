'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bell, ChevronDown, ChevronRight, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isAdminRole, normalizeAccessRole } from '@/lib/authz';
import { isLiveLimitedRelease } from '@/lib/release-scope';

type PortalSidebarProps = {
  user: { id: string; email?: string; full_name?: string | null } | null;
  userRole: string;
  /** Sem sessão: só macros Rede + Novos Negócios (subitens completos para edição pública). */
  publicVisitor?: boolean;
};

function getInicialNome(fullName: string | null | undefined): string {
  if (!fullName || !fullName.trim()) return '?';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 2) {
    const ultima = parts[parts.length - 1];
    return (parts[0][0] + (ultima?.[0] ?? '')).toUpperCase().slice(0, 2);
  }
  return (parts[0][0] ?? '?').toUpperCase();
}

type NavItem = { href: string; label: string };
const REDE_FRANQUEADOS_SUBITENS: NavItem[] = [
  { href: '/rede-franqueados', label: 'Rede de Franqueados' },
  { href: '/comunidade', label: 'Comunidade' },
];
const CATALOGO_SUBITENS: NavItem[] = [
  { href: '/catalogo-produtos-moni', label: 'Catálogo de Produtos Moní' },
];
const REDE_CONTATOS_SUBITENS: NavItem[] = [
  { href: '/rede', label: 'Rede de contatos' },
];
const STEPS_SUBITENS: NavItem[] = [
  { href: '/step-one', label: 'Step 1: Mapeamento da Região' },
  { href: '/step-2', label: 'Step 2: Novo Negócio' },
  { href: '/step-3', label: 'Step 3: Opção' },
  { href: '/painel', label: 'Step 4: Check Legal + Checklist Crédito' },
  { href: '/acoplamento-pl', label: 'Acoplamento (paralelo Step 4)' },
  { href: '/step-5', label: 'Step 5: Comitê' },
  { href: '/step-6', label: 'Step 6: Diligência' },
  { href: '/step-7', label: 'Step 7: Contrato' },
];
const ACOPLAMENTO_SUBITENS: NavItem[] = [
  { href: '/acoplamento-pl', label: 'Início' },
  { href: '/acoplamento-pl/alteracoes-acoplamento', label: 'Alterações acoplamento' },
  { href: '/acoplamento-pl/modelagem-terreno', label: 'Modelagem terreno' },
  { href: '/acoplamento-pl/validacao-acoplamento', label: 'Validação acoplamento' },
  { href: '/acoplamento-pl/checklist-legal', label: 'Checklist legal' },
  { href: '/acoplamento-pl/resumo-manuais', label: 'Resumo manuais' },
  { href: '/acoplamento-pl/modelagem-casa-gbox', label: 'Modelagem casa Gbox' },
];
const PAINEL_NOVOS_NEGOCIOS_SUBITENS: NavItem[] = [
  { href: '/dashboard-novos-negocios', label: 'Dashboard Novos Negócios' },
  { href: '/painel-novos-negocios', label: 'Portfolio + Operações' },
];
const PAINEL_NOVOS_NEGOCIOS_TAREFAS: NavItem[] = [
  { href: '/painel-novos-negocios/tarefas', label: 'Painel de Tarefas' },
];
const PAINEL_NOVOS_NEGOCIOS_ADMIN_SUBITENS: NavItem[] = [
  { href: '/painel-contabilidade', label: 'Contabilidade' },
  { href: '/painel-credito', label: 'Crédito' },
];

function isRedeFranqueadosActive(pathname: string) {
  return pathname.startsWith('/rede-franqueados') || pathname.startsWith('/comunidade');
}
function isPainelNovosNegociosActive(pathname: string) {
  return (
    pathname.startsWith('/painel-novos-negocios') ||
    pathname.startsWith('/painel-contabilidade') ||
    pathname.startsWith('/painel-credito') ||
    pathname.startsWith('/dashboard-novos-negocios')
  );
}
function isCatalogoActive(pathname: string) {
  return pathname.startsWith('/catalogo-produtos-moni');
}
function isRedeContatosActive(pathname: string) {
  return pathname === '/rede' || (pathname.startsWith('/rede') && !pathname.startsWith('/rede-franqueados'));
}
function isStepsActive(pathname: string) {
  return pathname.startsWith('/step-one') || pathname.startsWith('/step-2') || pathname.startsWith('/step-3') || pathname.startsWith('/step-5') || pathname.startsWith('/step-6') || pathname.startsWith('/step-7') || pathname.startsWith('/painel');
}
function isAcoplamentoActive(pathname: string) {
  return pathname.startsWith('/acoplamento-pl');
}
export function PortalSidebar({ user, userRole, publicVisitor = false }: PortalSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [resolvedRole, setResolvedRole] = useState(userRole);
  const isAdmin = isAdminRole(resolvedRole);
  const limitedRelease = isLiveLimitedRelease();
  const showFullNovosNegociosNav = publicVisitor || isAdmin;

  useEffect(() => {
    setResolvedRole(userRole);
  }, [userRole]);

  useEffect(() => {
    if (publicVisitor || !user?.id) return;
    const supabase = createClient();
    void supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.role != null) {
          setResolvedRole(normalizeAccessRole(String(data.role)));
        }
      });
  }, [user?.id, publicVisitor]);
  const [perfilOpen, setPerfilOpen] = useState(() => (pathname ?? '') === '/perfil');
  const [redeFranqueadosOpen, setRedeFranqueadosOpen] = useState(() => isRedeFranqueadosActive(pathname ?? ''));
  const [catalogoOpen, setCatalogoOpen] = useState(() => isCatalogoActive(pathname ?? ''));
  const [redeContatosOpen, setRedeContatosOpen] = useState(() => isRedeContatosActive(pathname ?? ''));
  const [stepsOpen, setStepsOpen] = useState(() => isStepsActive(pathname ?? ''));
  const [acoplamentoOpen, setAcoplamentoOpen] = useState(() => isAcoplamentoActive(pathname ?? ''));
  const [painelNovosNegociosOpen, setPainelNovosNegociosOpen] = useState(() =>
    isPainelNovosNegociosActive(pathname ?? ''),
  );

  useEffect(() => {
    const p = pathname ?? '';
    if (p === '/perfil' || p.startsWith('/admin/usuarios')) setPerfilOpen(true);
    if (isPainelNovosNegociosActive(p)) setPainelNovosNegociosOpen(true);
    if (isRedeFranqueadosActive(p)) setRedeFranqueadosOpen(true);
    else if (isCatalogoActive(p)) setCatalogoOpen(true);
    else if (isRedeContatosActive(p)) setRedeContatosOpen(true);
    else if (isStepsActive(p)) setStepsOpen(true);
    else if (isAcoplamentoActive(p)) setAcoplamentoOpen(true);
    // Painel Crédito é subitem de Painel Novos Negócios (sem macro separado).
  }, [pathname]);

  const isSirene = pathname.startsWith('/sirene');
  const displayName = publicVisitor
    ? 'Visitante'
    : user?.full_name?.trim() || user?.email || 'Franqueado';
  const inicial = publicVisitor ? 'V' : getInicialNome(user?.full_name ?? null);

  const linkClassPrincipal = (active: boolean) =>
    `block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
      isSirene
        ? active
          ? 'bg-stone-800 text-white'
          : 'text-stone-200 hover:bg-stone-800/80 hover:text-white'
        : active
          ? 'bg-moni-light text-moni-primary'
          : 'text-moni-primary hover:bg-moni-light/50 hover:text-moni-secondary'
    }`;

  const linkClassSub = (active: boolean) =>
    `block w-full rounded py-1.5 pl-5 pr-3 text-left text-xs transition ${
      isSirene
        ? active
          ? 'bg-stone-800 text-white'
          : 'text-stone-300 hover:bg-stone-800/60 hover:text-stone-100'
        : active
          ? 'bg-moni-light/80 font-medium text-moni-primary'
          : 'text-stone-600 hover:bg-stone-100 hover:text-moni-secondary'
    }`;

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const renderMacro = (
    key:
      | 'rede'
      | 'catalogo'
      | 'redeContatos'
      | 'steps'
      | 'acoplamento'
      | 'credito'
      | 'painelNovosNegocios',
    label: string,
    isActive: boolean,
    open: boolean,
    setOpen: (v: boolean) => void,
    subitens: NavItem[],
    isActiveHref: (href: string) => boolean,
  ) => {
    const isSireneMacro = false;
    const macroClass =
      isSirene && isSireneMacro
        ? 'block w-full rounded-lg bg-emerald-400 px-3 py-2 text-left text-sm font-semibold text-stone-900 transition hover:bg-emerald-300'
        : linkClassPrincipal(isActive);
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className={`flex flex-1 items-center gap-2 ${macroClass}`}
          >
            {label}
          </button>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className={`rounded p-1.5 ${isSirene ? 'text-stone-400 hover:text-stone-200' : 'text-stone-500 hover:text-moni-primary'}`}
            aria-expanded={open}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
        {open && (
          <div className="mt-0.5 space-y-0.5">
            {subitens.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className={linkClassSub(isActiveHref(s.href))}
              >
                {s.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`flex h-screen w-56 flex-col border-r ${
        isSirene ? 'border-stone-800 bg-stone-900 text-stone-100' : 'border-stone-200 bg-white'
      }`}
    >
      {/* Topo: logo + sino */}
      <div
        className={`flex h-14 items-center justify-between gap-2 border-b px-4 ${
          isSirene ? 'border-stone-800' : 'border-stone-200'
        }`}
      >
        <Link
          href="/"
          className={`text-lg font-semibold tracking-tight ${
            isSirene
              ? 'text-stone-100 hover:text-white'
              : 'text-moni-primary hover:text-moni-secondary'
          }`}
        >
          Moní
        </Link>
        <Link
          href={isSirene ? '/sirene' : isAdmin ? '/alertas' : '/comunidade'}
          className={`flex items-center justify-center rounded-full p-1.5 ${
            isSirene
              ? 'text-amber-400 hover:bg-stone-800 hover:text-amber-300'
              : 'text-amber-500 hover:bg-amber-50 hover:text-amber-600'
          }`}
          title={isSirene ? 'Notificações Sirene' : isAdmin ? 'Alertas' : 'Comunidade'}
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
        </Link>
      </div>

      {/* Navegação principal com macro-itens e subitens */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {renderMacro(
          'rede',
          'Rede de Franqueados',
          isRedeFranqueadosActive(pathname ?? ''),
          redeFranqueadosOpen,
          setRedeFranqueadosOpen,
          REDE_FRANQUEADOS_SUBITENS,
          (href) => pathname?.startsWith(href) ?? false,
        )}

        {renderMacro(
          'painelNovosNegocios',
          'Novos Negócios',
          isPainelNovosNegociosActive(pathname ?? ''),
          painelNovosNegociosOpen,
          setPainelNovosNegociosOpen,
          showFullNovosNegociosNav
            ? [
                ...PAINEL_NOVOS_NEGOCIOS_SUBITENS,
                ...PAINEL_NOVOS_NEGOCIOS_ADMIN_SUBITENS,
                ...PAINEL_NOVOS_NEGOCIOS_TAREFAS,
              ]
            : [...PAINEL_NOVOS_NEGOCIOS_SUBITENS, ...PAINEL_NOVOS_NEGOCIOS_TAREFAS],
          (href) => pathname === href || (pathname?.startsWith(href + '/') ?? false),
        )}

        {!publicVisitor && !limitedRelease &&
          isAdmin &&
          renderMacro(
            'catalogo',
            'Catálogo de Produtos Moní',
            isCatalogoActive(pathname ?? ''),
            catalogoOpen,
            setCatalogoOpen,
            CATALOGO_SUBITENS,
            (href) => pathname?.startsWith(href) ?? false,
          )}

        {!publicVisitor && !limitedRelease &&
          isAdmin &&
          renderMacro(
            'redeContatos',
            'Rede de contatos',
            isRedeContatosActive(pathname ?? ''),
            redeContatosOpen,
            setRedeContatosOpen,
            REDE_CONTATOS_SUBITENS,
            (href) => pathname === href,
          )}

        {!publicVisitor && !limitedRelease &&
          isAdmin &&
          renderMacro(
            'steps',
            'Steps Viabilidade',
            isStepsActive(pathname ?? ''),
            stepsOpen,
            setStepsOpen,
            STEPS_SUBITENS,
            (href) => {
              if (href === '/step-one') {
                return Boolean(pathname?.startsWith('/step-one') && !pathname?.startsWith('/step-2'));
              }
              return pathname === href || (pathname?.startsWith(href + '/') ?? false);
            },
          )}

        {!limitedRelease &&
          isAdmin &&
          renderMacro(
            'acoplamento',
            'Acoplamento + PL',
            isAcoplamentoActive(pathname ?? ''),
            acoplamentoOpen,
            setAcoplamentoOpen,
            ACOPLAMENTO_SUBITENS,
            (href) => (pathname === href || (href !== '/acoplamento-pl' && pathname?.startsWith(href))) ?? false,
          )}

        {!publicVisitor && !limitedRelease && isAdmin && (
          <Link
            href="/sirene"
            className={
              isSirene
                ? 'block w-full rounded-lg bg-emerald-400 px-3 py-2 text-left text-sm font-semibold text-stone-900 transition hover:bg-emerald-300'
                : linkClassPrincipal(pathname.startsWith('/sirene'))
            }
          >
            Sirene
          </Link>
        )}
      </nav>

      {publicVisitor ? (
        <div className="space-y-2 border-t border-stone-200 p-3 text-xs text-stone-600">
          <p className="rounded-lg bg-stone-100 px-3 py-2 leading-snug">
            Modo visitante — edição pública (Rede + Novos Negócios)
          </p>
          <Link href="/login" className="block font-medium text-moni-primary hover:underline">
            Entrar com conta
          </Link>
        </div>
      ) : (
        <div
          className={
            isSirene
              ? 'space-y-1 border-t border-stone-800 bg-moni-primary/10 p-3'
              : 'space-y-1 border-t border-stone-200 p-3'
          }
        >
          <div
            className={
              isSirene
                ? 'flex w-full items-center gap-2 rounded-lg bg-moni-primary px-3 py-2'
                : 'flex w-full items-center gap-2 rounded-lg px-3 py-2'
            }
          >
            <span
              className={
                isSirene
                  ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white'
                  : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-moni-primary text-xs font-semibold text-white'
              }
            >
              {inicial}
            </span>
            <div className="min-w-0 flex-1">
              <span
                className={
                  isSirene
                    ? 'block truncate text-sm font-semibold text-white'
                    : 'block truncate text-sm font-semibold text-moni-primary'
                }
              >
                {displayName}
              </span>
              {user?.email && (
                <span
                  className={
                    isSirene
                      ? 'mt-0.5 block truncate text-[10px] text-emerald-50/80'
                      : 'mt-0.5 block truncate text-[10px] text-stone-300'
                  }
                >
                  {user.email}
                </span>
              )}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setPerfilOpen((o) => !o)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${
                isSirene
                  ? perfilOpen
                    ? 'bg-emerald-500/20 text-emerald-50'
                    : 'text-emerald-50/80 hover:bg-emerald-500/15 hover:text-emerald-50'
                  : perfilOpen
                    ? 'bg-moni-light text-moni-primary'
                    : 'text-moni-primary hover:bg-moni-light/70 hover:text-moni-secondary'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                <span>Perfil</span>
              </span>
              {perfilOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
            {perfilOpen && (
              <div className="mt-1 space-y-0.5 pl-6 text-[11px]">
                <div className={isSirene ? 'text-stone-400' : 'text-stone-500'}>
                  Papel: {resolvedRole || 'franqueado'}
                </div>
                {isAdmin && (
                  <Link
                    href="/admin/usuarios"
                    className={`mt-1 block text-left font-semibold ${isSirene ? 'text-emerald-200 hover:text-white' : 'text-moni-primary hover:text-moni-secondary'}`}
                  >
                    Gerenciar Usuários
                  </Link>
                )}
                <Link
                  href="/perfil"
                  className={`mt-1 block text-left ${isSirene ? 'text-stone-200 hover:text-white' : 'text-moni-primary hover:text-moni-secondary'}`}
                >
                  Ver perfil e configurações
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className={`mt-1 text-left ${isSirene ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'}`}
                >
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}