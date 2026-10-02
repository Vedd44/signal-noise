-- Additive launch migration; existing active/suppressed subscribers are preserved.
begin;

-- Production had a broader read policy than the checked-in schema.
drop policy if exists "Public read access for stories" on public.stories;
drop policy if exists public_can_read_published_stories on public.stories;
create policy public_can_read_published_stories on public.stories for select to anon, authenticated using (status = 'published');
revoke all on public.stories from anon, authenticated;
grant select on public.stories to anon, authenticated;
revoke all on public.daily_signal_sends from anon, authenticated;
grant all on public.daily_signal_sends to service_role;

alter table public.daily_signal_subscribers drop constraint if exists daily_signal_subscribers_status_check;
alter table public.daily_signal_subscribers add constraint daily_signal_subscribers_status_check check (status in ('pending','active','unsubscribed'));
alter table public.daily_signal_subscribers add column if not exists confirmation_token_hash text;
alter table public.daily_signal_subscribers add column if not exists confirmation_expires_at timestamptz;
alter table public.daily_signal_subscribers add column if not exists confirmation_requested_at timestamptz;
alter table public.daily_signal_subscribers add column if not exists confirmed_at timestamptz;
alter table public.daily_signal_subscribers add column if not exists attribution jsonb not null default '{}';
create unique index if not exists subscriber_confirmation_token_idx on public.daily_signal_subscribers(confirmation_token_hash) where confirmation_token_hash is not null;

create table if not exists public.public_request_limits (
  key_hash text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
create index if not exists public_request_limits_expiry_idx on public.public_request_limits(expires_at);
alter table public.public_request_limits enable row level security;
revoke all on public.public_request_limits from anon, authenticated;
grant all on public.public_request_limits to service_role;

create or replace function public.claim_public_request(request_key text, max_attempts integer, window_seconds integer)
returns boolean language plpgsql security invoker set search_path = public as $$
declare used integer;
begin
  if max_attempts < 1 or window_seconds < 1 or window_seconds > 86400 then return false; end if;
  delete from public_request_limits where expires_at < now();
  insert into public_request_limits(key_hash,attempts,expires_at) values(request_key,1,now()+make_interval(secs=>window_seconds))
  on conflict(key_hash) do update set attempts=public_request_limits.attempts+1
  returning attempts into used;
  return used <= max_attempts;
end $$;
revoke all on function public.claim_public_request(text,integer,integer) from public, anon, authenticated;
grant execute on function public.claim_public_request(text,integer,integer) to service_role;

create or replace function public.prepare_daily_signal_signup(subscriber_email text, token_hash text, campaign jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
declare subscriber daily_signal_subscribers; new_id uuid;
begin
  insert into daily_signal_subscribers(email,status,confirmation_token_hash,confirmation_expires_at,confirmation_requested_at,attribution)
  values(subscriber_email,'pending',token_hash,now()+interval '24 hours',now(),campaign)
  on conflict(email) do nothing returning id into new_id;
  if new_id is not null then return true; end if;
  select * into subscriber from daily_signal_subscribers where email=subscriber_email for update;
  if subscriber.status='active' or subscriber.confirmation_requested_at > now()-interval '5 minutes' then return false; end if;
  update daily_signal_subscribers set status='pending',confirmation_token_hash=token_hash,
    confirmation_expires_at=now()+interval '24 hours',confirmation_requested_at=now(),attribution=campaign
    where id=subscriber.id;
  return true;
end $$;
revoke all on function public.prepare_daily_signal_signup(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.prepare_daily_signal_signup(text,text,jsonb) to service_role;

create or replace function public.confirm_daily_signal_signup(token_hash text)
returns boolean language plpgsql security invoker set search_path = public as $$
declare subscriber daily_signal_subscribers;
begin
  select * into subscriber from daily_signal_subscribers where confirmation_token_hash=token_hash for update;
  if not found or subscriber.confirmation_expires_at < now() or subscriber.status='unsubscribed' then return false; end if;
  if subscriber.status='active' then return true; end if;
  update daily_signal_subscribers set status='active',confirmed_at=now(),subscribed_at=now(),unsubscribed_at=null where id=subscriber.id;
  return true;
end $$;
revoke all on function public.confirm_daily_signal_signup(text) from public, anon, authenticated;
grant execute on function public.confirm_daily_signal_signup(text) to service_role;

create table if not exists public.reader_submissions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('source','feature')),
  payload jsonb not null,
  dedupe_key text unique not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
alter table public.reader_submissions enable row level security;
revoke all on public.reader_submissions from anon, authenticated;
grant all on public.reader_submissions to service_role;

create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check(status in ('running','succeeded','failed')),
  metrics jsonb
);
alter table public.pipeline_runs enable row level security;
revoke all on public.pipeline_runs from anon, authenticated;
grant all on public.pipeline_runs to service_role;

create or replace function public.claim_pipeline_run()
returns uuid language plpgsql security invoker set search_path = public as $$
declare run_id uuid;
begin
  perform pg_advisory_xact_lock(72462811);
  if exists(select 1 from pipeline_runs where status='running' and started_at > now()-interval '6 minutes') then return null; end if;
  update pipeline_runs set status='failed',completed_at=now() where status='running';
  delete from pipeline_runs where started_at < now()-interval '30 days';
  insert into pipeline_runs(status) values('running') returning id into run_id;
  return run_id;
end $$;
revoke all on function public.claim_pipeline_run() from public, anon, authenticated;
grant execute on function public.claim_pipeline_run() to service_role;

alter table public.daily_signal_sends add column if not exists selection_snapshot jsonb;

commit;
