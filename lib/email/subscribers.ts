import { createHmac, timingSafeEqual } from "node:crypto";

import { getSupabaseServiceClient } from "@/lib/db";

export type DailySignalSubscriber = {
  id: string;
  email: string;
};

export type DailySignalSubscriberStore = {
  listActive(): Promise<DailySignalSubscriber[]>;
  unsubscribe(id: string, now: string): Promise<void>;
};

const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function normalizeSubscriberEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  const local = email.split("@")[0];
  return email.length <= 254 && local.length <= 64 && !local.startsWith(".") && !local.endsWith(".") && !local.includes("..") && EMAIL_PATTERN.test(email) ? email : null;
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
    async listActive() {
      const subscribers: DailySignalSubscriber[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from("daily_signal_subscribers").select("id, email")
          .eq("status", "active").order("id").range(offset, offset + 499);
        if (result.error) throw new Error("Subscriber list unavailable");
        subscribers.push(...(result.data ?? []) as DailySignalSubscriber[]);
        if ((result.data?.length ?? 0) < 500) return subscribers;
      }
    },

    async unsubscribe(id, now) {
      const result = await supabase
        .from("daily_signal_subscribers")
        .update({ status: "unsubscribed", unsubscribed_at: now, updated_at: now, confirmation_token_hash: null, confirmation_expires_at: null, confirmation_requested_at: null })
        .eq("id", id)
        .in("status", ["active", "pending"]);
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
