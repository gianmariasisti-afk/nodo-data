-- Start the data workflows on time (applied as migration workflow_dispatch_schedule).
-- GitHub's own `schedule:` trigger starts runs 7 to 12 hours late (assessment, 24 Nov 2026). pg_cron is on time,
-- so Supabase calls GitHub's workflow_dispatch API at the same UTC times the workflows list.
--
-- Needs one fine-grained GitHub token: repository nodo-data only, permission "Actions: read and write", nothing else.
-- Store it once in Supabase Vault (SQL editor):
--   select vault.create_secret('<token>', 'github_dispatch_token', 'nodo-data workflow_dispatch');
-- Replace it later:
--   select vault.update_secret((select id from vault.secrets where name = 'github_dispatch_token'), '<new token>');
-- Until the secret exists every job is a no-op, so this file can be applied before the token is made.
--
-- The `schedule:` lines stay in the workflows as a late fallback until the dispatched runs have been checked for a
-- few days; then they come out in a second change, so no workflow runs twice a day.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.dispatch_workflow(workflow text)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  tok text;
begin
  if workflow !~ '^[a-z]+\.yml$' then raise exception 'bad workflow name'; end if;
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'github_dispatch_token' limit 1;
  if tok is null then return null; end if;
  return net.http_post(
    url := 'https://api.github.com/repos/gianmariasisti-afk/nodo-data/actions/workflows/' || workflow || '/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || tok,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'nodo-supabase-cron',
      'Content-Type', 'application/json'),
    body := '{"ref":"main"}'::jsonb,
    timeout_milliseconds := 15000);
end;
$$;
revoke execute on function public.dispatch_workflow(text) from public, anon, authenticated;

-- Same UTC times as the workflows' `schedule:` lines.
select cron.schedule('gh-activity',   '30 3,15 * * *',         $j$ select public.dispatch_workflow('activity.yml') $j$);
select cron.schedule('gh-commission', '41 4 * * 1-5',          $j$ select public.dispatch_workflow('commission.yml') $j$);
select cron.schedule('gh-meps',       '11 5 * * 1-5',          $j$ select public.dispatch_workflow('meps.yml') $j$);
select cron.schedule('gh-agenda',     '17 5,9,13,17 * * 1-5',  $j$ select public.dispatch_workflow('agenda.yml') $j$);
select cron.schedule('gh-press',      '23 5 * * *',            $j$ select public.dispatch_workflow('press.yml') $j$);
select cron.schedule('gh-portraits',  '37 6 * * *',            $j$ select public.dispatch_workflow('portraits.yml') $j$);
select cron.schedule('gh-updates',    '41 6 * * *',            $j$ select public.dispatch_workflow('updates.yml') $j$);
select cron.schedule('gh-status',     '20 6 * * 1-5',          $j$ select public.dispatch_workflow('status.yml') $j$);

-- Checks:
--   GitHub's answers (204 = started; kept about 6 hours): select id, status_code, content, created from net._http_response order by id desc limit 20;
--   cron runs: select j.jobname, d.status, d.start_time from cron.job_run_details d join cron.job j using (jobid) where j.jobname like 'gh-%' order by d.start_time desc limit 20;
--   stop one: select cron.unschedule('gh-press');
