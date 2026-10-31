# Partnerflow

A Next.js and Supabase app for researching potential partners, drafting
personalized outreach, and tracking representatives through a pipeline.
Messages are reviewed, copied, and sent manually outside the app.

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

For lead research and message generation, add a server-only Gemini key:

```dotenv
GEMINI_API_KEY=your_new_key
# Optional; this is the default model:
GEMINI_MODEL=gemini-3.8-flash
```

Create the key in [Google AI Studio](https://aistudio.google.com/api-keys).
Never prefix it with `NEXT_PUBLIC_` or commit it. Restart `npm run dev` after
adding it. Search requires a project/model with Google Search grounding access;
Google currently requires paid-tier API access for this feature, even when a
free search allowance applies. Model tokens and search requests have separate
pricing. See [Google pricing](https://ai.google.dev/gemini-api/docs/pricing).

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

The migrations create `public.partners`, `public.partner_status_history`,
`public.partner_messages`, and the private `public.ai_request_log` budget table.
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

## Discover leads

Open **Discover leads** (`/search`) and choose **Search with AI** to use the
existing research flow. **Search with LinkedIn** opens LinkedIn people search
in a new tab. **Search with Apollo** is disabled and marked **Coming soon**.
For AI research, enter a business search and optionally
choose partner type, market served, and insurance product. The authenticated
server calls Gemini's Interactions API with the Google Search tool enabled.
Findings include source links, Google's associated search suggestions, and a
prominent reminder to verify information. Unsourced responses are rejected.

Search findings are rendered only to the requesting user and are not saved,
cached, automatically copied into contacts, or fed into message generation.
Independently verify relevant information on original company sources, then
use **Partners** (`/partners`) to enter the business details manually. Research
may be incomplete or inaccurate; a model suggestion is not a verified lead.
The app does not scrape LinkedIn or log in to third-party sites.

This display-only design follows the restrictions in Google's
[Grounding with Google Search terms](https://ai.google.dev/gemini-api/terms#grounding-with-google-search).
Search findings must not be used to build a programmatically collected database.
Google's supplied suggestion markup is sanitized and its styling isolated in a
shadow root; model-written HTML is never executed.

## Generate and record outreach

On a representative's row, click **Messages**, or open their edit form and
choose **Messages** there. Choose how to create your message:

- **Write it yourself** (default): choose Email, LinkedIn, or WhatsApp, select
  First message or Follow-up, and write your text. Email also has a subject.
  **Save message** creates a draft using Supabase directly. This works without
  a Gemini key and does not use AI quota.
- **Generate with AI**: add an optional brief with your company, sender name,
  partnership goals, language, tone, and any extra instructions. The app
  generates and saves six drafts: an initial message and one follow-up for
  each channel.

Both types can be edited, copied, and recorded as sent. The database stores
`source` as `manual` or `ai`; manual messages have no model value. Existing
messages are classified as AI-created by the migration. Unsent manual drafts
remain visible in their channel alongside the latest AI batch, while older AI
batches remain under History.

Only saved partner facts relevant to personalization (name, company, role,
stage, contact origin/method, outcome, and notes) plus your brief go to Gemini.
Contact numbers, email addresses, ownership IDs, and auth tokens are excluded.
Do not enter private personal information in notes or prompts. Follow-up drafts
are written for use after the corresponding initial message has actually been
sent; no schedule or previous conversation is invented. Missing sender details
remain placeholders for you to replace.

- Review and edit drafts. **Save draft** persists edits; **Copy** copies the
  current text, including the subject for email. Copying does not save edits
  or mark anything as sent.
- **Generate new versions** creates another saved batch. Prior drafts remain
  accessible under History; sent messages are preserved.
- After sending a message yourself, choose **Record as sent**. Review the final
  snapshot and enter the actual local sent time. Confirmation saves the final
  text and timestamp and updates the partner in one database transaction.
- A Found partner becomes Contacted. Replied, In talks, and Signed are never
  downgraded. The contact date and contacted-by field are updated. Sent snapshots
  are read-only. Follow-up dates still use the existing manual scheduling form.
- WhatsApp drafts include a recipient-permission reminder. A public phone number
  does not establish opt-in. The app has no messaging delivery integrations.

All AI endpoints verify the Supabase session server-side. Database ownership
policies protect drafts and sent records. A database-backed guard permits at
most 5 AI requests per minute and 50 per rolling day per account, across both
search and generation. Failed provider calls also count as attempts. No search
text or prompts are stored in the budget log. Before a public launch, add global
spend controls and account-abuse protections appropriate to the deployment.

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
deduplication, calendar boundaries, and input validation. Additional tests cover
the message schema/RLS, read-only sent records, atomic stage transitions, AI
rate limits, response validation, and real API Route Handlers with mocked HTTP
providers. Tests never spend model quota or write to your hosted database.
The test command uses the `react-server` export condition for `server-only`
route imports. Run date tests in
another time zone with `TZ=America/Los_Angeles npm test`.

```bash
npm run format
```

## Main files

- `src/components/partner-tracker.tsx`: auth, table, filters, and follow-up queue.
- `src/components/partner-form.tsx`: add/edit form and stage history.
- `src/components/lead-search.tsx`: discovery form, report, and source display.
- `src/components/outreach-dialog.tsx`: drafts, copy, and sent-message history.
- `src/app/api/`: authenticated search, generation, and record-sent handlers.
- `src/lib/server/`: server-only Gemini requests and API authentication.
- `src/lib/ai-contract.ts`: prompts and provider response validation.
- `src/lib/partners.ts`: types, validation, and calendar/follow-up logic.
- `src/lib/supabase.ts`: browser Supabase client using the public environment.
- `supabase/migrations/`: database schema, policies, and triggers.

The browser loads all of the current user's records in paginated API requests
and then filters locally. For a larger pipeline, move filtering and pagination
to database queries. Company management, shared team permissions, contact
activity logs, and scheduled notification delivery are future work.
