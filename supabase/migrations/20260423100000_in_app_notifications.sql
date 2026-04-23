-- Notificaciones in-app por usuario
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (
    type in (
      'chat_message',
      'match_invitation',
      'match_upcoming_2h',
      'match_finished_review_pending'
    )
  ),
  title text not null,
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz null
);

create index if not exists idx_notifications_user_created_desc
  on public.notifications (user_id, created_at desc);

create index if not exists idx_notifications_user_read_created_desc
  on public.notifications (user_id, is_read, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists notifications_insert_service_role on public.notifications;
create policy notifications_insert_service_role
  on public.notifications
  for insert
  to service_role
  with check (true);

drop policy if exists notifications_delete_service_role on public.notifications;
create policy notifications_delete_service_role
  on public.notifications
  for delete
  to service_role
  using (true);

grant select, update on public.notifications to authenticated;

-- Mantiene solo 30 notificaciones por usuario y limpia >30 días.
create or replace function public.prune_notifications_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  delete from public.notifications
  where user_id = p_user_id
    and created_at < now() - interval '30 days';

  delete from public.notifications n
  where n.user_id = p_user_id
    and n.id in (
      select x.id
      from (
        select id,
               row_number() over (order by created_at desc, id desc) as rn
        from public.notifications
        where user_id = p_user_id
      ) as x
      where x.rn > 30
    );
end;
$$;

revoke all on function public.prune_notifications_for_user(uuid) from public;
grant execute on function public.prune_notifications_for_user(uuid) to service_role;

create or replace function public.notifications_after_write_prune()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.prune_notifications_for_user(new.user_id);
  return new;
end;
$$;

drop trigger if exists trg_notifications_after_insert_prune on public.notifications;
create trigger trg_notifications_after_insert_prune
after insert on public.notifications
for each row execute function public.notifications_after_write_prune();

-- Marca todas las notificaciones propias como leídas
create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_count integer := 0;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return 0;
  end if;

  update public.notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where user_id = v_uid
    and is_read = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;
