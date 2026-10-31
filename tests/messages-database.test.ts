import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("message ownership, immutable sent snapshots, atomic status updates, and AI budgets", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users values ('${owner}'), ('${other}');
    `);
    for (const file of [
      "20261029210000_create_partner_pipeline.sql",
      "20261030010000_partner_messages.sql",
      "20261031010000_manual_partner_messages.sql",
    ]) {
      await db.exec(
        await readFile(
          new URL(`../supabase/migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    }
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false);`,
    );
    const partner = (
      await db.query<{ id: string }>(
        "insert into public.partners (first_name) values ('Sam') returning id",
      )
    ).rows[0].id;
    const message = (
      await db.query<{ id: string }>(
        "insert into public.partner_messages (partner_id, generation_id, channel, kind, body, model) values ($1, gen_random_uuid(), 'email', 'initial', 'Draft text', 'test') returning id",
        [partner],
      )
    ).rows[0].id;
    await db.query(
      "update public.partner_messages set body = 'Reviewed text' where id = $1",
      [message],
    );
    // A direct client cannot bypass the atomic record-sent function.
    await assert.rejects(
      db.query(
        "update public.partner_messages set sent_at = now() where id = $1",
        [message],
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        "select public.record_partner_message_sent($1, '', 'Final text', now() + interval '1 day', current_date)",
        [message],
      ),
      /future/,
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.partners where id = $1",
          [partner],
        )
      ).rows[0].status,
      "found",
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub', '${other}', false);`,
    );
    assert.equal(
      (await db.query("select * from public.partner_messages")).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "select public.record_partner_message_sent($1, '', 'Stolen', now(), current_date)",
        [message],
      ),
      /not found/,
    );
    await assert.rejects(
      db.query(
        "insert into public.partner_messages (partner_id, generation_id, channel, kind, body, model) values ($1, gen_random_uuid(), 'email', 'initial', 'Other owner', 'test')",
        [partner],
      ),
      /foreign key/,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub', '${owner}', false);`,
    );
    await db.query(
      "select public.record_partner_message_sent($1, 'Final subject', 'Final text', now(), current_date)",
      [message],
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.partners where id = $1",
          [partner],
        )
      ).rows[0].status,
      "contacted",
    );
    const snapshot = (
      await db.query<{ body: string; subject: string; sent_at: string }>(
        "select body, subject, sent_at from public.partner_messages where id = $1",
        [message],
      )
    ).rows[0];
    assert.equal(snapshot.body, "Final text");
    assert.equal(snapshot.subject, "Final subject");
    assert.ok(snapshot.sent_at);
    await assert.rejects(
      db.query(
        "update public.partner_messages set body = 'Rewrite history' where id = $1",
        [message],
      ),
      /read-only/,
    );
    await assert.rejects(
      db.query(
        "select public.record_partner_message_sent($1, '', 'Again', now(), current_date)",
        [message],
      ),
      /read-only/,
    );
    await db.query(
      "update public.partners set status = 'replied' where id = $1",
      [partner],
    );
    const followup = (
      await db.query<{ id: string }>(
        "insert into public.partner_messages (partner_id, generation_id, channel, kind, body, model) values ($1, gen_random_uuid(), 'linkedin', 'follow_up', 'Follow-up', 'test') returning id",
        [partner],
      )
    ).rows[0].id;
    await db.query(
      "select public.record_partner_message_sent($1, '', 'Follow-up', now(), current_date)",
      [followup],
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.partners where id = $1",
          [partner],
        )
      ).rows[0].status,
      "replied",
    );
    const manualPartner = (
      await db.query<{ id: string }>(
        "insert into public.partners (first_name) values ('Manual') returning id",
      )
    ).rows[0].id;
    const manualMessage = (
      await db.query<{ id: string; source: string; model: string | null }>(
        "insert into public.partner_messages (partner_id, generation_id, channel, kind, body, source) values ($1, gen_random_uuid(), 'email', 'initial', 'My own message', 'manual') returning id, source, model",
        [manualPartner],
      )
    ).rows[0];
    assert.equal(manualMessage.source, "manual");
    assert.equal(manualMessage.model, null);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.partners where id = $1",
          [manualPartner],
        )
      ).rows[0].status,
      "found",
    );
    await assert.rejects(
      db.query(
        "insert into public.partner_messages (partner_id, generation_id, channel, kind, body, source, model) values ($1, gen_random_uuid(), 'email', 'initial', 'Wrong origin', 'manual', 'test-model')",
        [manualPartner],
      ),
      /check constraint/,
    );
    await assert.rejects(
      db.query(
        "insert into public.partner_messages (partner_id, generation_id, channel, kind, body, source) values ($1, gen_random_uuid(), 'email', 'initial', 'Missing model', 'ai')",
        [manualPartner],
      ),
      /check constraint/,
    );
    await db.query(
      "select public.record_partner_message_sent($1, 'My subject', 'My final message', now(), current_date)",
      [manualMessage.id],
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.partners where id = $1",
          [manualPartner],
        )
      ).rows[0].status,
      "contacted",
    );
    await assert.rejects(
      db.query(
        "update public.partner_messages set body = 'Change sent manual message' where id = $1",
        [manualMessage.id],
      ),
      /read-only/,
    );
    // Writing and recording manual messages never invokes the AI budget function.
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from public.ai_request_log",
        )
      ).rows[0].count,
      0,
    );
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false);`,
    );
    for (let count = 0; count < 5; count++)
      await db.query("select public.claim_ai_request('search')");
    await assert.rejects(
      db.query("select public.claim_ai_request('messages')"),
      /AI_RATE_LIMIT/,
    );
    await assert.rejects(
      db.query("delete from public.ai_request_log"),
      /permission denied/,
    );
    await db.exec(
      `set role anon; select set_config('request.jwt.claim.sub', '', false);`,
    );
    await assert.rejects(
      db.query("select * from public.partner_messages"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.claim_ai_request('search')"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
