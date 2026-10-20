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
