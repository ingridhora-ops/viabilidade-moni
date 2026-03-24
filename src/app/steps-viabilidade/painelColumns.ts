/**
 * Colunas do Painel Novos Negócios (Kanban + Miro).
 * Ordem e agrupamentos: fluxo principal + paralelos (Crédito Terreno/Obra, Acoplamento, etc.).
 */
export type PainelColumnKey =
  | 'step_1'
  | 'step_2'
  | 'aprovacao_moni_novo_negocio'
  | 'step_3'
  | 'step_4'
  | 'acoplamento'
  | 'step_5'
  | 'step_6'
  | 'step_7'
  | 'contabilidade_incorporadora'
  | 'contabilidade_spe'
  | 'contabilidade_gestora'
  | 'passagem_wayser'
  | 'planialtimetrico'
  | 'sondagem'
  | 'projeto_legal'
  | 'aprovacao_condominio'
  | 'aprovacao_prefeitura'
  | 'revisao_bca'
  | 'processos_cartorarios'
  | 'aguardando_credito'
  | 'em_obra'
  | 'moni_care'
  | 'credito_terreno'
  | 'credito_obra';

export interface PainelColumnDef {
  key: PainelColumnKey;
  title: string;
  /** Subtítulo ou itens de checklist (ex.: Acoplamento). */
  subtitle?: string;
  /** Agrupar na mesma “faixa” visual (ex.: Step 4 + Acoplamento). */
  parallelGroup?: string;
  /** Rota para abrir o processo nesta etapa (step-one, step-2, painel, etc.). */
  hrefBase?: string;
}

export const PAINEL_COLUMNS: PainelColumnDef[] = [
  { key: 'step_1', title: 'Step 1: Mapeamento da Região', hrefBase: '/step-one' },
  { key: 'step_2', title: 'Step 2: Novo Negócio', hrefBase: '/step-2' },
  { key: 'aprovacao_moni_novo_negocio', title: 'Aprovação Moní - Novo Negócio' },
  { key: 'step_3', title: 'Step 3: Opção', hrefBase: '/step-3' },
  {
    key: 'step_4',
    title: 'Step 4: Check Legal + Checklist de Crédito',
    parallelGroup: 'step4_acoplamento',
    hrefBase: '/painel',
  },
  {
    key: 'acoplamento',
    title: 'Acoplamento',
    parallelGroup: 'step4_acoplamento',
    hrefBase: '/acoplamento-pl',
  },
  { key: 'step_5', title: 'Step 5: Comitê', hrefBase: '/step-5' },
  { key: 'step_6', title: 'Step 6: Diligência', hrefBase: '/step-6' },
  {
    key: 'step_7',
    title: 'Step 7: Contrato',
    hrefBase: '/step-7',
  },
  { key: 'passagem_wayser', title: 'Passagem para Wayser' },
  {
    key: 'planialtimetrico',
    title: 'Planialtimétrico',
    parallelGroup: 'planialtimetrico_sondagem',
  },
  {
    key: 'sondagem',
    title: 'Sondagem (paralelo Planialtimétrico)',
    parallelGroup: 'planialtimetrico_sondagem',
  },
  { key: 'projeto_legal', title: 'Projeto Legal' },
  { key: 'aprovacao_condominio', title: 'Aprovação no Condomínio' },
  { key: 'aprovacao_prefeitura', title: 'Aprovação na Prefeitura' },
  { key: 'revisao_bca', title: 'Revisão do BCA' },
  { key: 'processos_cartorarios', title: 'Processos Cartorários' },
  { key: 'aguardando_credito', title: 'Aguardando Crédito' },
  { key: 'em_obra', title: 'Em Obra' },
  { key: 'moni_care', title: 'Moní Care' },
  { key: 'contabilidade_incorporadora', title: 'Abertura da Incorporadora' },
  { key: 'contabilidade_spe', title: 'Abertura da SPE' },
  { key: 'contabilidade_gestora', title: 'Abertura da Gestora' },
  {
    key: 'credito_terreno',
    title: 'Crédito Terreno',
    hrefBase: '/credito-terreno',
  },
  {
    key: 'credito_obra',
    title: 'Crédito Obra',
    hrefBase: '/credito-obra',
  },
];

