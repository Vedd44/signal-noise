"use client";

import { FormEvent, useState } from "react";

import { subscriptionResult, type SubscriptionFormState } from "@/lib/subscription-form";

export function DailySignalSignup() {
  const [state, setState] = useState<SubscriptionFormState>({ status: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setState({ status: "submitting" });

    try {
      const response = await fetch("/api/daily-signal/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), company: data.get("company") })
      });
      if (response.status === 400) {
        setState({ status: "error", message: "Enter a valid email address." });
        return;
      }
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
        <h2 id="daily-signal-title">{successful ? "You’re in." : "The signal, before the noise."}</h2>
        <p>
          {successful
            ? "Your first Daily Signal will arrive tomorrow morning."
            : "The Lead, three stories Worth Knowing, and what’s On the Radar — delivered to your inbox every morning."}
        </p>
      </div>

      {!successful ? (
        <form className="daily-signal-form" onSubmit={submit} noValidate>
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
              aria-describedby="daily-signal-support daily-signal-error"
              aria-invalid={state.status === "error"}
              disabled={state.status === "submitting"}
            />
            <input className="signup-honeypot" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <button type="submit" disabled={state.status === "submitting"}>
              {state.status === "submitting" ? "ADDING YOU…" : "GET THE DAILY SIGNAL →"}
            </button>
          </div>
          <p id="daily-signal-support" className="daily-signal-support">One email each morning. Unsubscribe anytime.</p>
          <p id="daily-signal-error" className="daily-signal-error" role="alert">
            {state.status === "error" ? state.message : ""}
          </p>
        </form>
      ) : null}
    </section>
  );
}
