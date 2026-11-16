-- nodo: one private state record per user. Run this once in the Supabase SQL editor.

create table if not exists public.user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  body jsonb not null default '{}'::jsonb,
  updated bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

-- New tables are not exposed to the Data API by default: grant access explicitly.
-- anon gets nothing. Row-level security below limits signed-in people to their own row.
revoke all on public.user_state from anon;
grant select, insert, update, delete on public.user_state to authenticated;

drop policy if exists "own row select" on public.user_state;
drop policy if exists "own row insert" on public.user_state;
drop policy if exists "own row update" on public.user_state;
drop policy if exists "own row delete" on public.user_state;

create policy "own row select" on public.user_state for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own row insert" on public.user_state for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own row update" on public.user_state for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own row delete" on public.user_state for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Account deletion from inside the app (required by the App Store).
-- Deleting the auth user cascades to user_state.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Usage events (applied as migration usage_events, 8 Oct 2026). Each signed-in person writes and reads only their own
-- rows; reading across people needs the SQL editor or the service role. Text columns are capped so an event cannot carry a document.
create table if not exists public.events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id text,
  name text not null check (char_length(name) <= 40),
  section text check (char_length(section) <= 40),
  item text check (char_length(item) <= 200),
  query text check (char_length(query) <= 200),
  results integer,
  created_at timestamptz not null default now()
);
create index if not exists events_created_at_idx on public.events (created_at);
create index if not exists events_user_created_idx on public.events (user_id, created_at);

alter table public.events enable row level security;
revoke all on public.events from anon;
grant select, insert on public.events to authenticated;

drop policy if exists "own events insert" on public.events;
drop policy if exists "own events select" on public.events;
create policy "own events insert" on public.events for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own events select" on public.events for select to authenticated
  using ((select auth.uid()) = user_id);

-- Council names (applied as migration user_council_names, 20 Oct 2026; used by the preview first).
-- The names a person adds for delegations and working parties (attachés, counsellors), synced across their devices.
-- Kept apart from user_state because the live app rewrites user_state.body whole and would drop them.
create table if not exists public.user_council_names (
  user_id uuid primary key references auth.users (id) on delete cascade,
  body jsonb not null default '{}'::jsonb check (pg_column_size(body) < 200000),
  updated bigint not null default 0,
  created_at timestamptz not null default now()
);
alter table public.user_council_names enable row level security;
revoke all on public.user_council_names from anon;
grant select, insert, update, delete on public.user_council_names to authenticated;
create policy "own names select" on public.user_council_names for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own names insert" on public.user_council_names for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own names update" on public.user_council_names for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own names delete" on public.user_council_names for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Admin console (applied as migration admin_console, 21 Oct 2026). public.admins lists the admin accounts; it has row-level
-- security and no grants, so it is read only through the two functions below. is_admin() tells the app whether to show the
-- Admin entry; admin_overview() returns account and usage counts, the people list and what people search for, and raises
-- 42501 for anyone who is not an admin. Both run as security definer with an empty search_path.
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
-- Add an admin: insert into public.admins (user_id) values ('<auth user id>');

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins a where a.user_id = (select auth.uid())); $$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Brussels')::date;
  out jsonb;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  with live as (
    -- Usage from the live app only: preview sessions start with "next-".
    select * from public.events
    where created_at > now() - interval '31 days' and coalesce(session_id, '') not like 'next-%'
  ),
  days as (select d::date as day from generate_series(today - 13, today, interval '1 day') d),
  per_day as (
    select (created_at at time zone 'Europe/Brussels')::date as day, count(distinct user_id) as n from live group by 1
  ),
  last_seen as (select user_id, max(created_at) as at from public.events group by user_id)
  select jsonb_build_object(
    'generated', now(),
    'accounts', (select count(*) from auth.users),
    'new7', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'active7', (select count(distinct user_id) from live where created_at > now() - interval '7 days'),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'users', coalesce(p.n, 0)) order by d.day), '[]'::jsonb)
              from days d left join per_day p on p.day = d.day),
    'searches30', (select count(*) from live where name = 'search'),
    'empty30', (select count(*) from live where name = 'search' and results = 0),
    'empty', (select coalesce(jsonb_agg(jsonb_build_object('q', q, 'n', n, 'last', last) order by last desc), '[]'::jsonb) from (
                select lower(btrim(query)) as q, count(*) as n, max(created_at) as last
                from public.events
                where name = 'search' and results = 0 and query is not null and char_length(btrim(query)) > 1
                  and created_at > now() - interval '31 days'
                group by 1 order by max(created_at) desc limit 12) s),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('q', q, 'n', n, 'last', last) order by last desc), '[]'::jsonb) from (
                select lower(btrim(coalesce(query, item))) as q, count(*) as n, max(created_at) as last
                from public.events
                where name = 'request' and coalesce(query, item) is not null
                group by 1 order by max(created_at) desc limit 12) r),
    'feedback30', (select count(*) from public.events where name = 'feedback_mail' and created_at > now() - interval '31 days'),
    'people', (select coalesce(jsonb_agg(jsonb_build_object(
                  'email', u.email, 'name', s.body -> 'profile' ->> 'name', 'org', s.body -> 'profile' ->> 'org',
                  'method', s.body -> 'profile' ->> 'method', 'created', u.created_at, 'seen', l.at,
                  'admin', exists (select 1 from public.admins a where a.user_id = u.id)
                ) order by coalesce(l.at, u.created_at) desc), '[]'::jsonb)
               from auth.users u
               left join public.user_state s on s.user_id = u.id
               left join last_seen l on l.user_id = u.id)
  ) into out;
  return out;
