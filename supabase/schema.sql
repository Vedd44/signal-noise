create table if not exists public.stories (
  id text primary key,
  title text not null,
  url text not null unique,
  source text not null,
  source_type text not null,
  published_at timestamptz not null,
  summary text,
  why_it_matters text,
  tag text,
  score integer,
  raw_snippet text,
  image_url text,
  read_time integer,
  is_top_signal boolean not null default false,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stories_published_at_desc_idx
  on public.stories (published_at desc);

create index if not exists stories_score_desc_idx
  on public.stories (score desc);

create index if not exists stories_tag_idx
  on public.stories (tag);

create index if not exists stories_source_idx
  on public.stories (source);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stories_set_updated_at on public.stories;

create trigger stories_set_updated_at
before update on public.stories
for each row
execute function public.set_updated_at();
