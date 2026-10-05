import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { organizeBriefingStories } from "@/lib/briefing";
import { authenticateDailySignalRequest } from "@/lib/email/auth";
import {
  createDailySignalProviderIdempotencyKey,
  getDailySignalHttpStatus,
  runDailySignal
} from "@/lib/email/daily-signal";
import { renderDailySignalEmail } from "@/lib/email/render";
import type { DailySignalDeliveryLog } from "@/lib/email/delivery-log";
import { getDailySignalLocalTime, isDailySignalSendWindow } from "@/lib/email/schedule";
import {
  evaluateExistingDailySignalClaim,
  type DailySignalSendLog,
  type ExistingDailySignalSend
} from "@/lib/email/send-log";
import { selectDailySignalStories } from "@/lib/email/selection";
import type { DailySignalTransport } from "@/lib/email/transport";
import type { DailySignalSubscriberStore } from "@/lib/email/subscribers";
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken
} from "@/lib/email/subscribers";
import { orderStoriesForFeed } from "@/lib/utils";
import type { Story, StoryTag } from "@/types/story";

const SEND_DATE = new Date("2026-09-04T12:00:00.000Z");

function makeStory(index: number, overrides: Partial<Story> = {}): Story {
  const tags: StoryTag[] = ["AI", "Media", "Product", "Strategy", "Business", "Consumer Tech"];
  const publishedAt = new Date(SEND_DATE.getTime() - index * 60 * 60 * 1000).toISOString();

  return {
    id: `story-${index}`,
    title: `Story ${index}`,
    url: `https://publisher.example/story-${index}`,
    source: `Publisher ${index % 4}`,
    source_type: "reporting",
    published_at: publishedAt,
    summary: `Summary for story ${index}.`,
    why_it_matters: `Editorial takeaway for story ${index}.`,
    tag: tags[index % tags.length],
    score: 100 - index * 3,
    created_at: publishedAt,
    updated_at: publishedAt,
    status: "published",
    ...overrides
  };
}

const stories = Array.from({ length: 12 }, (_, index) => makeStory(index));
const config = {
  apiKey: "test-key",
  recipient: "owner@example.com",
  from: "Signal > Noise <briefing@example.com>"
};
const emptySubscriberStore: DailySignalSubscriberStore = {
  listActive: async () => [],
  unsubscribe: async () => undefined
};
const acceptingDeliveryLog: DailySignalDeliveryLog = {
  claim: async () => ({ claimed: true }),
  markSent: async () => undefined,
  markFailed: async () => undefined
};

test("email selection reuses the website's ranked lead and Worth Knowing order", () => {
  const ranked = orderStoriesForFeed(stories, SEND_DATE.getTime());
  const website = organizeBriefingStories(ranked, "All");
  const email = selectDailySignalStories(stories, SEND_DATE.getTime());

  assert.ok(email);
  assert.equal(email.lead.id, website.leadStory?.id);
  assert.deepEqual(
    email.worthKnowing.map((story) => story.id),
    website.worthKnowingStories.map((story) => story.id)
  );
  assert.ok(email.onRadar.length >= 4 && email.onRadar.length <= 6);
});

test("premier slots exclude restricted sources while Latest retains their stories", () => {
  const ranked = [
    makeStory(0, { id: "restricted", source: "Stratechery", score: 95 }),
    makeStory(1, { id: "metered-top", source: "The Verge", score: 92 }),
    makeStory(2, { id: "mostly-open-lead", source: "TechCrunch", score: 91 }),
    makeStory(3, { id: "metered-worth", source: "MIT Technology Review", score: 90 }),
    makeStory(4, { id: "open-worth", source: "Apple Newsroom", score: 89 }),
    makeStory(5, { id: "metered-latest", source: "WIRED", score: 88 })
  ];
  const briefing = organizeBriefingStories(ranked, "All");

  assert.equal(briefing.leadStory?.id, "mostly-open-lead");
  assert.deepEqual(
    briefing.worthKnowingStories.map((story) => story.id),
    ["open-worth", "metered-top", "metered-worth"]
  );
  assert.equal(
    briefing.worthKnowingStories.some((story) => story.source === "Stratechery"),
    false
  );
  assert.equal(briefing.latestStories.some((story) => story.id === "restricted"), true);
});

