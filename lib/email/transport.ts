import { Resend } from "resend";

export type DailySignalEmailConfig = { apiKey: string; recipient: string; from: string; };
export type DailySignalTransportMessage = { from: string; recipient: string; subject: string; html: string; text: string; localDate: string; idempotencyKey: string; };
export type DailySignalTransport = { send(message: DailySignalTransportMessage): Promise<{ id: string }>; };

function getRequiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in environment variables`);
  return value;
}

export function formatSignalBriefFrom(value: string) {
  const addressMatch = value.match(/<([^>]+)>\s*$/);
  const address = addressMatch?.[1]?.trim() || value.trim();
  return `Signal Brief <${address}>`;
}

export function getDailySignalEmailConfig(): DailySignalEmailConfig {
  return {
    apiKey: getRequiredEnvironmentValue("RESEND_API_KEY"),
    recipient: getRequiredEnvironmentValue("DAILY_SIGNAL_RECIPIENT"),
    from: formatSignalBriefFrom(getRequiredEnvironmentValue("DAILY_SIGNAL_FROM"))
  };
}

export function createResendTransport(apiKey: string): DailySignalTransport {
  const resend = new Resend(apiKey);
  return {
    async send(message) {
      const { data, error } = await resend.emails.send(
        { from: message.from, to: [message.recipient], subject: message.subject, html: message.html, text: message.text, tags: [{ name: "briefing", value: "daily-signal" }] },
        { idempotencyKey: message.idempotencyKey }
      );
      if (error || !data?.id) throw new Error(error?.message ?? "Resend did not return a message ID");
      return { id: data.id };
    }
  };
}
