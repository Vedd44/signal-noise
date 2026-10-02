"use client";

import { useState } from "react";

export function UnsubscribeControl({ token }: { token: string }) {
  const [status, setStatus] = useState<"ready" | "submitting" | "success" | "error">("ready");
  const [error, setError] = useState('We couldn’t unsubscribe you. Please try again.');

  async function unsubscribe() {
    if (status === "submitting") return;
    setStatus("submitting");
    try {
      const response = await fetch("/api/daily-signal/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(15_000)
      });
      if (response.status === 400) setError('This link is invalid. Use the unsubscribe link in your latest Daily Signal email.');
      else setError('We couldn’t unsubscribe you. Please try again.');
      setStatus(response.ok ? "success" : "error");
      if (response.ok) window.history.replaceState(null, "", "/daily-signal/unsubscribe");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="unsubscribe-state" role="status">
        <p className="daily-signal-eyebrow">Daily Signal</p>
        <h1>You’re unsubscribed.</h1>
        <p>You won’t receive the Daily Signal anymore.</p>
      </div>
    );
  }

  return (
    <div className="unsubscribe-state" aria-live="polite">
      <p className="daily-signal-eyebrow">Daily Signal</p>
      <h1>Leave the Daily Signal?</h1>
      <p>You can unsubscribe from the morning email below.</p>
      <button type="button" onClick={unsubscribe} disabled={status === "submitting"}>
        {status === "submitting" ? "UNSUBSCRIBING…" : "UNSUBSCRIBE"}
      </button>
      {status === "error" ? <p className="daily-signal-error" role="alert">{error}</p> : null}
    </div>
  );
}