/** Duas colunas do kanban Crédito no painel Novos Negócios — gráficos do dashboard usam só estas (via `etapa_painel`). */
export const PAINEL_KANBAN_CREDITO_KEYS: readonly PainelColumnKey[] = ['credito_terreno', 'credito_obra'];

const DEFAULT_ETAPA = 'step_1' as PainelColumnKey;

/** Linha do fluxo: sequencial (uma fase) ou paralela (várias fases lado a lado com split/join). */
export type PainelFlowRow =
  | { type: 'sequential'; keys: [PainelColumnKey] }
  | { type: 'parallel'; keys: PainelColumnKey[] };

/** Ordem do fluxo: Crédito Terreno empilhado com Step 3; Crédito Obra empilhado com Step 6. */
export const PAINEL_FLOW_ROWS: PainelFlowRow[] = [
  { type: 'sequential', keys: ['step_1'] },
  { type: 'sequential', keys: ['step_2'] },
  { type: 'sequential', keys: ['aprovacao_moni_novo_negocio'] },
  { type: 'sequential', keys: ['step_3'] },
  { type: 'parallel', keys: ['step_4', 'acoplamento'] },
  { type: 'sequential', keys: ['step_5'] },
  { type: 'sequential', keys: ['step_6'] },
  { type: 'sequential', keys: ['step_7'] },
  { type: 'sequential', keys: ['passagem_wayser'] },
  { type: 'parallel', keys: ['planialtimetrico', 'sondagem'] },
  { type: 'sequential', keys: ['projeto_legal'] },
  { type: 'sequential', keys: ['aprovacao_condominio'] },
  { type: 'sequential', keys: ['aprovacao_prefeitura'] },
  { type: 'sequential', keys: ['revisao_bca'] },
  { type: 'sequential', keys: ['processos_cartorarios'] },
  { type: 'sequential', keys: ['aguardando_credito'] },
  { type: 'sequential', keys: ['em_obra'] },
  { type: 'sequential', keys: ['moni_care'] },
];

export function getDefaultEtapaPainel(): PainelColumnKey {
  return DEFAULT_ETAPA;
}

export function getHrefForProcesso(etapaKey: PainelColumnKey, processoId: string): string {
  const col = PAINEL_COLUMNS.find((c) => c.key === etapaKey);
  if (col?.hrefBase === '/step-one') return `/step-one/${processoId}`;
  if (col?.hrefBase === '/step-2') return `/step-2/${processoId}`;
  if (etapaKey === 'aprovacao_moni_novo_negocio') return `/painel-novos-negocios/${processoId}`;
  if (col?.hrefBase === '/step-3') return `/step-3?processoId=${processoId}`;
  if (col?.hrefBase === '/painel') return `/painel`;
  if (col?.hrefBase === '/acoplamento-pl') return `/acoplamento-pl`;
  if (col?.hrefBase === '/step-5') return `/step-5?processoId=${processoId}`;
  if (col?.hrefBase === '/step-6') return `/step-6?processoId=${processoId}`;
  if (col?.hrefBase === '/step-7') return `/step-7?processoId=${processoId}`;
  if (col?.hrefBase === '/credito-terreno') return `/credito-terreno?processoId=${processoId}`;
  if (col?.hrefBase === '/credito-obra') return `/credito-obra?processoId=${processoId}`;
  if (
    etapaKey === 'revisao_bca' ||
    etapaKey === 'processos_cartorarios' ||
    etapaKey === 'aguardando_credito' ||
    etapaKey === 'em_obra' ||
    etapaKey === 'moni_care'
  ) {
    return `/painel-novos-negocios?card=${encodeURIComponent(processoId)}`;
  }
  return `/step-one/${processoId}`;
}