end;
$$;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

-- Data health for the maintenance dashboard (applied as migration data_status_from_github, 15 Nov 2026).
-- public.data_status holds one row: the latest status.json from the status branch. It has row-level security and no
-- grants, so only the dashboard's own SQL connection reads it. The "Publish health status" workflow calls
-- refresh_data_status() with the publishable key after each publish. The function takes no input and fetches the file
-- from this repo itself (GitHub API first, raw.githubusercontent.com as a fallback), at most once every 30 seconds,
-- and never replaces a newer file with an older one. Needs the `http` extension.
create extension if not exists http with schema extensions;

create table if not exists public.data_status (
  id smallint primary key default 1 check (id = 1),
  body jsonb not null default '{}'::jsonb,
  generated text,
  fetched_at timestamptz,
  tried_at timestamptz,
  last_error text
);
alter table public.data_status enable row level security;
revoke all on public.data_status from anon, authenticated;
insert into public.data_status (id) values (1) on conflict do nothing;

create or replace function public.refresh_data_status()
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare
  cur public.data_status%rowtype;
  code integer;
  txt text;
  doc jsonb;
  src text;
begin
  select * into cur from public.data_status where id = 1 for update;
  if cur.tried_at is not null and cur.tried_at > now() - interval '30 seconds' then
    return jsonb_build_object('status', 'skipped', 'generated', cur.generated, 'fetched_at', cur.fetched_at);
  end if;

  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '10');
    -- The API serves the branch as it is now; raw.githubusercontent.com can lag by five minutes.
    src := 'api';
    select h.status, h.content into code, txt from extensions.http((
      'GET',
      'https://api.github.com/repos/gianmariasisti-afk/nodo-data/contents/status.json?ref=status',
      array[extensions.http_header('Accept', 'application/vnd.github.raw+json'), extensions.http_header('User-Agent', 'nodo-data-status')],
      null, null)::extensions.http_request) h;
    if code is distinct from 200 then
      src := 'raw';
      select h.status, h.content into code, txt
      from extensions.http_get('https://raw.githubusercontent.com/gianmariasisti-afk/nodo-data/status/status.json') h;
    end if;
    if code is distinct from 200 then
      raise exception 'GitHub answered %', code;
    end if;
    if length(txt) > 500000 then
      raise exception 'status.json is % characters', length(txt);
    end if;
    doc := txt::jsonb;
    if jsonb_typeof(doc) <> 'object' or (doc ->> 'generated') is null or not (doc ? 'freshness') or not (doc ? 'workflows') then
      raise exception 'status.json has not the expected shape';
    end if;
  exception when others then
    update public.data_status set tried_at = now(), last_error = left(sqlerrm, 300) where id = 1;
    return jsonb_build_object('status', 'error', 'error', left(sqlerrm, 300), 'generated', cur.generated, 'fetched_at', cur.fetched_at);
  end;

  -- Never go back to an older file (a lagging copy from the raw host).
  if cur.generated is not null and (doc ->> 'generated') < cur.generated then
    update public.data_status set tried_at = now(), last_error = null where id = 1;
    return jsonb_build_object('status', 'older', 'source', src, 'generated', cur.generated, 'fetched_at', cur.fetched_at);
  end if;

  update public.data_status
    set body = doc, generated = doc ->> 'generated', fetched_at = now(), tried_at = now(), last_error = null
    where id = 1;
  return jsonb_build_object('status', 'ok', 'source', src, 'generated', doc ->> 'generated', 'fetched_at', now());
end;
$$;
revoke execute on function public.refresh_data_status() from public, authenticated;
grant execute on function public.refresh_data_status() to anon, service_role;

-- nodo push notifications (16 Nov 2026). Applied as migration push_notifications; also appended to schema.sql.
-- Tiers: file moves (instant), weekday roundup (08:30 Brussels), Monday week ahead (08:30). One per person per day.
-- The sender is the push-send Edge Function, started by pg_cron (see the end of this file).
-- Applied to the project on 16 Nov 2026 as migrations push_notifications and push_schedule.

