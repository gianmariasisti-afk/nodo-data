-- Contacts and labels people add to files (applied as migration user_file_people, 27 Nov 2026).
-- One row per account, like user_council_names: body = { contacts: { <file id>: [ {id, name, org, role, place, label,
-- detail, ts, del?} ] }, labels: { <file id>: { <person key>: <label> } } }. People nodo lists are added through
-- user_state.lists as before; this table holds only the labels on them and the contacts nodo doesn't list.
-- Kept out of user_state because the live app rewrites that row whole and would drop them.
-- Private: each person reads and writes only their own row. Deleting the account removes it (on delete cascade).
create table if not exists public.user_file_people (
  user_id uuid primary key references auth.users (id) on delete cascade,
  body jsonb not null default '{}'::jsonb check (pg_column_size(body) < 1000000),
  updated bigint not null default 0
);
alter table public.user_file_people enable row level security;
revoke all on public.user_file_people from anon;
grant select, insert, update, delete on public.user_file_people to authenticated;
drop policy if exists "own file people select" on public.user_file_people;
drop policy if exists "own file people insert" on public.user_file_people;
drop policy if exists "own file people update" on public.user_file_people;
drop policy if exists "own file people delete" on public.user_file_people;
create policy "own file people select" on public.user_file_people for select to authenticated using ((select auth.uid()) = user_id);
create policy "own file people insert" on public.user_file_people for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own file people update" on public.user_file_people for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own file people delete" on public.user_file_people for delete to authenticated using ((select auth.uid()) = user_id);
