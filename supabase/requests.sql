-- File requests answered automatically (applied as migration file_requests, 27 Nov 2026).
--
-- Every "Request a full page" tap already writes a usage event (events.name = 'request'). A trigger copies each one
-- into public.file_requests with a due date three working days later. Once a day, public.answer_requests() matches
-- the open requests against nodo's published data (files.json, auto-files.json, search-terms.json, fetched from
-- GitHub Pages) and answers what it can:
--   status 'full'     the query names a file nodo follows (procedure number, nickname or title)
--   status 'auto'     the query names a procedure with an automatic page
--   status 'declined' set by hand or by the weekly Claude refresh, always with a one-line reason
--   status 'open'     nothing matched yet; the weekly Claude refresh decides it before due_at
-- Ambiguous matches (two different files) stay open. A curated file wins over an automatic page.
-- Works with the app as it is: no new build is needed for requests to be recorded and answered. Showing the answer
-- to the person (Today card, push) comes with the next iOS build, which reads the person's own rows.

create extension if not exists http with schema extensions;
create extension if not exists pg_cron;

create table if not exists public.file_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  query text not null check (char_length(query) between 1 and 200),
  created_at timestamptz not null default now(),
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'full', 'auto', 'declined')),
  file_id text check (char_length(file_id) <= 80),
  reason text check (char_length(reason) <= 300),
  matched_by text check (matched_by in ('procedure', 'nickname', 'title', 'hand')),
  answered_at timestamptz,
  seen_at timestamptz,
  event_id bigint unique
);
create index if not exists file_requests_user_idx on public.file_requests (user_id, created_at desc);
create index if not exists file_requests_open_idx on public.file_requests (status, due_at) where status = 'open';

alter table public.file_requests enable row level security;
revoke all on public.file_requests from anon, authenticated;
grant select on public.file_requests to authenticated;
drop policy if exists "own requests select" on public.file_requests;
create policy "own requests select" on public.file_requests for select to authenticated
  using ((select auth.uid()) = user_id);

-- The person marks an answer as seen (the Today card goes away). Nothing else is writable from the app.
create or replace function public.mark_request_seen(p_id bigint)
returns void language sql security definer set search_path = ''
as $$ update public.file_requests set seen_at = now() where id = p_id and user_id = (select auth.uid()) and seen_at is null; $$;
revoke execute on function public.mark_request_seen(bigint) from public, anon;
grant execute on function public.mark_request_seen(bigint) to authenticated;

-- n working days (Mon–Fri, Brussels) after t, at 18:00 Brussels.
create or replace function public.add_working_days(t timestamptz, n integer)
returns timestamptz language plpgsql immutable set search_path = ''
as $$
declare d date := (t at time zone 'Europe/Brussels')::date; k integer := 0;
begin
  while k < n loop
    d := d + 1;
    if extract(isodow from d) < 6 then k := k + 1; end if;
  end loop;
  return (d + time '18:00') at time zone 'Europe/Brussels';
end;
$$;

-- Copy request events into file_requests. Never lets a failure here block the event itself.
create or replace function public.events_to_requests()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.name = 'request' and nullif(btrim(coalesce(new.query, new.item)), '') is not null then
    begin
      insert into public.file_requests (user_id, query, created_at, due_at, event_id)
      select new.user_id, btrim(coalesce(new.query, new.item)), new.created_at, public.add_working_days(new.created_at, 3), new.id
      where not exists (  -- the same person asking the same thing again while it is open counts once
        select 1 from public.file_requests r
        where r.user_id = new.user_id and r.status = 'open' and lower(r.query) = lower(btrim(coalesce(new.query, new.item))));
    exception when others then
      raise warning 'events_to_requests: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists events_to_requests on public.events;
create trigger events_to_requests after insert on public.events for each row execute function public.events_to_requests();

