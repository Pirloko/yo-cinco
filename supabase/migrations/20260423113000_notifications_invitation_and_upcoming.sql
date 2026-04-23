-- Notificaciones automáticas:
-- 1) Invitación a partido cuando se inserta participante con status='invited'
-- 2) Recordatorio 2h antes (ejecutable vía cron/API)

create or replace function public.notify_match_invitation_on_participant_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_title text;
begin
  if new.status is distinct from 'invited'::public.participant_status then
    return new;
  end if;

  select mo.title
    into v_match_title
  from public.match_opportunities mo
  where mo.id = new.opportunity_id;

  v_match_title := coalesce(nullif(trim(v_match_title), ''), 'Partido');

  insert into public.notifications (user_id, type, title, body, payload)
  select new.user_id,
         'match_invitation',
         'Te invitaron a un partido',
         'Tienes una invitación para "' || v_match_title || '".',
         jsonb_build_object(
           'targetTab', 'invitations',
           'matchId', new.opportunity_id::text
         )
  where not exists (
    select 1
    from public.notifications n
    where n.user_id = new.user_id
      and n.type = 'match_invitation'
      and coalesce(n.payload->>'matchId', '') = new.opportunity_id::text
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_match_invitation_on_participant_insert on public.match_opportunity_participants;
create trigger trg_notify_match_invitation_on_participant_insert
after insert on public.match_opportunity_participants
for each row execute function public.notify_match_invitation_on_participant_insert();

create or replace function public.create_match_upcoming_2h_notifications(
  p_window_from timestamptz default (now() + interval '1 hour 50 minutes'),
  p_window_to timestamptz default (now() + interval '2 hours 10 minutes')
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  insert into public.notifications (user_id, type, title, body, payload)
  select recipients.user_id,
         'match_upcoming_2h',
         'Tu partido empieza en 2 horas',
         'Recuerda tu partido "' || recipients.match_title || '" en ' || recipients.venue || '.',
         jsonb_build_object(
           'targetTab', 'upcoming',
           'matchId', recipients.match_id::text
         )
  from (
    select mo.id as match_id,
           mo.title as match_title,
           mo.venue,
           mo.creator_id as user_id
    from public.match_opportunities mo
    where mo.status in ('pending'::public.match_status, 'confirmed'::public.match_status)
      and mo.date_time >= p_window_from
      and mo.date_time < p_window_to
    union
    select mo.id as match_id,
           mo.title as match_title,
           mo.venue,
           p.user_id
    from public.match_opportunities mo
    join public.match_opportunity_participants p
      on p.opportunity_id = mo.id
    where mo.status in ('pending'::public.match_status, 'confirmed'::public.match_status)
      and mo.date_time >= p_window_from
      and mo.date_time < p_window_to
      and p.status in ('pending'::public.participant_status, 'confirmed'::public.participant_status, 'invited'::public.participant_status)
  ) recipients
  where recipients.user_id is not null
    and not exists (
      select 1
      from public.notifications n
      where n.user_id = recipients.user_id
        and n.type = 'match_upcoming_2h'
        and coalesce(n.payload->>'matchId', '') = recipients.match_id::text
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.create_match_upcoming_2h_notifications(timestamptz, timestamptz) from public;
grant execute on function public.create_match_upcoming_2h_notifications(timestamptz, timestamptz) to service_role;
