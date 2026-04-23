-- Fix crítico: agregar estado 'invited' al enum participant_status.
-- Sin esto, los triggers de notificaciones que referencian 'invited'
-- pueden romper inserciones en messages con error 400.

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'participant_status'
      and e.enumlabel = 'invited'
  ) then
    alter type public.participant_status add value 'invited';
  end if;
end
$$;
