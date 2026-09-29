"use client";

import { useState } from "react";

export function UnsubscribeControl({ token }: { token: string }) {
  const [status, setStatus] = useState<"ready" | "submitting" | "success" | "error">("ready");

  async function unsubscribe() {
    setStatus("submitting");
    try {
      const response = await fetch("/api/daily-signal/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token })
      });
      setStatus(response.ok ? "success" : "error");
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
    <div className="unsubscribe-state">
      <p className="daily-signal-eyebrow">Daily Signal</p>
      <h1>Leave the Daily Signal?</h1>
      <p>You can unsubscribe from the morning email below.</p>
      <button type="button" onClick={unsubscribe} disabled={status === "submitting"}>
        {status === "submitting" ? "UNSUBSCRIBING…" : "UNSUBSCRIBE"}
      </button>
      {status === "error" ? <p className="daily-signal-error" role="alert">We couldn’t unsubscribe you. Please try again.</p> : null}
    </div>
  );
}
