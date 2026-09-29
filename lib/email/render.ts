import { SITE_URL } from "@/lib/site";
import { DAILY_SIGNAL_TIME_ZONE, getDailySignalLocalTime } from "@/lib/email/schedule";
import type { DailySignalSelection } from "@/lib/email/selection";
import type { Story } from "@/types/story";

const PREHEADER = "The stories worth knowing today.";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPublicationTime(story: Story) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DAILY_SIGNAL_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(story.published_at));
}

function renderStoryLink(story: Story, label: string, variant: "headline" | "action" = "action") {
  const color = variant === "headline" ? "#e8e3d9" : "#dc6d52";
  return `<a href="${escapeHtml(story.url)}" target="_blank" rel="noopener noreferrer" style="color:${color};text-decoration:underline;text-decoration-color:#9f4f3d;text-decoration-thickness:1px;text-underline-offset:3px;">${escapeHtml(label)}</a>`;
}

function renderFeaturedStory(
  story: Story,
  includeTime: boolean,
  hierarchy: "lead" | "worth"
) {
  const metadata = [story.source, includeTime ? formatPublicationTime(story) : null, story.tag]
    .filter(Boolean)
    .map((value) => escapeHtml(String(value)))
    .join(" &nbsp;/&nbsp; ");
  const headlineSize = hierarchy === "lead" ? "29px" : "22px";
  const headlineLineHeight = hierarchy === "lead" ? "1.17" : "1.22";
  const storyPadding = hierarchy === "lead" ? "0 0 18px" : "0 0 26px";

  return `
    <div class="story ${hierarchy}-story" style="padding:${storyPadding};">
      <p class="metadata" style="margin:0 0 9px;color:#938d83;font-family:'Arial Narrow','Helvetica Neue Condensed',Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.07em;line-height:1.5;text-transform:uppercase;">${metadata}</p>
      <h2 class="headline ${hierarchy}-headline" style="margin:0 0 13px;color:#e8e3d9;font-family:Georgia,'Times New Roman',serif;font-size:${headlineSize};line-height:${headlineLineHeight};mso-line-height-rule:exactly;letter-spacing:-.025em;">${renderStoryLink(story, story.title, "headline")}</h2>
      <p class="summary" style="margin:0 0 16px;color:#bbb4a8;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;">${escapeHtml(story.summary)}</p>
      <p class="signal" style="margin:0 0 14px;color:#e8e3d9;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.56;"><span style="display:inline-block;margin-bottom:5px;color:#dc6d52;font-family:'Arial Narrow','Helvetica Neue Condensed',Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">THE SIGNAL ›</span><br />${escapeHtml(story.why_it_matters)}</p>
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;">${renderStoryLink(story, `Read at ${story.source} →`)}</p>
    </div>`;
}

function renderRadarStory(story: Story) {
  return `
    <tr>
      <td class="radar-row" style="padding:14px 0;">
        <p class="radar-headline" style="margin:0 0 5px;color:#e8e3d9;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.32;mso-line-height-rule:exactly;">${renderStoryLink(story, story.title, "headline")}</p>
        <p class="metadata" style="margin:0;color:#938d83;font-family:'Arial Narrow','Helvetica Neue Condensed',Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.05em;line-height:1.4;text-transform:uppercase;">${escapeHtml(story.source)} &nbsp;/&nbsp; ${escapeHtml(story.tag)}</p>
      </td>
    </tr>`;
}

function renderPlainStory(story: Story, includeTime: boolean) {
  const metadata = [story.source, includeTime ? formatPublicationTime(story) : null, story.tag]
    .filter(Boolean)
    .join(" / ");

  return `${metadata}\n${story.title}\n${story.summary}\nTHE SIGNAL › ${story.why_it_matters}\n${story.url}`;
}

