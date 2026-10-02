import type { DailySignalSelection } from "@/lib/email/selection";
import { getSupabaseServiceClient } from "@/lib/db";

export type DailySignalClaimResult =
  | { claimed: true }
  | {
      claimed: false;
      reason: "already-sent" | "in-progress" | "payload-changed";
    };

export type DailySignalSendLog = {
  loadSelection?(localDate: string): Promise<DailySignalSelection | null>;
  claim(localDate: string, contentHash: string, attemptedAt: string, selection?: DailySignalSelection): Promise<DailySignalClaimResult>;
  markSent(localDate: string, providerMessageId: string, sentAt: string): Promise<void>;
  markFailed(localDate: string, failedAt: string): Promise<void>;
};

export type ExistingDailySignalSend = {
  status: "sending" | "sent" | "failed";
  content_hash: string;
  attempted_at: string;
};

const STALE_SEND_MINUTES = 15;
const RESEND_IDEMPOTENCY_HOURS = 23;

export function evaluateExistingDailySignalClaim(
  existing: ExistingDailySignalSend,
  contentHash: string,
  attemptedAt: string
): "reclaim" | Exclude<DailySignalClaimResult, { claimed: true }>["reason"] {
  if (existing.status === "sent") {
    return "already-sent";
  }

  if (existing.content_hash !== contentHash) {
    return "payload-changed";
  }

  const attemptedTime = Date.parse(existing.attempted_at);
  const currentTime = Date.parse(attemptedAt);
  const ageMinutes = (currentTime - attemptedTime) / (1000 * 60);

  return (existing.status === "failed" || ageMinutes >= STALE_SEND_MINUTES) &&
    ageMinutes <= RESEND_IDEMPOTENCY_HOURS * 60
    ? "reclaim"
    : "in-progress";
}

export function createSupabaseDailySignalSendLog(): DailySignalSendLog {
  const supabase = getSupabaseServiceClient();

  return {
    async loadSelection(localDate) {
      const result = await supabase.from("daily_signal_sends").select("selection_snapshot").eq("local_date",localDate).maybeSingle();
      if (result.error) throw new Error("Campaign snapshot unavailable");
      return (result.data?.selection_snapshot as DailySignalSelection) ?? null;
    },
    async claim(localDate, contentHash, attemptedAt, selection) {
      const inserted = await supabase
        .from("daily_signal_sends")
        .insert({
          local_date: localDate,
          selection_snapshot: selection ?? null,
          status: "sending",
          content_hash: contentHash,
          attempted_at: attemptedAt,
          updated_at: attemptedAt
        })
        .select("local_date")
        .maybeSingle();

      if (!inserted.error && inserted.data) {
        return { claimed: true };
      }

      if (inserted.error?.code !== "23505") {
        throw new Error(inserted.error?.message ?? "Unable to create Daily Signal send claim");
      }

      const existingResult = await supabase
        .from("daily_signal_sends")
        .select("status, content_hash, attempted_at")
        .eq("local_date", localDate)
        .maybeSingle();

      if (existingResult.error || !existingResult.data) {
        throw new Error(existingResult.error?.message ?? "Unable to read Daily Signal send claim");
      }

      const existing = existingResult.data as ExistingDailySignalSend;
      const decision = evaluateExistingDailySignalClaim(existing, contentHash, attemptedAt);

      if (decision !== "reclaim") {
        return { claimed: false, reason: decision };
      }

      const reclaimed = await supabase
        .from("daily_signal_sends")
        .update({
          status: "sending",
          content_hash: contentHash,
          provider_message_id: null,
          sent_at: null,
          attempted_at: attemptedAt,
          updated_at: attemptedAt
        })
        .eq("local_date", localDate)
        .eq("status", existing.status)
        .eq("attempted_at", existing.attempted_at)
        .select("local_date")
        .maybeSingle();

      if (reclaimed.error) {
        throw new Error(reclaimed.error.message);
      }

      return reclaimed.data
        ? { claimed: true }
        : { claimed: false, reason: "in-progress" };
    },

    async markSent(localDate, providerMessageId, sentAt) {
      const result = await supabase
        .from("daily_signal_sends")
        .update({
          status: "sent",
          provider_message_id: providerMessageId,
          sent_at: sentAt,
          updated_at: sentAt
        })
        .eq("local_date", localDate)
        .eq("status", "sending")
        .select("local_date")
        .maybeSingle();

      if (result.error || !result.data) {
        throw new Error(result.error?.message ?? "Daily Signal sent status was not updated");
      }
    },

    async markFailed(localDate, failedAt) {
      const result = await supabase
        .from("daily_signal_sends")
        .update({ status: "failed", updated_at: failedAt })
        .eq("local_date", localDate)
        .eq("status", "sending")
        .select("local_date")
        .maybeSingle();

      if (result.error || !result.data) {
        throw new Error(result.error?.message ?? "Daily Signal failed status was not updated");
      }
    }
  };
}
