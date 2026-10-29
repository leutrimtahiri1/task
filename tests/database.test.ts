import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// An isolated in-memory PostgreSQL instance exercises the real migration.
// The auth schema/roles below are the minimum Supabase interfaces it uses.
test("migration enforces ownership, constraints, and automatic stage history", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users values ('${owner}'), ('${other}');
    `);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261029210000_create_partner_pipeline.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(`set role anon;`);
    await assert.rejects(
      db.query("select * from public.partners"),
      /permission denied/,
    );
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false);`,
    );
    const { rows } = await db.query<{ id: string; owner_id: string }>(
      "insert into public.partners (first_name, company_name) values ('Sam', 'Example BPO') returning id, owner_id",
    );
    const id = rows[0].id;
    assert.equal(rows[0].owner_id, owner);
    await db.query(
      "update public.partners set status = 'contacted' where id = $1",
      [id],
    );
    await db.query(
      "update public.partners set notes = 'Called once' where id = $1",
      [id],
    );
    const history = await db.query<{
      from_status: string | null;
      to_status: string;
    }>(
      "select from_status, to_status from public.partner_status_history order by changed_at",
    );
    assert.deepEqual(history.rows, [
      { from_status: null, to_status: "found" },
      { from_status: "found", to_status: "contacted" },
    ]);
    await assert.rejects(
      db.query(
        "insert into public.partner_status_history (partner_id, owner_id, to_status) values ($1, $2, 'signed')",
        [id, owner],
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update public.partners set status = 'invalid' where id = $1", [
        id,
      ]),
      /check constraint/,
    );
    await assert.rejects(
      db.query("insert into public.partners (first_name) values ('   ')"),
      /check constraint/,
    );
    await assert.rejects(
      db.query(
        "update public.partners set completed_follow_up_dates = array['2026-10-29']::date[] where id = $1",
        [id],
      ),
      /check constraint/,
    );
    await assert.rejects(
      db.query("update public.partners set assigned_to = $1 where id = $2", [
        other,
        id,
      ]),
      /check constraint/,
    );
    await assert.rejects(
      db.query("update public.partners set owner_id = $1 where id = $2", [
        other,
        id,
      ]),
      /row-level security/,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub', '${other}', false);`,
    );
    assert.equal(
      (await db.query("select * from public.partners")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.partner_status_history")).rows
        .length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update public.partners set status = 'signed' where id = $1 returning id",
          [id],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "delete from public.partners where id = $1 returning id",
          [id],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into public.partners (owner_id, first_name) values ($1, 'Spoof')",
        [owner],
      ),
      /row-level security/,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub', '${owner}', false);`,
    );
    await db.query("delete from public.partners where id = $1", [id]);
    assert.equal(
      (await db.query("select * from public.partner_status_history")).rows
        .length,
      0,
    );
  } finally {
    await db.close();
  }
});
