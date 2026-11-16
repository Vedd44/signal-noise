import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { createSupabaseDailySignalSendLog } from "../lib/email/send-log";
import type { DailySignalSelection } from "../lib/email/selection";
import type { Story } from "../types/story";

function makeStory(index: number): Story {
  return {
    id: `history-story-${index}`,
    title: `History story ${index}`,
    summary: `A distinct development ${index}.`,
    why_it_matters: `The consequence ${index}.`,
    url: `https://publisher.example/history-${index}`,
    source: "The Record",
    source_type: "reporting",
    tag: "Business",
    score: 90 - index,
    published_at: "2026-11-14T10:00:00Z",
    created_at: "2026-11-14T10:00:00Z",
    updated_at: "2026-11-14T10:00:00Z"
  };
}

const previousSelection: DailySignalSelection = {
  lead: makeStory(0),
  worthKnowing: [makeStory(1), makeStory(2), makeStory(3)],
  onRadar: [makeStory(4)]
};

// Exercise the production Supabase adapter without credentials or network access.
// Tests in this file are sequential, and every environment change is restored.
function mockHistoryResponse(t: TestContext, response: unknown, status = 200) {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-key";
  t.after(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  });

  const requests: URL[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push(new URL(url));
    assert.equal(init?.method ?? "GET", "GET");
    return new Response(JSON.stringify(response), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  });
  return { sendLog: createSupabaseDailySignalSendLog(), requests };
}

test("history adapter selects the latest earlier sent edition within three New York calendar days with sent status", async (t) => {
  const { sendLog, requests } = mockHistoryResponse(t, [{ selection_snapshot: previousSelection }]);
  const datePairs = [
    ["2026-11-15", "2026-11-12"],
    ["2026-11-01", "2026-10-29"],
    ["2026-11-02", "2026-10-30"],
    ["2026-03-08", "2026-03-05"],
    ["2026-03-09", "2026-03-06"],
    ["2027-01-01", "2026-12-29"],
    ["2028-03-01", "2028-02-27"]
  ];

  for (const [localDate, previousDate] of datePairs) {
    assert.deepEqual(await sendLog.loadPreviousSentSelection!(localDate), previousSelection);
    const request = requests.at(-1)!;
    assert.equal(request.pathname, "/rest/v1/daily_signal_sends");
    assert.equal(request.searchParams.get("select"), "selection_snapshot");
    assert.deepEqual(request.searchParams.getAll("local_date"), [`gte.${previousDate}`, `lt.${localDate}`]);
    assert.equal(request.searchParams.get("order"), "local_date.desc");
    assert.equal(request.searchParams.get("limit"), "1");
    assert.equal(request.searchParams.get("status"), "eq.sent");
  }
  assert.equal(requests.length, datePairs.length);
});

test("no prior sent campaign returns no suppression history", async (t) => {
  const { sendLog, requests } = mockHistoryResponse(t, []);
  assert.equal(await sendLog.loadPreviousSentSelection!("2026-11-15"), null);
  assert.equal(requests.length, 1);
});

test("an existing sent campaign without a snapshot fails closed", async (t) => {
  const { sendLog } = mockHistoryResponse(t, [{ selection_snapshot: null }]);
  await assert.rejects(
    sendLog.loadPreviousSentSelection!("2026-11-15"),
    /Previous campaign snapshot unavailable/
  );
});

test("history adapter rejects query failures rather than treating them as absent history", async (t) => {
  const { sendLog } = mockHistoryResponse(t, { message: "fixture database error" }, 500);
  await assert.rejects(
    sendLog.loadPreviousSentSelection!("2026-11-15"),
    /Previous campaign snapshot unavailable/
  );
});
