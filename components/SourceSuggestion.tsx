"use client";

import { FormEvent, useState } from "react";

type FormKind = "feature" | "source";
type Status = "idle" | "sending" | "sent" | "error";

export function SourceSuggestion() {
  const [open, setOpen] = useState<FormKind | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  function toggle(kind: FormKind) {
    setStatus("idle");
    setOpen((current) => current === kind ? null : kind);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!open) return;
    setStatus("sending");
    const form = new FormData(event.currentTarget);
    const endpoint = open === "source" ? "/api/suggest-source" : "/api/feature-request";
    const body = open === "source"
      ? { name: form.get("name"), url: form.get("url"), reason: form.get("reason"), company: form.get("company") }
      : { request: form.get("request"), company: form.get("company") };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    setStatus(response.ok ? "sent" : "error");
    if (response.ok) event.currentTarget.reset();
  }

  return (
    <section className="source-suggestion" aria-label="Feedback">
      <div className="source-suggestion-links">
        <button type="button" onClick={() => toggle("feature")} aria-expanded={open === "feature"}>
          Submit a feature request
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" onClick={() => toggle("source")} aria-expanded={open === "source"}>
          Suggest a source
        </button>
      </div>

      {open ? (
        <form className="source-suggestion-form" onSubmit={submit}>
          {open === "source" ? (
            <>
              <label>Source name<input name="name" required maxLength={120} /></label>
              <label>URL<input name="url" type="url" required maxLength={500} placeholder="https://" /></label>
              <label>Why should we add it? <span>(optional)</span><textarea name="reason" maxLength={1000} rows={3} /></label>
            </>
          ) : (
            <>
              <label>What should we add or improve?<textarea name="request" required maxLength={1000} rows={3} /></label>
            </>
          )}
          <input className="source-honeypot" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <button type="submit" disabled={status === "sending"}>
            {status === "sending" ? "Sending…" : open === "source" ? "Send suggestion" : "Send request"}
          </button>
          {status === "sent" ? <p>Thanks. We’ll take a look.</p> : null}
          {status === "error" ? <p>Couldn’t send that right now. Try again.</p> : null}
        </form>
      ) : null}
    </section>
  );
}
