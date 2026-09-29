import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runDailySignal } from "@/lib/email/daily-signal";
import type { DailySignalDeliveryLog } from "@/lib/email/delivery-log";
import type { DailySignalSendLog, ExistingDailySignalSend } from "@/lib/email/send-log";
import { evaluateExistingDailySignalClaim } from "@/lib/email/send-log";
import {
  createUnsubscribeToken,
  normalizeSubscriberEmail,
  subscribeToDailySignal,
  unsubscribeFromDailySignal,
  verifyUnsubscribeToken,
  type DailySignalSubscriberStore
} from "@/lib/email/subscribers";
import type { DailySignalTransport, DailySignalTransportMessage } from "@/lib/email/transport";
import { subscriptionResult } from "@/lib/subscription-form";
import type { Story, StoryTag } from "@/types/story";

const NOW = new Date("2026-09-04T12:00:00.000Z");
const SECRET = "a-secure-test-secret-with-at-least-32-characters";
const OWNER = "owner@example.com";
const ACTIVE_ID = "7c1ff353-1395-4fe6-9179-aa41f42d44cc";
const OTHER_ID = "34993467-87be-45e0-a750-26eb7084d9e0";

function story(index: number): Story {
  const tags: StoryTag[] = ["AI", "Media", "Product", "Strategy", "Business", "Consumer Tech"];
  const time = new Date(NOW.getTime() - index * 3_600_000).toISOString();
  return {
    id: `subscription-story-${index}`,
    title: `Subscription story ${index}`,
    url: `https://publisher.example/subscription-${index}`,
    source: `Publisher ${index % 3}`,
    source_type: "reporting",
    published_at: time,
    summary: `Summary ${index}`,
    why_it_matters: `Signal ${index}`,
    tag: tags[index % tags.length],
    score: 100 - index,
    created_at: time,
    updated_at: time,
    status: "published"
  };
}

const stories = Array.from({ length: 10 }, (_, index) => story(index));

function memorySubscriberStore(initial: Array<{ id: string; email: string; status: "active" | "unsubscribed" }> = []) {
  const rows = [...initial];
  const store: DailySignalSubscriberStore = {
    async subscribe(email) {
      const existing = rows.find((row) => row.email === email);
      if (existing) existing.status = "active";
      else rows.push({ id: OTHER_ID, email, status: "active" });
    },
    async listActive() {
      return rows.filter((row) => row.status === "active").map(({ id, email }) => ({ id, email }));
    },
    async unsubscribe(id) {
      const row = rows.find((candidate) => candidate.id === id);
      if (row) row.status = "unsubscribed";
    }
  };
  return { rows, store };
}

test("signup validates and normalizes email without duplicating an active subscriber", async () => {
  const memory = memorySubscriberStore();
  assert.equal(normalizeSubscriberEmail("  PERSON@Example.COM "), "person@example.com");
  assert.equal(normalizeSubscriberEmail("not-an-email"), null);
  assert.deepEqual(await subscribeToDailySignal("bad", memory.store), { success: false, reason: "invalid-email" });
  await subscribeToDailySignal("  PERSON@Example.COM ", memory.store);
  await subscribeToDailySignal("person@example.com", memory.store);
  assert.equal(memory.rows.length, 1);
  assert.equal(memory.rows[0].email, "person@example.com");
});

test("an unsubscribed address can safely reactivate", async () => {
  const memory = memorySubscriberStore([{ id: ACTIVE_ID, email: "person@example.com", status: "unsubscribed" }]);
  await subscribeToDailySignal("PERSON@example.com", memory.store);
  assert.equal(memory.rows[0].status, "active");
  assert.equal(memory.rows.length, 1);
});

