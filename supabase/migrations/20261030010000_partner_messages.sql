-- Keep drafts and the final message the user says they sent. Nothing is sent
-- by the app. The composite FK prevents attaching a message to another owner.
alter table public.partners add constraint partners_id_owner_unique unique (id, owner_id);

create table public.partner_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  partner_id uuid not null,
  generation_id uuid not null,
  channel text not null check (channel in ('email', 'linkedin', 'whatsapp')),
  kind text not null check (kind in ('initial', 'follow_up')),
  subject text not null default '' check (length(subject) <= 300),
  body text not null check (length(trim(body)) between 1 and 6000),
  extra_prompt text not null default '' check (length(extra_prompt) <= 4000),
  model text not null check (length(model) <= 120),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (partner_id, owner_id) references public.partners(id, owner_id) on delete cascade,
  unique (generation_id, channel, kind)
);
create index partner_messages_partner_created_idx
  on public.partner_messages (partner_id, created_at desc);

alter table public.partner_messages enable row level security;
revoke all on public.partner_messages from anon, authenticated;
grant select, insert on public.partner_messages to authenticated;
grant update (subject, body) on public.partner_messages to authenticated;
create policy "Read own messages" on public.partner_messages for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Create own drafts" on public.partner_messages for insert to authenticated
  with check ((select auth.uid()) = owner_id and sent_at is null);
create policy "Edit own messages" on public.partner_messages for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create function public.protect_sent_message()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.sent_at is not null then
    raise exception 'Sent messages are read-only. Create a new draft instead.';
  end if;
  if new.sent_at > now() + interval '5 minutes' then
    raise exception 'A message cannot be recorded as sent in the future.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_sent_message() from public;
create trigger partner_messages_protect_sent before update on public.partner_messages
  for each row execute function public.protect_sent_message();

-- Both writes run in one transaction. Recording a sent message must not
-- downgrade a partner who has already replied, entered talks, or signed.
create function public.record_partner_message_sent(
  p_message_id uuid, p_subject text, p_body text,
  p_sent_at timestamptz, p_contact_date date
)
returns public.partner_messages language plpgsql security definer set search_path = '' as $$
declare
  message public.partner_messages;
begin
  if p_sent_at is null or p_contact_date is null then
    raise exception 'The actual sent date is required.';
  end if;
  update public.partner_messages
    set subject = trim(p_subject), body = trim(p_body), sent_at = p_sent_at
    where id = p_message_id and owner_id = (select auth.uid())
    returning * into message;
  if not found then
    raise exception 'Message not found or not accessible.';
  end if;
  update public.partners
    set status = case when status = 'found' then 'contacted' else status end,
        contact_date = greatest(contact_date, p_contact_date),
        contacted_by = (select auth.uid()),
        method_of_contact = case when method_of_contact = '' then message.channel else method_of_contact end
    where id = message.partner_id and owner_id = (select auth.uid());
  return message;
end;
$$;
revoke all on function public.record_partner_message_sent(uuid, text, text, timestamptz, date) from public;
grant execute on function public.record_partner_message_sent(uuid, text, text, timestamptz, date) to authenticated;

-- A shared database guard, rather than an in-memory counter, caps expensive
-- AI calls across app instances. No prompts or search results are stored here.
create table public.ai_request_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('search', 'messages')),
  created_at timestamptz not null default now()
);
create index ai_request_log_owner_time_idx on public.ai_request_log (owner_id, created_at desc);
alter table public.ai_request_log enable row level security;
revoke all on public.ai_request_log from anon, authenticated;

create function public.claim_ai_request(p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  user_id uuid := (select auth.uid());
begin
  if user_id is null then raise exception 'Authentication required.'; end if;
  if p_kind not in ('search', 'messages') or p_kind is null then raise exception 'Invalid AI request kind.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(user_id::text, 0));
  delete from public.ai_request_log where owner_id = user_id and created_at < now() - interval '1 day';
  if (select count(*) from public.ai_request_log where owner_id = user_id and created_at > now() - interval '1 minute') >= 5
    or (select count(*) from public.ai_request_log where owner_id = user_id) >= 50 then
    raise exception 'AI_RATE_LIMIT: Please wait before generating again. Limit: 5 requests/minute and 50/day.';
  end if;
  insert into public.ai_request_log (owner_id, kind) values (user_id, p_kind);
end;
$$;
revoke all on function public.claim_ai_request(text) from public;
grant execute on function public.claim_ai_request(text) to authenticated;
