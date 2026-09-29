import { createHash } from "node:crypto";

import { getPublishedStories } from "@/lib/data";
import { renderDailySignalEmail } from "@/lib/email/render";
import { createSupabaseDailySignalDeliveryLog, type DailySignalDeliveryLog } from "@/lib/email/delivery-log";
import { getDailySignalLocalTime, isDailySignalSendWindow } from "@/lib/email/schedule";
import {
  createSupabaseDailySignalSendLog,
  type DailySignalSendLog
} from "@/lib/email/send-log";
import { selectDailySignalStories } from "@/lib/email/selection";
import {
  createResendTransport,
  getDailySignalEmailConfig,
  type DailySignalEmailConfig,
  type DailySignalTransport
} from "@/lib/email/transport";
import type { Story } from "@/types/story";
import { SITE_URL } from "@/lib/site";
import {
  createSupabaseSubscriberStore,
  createUnsubscribeToken,
  normalizeSubscriberEmail,
  type DailySignalSubscriberStore
} from "@/lib/email/subscribers";

export type DailySignalRunStatus =
  | "sent"
  | "duplicate"
  | "outside-window"
  | "insufficient-stories"
  | "failed";

export type DailySignalRunResult = {
  success: boolean;
  status: DailySignalRunStatus;
  localDate: string;
  selected: {
    leadId: string | null;
    worthKnowingIds: string[];
    onRadarIds: string[];
  };
  providerMessageId?: string;
  deliveries?: { total: number; sent: number; skipped: number; failed: number };
  reason?: string;
};

export function getDailySignalHttpStatus(result: Pick<DailySignalRunResult, "status">) {
  return result.status === "failed" ? 500 : 200;
}

type RunDailySignalOptions = {
  now?: Date;
  enforceSendWindow?: boolean;
  stories?: Story[];
  loadStories?: () => Promise<Story[]>;
  storyRetryDelayMs?: number;
  config?: DailySignalEmailConfig;
  sendLog?: DailySignalSendLog;
  transport?: DailySignalTransport;
  subscriberStore?: DailySignalSubscriberStore;
  deliveryLog?: DailySignalDeliveryLog;
  unsubscribeSecret?: string;
};

const EMPTY_SELECTION = {
  leadId: null,
  worthKnowingIds: [],
  onRadarIds: []
};

const STORY_RETRY_DELAY_MS = 300;
const MAX_STORY_RETRY_DELAY_MS = 1_000;

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string"
      ? String((error as Record<string, unknown>).message)
      : "Unknown error";
  return message.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");
}

