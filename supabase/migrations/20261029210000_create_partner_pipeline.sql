-- Each signed-in user has a private partner pipeline.
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company_name text not null default '' check (length(company_name) <= 200),
  first_name text not null check (length(trim(first_name)) between 1 and 120),
  last_name text not null default '' check (length(last_name) <= 120),
  role text not null default '' check (length(role) <= 200),
  status text not null default 'found'
    check (status in ('found', 'contacted', 'replied', 'in_talks', 'signed')),
  linkedin_url text not null default '' check (length(linkedin_url) <= 2000),
  method_of_contact text not null default '' check (length(method_of_contact) <= 120),
  contact_origin text not null default '' check (length(contact_origin) <= 200),
  email text not null default '' check (length(email) <= 320),
  phone text not null default '' check (length(phone) <= 80),
  company_phone text not null default '' check (length(company_phone) <= 80),
  contact_date date,
  reminder_date date,
  reminder_completed boolean not null default false,
  follow_up_dates date[] not null default '{}',
  completed_follow_up_dates date[] not null default '{}',
  outcome text not null default '' check (length(outcome) <= 2000),
  contacted_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  is_unread boolean not null default false,
  notes text not null default '' check (length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Team sharing is deliberately out of scope for the first version.
  check (contacted_by is null or contacted_by = owner_id),
  check (assigned_to is null or assigned_to = owner_id),
  check (array_position(follow_up_dates, null) is null),
  check (array_position(completed_follow_up_dates, null) is null),
  check (completed_follow_up_dates <@ follow_up_dates),
  check (cardinality(follow_up_dates) <= 50),
  check (cardinality(completed_follow_up_dates) <= 50)
);

create index partners_owner_updated_idx on public.partners (owner_id, updated_at desc);
create index partners_owner_status_idx on public.partners (owner_id, status);

alter table public.partners enable row level security;
revoke all on public.partners from anon, authenticated;
grant select, insert, update, delete on public.partners to authenticated;

create policy "Read own partners" on public.partners for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Create own partners" on public.partners for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "Update own partners" on public.partners for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "Delete own partners" on public.partners for delete to authenticated
  using ((select auth.uid()) = owner_id);

create table public.partner_status_history (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now()
);
create index partner_status_history_partner_idx
  on public.partner_status_history (partner_id, changed_at desc);

alter table public.partner_status_history enable row level security;
revoke all on public.partner_status_history from anon, authenticated;
grant select on public.partner_status_history to authenticated;
create policy "Read own status history" on public.partner_status_history
  for select to authenticated using ((select auth.uid()) = owner_id);

create function public.set_partner_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_partner_updated_at() from public;
create trigger partners_updated_at before update on public.partners
  for each row execute function public.set_partner_updated_at();

-- Only this trigger writes history, so editing a partner and logging its stage
-- happen atomically and clients cannot forge history entries.
create function public.record_partner_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.partner_status_history (partner_id, owner_id, to_status)
      values (new.id, new.owner_id, new.status);
  elsif old.status is distinct from new.status then
    insert into public.partner_status_history (partner_id, owner_id, from_status, to_status)
      values (new.id, new.owner_id, old.status, new.status);
  end if;
  return new;
end;
$$;
revoke all on function public.record_partner_status() from public;
create trigger partners_status_history after insert or update on public.partners
  for each row execute function public.record_partner_status();
