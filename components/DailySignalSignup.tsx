"use client";

import { FormEvent, useRef, useState } from "react";

import { captureCampaign, track } from "@/lib/analytics";

import { subscriptionResult, type SubscriptionFormState } from "@/lib/subscription-form";

export function DailySignalSignup() {
  const [state, setState] = useState<SubscriptionFormState>({ status: "idle" });

  const started = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status === "submitting") return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    setState({ status: "submitting" });

    try {
      const response = await fetch("/api/daily-signal/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), company: data.get("company"), attribution: captureCampaign() }),
        signal: AbortSignal.timeout(15_000)
      });
      if (response.status === 400) {
        setState({ status: "error", message: "Enter a valid email address." });
        return;
      }
      if (response.status === 429) { setState({ status: "error", message: "Please wait a minute before trying again." }); return; }
      if (response.ok) track("signup_submitted");
      setState(subscriptionResult(response.ok));
    } catch {
      setState(subscriptionResult(false));
    }
  }

  const successful = state.status === "success";

  return (
    <section
      id="daily-signal"
      className={successful ? "daily-signal-signup is-success" : "daily-signal-signup"}
      aria-labelledby="daily-signal-title"
      aria-live="polite"
    >
      <div className="daily-signal-copy">
        <p className="daily-signal-eyebrow">Daily Signal</p>
        <h2 id="daily-signal-title">{successful ? "Check your inbox." : "The signal, before the noise."}</h2>
        <p>
          {successful
            ? "Confirm your email to start your morning briefing. Already subscribed? You’re all set. Check spam if the email hasn’t arrived."
            : "The Lead, three stories Worth Knowing, and what’s On the Radar — delivered to your inbox every morning."}
        </p>
      </div>

      {!successful ? (
        <form className="daily-signal-form" onSubmit={submit}>
          <label className="sr-only" htmlFor="daily-signal-email">Email address</label>
          <div className="daily-signal-fields">
            <input
              id="daily-signal-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Email address"
              required
              maxLength={254}
              onFocus={() => { if (!started.current) { started.current = true; track("signup_started"); } }}
              aria-describedby="daily-signal-support daily-signal-error"
              aria-invalid={state.status === "error"}
              disabled={state.status === "submitting"}
            />
            <input className="signup-honeypot" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <button type="submit" disabled={state.status === "submitting"}>
              {state.status === "submitting" ? "ADDING YOU…" : "GET THE DAILY SIGNAL →"}
            </button>
          </div>
          <p id="daily-signal-support" className="daily-signal-support">Around 8:10 AM Eastern. Free. Unsubscribe anytime. <a href="/privacy">Privacy</a></p>
          <p id="daily-signal-error" className="daily-signal-error" role="alert">
            {state.status === "error" ? state.message : ""}
          </p>
        </form>
      ) : null}
    </section>
  );
}