test("signed unsubscribe is valid, tamper-resistant, successful, and repeat-safe", async () => {
  const memory = memorySubscriberStore([{ id: ACTIVE_ID, email: "person@example.com", status: "active" }]);
  const token = createUnsubscribeToken(ACTIVE_ID, SECRET);
  assert.equal(verifyUnsubscribeToken(token, SECRET), ACTIVE_ID);
  assert.equal(verifyUnsubscribeToken(`${token}x`, SECRET), null);
  assert.deepEqual(await unsubscribeFromDailySignal(token, memory.store, NOW.toISOString(), SECRET), { success: true });
  assert.deepEqual(await unsubscribeFromDailySignal(token, memory.store, NOW.toISOString(), SECRET), { success: true });
  assert.equal(memory.rows[0].status, "unsubscribed");
});

test("subscriber tables enable RLS without public access policies", async () => {
  const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  assert.match(schema, /alter table public\.daily_signal_subscribers enable row level security/i);
  assert.match(schema, /alter table public\.daily_signal_deliveries enable row level security/i);
  assert.doesNotMatch(schema, /create policy[^;]+on public\.daily_signal_subscribers/i);
  assert.doesNotMatch(schema, /create policy[^;]+on public\.daily_signal_deliveries/i);
  assert.match(schema, /revoke all on table public\.daily_signal_subscribers from anon, authenticated/i);
  assert.match(schema, /revoke all on table public\.daily_signal_deliveries from anon, authenticated/i);
  assert.match(schema, /grant all on table public\.daily_signal_subscribers to service_role/i);
  assert.match(schema, /grant all on table public\.daily_signal_deliveries to service_role/i);
});

test("subscriber form preserves accessible markup, approved copy, success, and safe error states", async () => {
  assert.deepEqual(subscriptionResult(true), { status: "success" });
  assert.equal(subscriptionResult(false).status, "error");
  const component = await readFile(new URL("../components/DailySignalSignup.tsx", import.meta.url), "utf8");
  assert.match(component, /htmlFor="daily-signal-email"/);
  assert.match(component, /id="daily-signal-email"/);
  assert.match(component, /aria-describedby="daily-signal-support daily-signal-error"/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /The signal, before the noise\./);
  assert.match(component, /You’re in\./);
  assert.match(component, /Your first Daily Signal will arrive tomorrow morning\./);
});