function isTransientStoryQueryError(error: unknown) {
  const details = error && typeof error === "object"
    ? error as Record<string, unknown>
    : {};
  const status = typeof details.status === "number" ? details.status : undefined;
  const code = typeof details.code === "string" ? details.code : "";
  const message = [safeErrorMessage(error), code, details.details, details.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  return (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    error instanceof TypeError ||
    details.name === "AbortError" ||
    /\b(?:http\s*)?(?:502|503|504)\b|bad gateway|gateway timeout|service unavailable|fetch failed|network(?: error| failure)?|temporar(?:y|ily)|econnreset|etimedout|socket hang up/i.test(message)
  );
}

async function loadStoryInventory(options: RunDailySignalOptions) {
  const loadStories = options.loadStories ??
    (async () => (await getPublishedStories({ throwOnError: true })).stories);
  const retryDelayMs = Math.max(
    0,
    Math.min(options.storyRetryDelayMs ?? STORY_RETRY_DELAY_MS, MAX_STORY_RETRY_DELAY_MS)
  );

  try {
    return await loadStories();
  } catch (error) {
    if (!isTransientStoryQueryError(error)) throw error;

    console.warn(
      "[daily-signal] story retrieval retry",
      JSON.stringify({ event: "story_inventory_retry", attempt: 2, error: safeErrorMessage(error) })
    );
    if (retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
    return loadStories();
  }
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createDailySignalProviderIdempotencyKey(
  localDate: string,
  message: {
    from: string;
    recipient: string;
    subject: string;
    html: string;
    text: string;
  }
) {
  return `daily-signal/${localDate}/${sha256(message)}`;
}

export async function runDailySignal(
  options: RunDailySignalOptions = {}
): Promise<DailySignalRunResult> {
  const now = options.now ?? new Date();
  const localTime = getDailySignalLocalTime(now);
  console.log(`[daily-signal] local briefing date ${localTime.localDate}`);

  if (options.enforceSendWindow && !isDailySignalSendWindow(now)) {
    console.log("[daily-signal] skipped outside 8:10 AM America/New_York window");
    return {
      success: true,
      status: "outside-window",
      localDate: localTime.localDate,
      selected: EMPTY_SELECTION,
      reason: "Outside the 8:10 AM America/New_York send window"
    };
  }

  let stories: Story[];

  try {
    stories = options.stories ?? (await loadStoryInventory(options));
  } catch (error) {
    const reason = safeErrorMessage(error);
    console.error(
      "[daily-signal] story retrieval failed",
      JSON.stringify({ event: "story_inventory_fetch_failed", error: reason })
    );
    return {
      success: false,
      status: "failed",
      localDate: localTime.localDate,
      selected: EMPTY_SELECTION,
      reason
    };
  }

  const selection = selectDailySignalStories(stories, now.getTime());

  if (!selection) {
    console.log("[daily-signal] skipped because no eligible stories were available");
    return {
      success: true,
      status: "insufficient-stories",
      localDate: localTime.localDate,
      selected: EMPTY_SELECTION,
      reason: "No eligible stories were available"
    };
  }

  const selected = {
    leadId: selection.lead.id,
    worthKnowingIds: selection.worthKnowing.map((story) => story.id),
    onRadarIds: selection.onRadar.map((story) => story.id)
  };
  console.log(
    "[daily-signal] stories selected",
    JSON.stringify({
      leadId: selected.leadId,
      worthKnowingIds: selected.worthKnowingIds,
      onRadarIds: selected.onRadarIds
    })
  );

  let config: DailySignalEmailConfig;

  try {
    config = options.config ?? getDailySignalEmailConfig();
  } catch (error) {
    const reason = safeErrorMessage(error);
    console.error(`[daily-signal] configuration failed: ${reason}`);
    return {
      success: false,
      status: "failed",
      localDate: localTime.localDate,
      selected,
      reason
    };
  }

  let recipients: Array<{
    email: string;
    normalizedEmail: string;
    subscriberId: string | null;
    type: "owner" | "subscriber";
    rendered: ReturnType<typeof renderDailySignalEmail>;
  }>;

  try {
    const subscriberStore = options.subscriberStore ?? createSupabaseSubscriberStore();
    const subscribers = await subscriberStore.listActive();
    const ownerEmail = normalizeSubscriberEmail(config.recipient);
    if (!ownerEmail) throw new Error("DAILY_SIGNAL_RECIPIENT is not a valid email address");

    const seen = new Set([ownerEmail]);
    recipients = [{
      email: config.recipient.trim(),
      normalizedEmail: ownerEmail,
      subscriberId: null,
      type: "owner",
      rendered: renderDailySignalEmail(selection, now)
    }];

    for (const subscriber of subscribers) {
      const email = normalizeSubscriberEmail(subscriber.email);
      if (!email || seen.has(email)) continue;
      seen.add(email);
      const token = options.unsubscribeSecret
        ? createUnsubscribeToken(subscriber.id, options.unsubscribeSecret)
        : createUnsubscribeToken(subscriber.id);
      recipients.push({
        email,
        normalizedEmail: email,
        subscriberId: subscriber.id,
        type: "subscriber",
        rendered: renderDailySignalEmail(
          selection,
          now,
          `${SITE_URL}/daily-signal/unsubscribe?token=${encodeURIComponent(token)}`
        )
      });
    }
  } catch (error) {
    const reason = safeErrorMessage(error);
    console.error(`[daily-signal] recipient resolution failed: ${reason}`);
    return { success: false, status: "failed", localDate: localTime.localDate, selected, reason };
  }

  console.log(`[daily-signal] recipient count ${recipients.length}`);
  const rendered = renderDailySignalEmail(selection, now);
  const contentHash = sha256({
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text
  });
  const attemptedAt = now.toISOString();
  let sendLog: DailySignalSendLog;

  try {
    sendLog = options.sendLog ?? createSupabaseDailySignalSendLog();
    const claim = await sendLog.claim(localTime.localDate, contentHash, attemptedAt);

    if (!claim.claimed) {
      console.log(`[daily-signal] duplicate send prevented: ${claim.reason}`);
      return {
        success: true,
        status: "duplicate",
        localDate: localTime.localDate,
        selected,
        reason: claim.reason
      };
    }
  } catch (error) {
    const reason = safeErrorMessage(error);
    console.error(`[daily-signal] send claim failed: ${reason}`);
    return {
      success: false,
      status: "failed",
      localDate: localTime.localDate,
      selected,
      reason
    };
  }

  const transport = options.transport ?? createResendTransport(config.apiKey);
  const deliveryLog = options.deliveryLog ?? createSupabaseDailySignalDeliveryLog();
  const deliveries = { total: recipients.length, sent: 0, skipped: 0, failed: 0 };
  let providerMessageId: string | undefined;
  let failureReason: string | undefined;

  for (const recipient of recipients) {
    const recipientHash = sha256(recipient.normalizedEmail);
    const payloadHash = sha256({
      from: config.from,
      recipient: recipient.normalizedEmail,
      subject: recipient.rendered.subject,
      html: recipient.rendered.html,
      text: recipient.rendered.text
    });
    try {
      const deliveryClaim = await deliveryLog.claim(
        localTime.localDate,
        recipientHash,
        recipient.subscriberId,
        recipient.type,
        payloadHash,
        attemptedAt
      );
      if (!deliveryClaim.claimed) {
        if (deliveryClaim.reason === "already-sent") {
          deliveries.skipped += 1;
        } else {
          deliveries.failed += 1;
          failureReason = `Recipient delivery claim was ${deliveryClaim.reason}`;
        }
        continue;
      }

      console.log(`[daily-signal] ${recipient.type} delivery attempted ${recipientHash.slice(0, 12)}`);
      const response = await transport.send({
        from: config.from,
        recipient: recipient.email,
        subject: recipient.rendered.subject,
        html: recipient.rendered.html,
        text: recipient.rendered.text,
        localDate: localTime.localDate,
        idempotencyKey: createDailySignalProviderIdempotencyKey(localTime.localDate, {
          from: config.from,
          recipient: recipient.normalizedEmail,
          subject: recipient.rendered.subject,
          html: recipient.rendered.html,
          text: recipient.rendered.text
        })
      });
      await deliveryLog.markSent(localTime.localDate, recipientHash, response.id, new Date().toISOString());
      providerMessageId ??= response.id;
      deliveries.sent += 1;
    } catch (error) {
      failureReason = safeErrorMessage(error);
      deliveries.failed += 1;
      console.error(`[daily-signal] ${recipient.type} delivery failed ${recipientHash.slice(0, 12)}: ${failureReason}`);
      try {
        await deliveryLog.markFailed(localTime.localDate, recipientHash, new Date().toISOString());
      } catch (markError) {
        console.error(`[daily-signal] delivery failure status update failed: ${safeErrorMessage(markError)}`);
      }
    }
  }

  if (deliveries.failed > 0) {
    try {
      await sendLog.markFailed(localTime.localDate, new Date().toISOString());
    } catch (markError) {
      console.error(`[daily-signal] campaign failure status update failed: ${safeErrorMessage(markError)}`);
    }
    return {
      success: false,
      status: "failed",
      localDate: localTime.localDate,
      selected,
      providerMessageId,
      deliveries,
      reason: failureReason ?? "One or more recipient deliveries failed"
    };
  }

  try {
    await sendLog.markSent(localTime.localDate, providerMessageId ?? "recipient-deliveries-complete", new Date().toISOString());
  } catch (error) {
    const reason = safeErrorMessage(error);
    console.error(`[daily-signal] provider accepted but send log update failed: ${reason}`);
    return {
      success: false,
      status: "failed",
      localDate: localTime.localDate,
      selected,
      providerMessageId,
      deliveries,
      reason
    };
  }

  return {
    success: true,
    status: "sent",
    localDate: localTime.localDate,
    selected,
    providerMessageId,
    deliveries
  };
}