test("email renderer produces editorial HTML, plain text, and direct publisher links", () => {
  const selection = selectDailySignalStories(stories, SEND_DATE.getTime());
  assert.ok(selection);
  const rendered = renderDailySignalEmail(selection, SEND_DATE);

  assert.equal(rendered.subject, "The Signal | September 4");
  assert.equal(rendered.preheader, "The stories worth knowing today.");
  assert.match(rendered.html, /The lead/);
  assert.match(rendered.html, /Worth knowing/);
  assert.match(rendered.html, /On the radar/);
  assert.match(rendered.html, /The Signal:/);
  assert.match(rendered.html, /https:\/\/publisher\.example\/story-/);
  assert.match(rendered.html, /bgcolor="#25241f"/);
  assert.match(rendered.html, /background:#25241f/);
  assert.match(rendered.html, /line-height:1\.17/);
  assert.match(rendered.html, /line-height:1\.22/);
  assert.match(rendered.html, /line-height:1\.32/);
  assert.match(rendered.html, /color:#e8e3d9/);
  assert.match(rendered.html, /color:#dc6d52/);
  assert.doesNotMatch(rendered.html, /border-bottom:1px solid/);
  assert.doesNotMatch(rendered.html, /background:#f7f6f2/);
  assert.doesNotMatch(rendered.html, /<script/i);
  assert.match(rendered.text, /Read the full briefing/);
  assert.doesNotMatch(rendered.html, /Unsubscribe/);
  assert.doesNotMatch(rendered.text, /Unsubscribe/);

  const subscriberId = "123e4567-e89b-42d3-a456-426614174000";
  const unsubscribeSecret = "daily-signal-test-secret-at-least-32-characters";
  const unsubscribeToken = createUnsubscribeToken(subscriberId, unsubscribeSecret);
  const unsubscribeUrl =
    `https://www.signalbrief.xyz/daily-signal/unsubscribe?token=${unsubscribeToken}`;
  const subscriberRendered = renderDailySignalEmail(
    selection,
    SEND_DATE,
    unsubscribeUrl
  );
  assert.match(subscriberRendered.html, /Unsubscribe/);
  assert.match(subscriberRendered.text, /Unsubscribe/);
  assert.match(subscriberRendered.html, /https:\/\/www\.signalbrief\.xyz\/daily-signal\/unsubscribe\?token=/);
  assert.equal(verifyUnsubscribeToken(unsubscribeToken, unsubscribeSecret), subscriberId);
});

test("manual and cron authentication follow existing secret conventions", () => {
  const manualHeaders = new Headers({ authorization: "Bearer manual-secret" });
  const cronHeaders = new Headers({ authorization: "Bearer cron-secret" });
  const wrongHeaders = new Headers({ authorization: "Bearer wrong" });
  const environment = { PIPELINE_SECRET: "manual-secret", CRON_SECRET: "cron-secret" };

  assert.equal(authenticateDailySignalRequest("POST", manualHeaders, environment), "manual");
  assert.equal(authenticateDailySignalRequest("GET", cronHeaders, environment), "vercel-cron");
  assert.equal(authenticateDailySignalRequest("POST", wrongHeaders, environment), null);
  assert.equal(authenticateDailySignalRequest("GET", manualHeaders, environment), null);
});

test("8:10 AM New York send window remains correct across standard and daylight time", () => {
  const winter = new Date("2026-01-15T13:10:00.000Z");
  const summer = new Date("2026-07-15T12:10:00.000Z");

  assert.equal(getDailySignalLocalTime(winter).hour, 8);
  assert.equal(getDailySignalLocalTime(winter).minute, 10);
  assert.equal(getDailySignalLocalTime(summer).hour, 8);
  assert.equal(getDailySignalLocalTime(summer).minute, 10);
  assert.equal(isDailySignalSendWindow(winter), true);
  assert.equal(isDailySignalSendWindow(summer), true);
  assert.equal(isDailySignalSendWindow(new Date("2026-01-15T13:09:00.000Z")), false);
  assert.equal(isDailySignalSendWindow(new Date("2026-01-15T13:40:00.000Z")), false);
  assert.equal(isDailySignalSendWindow(new Date("2026-07-15T13:10:00.000Z")), false);
});

test("dual UTC cron invokes Daily Signal at :10 with a :30 recovery attempt", async () => {
  const vercelConfig = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8")
  ) as { crons: Array<{ path: string; schedule: string }> };

  assert.deepEqual(
    vercelConfig.crons.find((cron) => cron.path === "/api/run-pipeline"),
    { path: "/api/run-pipeline", schedule: "0 */6 * * *" }
  );
  assert.deepEqual(
    vercelConfig.crons.find((cron) => cron.path === "/api/daily-signal"),
    { path: "/api/daily-signal", schedule: "10,30 12,13 * * *" }
  );
});

test("outside-window cron work exits before selecting or sending", async () => {
  let loaded = false;
  const result = await runDailySignal({
    now: new Date("2026-09-04T11:00:00.000Z"),
    enforceSendWindow: true,
    loadStories: async () => {
      loaded = true;
      return stories;
    }
  });

  assert.equal(result.status, "outside-window");
  assert.equal(getDailySignalHttpStatus(result), 200);
  assert.equal(loaded, false);
});

test("transient story query retries once and then sends", async () => {
  let storyLoads = 0;
  let providerCalls = 0;
  const sendLog: DailySignalSendLog = {
    claim: async () => ({ claimed: true }),
    markSent: async () => undefined,
    markFailed: async () => assert.fail("successful retry must not mark the campaign failed")
  };
  const transport: DailySignalTransport = {
    send: async () => {
      providerCalls += 1;
      return { id: "retry-success" };
    }
  };

  const result = await runDailySignal({
    now: new Date("2026-09-04T12:10:00.000Z"),
    enforceSendWindow: true,
    loadStories: async () => {
      storyLoads += 1;
      if (storyLoads === 1) throw new Error("Gateway Timeout");
      return stories;
    },
    storyRetryDelayMs: 0,
    config,
    sendLog,
    transport,
    subscriberStore: emptySubscriberStore,
    deliveryLog: acceptingDeliveryLog
  });

  assert.equal(result.status, "sent");
  assert.equal(storyLoads, 2);
  assert.equal(providerCalls, 1);
});

test("two transient story query failures return 500 before campaign or delivery creation", async () => {
  let storyLoads = 0;
  let campaignClaims = 0;
  let deliveryClaims = 0;
  let providerCalls = 0;
  const sendLog: DailySignalSendLog = {
    claim: async () => {
      campaignClaims += 1;
      return { claimed: true };
    },
    markSent: async () => undefined,
    markFailed: async () => undefined
  };
  const deliveryLog: DailySignalDeliveryLog = {
    claim: async () => {
      deliveryClaims += 1;
      return { claimed: true };
    },
    markSent: async () => undefined,
    markFailed: async () => undefined
  };
  const transport: DailySignalTransport = {
    send: async () => {
      providerCalls += 1;
      return { id: "must-not-send" };
    }
  };

  const result = await runDailySignal({
    now: new Date("2026-09-04T12:10:00.000Z"),
    enforceSendWindow: true,
    loadStories: async () => {
      storyLoads += 1;
      throw Object.assign(new Error("HTTP 504 Gateway Timeout"), { status: 504 });
    },
    storyRetryDelayMs: 0,
    config,
    sendLog,
    transport,
    subscriberStore: emptySubscriberStore,
    deliveryLog
  });

  assert.equal(result.status, "failed");
  assert.equal(result.success, false);
  assert.equal(getDailySignalHttpStatus(result), 500);
  assert.equal(storyLoads, 2);
  assert.equal(campaignClaims, 0);
  assert.equal(deliveryClaims, 0);
  assert.equal(providerCalls, 0);
});

test("non-transient story query failures are not retried", async () => {
  let storyLoads = 0;
  const result = await runDailySignal({
    now: new Date("2026-09-04T12:10:00.000Z"),
    loadStories: async () => {
      storyLoads += 1;
      throw new Error("Invalid story query filter");
    },
    storyRetryDelayMs: 0
  });

  assert.equal(result.status, "failed");
  assert.equal(storyLoads, 1);
});

test("duplicate send claims prevent provider calls", async () => {
  let providerCalls = 0;
  const sendLog: DailySignalSendLog = {
    claim: async () => ({ claimed: false, reason: "already-sent" }),
    markSent: async () => undefined,
    markFailed: async () => undefined
  };
  const transport: DailySignalTransport = {
    send: async () => {
      providerCalls += 1;
      return { id: "should-not-send" };
    }
  };
  const result = await runDailySignal({
    now: SEND_DATE,
    stories,
    config,
    sendLog,
    transport,
    subscriberStore: emptySubscriberStore,
    deliveryLog: acceptingDeliveryLog
  });

  assert.equal(result.status, "duplicate");
  assert.equal(providerCalls, 0);
});

test("failed send is reclaimed and its retry can succeed", async () => {
  let existing: ExistingDailySignalSend = {
    status: "failed",
    content_hash: (() => {
      const rendered = renderDailySignalEmail(selectDailySignalStories(stories, SEND_DATE.getTime())!, SEND_DATE);
      return createHash('sha256').update(JSON.stringify({subject:rendered.subject,html:rendered.html,text:rendered.text})).digest('hex');
    })(),
    attempted_at: "2026-09-04T11:00:00.000Z"
  };
  let providerCalls = 0;
  const sendLog: DailySignalSendLog = {
    claim: async (_localDate, contentHash, attemptedAt) => {
      const decision = evaluateExistingDailySignalClaim(existing, contentHash, attemptedAt);
      if (decision !== "reclaim") {
        return { claimed: false, reason: decision };
      }
      existing = { status: "sending", content_hash: contentHash, attempted_at: attemptedAt };
      return { claimed: true };
    },
    markSent: async () => {
      existing = { ...existing, status: "sent" };
    },
    markFailed: async () => assert.fail("successful retry must not be marked failed")
  };
  const transport: DailySignalTransport = {
    send: async () => {
      providerCalls += 1;
      return { id: "retried-message" };
    }
  };

  const result = await runDailySignal({
    now: SEND_DATE,
    stories,
    config,
    sendLog,
    transport,
    subscriberStore: emptySubscriberStore,
    deliveryLog: acceptingDeliveryLog
  });

  assert.equal(result.status, "sent");
  assert.equal(existing.status, "sent");
  assert.equal(providerCalls, 1);
});

test("sent send blocks a retry with unchanged content", () => {
  const decision = evaluateExistingDailySignalClaim(
    { status: "sent", content_hash: "same", attempted_at: "2026-09-04T11:00:00.000Z" },
    "same",
    SEND_DATE.toISOString()
  );

  assert.equal(decision, "already-sent");
});

test("in-progress send blocks an overlapping retry", () => {
  const decision = evaluateExistingDailySignalClaim(
    { status: "sending", content_hash: "same", attempted_at: "2026-09-04T11:55:00.000Z" },
    "same",
    SEND_DATE.toISOString()
  );

  assert.equal(decision, "in-progress");
});

test("changed payload after a failed send is blocked to prevent accepted-but-unrecorded duplicates", () => {
  const decision = evaluateExistingDailySignalClaim(
    { status: "failed", content_hash: "old", attempted_at: "2026-09-04T11:00:00.000Z" },
    "new",
    SEND_DATE.toISOString()
  );

  assert.equal(decision, "payload-changed");
});

test("changed payload after a sent send remains blocked", () => {
  const decision = evaluateExistingDailySignalClaim(
    { status: "sent", content_hash: "old", attempted_at: "2026-09-04T11:00:00.000Z" },
    "new",
    SEND_DATE.toISOString()
  );

  assert.equal(decision, "already-sent");
});

test("Resend idempotency key is stable per request and changes with corrected transport", () => {
  const message = {
    from: "Signal > Noise <briefing@old.example>",
    recipient: "owner@example.com",
    subject: "The Signal — September 4",
    html: "<p>Briefing</p>",
    text: "Briefing"
  };
  const first = createDailySignalProviderIdempotencyKey("2026-09-04", message);
  const identical = createDailySignalProviderIdempotencyKey("2026-09-04", message);
  const corrected = createDailySignalProviderIdempotencyKey("2026-09-04", {
    ...message,
    from: "Signal > Noise <briefing@verified.example>"
  });

  assert.equal(first, identical);
  assert.notEqual(first, corrected);
  assert.ok(first.length <= 256);
});

test("provider rejection marks the send failed without reporting success", async () => {
  let failedUpdates = 0;
  const sendLog: DailySignalSendLog = {
    claim: async () => ({ claimed: true }),
    markSent: async () => assert.fail("markSent must not run after provider rejection"),
    markFailed: async () => {
      failedUpdates += 1;
    }
  };
  const transport: DailySignalTransport = {
    send: async () => {
      throw new Error("provider unavailable");
    }
  };
  const result = await runDailySignal({
    now: SEND_DATE,
    stories,
    config,
    sendLog,
    transport,
    subscriberStore: emptySubscriberStore,
    deliveryLog: acceptingDeliveryLog
  });

  assert.equal(result.status, "failed");
  assert.equal(result.success, false);
  assert.equal(failedUpdates, 1);
});

test("empty story sets skip cleanly without claiming or sending", async () => {
  let claimed = false;
  const sendLog: DailySignalSendLog = {
    claim: async () => {
      claimed = true;
      return { claimed: true };
    },
    markSent: async () => undefined,
    markFailed: async () => undefined
  };
  const result = await runDailySignal({ now: SEND_DATE, stories: [], config, sendLog });

  assert.equal(result.status, "insufficient-stories");
  assert.equal(claimed, false);
});


test("campaign recovery renders the saved issue without rereading current inventory", async () => {
  const selection = selectDailySignalStories(stories, SEND_DATE.getTime())!;
  let snapshotRead = false;
  let deliveredHtml = '';
  const sendLog: DailySignalSendLog = {
    loadSelection: async () => { snapshotRead = true; return selection; },
    claim: async (_date, _hash, _attempt, snapshot) => {
      assert.deepEqual(snapshot, selection);
      return { claimed: true };
    },
    markSent: async () => undefined,
    markFailed: async () => assert.fail('Saved issue should send')
  };
  const result = await runDailySignal({
    now: new Date('2026-09-04T12:30:00Z'), config, sendLog,
    subscriberStore: emptySubscriberStore, deliveryLog: acceptingDeliveryLog,
    transport: { send: async message => { deliveredHtml = message.html; return {id:'saved-issue'}; } }
  });
  assert.equal(snapshotRead, true);
  assert.equal(result.status, 'sent');
  assert.equal(deliveredHtml, renderDailySignalEmail(selection, new Date('2026-09-04T12:10:00Z')).html);
});