test("daily delivery preserves owner, includes only active subscribers, dedupes owner, and isolates addresses", async () => {
  const subscriberStore = memorySubscriberStore([
    { id: ACTIVE_ID, email: "reader@example.com", status: "active" },
    { id: OTHER_ID, email: "OWNER@example.com", status: "active" },
    { id: "a71143b4-b153-49aa-a45a-03488a3aa62f", email: "gone@example.com", status: "unsubscribed" }
  ]).store;
  const messages: DailySignalTransportMessage[] = [];
  const transport: DailySignalTransport = { send: async (message) => { messages.push(message); return { id: `id-${messages.length}` }; } };
  const sendLog: DailySignalSendLog = { claim: async () => ({ claimed: true }), markSent: async () => undefined, markFailed: async () => undefined };
  const deliveryLog: DailySignalDeliveryLog = { claim: async () => ({ claimed: true }), markSent: async () => undefined, markFailed: async () => undefined };

  const result = await runDailySignal({
    now: NOW,
    stories,
    config: { apiKey: "test", recipient: OWNER, from: "Signal > Noise <signal@example.com>" },
    subscriberStore,
    sendLog,
    deliveryLog,
    transport,
    unsubscribeSecret: SECRET
  });

  assert.equal(result.status, "sent");
  assert.deepEqual(messages.map((message) => message.recipient), [OWNER, "reader@example.com"]);
  assert.doesNotMatch(messages[0].html, /Unsubscribe/);
  assert.match(messages[1].html, /Unsubscribe/);
  assert.doesNotMatch(messages[0].text, /Unsubscribe/);
  assert.match(messages[1].text, /Unsubscribe\nhttps:\/\/www\.signalbrief\.xyz\/daily-signal\/unsubscribe\?token=/);
  const tokenMatch = messages[1].html.match(/unsubscribe\?token=([^"&]+)/);
  assert.ok(tokenMatch);
  assert.equal(verifyUnsubscribeToken(decodeURIComponent(tokenMatch[1]), SECRET), ACTIVE_ID);
  assert.doesNotMatch(messages[1].html, new RegExp(SECRET));
  for (const message of messages) {
    for (const other of messages) {
      if (other.recipient !== message.recipient) assert.doesNotMatch(message.html, new RegExp(other.recipient));
    }
  }
});

test("a 20-recipient partial failure continues, then retries only recipient 13", async () => {
  let campaign: ExistingDailySignalSend | null = null;
  const deliveryStates = new Map<string, ExistingDailySignalSend>();
  const attempts: string[] = [];
  const idempotencyKeys: string[] = [];
  let failRecipient13 = true;
  const sendLog: DailySignalSendLog = {
    async claim(_date, contentHash, attemptedAt) {
      if (!campaign) { campaign = { status: "sending", content_hash: contentHash, attempted_at: attemptedAt }; return { claimed: true }; }
      const decision = evaluateExistingDailySignalClaim(campaign, contentHash, attemptedAt);
      if (decision !== "reclaim") return { claimed: false, reason: decision };
      campaign = { status: "sending", content_hash: contentHash, attempted_at: attemptedAt };
      return { claimed: true };
    },
    async markSent() { if (campaign) campaign.status = "sent"; },
    async markFailed() { if (campaign) campaign.status = "failed"; }
  };
  const deliveryLog: DailySignalDeliveryLog = {
    async claim(_date, hash, _id, _type, contentHash, attemptedAt) {
      const existing = deliveryStates.get(hash);
      if (!existing) { deliveryStates.set(hash, { status: "sending", content_hash: contentHash, attempted_at: attemptedAt }); return { claimed: true }; }
      const decision = evaluateExistingDailySignalClaim(existing, contentHash, attemptedAt);
      if (decision !== "reclaim") return { claimed: false, reason: decision };
      deliveryStates.set(hash, { status: "sending", content_hash: contentHash, attempted_at: attemptedAt });
      return { claimed: true };
    },
    async markSent(_date, hash) { const row = deliveryStates.get(hash); if (row) row.status = "sent"; },
    async markFailed(_date, hash) { const row = deliveryStates.get(hash); if (row) row.status = "failed"; }
  };
  const transport: DailySignalTransport = {
    async send(message) {
      attempts.push(message.recipient);
      if (message.recipient === "recipient-13@example.com") {
        idempotencyKeys.push(message.idempotencyKey);
        if (failRecipient13) throw new Error("temporary failure");
      }
      return { id: `id-${attempts.length}` };
    }
  };
  const subscriberStore = memorySubscriberStore(
    Array.from({ length: 19 }, (_, index) => {
      const recipientNumber = index + 2;
      return {
        id: `00000000-0000-4000-8000-${String(recipientNumber).padStart(12, "0")}`,
        email: `recipient-${String(recipientNumber).padStart(2, "0")}@example.com`,
        status: "active" as const
      };
    })
  ).store;
  const options = {
    now: NOW,
    stories,
    config: { apiKey: "test", recipient: "recipient-01@example.com", from: "Signal > Noise <signal@example.com>" },
    subscriberStore,
    sendLog,
    deliveryLog,
    transport,
    unsubscribeSecret: SECRET
  };

  assert.equal((await runDailySignal(options)).status, "failed");
  assert.equal(attempts.length, 20);
  assert.deepEqual(
    attempts,
    Array.from({ length: 20 }, (_, index) => `recipient-${String(index + 1).padStart(2, "0")}@example.com`)
  );

  failRecipient13 = false;
  assert.equal((await runDailySignal(options)).status, "sent");
  assert.equal(attempts.length, 21);
  assert.equal(attempts[20], "recipient-13@example.com");
  assert.equal(idempotencyKeys.length, 2);
  assert.equal(idempotencyKeys[0], idempotencyKeys[1]);
  assert.equal(deliveryStates.size, 20);
  assert.equal([...deliveryStates.values()].every((row) => row.status === "sent"), true);

  assert.equal((await runDailySignal(options)).status, "duplicate");
  assert.equal(attempts.length, 21);
});
