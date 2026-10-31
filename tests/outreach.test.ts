import assert from "node:assert/strict";
import { test } from "node:test";
import {
  groundedResult,
  interactionText,
  messagesPrompt,
  partnerContext,
} from "../src/lib/ai-contract";
import {
  messagePlanSchema,
  messageText,
  safeWebUrl,
  searchInputSchema,
  sentInputSchema,
} from "../src/lib/outreach";
import { EMPTY_PARTNER, type Partner } from "../src/lib/partners";

const partner: Partner = {
  ...EMPTY_PARTNER,
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "22222222-2222-4222-8222-222222222222",
  first_name: "Sam",
  company_name: "Example BPO",
  email: "private@example.com",
  phone: "+15555550123",
  notes: "Runs insurance campaigns.",
  created_at: "2026-10-30T00:00:00Z",
  updated_at: "2026-10-30T00:00:00Z",
};

test("personalization includes relevant facts but excludes identifiers and contact numbers", () => {
  const context = JSON.stringify(partnerContext(partner));
  assert.match(context, /insurance campaigns/);
  for (const value of [
    partner.id,
    partner.owner_id,
    partner.email,
    partner.phone,
  ])
    assert.ok(!context.includes(value));
  const prompt = messagesPrompt(partner, "Use a friendly tone.");
  assert.match(prompt, /friendly tone/);
  assert.match(prompt, /Do not browse or invent/);
});

test("a valid plan requires exactly one initial and follow-up per channel", () => {
  const messages = ["email", "linkedin", "whatsapp"].flatMap((channel) =>
    ["initial", "follow_up"].map((kind) => ({
      channel,
      kind,
      subject: "",
      body: "Hello, let's discuss a partnership.",
    })),
  );
  assert.ok(messagePlanSchema.safeParse({ messages }).success);
  assert.ok(
    !messagePlanSchema.safeParse({ messages: messages.slice(1) }).success,
  );
  assert.ok(
    !messagePlanSchema.safeParse({
      messages: [...messages.slice(1), messages[1]],
    }).success,
  );
  assert.ok(
    !messagePlanSchema.safeParse({
      messages: messages.map((message) => ({ ...message, body: " " })),
    }).success,
  );
});

test("copy includes the email subject but keeps chat messages plain", () => {
  assert.equal(
    messageText({
      channel: "email",
      subject: " Partnership ",
      body: " Hello ",
    }),
    "Subject: Partnership\n\nHello",
  );
  assert.equal(
    messageText({ channel: "linkedin", subject: "Ignored", body: "Hello" }),
    "Hello",
  );
});

test("research must have an actual search step and a safe cited source", () => {
  const text = "Company A offers insurance campaigns. Verify its services.";
  const response = {
    status: "completed",
    steps: [
      {
        type: "thought",
        content: [
          { type: "text", text: "Private reasoning must not be rendered." },
        ],
      },
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
            text,
            annotations: [
              {
                type: "url_citation",
                url: "https://example.com/services",
                title: "Example",
              },
              {
                type: "url_citation",
                url: "https://example.com/services",
                title: "Duplicate",
              },
              {
                type: "url_citation",
                url: "javascript:alert(1)",
                title: "Unsafe",
              },
            ],
          },
        ],
      },
    ],
  };
  const result = groundedResult(response);
  assert.equal(result.text, text);
  assert.deepEqual(result.sources, [
    { url: "https://example.com/services", title: "Example" },
  ]);
  assert.deepEqual(result.suggestions, ["<div>Google suggestions</div>"]);
  assert.throws(
    () =>
      groundedResult({
        ...response,
        steps: response.steps.filter(
          (step) => step.type !== "google_search_call",
        ),
      }),
    /No cited/,
  );
  assert.throws(
    () => interactionText({ ...response, status: "failed" }),
    /did not complete/,
  );
});

test("unsafe links and malformed or oversized inputs are rejected", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "https://user:pass@example.com",
    "/internal",
  ])
    assert.equal(safeWebUrl(url), null);
  assert.equal(safeWebUrl("https://example.com"), "https://example.com/");
  assert.ok(
    !searchInputSchema.safeParse({
      query: "a",
      partnerType: "any",
      market: "",
      insurance: "",
    }).success,
  );
  assert.ok(
    !sentInputSchema.safeParse({
      messageId: partner.id,
      subject: "",
      body: "hello",
      sentAt: "bad",
      contactDate: "2026-02-30",
    }).success,
  );
});
