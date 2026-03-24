-- Regista quando o convite foi realmente enviado via Resend (distingue de token gerado sem envio).

alter table public.profiles
  add column if not exists invite_email_sent_at timestamptz;

comment on column public.profiles.invite_email_sent_at is
  'Preenchido quando o e-mail de convite foi enviado com sucesso via Resend. Null se só houve token (ex.: sem RESEND_API_KEY).';
