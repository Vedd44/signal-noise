import { getSupabaseServiceClient } from "@/lib/db";
import {
  evaluateExistingDailySignalClaim,
  type DailySignalClaimResult,
  type ExistingDailySignalSend
} from "@/lib/email/send-log";

export type DailySignalDeliveryLog = {
  claim(localDate: string, recipientHash: string, subscriberId: string | null, recipientType: "owner" | "subscriber", contentHash: string, attemptedAt: string): Promise<DailySignalClaimResult>;
  markSent(localDate: string, recipientHash: string, providerMessageId: string, sentAt: string): Promise<void>;
  markFailed(localDate: string, recipientHash: string, failedAt: string): Promise<void>;
};

export function createSupabaseDailySignalDeliveryLog(): DailySignalDeliveryLog {
  const supabase = getSupabaseServiceClient();
  return {
    async claim(localDate, recipientHash, subscriberId, recipientType, contentHash, attemptedAt) {
      const inserted = await supabase.from("daily_signal_deliveries").insert({
        local_date: localDate,
        recipient_hash: recipientHash,
        subscriber_id: subscriberId,
        recipient_type: recipientType,
        status: "sending",
        content_hash: contentHash,
        attempted_at: attemptedAt,
        updated_at: attemptedAt
      }).select("recipient_hash").maybeSingle();

      if (!inserted.error && inserted.data) return { claimed: true };
      if (inserted.error?.code !== "23505") throw new Error(inserted.error?.message ?? "Unable to create delivery claim");

      const result = await supabase.from("daily_signal_deliveries")
        .select("status, content_hash, attempted_at")
        .eq("local_date", localDate).eq("recipient_hash", recipientHash).maybeSingle();
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Unable to read delivery claim");

      const existing = result.data as ExistingDailySignalSend;
      const decision = evaluateExistingDailySignalClaim(existing, contentHash, attemptedAt);
      if (decision !== "reclaim") return { claimed: false, reason: decision };

      const reclaimed = await supabase.from("daily_signal_deliveries").update({
        status: "sending", content_hash: contentHash, provider_message_id: null,
        sent_at: null, attempted_at: attemptedAt, updated_at: attemptedAt
      }).eq("local_date", localDate).eq("recipient_hash", recipientHash)
        .eq("status", existing.status).eq("attempted_at", existing.attempted_at)
        .select("recipient_hash").maybeSingle();
      if (reclaimed.error) throw new Error(reclaimed.error.message);
      return reclaimed.data ? { claimed: true } : { claimed: false, reason: "in-progress" };
    },

    async markSent(localDate, recipientHash, providerMessageId, sentAt) {
      const result = await supabase.from("daily_signal_deliveries").update({
        status: "sent", provider_message_id: providerMessageId, sent_at: sentAt, updated_at: sentAt
      }).eq("local_date", localDate).eq("recipient_hash", recipientHash).eq("status", "sending")
        .select("recipient_hash").maybeSingle();
      if (result.error || !result.data) throw new Error(result.error?.message ?? "Delivery sent status was not updated");
    },

    async markFailed(localDate, recipientHash, failedAt) {
      const result = await supabase.from("daily_signal_deliveries")
        .update({ status: "failed", updated_at: failedAt })
        .eq("local_date", localDate).eq("recipient_hash", recipientHash).eq("status", "sending");
      if (result.error) throw new Error(result.error.message);
    }
  };
}
