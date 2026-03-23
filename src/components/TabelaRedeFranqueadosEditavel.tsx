'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, X } from 'lucide-react';
import type { RedeFranqueadoDbKey, RedeFranqueadoRowDb } from '@/lib/rede-franqueados';
import { COLUNAS_REDE_FRANQUEADOS, REDE_FRANQUEADOS_DB_KEYS } from '@/lib/rede-franqueados';
import { atualizarRedeFranqueado, excluirRedeFranqueado } from '@/app/rede-franqueados/actions';
import { UFS_BRASIL } from '@/lib/uf';

type AreaAtuacaoItem = { estado: string; cidade: string };
type CidadeIBGE = { id: number; nome: string };

function parseAreaAtuacao(s: string | null | undefined): AreaAtuacaoItem[] {
  if (!s || typeof s !== 'string') return [];
  return s
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const i = part.indexOf(' - ');
      if (i < 0) return null;
      return { estado: part.slice(0, i).trim(), cidade: part.slice(i + 3).trim() };
    })
    .filter((x): x is AreaAtuacaoItem => x !== null && Boolean(x.estado && x.cidade));
}

function CidadeCombobox({
  id,
  disabled,
  loading,
  placeholder,
  value,
  onChange,
  items,
}: {
  id: string;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  value: string;
  onChange: (cidade: string) => void;
  items: CidadeIBGE[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => c.nome.toLowerCase().includes(q));
  }, [items, query]);
  useEffect(() => setQuery(''), [items]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-left text-sm ${
          disabled ? 'border-stone-200 bg-stone-100 text-stone-500' : 'border-stone-300 bg-white'
        }`}
      >
        {value ? value : loading ? 'Carregando...' : placeholder ?? '— Cidade —'}
      </button>
      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-lg">
          <div className="border-b border-stone-200 p-1.5">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar..."
              className="w-full rounded border border-stone-300 px-2 py-1 text-sm"
              autoFocus
            />
          </div>
          <ul id={id} role="listbox" className="max-h-48 overflow-auto py-1">
            {loading ? (
              <li className="px-2 py-1.5 text-sm text-stone-500">Carregando...</li>
            ) : filtered.length === 0 ? (
              <li className="px-2 py-1.5 text-sm text-stone-500">Nenhuma cidade.</li>
            ) : (
              filtered.map((c) => (
                <li
                  key={c.id}
                  role="option"
                  aria-selected={c.nome === value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(c.nome);
                    setOpen(false);
                  }}
                  className="cursor-pointer px-2 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
                >
                  {c.nome}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

const PER_PAGE = 15;

type Props = {
  rows: RedeFranqueadoRowDb[];
  /** Apenas administradores (e perfis equivalentes no authz) podem editar/excluir linhas. */
  canEditRows?: boolean;
};

function toInputDate(val: string | null | undefined): string {
  if (!val) return '';
  // Se vier como YYYY-MM-DD já serve; se vier com timezone/ISO pega os 10 primeiros
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  if (val.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
  return val;
}

function isDateKey(k: RedeFranqueadoDbKey): boolean {
  return (
    k === 'data_ass_cof' ||
    k === 'data_ass_contrato' ||
    k === 'data_expiracao_franquia' ||
    k === 'data_nasc_frank' ||
    k === 'data_recebimento_kit_boas_vindas'
  );
}

function normalizeFKDisplay(val: string | null | undefined): string {
  const v = (val ?? '').toString().trim();
  if (!v) return '';
  const m = v.match(/fk\s*0*(\d+)/i);
  if (!m) return v;
  const n = parseInt(m[1] ?? '', 10);
  if (!Number.isFinite(n) || n < 0) return v;
  return `FK${String(n).padStart(4, '0')}`;
}

export function TabelaRedeFranqueadosEditavel({ rows, canEditRows = true }: Props) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Record<RedeFranqueadoDbKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Área de atuação (Estado + Cidade) — só usado quando está editando
  const [areaAtuacaoItens, setAreaAtuacaoItens] = useState<AreaAtuacaoItem[]>([]);
  const [estadoAtuacao, setEstadoAtuacao] = useState('');
  const [cidadeAtuacao, setCidadeAtuacao] = useState('');
  const [cidadesAtuacao, setCidadesAtuacao] = useState<CidadeIBGE[]>([]);
  const [loadingCidadesAtuacao, setLoadingCidadesAtuacao] = useState(false);

  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PER_PAGE;
  const pageRows = useMemo(() => rows.slice(start, start + PER_PAGE), [rows, start]);

  useEffect(() => {
    if (!canEditRows && editingId) {
      setEditingId(null);
      setDraft({});
      setAreaAtuacaoItens([]);
    }
  }, [canEditRows, editingId]);

  useEffect(() => {
    if (!editingId || !estadoAtuacao) {
      setCidadesAtuacao([]);
      setCidadeAtuacao('');
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        setLoadingCidadesAtuacao(true);
        const res = await fetch(
          `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${estadoAtuacao}/municipios`,
          { signal: controller.signal },
        );
        const lista = (await res.json()) as CidadeIBGE[];
        setCidadesAtuacao(Array.isArray(lista) ? lista : []);
        setCidadeAtuacao('');
      } catch {
        setCidadesAtuacao([]);
      } finally {
        setLoadingCidadesAtuacao(false);
      }
    })();
    return () => controller.abort();
  }, [editingId, estadoAtuacao]);

  const headers = useMemo(() => [...COLUNAS_REDE_FRANQUEADOS], []);
  const keys = useMemo(() => [...REDE_FRANQUEADOS_DB_KEYS], []);

  const beginEdit = (r: RedeFranqueadoRowDb) => {
    if (!canEditRows) return;
    setMsg(null);
    setEditingId(r.id);
    const d: Partial<Record<RedeFranqueadoDbKey, string>> = {};
    for (const k of keys) {
      const v = (r[k] ?? '') as string;
      const raw = isDateKey(k) ? toInputDate(v) : v;
      d[k] = k === 'n_franquia' ? normalizeFKDisplay(raw) : raw;
    }
    setDraft(d);
    setAreaAtuacaoItens(parseAreaAtuacao(d.area_atuacao));
    setEstadoAtuacao('');
    setCidadeAtuacao('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft({});
    setAreaAtuacaoItens([]);
    setEstadoAtuacao('');
    setCidadeAtuacao('');
    setMsg(null);
  };

  const save = async () => {
    if (!canEditRows || !editingId) return;
    setSaving(true);
    setMsg(null);

    // Envia tudo do draft (simples e consistente). String vazia vira null na action.
    const patch: Partial<Record<RedeFranqueadoDbKey, string | null>> = {};
    for (const k of keys) patch[k] = (draft[k] ?? '') as string;

    const r = await atualizarRedeFranqueado(editingId, patch);
    setSaving(false);
    if (r.ok) {
      setMsg({ tipo: 'ok', texto: r.mensagem });
      setEditingId(null);
      setDraft({});
      setAreaAtuacaoItens([]);
      setEstadoAtuacao('');
      setCidadeAtuacao('');
      // A página server revalida, mas client-side atualiza via refresh quando o usuário recarrega.
      // Como estamos em client component, deixamos a lista atualizar no próximo refresh/navegação.
    } else {
      setMsg({ tipo: 'erro', texto: r.error });
    }
  };

  const excluir = async (id: string) => {
    if (!canEditRows || saving) return;
    setMsg(null);
    const ok = window.confirm('Excluir esta linha da Rede de Franqueados? Essa ação não pode ser desfeita.');
    if (!ok) return;
    setSaving(true);
    const r = await excluirRedeFranqueado(id);
    setSaving(false);
    if (r.ok) {
      setMsg({ tipo: 'ok', texto: r.mensagem });
      router.refresh();
    } else {
      setMsg({ tipo: 'erro', texto: r.error });
    }
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center text-sm text-stone-600">
        <p className="font-medium">Nenhum franqueado cadastrado na rede.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`rounded-xl border p-3 text-sm ${msg.tipo === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {msg.texto}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[1700px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              {canEditRows && (
                <th className="whitespace-nowrap px-3 py-2 font-semibold text-stone-700">Ações</th>
              )}
              {headers.map((h, i) => (
                <th key={i} className="whitespace-nowrap px-3 py-2 font-semibold text-stone-700">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const isEditing = editingId === r.id;
              return (
                <tr key={r.id} className="border-b border-stone-100 align-top hover:bg-stone-50/80">
                  {canEditRows && (
                    <td className="whitespace-nowrap px-3 py-2">
                      {!isEditing ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => beginEdit(r)}
                            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void excluir(r.id)}
                            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                          >
                            Excluir
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={save}
                            disabled={saving}
                            className="rounded-lg bg-moni-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-moni-secondary disabled:opacity-50"
                          >
                            {saving ? (
                              <>
                                <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
                                Salvando…
                              </>
                            ) : (
                              'Salvar'
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={saving}
                            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </td>
                  )}

                  {keys.map((k) => {
                    const current = (r[k] ?? '') as string;
                    const value = (draft[k] ?? '') as string;
                    const shown = k === 'n_franquia' ? normalizeFKDisplay(current) : current;
                    const isAreaAtuacao = k === 'area_atuacao';
                    return (
                      <td key={k} className="px-3 py-2 text-stone-700">
                        {!isEditing ? (
                          <span className="whitespace-pre-wrap">{shown}</span>
                        ) : isAreaAtuacao ? (
                          <div className="min-w-[280px] space-y-2">
                            {areaAtuacaoItens.length > 0 && (
                              <ul className="flex flex-wrap gap-1.5">
                                {areaAtuacaoItens.map((item, idx) => (
                                  <li
                                    key={`${item.estado}-${item.cidade}-${idx}`}
                                    className="flex items-center gap-1 rounded-md bg-stone-100 px-2 py-1 text-xs"
                                  >
                                    <span>{item.estado} – {item.cidade}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = areaAtuacaoItens.filter((_, i) => i !== idx);
                                        setAreaAtuacaoItens(next);
                                        setDraft((d) => ({
                                          ...d,
                                          area_atuacao: next.map((i) => `${i.estado} - ${i.cidade}`).join('; '),
                                        }));
                                      }}
                                      className="rounded p-0.5 text-stone-500 hover:bg-stone-200 hover:text-stone-700"
                                      aria-label="Remover"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="flex flex-wrap items-end gap-2">
                              <div className="w-20">
                                <label className="text-xs text-stone-500">Estado</label>
                                <select
                                  value={estadoAtuacao}
                                  onChange={(e) => setEstadoAtuacao(e.target.value)}
                                  className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1 text-sm"
                                >
                                  <option value="">—</option>
                                  {UFS_BRASIL.map((uf) => (
                                    <option key={uf.sigla} value={uf.sigla}>
                                      {uf.sigla}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="min-w-[140px] flex-1">
                                <label className="text-xs text-stone-500">Cidade</label>
                                <CidadeCombobox
                                  id="tab-rede-cidade-atuacao"
                                  disabled={!estadoAtuacao}
                                  loading={loadingCidadesAtuacao}
                                  value={cidadeAtuacao}
                                  onChange={setCidadeAtuacao}
                                  items={cidadesAtuacao}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!estadoAtuacao || !cidadeAtuacao) return;
                                  const next = [...areaAtuacaoItens, { estado: estadoAtuacao, cidade: cidadeAtuacao }];
                                  setAreaAtuacaoItens(next);
                                  setDraft((d) => ({
                                    ...d,
                                    area_atuacao: next.map((i) => `${i.estado} - ${i.cidade}`).join('; '),
                                  }));
                                  setEstadoAtuacao('');
                                  setCidadeAtuacao('');
                                }}
                                disabled={!estadoAtuacao || !cidadeAtuacao}
                                className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                              >
                                <Plus className="inline h-4 w-4" /> Adicionar
                              </button>
                            </div>
                          </div>
                        ) : isDateKey(k) ? (
                          <input
                            type="date"
                            value={value}
                            onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                            className="w-44 rounded-md border border-stone-300 px-2 py-1 text-sm"
                          />
                        ) : (
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                            className="w-56 rounded-md border border-stone-300 px-2 py-1 text-sm"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-stone-200 pt-3 text-sm text-stone-600">
        Mostrando {start + 1}–{Math.min(start + PER_PAGE, rows.length)} de {rows.length} franqueados
      </p>

      {totalPages > 1 && (
        <nav className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-stone-500" aria-hidden="true" />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-50"
            >
              Anterior
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={`min-w-[2.25rem] rounded-lg border px-2 py-1.5 text-sm font-medium ${
                  p === safePage
                    ? 'border-moni-primary bg-moni-primary text-white'
                    : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

