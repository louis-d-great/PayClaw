-- CrewPay email updates. Every system message in a project's group chat (invited, signed,
-- funded, deposits paid, work submitted, changes asked, paid, disputes, rulings) is a moment
-- someone should hear about. After each insert, the database posts the new messages to the
-- app's /api/notify, which emails the crew. Re-runnable.

-- People can switch emails off on their profile.
alter table public.profiles add column if not exists email_updates boolean not null default true;

-- Where to send them, and the shared secret the server checks. Server-only: no policies.
create table if not exists public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security;

-- pg_net makes HTTP calls from the database (built into Supabase). Plain Postgres (tests, CI)
-- doesn't have it, so the trigger below does nothing there.
do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net not available: email updates are off on this database';
end $$;

create or replace function public.notify_crew() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  url text := (select value from app_config where key = 'notify_url');
  secret text := (select value from app_config where key = 'notify_secret');
  body jsonb;
begin
  if url is null or secret is null or not exists (select 1 from pg_namespace where nspname = 'net') then return null; end if;
  select jsonb_build_object('messages', coalesce(jsonb_agg(jsonb_build_object('project_id', project_id, 'text', text, 'created_at', created_at) order by created_at), '[]'))
    into body from inserted where kind = 'system';
  if jsonb_array_length(body->'messages') = 0 then return null; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 8000)'
    using url, body, jsonb_build_object('content-type', 'application/json', 'x-crewpay-secret', secret);
  return null;
exception when others then
  -- Email trouble must never stop the action that caused it.
  raise warning 'notify_crew: %', sqlerrm;
  return null;
end $$;
revoke execute on function public.notify_crew() from public, anon, authenticated;

-- One call per statement, so "funded" and "deposits paid" arrive together as one email.
drop trigger if exists notify_crew on public.messages;
create trigger notify_crew after insert on public.messages
  referencing new table as inserted for each statement execute function public.notify_crew();