-- One row per phone. Written only through register_push_device / unregister_push_device, so a token that moves
-- to another account (sign out, sign in as someone else) is handed over instead of being refused by row-level security.
create table if not exists public.push_devices (
  token text primary key check (char_length(token) between 32 and 200),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'ios' check (platform in ('ios', 'android')),
  env text not null default 'production' check (env in ('production', 'sandbox')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_devices_user_idx on public.push_devices (user_id);
alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon, authenticated;

create or replace function public.register_push_device(p_token text, p_platform text default 'ios', p_env text default 'production')
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.push_devices (token, user_id, platform, env)
  values (p_token, (select auth.uid()), coalesce(p_platform, 'ios'), coalesce(p_env, 'production'))
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, env = excluded.env, updated_at = now();
end;
$$;
create or replace function public.unregister_push_device(p_token text)
returns void language sql security definer set search_path = ''
as $$ delete from public.push_devices where token = p_token and user_id = (select auth.uid()); $$;
revoke execute on function public.register_push_device(text, text, text) from public, anon;
revoke execute on function public.unregister_push_device(text) from public, anon;
grant execute on function public.register_push_device(text, text, text) to authenticated;
grant execute on function public.unregister_push_device(text) to authenticated;

-- When the sender first saw each update (event id, or "press:<id>"). "New" means first seen since the last send,
-- whatever date the institution put on the event. The first run seeds everything as old, so nobody gets a backlog.
create table if not exists public.push_seen (
  id text primary key,
  first_seen timestamptz not null default now()
);
alter table public.push_seen enable row level security;
revoke all on public.push_seen from anon, authenticated;

-- Every notification sent (or attempted). Read by the sender for the one-a-day cap and to never repeat an update.
create table if not exists public.push_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now(),
  kind text not null check (kind in ('move', 'day', 'week', 'test')),
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 400),
  event_ids text[] not null default '{}',
  file_ids text[] not null default '{}',
  devices integer not null default 0,
  delivered integer not null default 0,
  error text check (char_length(error) <= 400)
);
create index if not exists push_log_user_idx on public.push_log (user_id, sent_at desc);
alter table public.push_log enable row level security;
revoke all on public.push_log from anon, authenticated;

-- Kill switch and audience. audience 'admins' = only accounts in public.admins get the feature (the private test);
-- 'all' = everyone. enabled false stops every send.
create table if not exists public.push_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  audience text not null default 'admins' check (audience in ('admins', 'all')),
  updated_at timestamptz not null default now()
);
insert into public.push_settings (id) values (1) on conflict (id) do nothing;
alter table public.push_settings enable row level security;
revoke all on public.push_settings from anon, authenticated;

-- The app asks this before showing any push screen.
create or replace function public.push_open()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select s.enabled and (s.audience = 'all' or public.is_admin()) from public.push_settings s where s.id = 1), false);
$$;
revoke execute on function public.push_open() from public, anon;
grant execute on function public.push_open() to authenticated;

-- Admin view: devices, sends in the last 14 days by kind, the settings.
create or replace function public.admin_push_overview()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'not an admin' using errcode = '42501'; end if;
  return jsonb_build_object(
    'settings', (select to_jsonb(s) from public.push_settings s where s.id = 1),
    'devices', (select count(*) from public.push_devices),
    'people', (select count(distinct user_id) from public.push_devices),
    'sent14', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) n from public.push_log where sent_at > now() - interval '14 days' group by kind) k),
    'failed14', (select count(*) from public.push_log where sent_at > now() - interval '14 days' and delivered = 0 and kind <> 'test'),
    'last', (select max(sent_at) from public.push_log)
  );
end;
$$;
revoke execute on function public.admin_push_overview() from public, anon;
grant execute on function public.admin_push_overview() to authenticated;

-- Schedule (applied as migration push_schedule). Every weekday at :30 from 06:30 to 17:30 UTC, i.e. 07:30 to 19:30
-- Brussels across both seasons. The function decides by Brussels time: 08:30 is the morning run (roundup or week
-- ahead), other runs only send file moves, and nothing goes out before 08:00 or after 19:00 Brussels time.
-- The shared secret is generated in the database and read by both the job and the function.
alter table public.push_settings add column if not exists cron_secret text not null default encode(extensions.gen_random_bytes(24), 'hex');
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('nodo-push', '30 6-17 * * 1-5', $job$
  select net.http_post(
    url := 'https://dmishwyqipqbfgtdpalk.supabase.co/functions/v1/push-send',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-nodo-cron', (select cron_secret from public.push_settings where id = 1)),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$job$);

-- Operations:
--   stop everything:        update public.push_settings set enabled = false where id = 1;
--   open to everyone:       update public.push_settings set audience = 'all' where id = 1;
--   what was sent:          select sent_at, kind, title, body, delivered, error from public.push_log order by sent_at desc limit 50;
