import assert from "node:assert/strict";
import { test } from "node:test";
import {
  completeDate,
  EMPTY_PARTNER,
  formatDate,
  isCalendarDate,
  localDate,
  nextFollowUp,
  pendingDates,
  validatePartner,
} from "../src/lib/partners";

test("reminders and follow-ups share one sorted, deduplicated queue", () => {
  const partner = {
    ...EMPTY_PARTNER,
    reminder_date: "2026-10-29",
    follow_up_dates: ["2026-11-03", "2026-10-29", "2026-10-26"],
  };
  assert.deepEqual(pendingDates(partner), [
    "2026-10-26",
    "2026-10-29",
    "2026-11-03",
  ]);
  assert.equal(nextFollowUp(partner), "2026-10-26");
  assert.deepEqual(partner.follow_up_dates, [
    "2026-11-03",
    "2026-10-29",
    "2026-10-26",
  ]);
});

test("completing a shared date clears both tasks and retains completion history", () => {
  const partner = {
    ...EMPTY_PARTNER,
    reminder_date: "2026-10-29",
    follow_up_dates: ["2026-10-29", "2026-11-03"],
  };
  const updated = { ...partner, ...completeDate(partner, "2026-10-29") };
  assert.equal(updated.reminder_completed, true);
  assert.deepEqual(updated.completed_follow_up_dates, ["2026-10-29"]);
  assert.equal(nextFollowUp(updated), "2026-11-03");
  assert.deepEqual(
    completeDate(updated, "2026-10-29"),
    completeDate(partner, "2026-10-29"),
  );
});

test("completed and empty schedules do not produce reminders", () => {
  assert.equal(nextFollowUp(EMPTY_PARTNER), null);
  assert.deepEqual(
    pendingDates({
      ...EMPTY_PARTNER,
      reminder_date: "2026-10-29",
      reminder_completed: true,
      follow_up_dates: ["2026-10-28"],
      completed_follow_up_dates: ["2026-10-28"],
    }),
    [],
  );
});

test("calendar validation rejects rollover dates and accepts leap days", () => {
  assert.equal(isCalendarDate("2024-02-29"), true);
  for (const date of [
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-01",
    "2026-1-03",
    "0099-01-01",
  ])
    assert.equal(isCalendarDate(date), false, date);
  assert.equal(localDate(new Date(2026, 9, 29, 23, 59)), "2026-10-29");
  assert.match(formatDate("2026-10-29"), /Oct 29, 2026/);
});

test("partner validation rejects incomplete names and unsafe LinkedIn addresses", () => {
  assert.match(
    validatePartner({ ...EMPTY_PARTNER, first_name: "   " }) ?? "",
    /required/,
  );
  const valid = {
    ...EMPTY_PARTNER,
    first_name: "Sam",
    linkedin_url: "https://www.linkedin.com/in/example",
  };
  assert.equal(validatePartner(valid), null);
  for (const linkedin_url of [
    "javascript:alert(1)",
    "https://linkedin.com.evil.example/in/test",
    "https://evil.example",
    "http://www.linkedin.com/in/test",
  ]) {
    assert.ok(validatePartner({ ...valid, linkedin_url }), linkedin_url);
  }
  assert.ok(validatePartner({ ...valid, reminder_date: "2026-02-30" }));
});
