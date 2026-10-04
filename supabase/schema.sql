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
