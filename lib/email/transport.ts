export type EmailPayload = {
  from: string; to: string[]; subject: string; html: string; text: string;
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
};

/** Bounded provider calls; never include addresses in thrown provider errors. */
export async function sendEmail(apiKey: string, payload: EmailPayload, idempotencyKey: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000)
    });
    if (response.status === 429 && attempt === 0) {
      await new Promise(resolve => setTimeout(resolve, 650));
      continue;
    }
    const data = await response.json();
    if (!response.ok || typeof data.id !== 'string') throw new Error(`Email provider failed (${response.status})`);
    return { id: data.id as string };
  }
  throw new Error('Email provider rate limit');
}

export type DailySignalEmailConfig = {
  apiKey: string;
  recipient: string;
  from: string;
};

export type DailySignalTransportMessage = {
  from: string;
  recipient: string;
  subject: string;
  html: string;
  text: string;
  localDate: string;
  idempotencyKey: string;
  unsubscribeUrl?: string;
};

export type DailySignalTransport = {
  send(message: DailySignalTransportMessage): Promise<{ id: string }>;
};

function getRequiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in environment variables`);
  return value;
}

export function formatSignalBriefFrom(value: string) {
  const start = value.lastIndexOf("<");
  const end = value.lastIndexOf(">");
  const address = start >= 0 && end > start ? value.slice(start + 1, end).trim() : value.trim();
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
  return {
    async send(message) {
      return sendEmail(apiKey,
        {
          from: message.from,
          to: [message.recipient],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.unsubscribeUrl ? { headers: {
            'List-Unsubscribe': `<${message.unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
          } } : {}),
          tags: [{ name: "briefing", value: "daily-signal" }]
        },
        message.idempotencyKey
      );
    }
  };
}
