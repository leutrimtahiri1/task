-- Preserve the origin of each saved message. Existing drafts were AI-created.
alter table public.partner_messages
  add column source text not null default 'ai'
    check (source in ('ai', 'manual')),
  alter column model drop not null;

alter table public.partner_messages add constraint partner_messages_source_model_check
  check (
    (source = 'manual' and model is null)
    or (source = 'ai' and model is not null)
  );

-- Existing ownership policies, editable-column grants, and sent-record
-- protection apply equally to manually written and AI-created messages.
