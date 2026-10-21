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