-- Lower-case, curly quotes and dashes made plain, spaces squeezed.
create or replace function public.req_fold(s text)
returns text language sql immutable set search_path = ''
as $$ select btrim(regexp_replace(translate(lower(coalesce(s, '')), '‘’“”–—', '''''""--'), '\s+', ' ', 'g')) $$;

-- The match itself, on an index built from the published data. Returns one row per open request it can answer.
create or replace function public.answer_requests()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  base text := 'https://gianmariasisti-afk.github.io/nodo-data/v1/';
  files jsonb; autos jsonb; terms jsonb;
  r record; hit record; n_full int := 0; n_auto int := 0; n_open int := 0;
begin
  select content::jsonb into files from extensions.http_get(base || 'files.json');
  select content::jsonb into autos from extensions.http_get(base || 'auto-files.json');
  select content::jsonb into terms from extensions.http_get(base || 'search-terms.json');
  if files is null or jsonb_array_length(coalesce(files -> 'files', '[]')) < 10 then
    raise exception 'files.json could not be read';
  end if;

  create temp table if not exists _ix (id text, kind text, rank int, short text, title text, procs text[]) on commit drop;
  truncate _ix;
  insert into _ix
  select f ->> 'id', 'full', 1, public.req_fold(f ->> 'short'), public.req_fold(f ->> 'title'),
         array(select distinct upper(p) from (
           select f ->> 'procedure' as p
           union all select jsonb_array_elements_text(coalesce(f -> 'procedures', '[]'))
           union all select x ->> 'procedure' from jsonb_array_elements(coalesce(f -> 'parts', '[]')) x) q where p is not null)
  from jsonb_array_elements(files -> 'files') f;
  insert into _ix
  select f ->> 'id', 'auto', 2, public.req_fold(f ->> 'short'), public.req_fold(f ->> 'title'),
         array[upper(f ->> 'procedure')]
  from jsonb_array_elements(coalesce(autos -> 'files', '[]')) f
  where f ->> 'procedure' is not null;

  create temp table if not exists _nick (aka text, procs text[]) on commit drop;
  truncate _nick;
  insert into _nick
  select public.req_fold(a), array(select upper(jsonb_array_elements_text(n -> 'procedures')))
  from jsonb_array_elements(coalesce(terms -> 'nicknames', '[]')) n, jsonb_array_elements_text(n -> 'aka') a;

  for r in select id, public.req_fold(query) as q from public.file_requests where status = 'open' loop
    hit := null;
    -- 1. A procedure number in the query: 2025/0241(COD) or 2025/0241.
    select i.id, i.kind, 'procedure'::text as how into hit
    from _ix i, regexp_matches(upper(r.q), '(\d{4}/\d{4}[A-Z]?)(\([A-Z]{3}\))?', 'g') m
    where exists (select 1 from unnest(i.procs) p where p = m[1] || coalesce(m[2], '') or split_part(p, '(', 1) = m[1])
    group by i.id, i.kind, i.rank order by i.rank limit 1;
    -- 2. A Brussels nickname, the whole query.
    if hit is null then
      select i.id, i.kind, 'nickname'::text as how into hit
      from _nick k join _ix i on i.procs && k.procs
      where k.aka = r.q
      group by i.id, i.kind, i.rank order by i.rank, count(*) desc limit 1;
    end if;
    -- 3. Short name or title: the query is the name, or (8+ characters) the name contains it. Only a single file counts.
    if hit is null then
      select x.id, x.kind, 'title'::text as how into hit from (
        select i.id, i.kind, i.rank, count(*) over (partition by i.rank) as c
        from _ix i
        where i.short = r.q or i.title = r.q
           or (char_length(r.q) >= 8 and (position(r.q in i.short) > 0 or position(r.q in i.title) > 0))
      ) x where x.c = 1 order by x.rank limit 1;
    end if;

    if hit is not null then
      update public.file_requests
        set status = hit.kind, file_id = hit.id, matched_by = hit.how, answered_at = now()
        where id = r.id;
      if hit.kind = 'full' then n_full := n_full + 1; else n_auto := n_auto + 1; end if;
    else
      n_open := n_open + 1;
    end if;
  end loop;
  return jsonb_build_object('full', n_full, 'auto', n_auto, 'open', n_open, 'at', now());
end;
$$;
revoke execute on function public.answer_requests() from public, anon, authenticated;

-- Decide a request by hand or from the weekly Claude refresh (SQL editor / service connection only).
create or replace function public.decide_request(p_id bigint, p_status text, p_file_id text, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_status not in ('full', 'auto', 'declined') then raise exception 'bad status'; end if;
  if p_status = 'declined' and nullif(btrim(p_reason), '') is null then raise exception 'a decline needs a reason'; end if;
  update public.file_requests
    set status = p_status, file_id = p_file_id, reason = p_reason, matched_by = 'hand', answered_at = now()
    where id = p_id;
end;
$$;
revoke execute on function public.decide_request(bigint, text, text, text) from public, anon, authenticated;

-- Every weekday at 07:05 UTC, after the morning data runs.
select cron.unschedule('answer-requests') where exists (select 1 from cron.job where jobname = 'answer-requests');
select cron.schedule('answer-requests', '5 7 * * 1-5', $j$ select public.answer_requests() $j$);

-- Backfill: the requests made before this table existed (due dates count from today, not from the request).
insert into public.file_requests (user_id, query, created_at, due_at, event_id)
select e.user_id, btrim(coalesce(e.query, e.item)), e.created_at, public.add_working_days(now(), 3), e.id
from public.events e
where e.name = 'request' and nullif(btrim(coalesce(e.query, e.item)), '') is not null
on conflict (event_id) do nothing;

-- Checks:
--   select status, count(*) from public.file_requests group by 1;
--   select id, query, status, file_id, matched_by, due_at from public.file_requests order by created_at desc;
--   overdue: select * from public.file_requests where status = 'open' and due_at < now();
--   run now: select public.answer_requests();