export type RenderedDailySignalEmail = {
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

export function renderDailySignalEmail(
  selection: DailySignalSelection,
  sendDate = new Date(),
  unsubscribeUrl?: string
): RenderedDailySignalEmail {
  const localTime = getDailySignalLocalTime(sendDate);
  const subject = `The Signal — ${localTime.subjectDate}`;
  const worthKnowingHtml = selection.worthKnowing
    .map((story) => renderFeaturedStory(story, false, "worth"))
    .join("");
  const radarHtml = selection.onRadar.map(renderRadarStory).join("");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>${escapeHtml(subject)}</title>
    <style>
      :root { color-scheme:dark; supported-color-schemes:dark; }
      @media (prefers-color-scheme: dark) {
        .email-page, .email-shell { background:#25241f !important; }
        .email-shell, .headline, .signal, .radar-headline { color:#e8e3d9 !important; }
        .summary { color:#bbb4a8 !important; }
        .metadata { color:#938d83 !important; }
        .section-rule { border-color:#48463f !important; }
      }
      @media only screen and (max-width: 620px) {
        .email-shell { padding:28px 22px !important; }
        .brand { font-size:29px !important; }
        .lead-headline { font-size:25px !important; }
        .worth-headline { font-size:21px !important; }
      }
    </style>
  </head>
  <body class="email-page" bgcolor="#25241f" style="margin:0;padding:0;background:#25241f;color:#e8e3d9;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${PREHEADER}&#847;&zwnj;&nbsp;&#8199;&#65279;&#847;&zwnj;&nbsp;&#8199;&#65279;</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#25241f" class="email-page" style="width:100%;background:#25241f;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#25241f" class="email-shell" style="width:100%;max-width:640px;background:#25241f;padding:42px 38px;color:#e8e3d9;">
            <tr>
              <td>
                <h1 class="brand" style="margin:0;color:#e8e3d9;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1;letter-spacing:-.04em;text-transform:uppercase;">SIGNAL <span style="color:#dc6d52;font-family:'Arial Narrow','Helvetica Neue Condensed',Arial,Helvetica,sans-serif;font-weight:800;">&gt;</span> NOISE</h1>
                <p class="metadata" style="margin:15px 0 4px;color:#938d83;font-family:'Arial Narrow','Helvetica Neue Condensed',Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:.07em;line-height:1.5;text-transform:uppercase;">${escapeHtml(localTime.displayDate)}</p>
                <p class="summary" style="margin:0 0 34px;color:#bbb4a8;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;">${PREHEADER}</p>

                <div class="section-rule" style="padding-top:20px;border-top:1px solid #48463f;">
                  <p style="margin:0 0 18px;color:#dc6d52;font-family:'Arial Narrow','Helvetica Neue Condensed',Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">THE LEAD</p>
                  ${renderFeaturedStory(selection.lead, true, "lead")}
                </div>

                ${selection.worthKnowing.length > 0 ? `
                <div style="padding-top:25px;">
                  <p style="margin:0 0 22px;color:#dc6d52;font-family:'Arial Narrow','Helvetica Neue Condensed',Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">WORTH KNOWING</p>
                  ${worthKnowingHtml}
                </div>` : ""}

                ${selection.onRadar.length > 0 ? `
                <div class="section-rule" style="margin-top:8px;padding-top:25px;border-top:1px solid #48463f;">
                  <p style="margin:0 0 7px;color:#dc6d52;font-family:'Arial Narrow','Helvetica Neue Condensed',Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">ON THE RADAR</p>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">${radarHtml}</table>
                </div>` : ""}

                <div class="section-rule" style="margin-top:30px;padding-top:24px;border-top:1px solid #48463f;">
                  <a href="${SITE_URL}/" target="_blank" rel="noopener noreferrer" style="color:#dc6d52;font-family:'Arial Narrow','Helvetica Neue Condensed',Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;letter-spacing:.06em;text-decoration:none;text-transform:uppercase;">READ THE FULL BRIEFING →</a>
                  ${unsubscribeUrl ? `<p style="margin:22px 0 0;"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#938d83;font-family:Arial,Helvetica,sans-serif;font-size:11px;text-decoration:underline;text-underline-offset:3px;">Unsubscribe</a></p>` : ""}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  const text = [
    "SIGNAL > NOISE",
    localTime.displayDate,
    PREHEADER,
    "",
    "THE LEAD",
    renderPlainStory(selection.lead, true),
    selection.worthKnowing.length > 0
      ? `\nWORTH KNOWING\n\n${selection.worthKnowing
          .map((story) => renderPlainStory(story, false))
          .join("\n\n")}`
      : "",
    selection.onRadar.length > 0
      ? `\nON THE RADAR\n\n${selection.onRadar
          .map((story) => `${story.title}\n${story.source} / ${story.tag}\n${story.url}`)
          .join("\n\n")}`
      : "",
    `\nREAD THE FULL BRIEFING →\n${SITE_URL}/`,
    unsubscribeUrl ? `\nUnsubscribe\n${unsubscribeUrl}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, preheader: PREHEADER, html, text };
}
