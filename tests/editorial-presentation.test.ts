import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderDailySignalEmail } from "@/lib/email/render";
import type { Story } from "@/types/story";

const story: Story = {
  id: "presentation-fixture", title: "A long editorial headline & its useful context",
  url: "https://publisher.example/story?a=1&b=2", source: "Publisher", source_type: "reporting",
  published_at: "2026-10-10T10:00:00.000Z", summary: "A complete summary, with <escaped> text.",
  why_it_matters: "The complete Signal remains available to every reader.", tag: "AI", score: 90,
  created_at: "2026-10-10T10:00:00.000Z", updated_at: "2026-10-10T10:00:00.000Z", status: "published"
};

test("email editorial typography uses inline fallbacks and a bounded Outlook container", () => {
  const email = renderDailySignalEmail({ lead: story, worthKnowing: [story], onRadar: [story] }, new Date("2026-10-10T12:10:00Z"), "https://www.signalbrief.xyz/unsubscribe?token=fixture");
  assert.match(email.html, /font-family:Georgia,'Times New Roman',serif;font-size:44px;font-weight:400/);
  assert.match(email.html, /font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1\.8/);
  assert.match(email.html, /max-width:640px/);
  assert.match(email.html, /\[if mso\]><table role="presentation" width="640"/);
  assert.match(email.html, /\.email-shell \{ padding:28px 22px !important; \}/);
  assert.match(email.html, /The complete Signal remains available to every reader\./);
  assert.match(email.html, /&lt;escaped&gt;/);
  assert.match(email.html, /href="https:\/\/publisher.example\/story\?a=1&amp;b=2"/);
  assert.match(email.html, /href="https:\/\/www.signalbrief.xyz\/unsubscribe\?token=fixture"/);
  assert.match(email.text, /SIGNAL > NOISE/);
  assert.doesNotMatch(email.html, /@import|@font-face|<script|<link/i);
});

test("site frame uses approved local fonts and responsive gutters without importing stage controls", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /--serif: Georgia, "Times New Roman", serif;/);
  assert.match(css, /--sans: Arial, Helvetica, sans-serif;/);
  assert.match(css, /--max-width: 1344px/);
  assert.match(css, /padding-inline: 64px/);
  assert.match(css, /padding-inline: 32px/);
  assert.match(css, /padding-inline: 22px/);
  assert.doesNotMatch(css, /@import|@font-face|\.search.*:hover|body\.dark/);
});
