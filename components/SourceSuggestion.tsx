"use client";

import { FormEvent, useState } from "react";

export function SourceSuggestion() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/suggest-source", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        url: form.get("url"),
        reason: form.get("reason"),
        company: form.get("company")
      })
    });
    setStatus(response.ok ? "sent" : "error");
    if (response.ok) event.currentTarget.reset();
  }

  return (
    <section className="source-suggestion">
      <div className="source-suggestion-links">
        <a href="mailto:hello@signalbrief.xyz?subject=Signal%20Brief%20feature%20request">Submit a feature request</a>
        <span aria-hidden="true">·</span>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          Suggest a source
        </button>
      </div>
      {open ? (
        <form className="source-suggestion-form" onSubmit={submit}>
          <label>Source name<input name="name" required maxLength={120} /></label>
          <label>URL<input name="url" type="url" required maxLength={500} placeholder="https://" /></label>
          <label>Why should we add it? <span>(optional)</span><textarea name="reason" maxLength={1000} rows={3} /></label>
          <input className="source-honeypot" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <button type="submit" disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Send suggestion"}</button>
          {status === "sent" ? <p>Thanks. We’ll take a look.</p> : null}
          {status === "error" ? <p>Couldn’t send that right now. Try again.</p> : null}
        </form>
      ) : null}
    </section>
  );
}
