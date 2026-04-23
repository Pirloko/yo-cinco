-- Generación automática de notificaciones in-app desde eventos existentes:
-- 1) Mensajes de chat del partido
-- 2) Partido finalizado pendiente de reseña

create or replace function public.notify_match_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_title text;
  v_sender_name text;
  v_body text;
begin
  select mo.title
    into v_match_title
  from public.match_opportunities mo
  where mo.id = new.opportunity_id;

  select p.name
    into v_sender_name
  from public.profiles p
  where p.id = new.sender_id;

  v_match_title := coalesce(nullif(trim(v_match_title), ''), 'Partido');
  v_sender_name := coalesce(nullif(trim(v_sender_name), ''), 'Jugador');
  v_body := coalesce(left(trim(new.content), 140), '');

  insert into public.notifications (user_id, type, title, body, payload)
  select recipient_id,
         'chat_message',
         v_sender_name || ' envió un mensaje',
         case
           when v_body <> '' then v_body
           else 'Nuevo mensaje en "' || v_match_title || '".'
         end,
         jsonb_build_object(
           'targetTab', 'chats',
           'matchId', new.opportunity_id::text,
           'chatId', new.opportunity_id::text
         )
  from (
    select mo.creator_id as recipient_id
    from public.match_opportunities mo
    where mo.id = new.opportunity_id
    union
    select p.user_id as recipient_id
    from public.match_opportunity_participants p
    where p.opportunity_id = new.opportunity_id
      and p.status in ('pending', 'confirmed', 'invited')
  ) recipients
  where recipient_id is not null
    and recipient_id <> new.sender_id;

  return new;
end;
$$;

drop trigger if exists trg_notify_match_chat_message on public.messages;
create trigger trg_notify_match_chat_message
after insert on public.messages
for each row execute function public.notify_match_chat_message();

create or replace function public.notify_match_finished_review_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_title text;
begin
  if not (
    old.status is distinct from new.status
    and new.status = 'completed'::public.match_status
    and new.finalized_at is not null
  ) then
    return new;
  end if;

  v_match_title := coalesce(nullif(trim(new.title), ''), 'Partido');

  insert into public.notifications (user_id, type, title, body, payload)
  select recipient_id,
         'match_finished_review_pending',
         'Partido finalizado: deja tu reseña',
         'El partido "' || v_match_title || '" finalizó. Comparte tu reseña.',
         jsonb_build_object(
           'targetTab', 'finished',
           'matchId', new.id::text
         )
  from (
    select new.creator_id as recipient_id
    union
    select p.user_id as recipient_id
    from public.match_opportunity_participants p
    where p.opportunity_id = new.id
      and p.status = 'confirmed'
  ) recipients
  where recipient_id is not null
    and not exists (
      select 1
      from public.match_opportunity_ratings mor
      where mor.opportunity_id = new.id
        and mor.rater_id = recipient_id
    );

  return new;
end;
$$;

drop trigger if exists trg_notify_match_finished_review_pending on public.match_opportunities;
create trigger trg_notify_match_finished_review_pending
after update on public.match_opportunities
for each row execute function public.notify_match_finished_review_pending();
