-- Production prerequisite: public.daily_signal_sends must already exist.
-- This migration does not alter stories or the existing campaign-send table.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.daily_signal_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  status text not null default 'active' check (status in ('active', 'unsubscribed')),
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.daily_signal_subscribers enable row level security;

revoke all on table public.daily_signal_subscribers from anon, authenticated;
grant all on table public.daily_signal_subscribers to service_role;

comment on table public.daily_signal_subscribers is
  'Private Daily Signal subscriber and suppression list; service-role access only.';

create index if not exists daily_signal_subscribers_active_idx
  on public.daily_signal_subscribers (status) where status = 'active';

drop trigger if exists daily_signal_subscribers_set_updated_at on public.daily_signal_subscribers;

create trigger daily_signal_subscribers_set_updated_at
before update on public.daily_signal_subscribers
for each row
execute function public.set_updated_at();

create table if not exists public.daily_signal_deliveries (
  local_date date not null references public.daily_signal_sends(local_date) on delete cascade,
  recipient_hash text not null,
  subscriber_id uuid references public.daily_signal_subscribers(id),
  recipient_type text not null check (recipient_type in ('owner', 'subscriber')),
  status text not null check (status in ('sending', 'sent', 'failed')),
  content_hash text not null,
  provider_message_id text,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (local_date, recipient_hash)
);

alter table public.daily_signal_deliveries enable row level security;

revoke all on table public.daily_signal_deliveries from anon, authenticated;
grant all on table public.daily_signal_deliveries to service_role;

comment on table public.daily_signal_deliveries is
  'Private recipient-level delivery log used for retry-safe individual sends.';

create index if not exists daily_signal_deliveries_subscriber_idx
  on public.daily_signal_deliveries (subscriber_id);
