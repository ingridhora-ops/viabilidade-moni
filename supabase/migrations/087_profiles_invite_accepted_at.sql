-- Regista quando o utilizador concluiu o fluxo /aceitar-convite (senha + nome).

alter table public.profiles
  add column if not exists invite_accepted_at timestamptz;

comment on column public.profiles.invite_accepted_at is
  'Preenchido quando o utilizador aceita o convite e define senha em /aceitar-convite. Null se nunca concluiu por esse fluxo ou após novo convite.';
