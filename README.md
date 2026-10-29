# Partnerflow

A Next.js and Supabase app for manually tracking partner representatives, their
pipeline stages, and the next follow-up. No outreach messages are sent.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

If `.env.local` already exists, keep it. Set these values using your Supabase
project's **Connect** dialog:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Restart the development server after changing environment variables. Keep real
credentials out of Git. The publishable key identifies the app; Supabase Auth
and Row Level Security control which records a user can access. No database
password or privileged secret key is needed in the browser.

## Apply the database migration

The Supabase CLI is a pinned development dependency. Authenticate and link once:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

If asked, enter your project's database password, not the publishable key.
Then preview and apply pending migration files:

```bash
npm run db:plan
npm run db:push
npm run db:migrations
```

These commands target the linked hosted database. Docker is not required for
this workflow. Preview lists pending files; it does not validate their SQL.

The migration creates `public.partners` and `public.partner_status_history`.
Status history is written by a database trigger in the same transaction as the
partner change. Authenticated users can only access records they own; public
unauthenticated access and direct history writes are denied.

For subsequent schema changes:

```bash
npm run db:new -- describe_your_change
```

Write SQL in the generated file under `supabase/migrations/`, preview it, and
push it. Commit SQL migrations alongside application changes. Once applied,
make further changes in a new migration instead of editing the old file.
If your hosted project already has application tables, establish a baseline
with `npx supabase db pull` first (that workflow needs a container runtime).

## Use the tracker

1. Create an account or sign in with Supabase email/password authentication.
   Email confirmation is disabled in the linked project and local Supabase
   configuration. New accounts receive a session immediately after signup.
2. Add a representative. First name is required; company suggestions come from
   existing records, and you can enter a new company name.
3. Move the record through **Found → Contacted → Replied → In talks → Signed**.
   You can change stages directly in the table or in the edit form. Edit a
   representative to inspect stage history and all contact details.
4. Set a reminder and one or more follow-up dates. Overdue and due-today records
   appear in **Needs follow-up**; the side panel also lists future tasks.
   Mark a task **Done** to remove it from the active queue while retaining its
   scheduled date and completion state. A reminder and follow-up on the same
   date appear as one task, and completion clears both.
5. Search, filter by stage, mark records unread, and assign records to yourself.
   **Contacted by** and **Assigned to** currently support your own account or
   no assignment. Shared team workspaces are not implemented.

Each row represents one contact/partner relationship. Company names are stored
on those records; this version does not have a separate company directory or
shared company-level stage. Multiple contacts at one company can be tracked
independently.

Reminder dates use the browser's local calendar date, refresh at least every
30 seconds while the app is open, and are checked again on window focus. These
are **in-app reminders**, not background notifications or automatic email,
LinkedIn, or WhatsApp messages.

## Checks

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Tests use Node's test runner and an isolated in-memory PostgreSQL instance
(PGlite), not your hosted database. They verify the actual migration's RLS
policies, SQL constraints, and history trigger, plus follow-up completion,
deduplication, calendar boundaries, and input validation. Run date tests in
another time zone with `TZ=America/Los_Angeles npm test`.

```bash
npm run format
```

## Main files

- `src/components/partner-tracker.tsx`: auth, table, filters, and follow-up queue.
- `src/components/partner-form.tsx`: add/edit form and stage history.
- `src/lib/partners.ts`: types, validation, and calendar/follow-up logic.
- `src/lib/supabase.ts`: browser Supabase client using the public environment.
- `supabase/migrations/`: database schema, policies, and triggers.

The browser loads all of the current user's records in paginated API requests
and then filters locally. For a larger pipeline, move filtering and pagination
to database queries. Company management, shared team permissions, contact
activity logs, and scheduled notification delivery are future work.
