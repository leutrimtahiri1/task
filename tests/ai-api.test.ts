import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as search } from "../src/app/api/leads/search/route";
import { POST as generate } from "../src/app/api/messages/generate/route";
import { POST as record } from "../src/app/api/messages/sent/route";
import { EMPTY_PARTNER } from "../src/lib/partners";

// Exercise real Route Handlers with deterministic HTTP doubles. No real API
// key, account, model quota, or hosted records are used by these tests.
test("AI endpoints authenticate, enforce ownership, and save only validated drafts", async (t) => {
  const originalFetch = globalThis.fetch;
  const keys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
  ] as const;
  const previous = keys.map((key) => process.env[key]);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-public-key";
  process.env.GEMINI_API_KEY = "test-server-key";
  process.env.GEMINI_MODEL = "test-model";
  const id = "11111111-1111-4111-8111-111111111111";
  const userId = "22222222-2222-4222-8222-222222222222";
  const plan = {
    messages: ["email", "linkedin", "whatsapp"].flatMap((channel) =>
      ["initial", "follow_up"].map((kind) => ({
        channel,
        kind,
        subject: channel === "email" ? "Partnership" : "",
        body: "Hello Sam. Can we discuss a partnership?",
      })),
    ),
  };
  const partner = {
    ...EMPTY_PARTNER,
    id,
    owner_id: userId,
    first_name: "Sam",
    company_name: "Example BPO",
  };
  let providerCalls = 0;
  let saved: Record<string, unknown>[] = [];
  let missingPartner = false;
  let badPlan = false;
  let providerStatus = 200;
  let quotaReached = false;
  let calls = 0;
  const json = (body: unknown, status = 200) => Response.json(body, { status });
  const request = (body: unknown, authorized = true) =>
    new Request("http://localhost/api/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authorized ? { Authorization: "Bearer test-session" } : {}),
      },
      body: JSON.stringify(body),
    });
  globalThis.fetch = async (input, init) => {
    calls++;
    const url = String(input);
    if (url.includes("/auth/v1/user"))
      return json({
        id: userId,
        aud: "authenticated",
        email: "sam@example.com",
      });
    if (url.includes("/rest/v1/rpc/claim_ai_request"))
      return quotaReached
        ? json({ message: "AI_RATE_LIMIT", code: "P0001" }, 400)
        : json(null);
    if (url.includes("/rest/v1/partners?"))
      return missingPartner
        ? json({ message: "Not found", code: "PGRST116" }, 406)
        : json(partner);
    if (url.includes("/rest/v1/partner_messages?")) {
      saved = JSON.parse(String(init?.body));
      return json(
        saved.map((message, index) => ({
          ...message,
          id: `message-${index}`,
          created_at: "2026-10-30T00:00:00Z",
        })),
      );
    }
    if (url.includes("/rest/v1/rpc/record_partner_message_sent")) {
      const args = JSON.parse(String(init?.body));
      return json({
        id: args.p_message_id,
        body: args.p_body,
        subject: args.p_subject,
        sent_at: args.p_sent_at,
      });
    }
    if (
      url === "https://generativelanguage.googleapis.com/v1beta/interactions"
    ) {
      providerCalls++;
      assert.equal(
        new Headers(init?.headers).get("x-goog-api-key"),
        "test-server-key",
      );
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.store, false);
      if (providerStatus !== 200)
        return json(
          {
            error: { message: "private-provider-details-and-test-server-key" },
          },
          providerStatus,
        );
      if (payload.tools)
        return json({
          status: "completed",
          steps: [
            { type: "google_search_call" },
            {
              type: "google_search_result",
              result: [{ search_suggestions: "<div>Google suggestions</div>" }],
            },
            {
              type: "model_output",
              content: [
                {
                  type: "text",
                  text: "Example company. Verify its services.",
                  annotations: [
                    {
                      type: "url_citation",
                      title: "Company",
                      url: "https://example.com",
                    },
                  ],
                },
              ],
            },
          ],
        });
      assert.ok(payload.input.includes("Example BPO"));
      return json({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: JSON.stringify(badPlan ? { messages: [] } : plan),
              },
            ],
          },
        ],
      });
    }
    throw new Error(`Unexpected mocked HTTP path: ${new URL(url).pathname}`);
  };
  try {
    await t.test(
      "unauthenticated calls cannot reach any provider",
      async () => {
        const before = calls;
        for (const handler of [search, generate, record])
          assert.equal((await handler(request({}, false))).status, 401);
        assert.equal(calls, before);
      },
    );
    await t.test(
      "generation loads the owned record and saves six typed drafts",
      async () => {
        const response = await generate(
          request({ partnerId: id, extraPrompt: "Use a warm tone." }),
        );
        assert.equal(response.status, 200);
        assert.equal(saved.length, 6);
        assert.ok(
          saved.every(
            (message) =>
              message.owner_id === userId &&
              message.partner_id === id &&
              message.source === "ai" &&
              message.sent_at === null,
          ),
        );
        assert.equal(
          new Set(saved.map((message) => message.generation_id)).size,
          1,
        );
        assert.equal(saved[0].extra_prompt, "Use a warm tone.");
      },
    );
    await t.test(
      "missing partners and invalid input do not spend AI quota",
      async () => {
        const before = providerCalls;
        missingPartner = true;
        assert.equal((await generate(request({ partnerId: id }))).status, 404);
        missingPartner = false;
        assert.equal(
          (await generate(request({ partnerId: "bad" }))).status,
          400,
        );
        assert.equal(
          (
            await generate(
              request({ partnerId: id, extraPrompt: "x".repeat(25000) }),
            )
          ).status,
          413,
        );
        assert.equal(providerCalls, before);
      },
    );
    await t.test("incomplete model output is not persisted", async () => {
      saved = [];
      badPlan = true;
      assert.equal((await generate(request({ partnerId: id }))).status, 502);
      assert.equal(saved.length, 0);
      badPlan = false;
    });
    await t.test(
      "search returns cited findings without writing contacts or messages",
      async () => {
        saved = [];
        const response = await search(
          request({
            query: "Insurance BPO companies",
            partnerType: "bpo",
            market: "US",
            insurance: "life",
          }),
        );
        assert.equal(response.status, 200);
        assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
        const body = await response.json();
        assert.equal(body.sources[0].url, "https://example.com/");
        assert.equal(saved.length, 0);
      },
    );
    await t.test(
      "provider and daily budget errors are safe and actionable",
      async () => {
        providerStatus = 429;
        const response = await generate(request({ partnerId: id }));
        assert.equal(response.status, 429);
        assert.ok(!(await response.text()).includes("test-server-key"));
        providerStatus = 200;
        quotaReached = true;
        const before = providerCalls;
        assert.equal((await generate(request({ partnerId: id }))).status, 429);
        assert.equal(providerCalls, before);
        quotaReached = false;
      },
    );
    await t.test(
      "record-sent forwards the final edited snapshot; future times are rejected",
      async () => {
        const input = {
          messageId: id,
          subject: "Final subject",
          body: "Final edited message",
          sentAt: new Date().toISOString(),
          contactDate: "2026-10-30",
        };
        const response = await record(request(input));
        assert.equal(response.status, 200);
        assert.equal(
          (await response.json()).message.body,
          "Final edited message",
        );
        assert.equal(
          (
            await record(
              request({
                ...input,
                sentAt: new Date(Date.now() + 86400000).toISOString(),
              }),
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "a missing Gemini key fails without contacting the provider",
      async () => {
        delete process.env.GEMINI_API_KEY;
        const before = providerCalls;
        assert.equal((await generate(request({ partnerId: id }))).status, 503);
        assert.equal(providerCalls, before);
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
