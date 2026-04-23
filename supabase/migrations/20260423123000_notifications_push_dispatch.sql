-- Marca de despacho push para notificaciones in-app.
alter table public.notifications
  add column if not exists push_sent_at timestamptz null;

create index if not exists idx_notifications_push_pending
  on public.notifications (created_at asc)
  where push_sent_at is null;
