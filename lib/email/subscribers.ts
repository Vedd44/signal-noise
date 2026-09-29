import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getSupabaseServiceClient } from "@/lib/db";

export type DailySignalSubscriber = {
  id: string;
  email: string;
};

export type DailySignalSubscriberStore = {
  subscribe(email: string, now: string): Promise<void>;
  listActive(): Promise<DailySignalSubscriber[]>;
  unsubscribe(id: string, now: string): Promise<void>;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeSubscriberEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

export function subscriberLogId(email: string) {
  return createHash("sha256").update(email).digest("hex").slice(0, 12);
}

export async function subscribeToDailySignal(
  value: unknown,
  store: DailySignalSubscriberStore,
  now = new Date().toISOString()
) {
  const email = normalizeSubscriberEmail(value);
  if (!email) return { success: false as const, reason: "invalid-email" as const };
  await store.subscribe(email, now);
  return { success: true as const, email };
}

export async function unsubscribeFromDailySignal(
  token: unknown,
  store: DailySignalSubscriberStore,
  now = new Date().toISOString(),
  secret?: string
) {
  const id = secret ? verifyUnsubscribeToken(token, secret) : verifyUnsubscribeToken(token);
  if (!id) return { success: false as const, reason: "invalid-token" as const };
  await store.unsubscribe(id, now);
  return { success: true as const };
}

export function createSupabaseSubscriberStore(): DailySignalSubscriberStore {
  const supabase = getSupabaseServiceClient();

  return {
    async subscribe(email, now) {
      const existing = await supabase
        .from("daily_signal_subscribers")
        .select("id, status")
        .eq("email", email)
        .maybeSingle();

      if (existing.error) throw new Error(existing.error.message);
      if (existing.data?.status === "active") return;

      if (existing.data) {
        const reactivated = await supabase
          .from("daily_signal_subscribers")
          .update({ status: "active", subscribed_at: now, unsubscribed_at: null, updated_at: now })
          .eq("id", existing.data.id);
        if (reactivated.error) throw new Error(reactivated.error.message);
        return;
      }

      const inserted = await supabase.from("daily_signal_subscribers").insert({
        email,
        status: "active",
        subscribed_at: now,
        updated_at: now
      });

      // A concurrent request may have inserted the same normalized address.
      if (inserted.error?.code === "23505") {
        const reactivated = await supabase
          .from("daily_signal_subscribers")
          .update({ status: "active", subscribed_at: now, unsubscribed_at: null, updated_at: now })
          .eq("email", email)
          .eq("status", "unsubscribed");
        if (reactivated.error) throw new Error(reactivated.error.message);
        return;
      }
      if (inserted.error) throw new Error(inserted.error.message);
    },

    async listActive() {
      const result = await supabase
        .from("daily_signal_subscribers")
        .select("id, email")
        .eq("status", "active");
      if (result.error) throw new Error(result.error.message);
      return (result.data ?? []) as DailySignalSubscriber[];
    },

    async unsubscribe(id, now) {
      const result = await supabase
        .from("daily_signal_subscribers")
        .update({ status: "unsubscribed", unsubscribed_at: now, updated_at: now })
        .eq("id", id)
        .eq("status", "active");
      if (result.error) throw new Error(result.error.message);
    }
  };
}

function unsubscribeSecret() {
  const secret = process.env.DAILY_SIGNAL_UNSUBSCRIBE_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("Missing or weak DAILY_SIGNAL_UNSUBSCRIBE_SECRET in environment variables");
  }
  return secret;
}

export function createUnsubscribeToken(subscriberId: string, secret = unsubscribeSecret()) {
  const signature = createHmac("sha256", secret).update(subscriberId).digest("base64url");
  return `${subscriberId}.${signature}`;
}

export function verifyUnsubscribeToken(token: unknown, secret = unsubscribeSecret()) {
  if (typeof token !== "string") return null;
  const [id, suppliedSignature, extra] = token.split(".");
  if (extra || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  const expected = createHmac("sha256", secret).update(id).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return null;
  }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? id : null;
}
