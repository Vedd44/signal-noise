import Link from "next/link";
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Privacy | Signal Brief', alternates: {canonical:'https://www.signalbrief.xyz/privacy'} };
export default function PrivacyPage() {
  return <main id="main-content" className="standalone-page privacy-page">
    <Link className="standalone-brand" href="/">Signal <span>&gt;</span> Noise</Link>
    <h1>Privacy, plainly.</h1>
    <p>Signal Brief uses your email address to confirm your subscription and deliver the Daily Signal. You can unsubscribe from any issue. We keep a suppression record so an unsubscribed address stays off the list unless it is confirmed again.</p>
    <p>Subscriber records and reader submissions are stored privately in Supabase. Resend delivers subscription emails and private notifications. Vercel hosts the website and processes requests.</p>
    <p>We use Google Analytics to understand visits, campaign performance, reading activity, and signup interest. We do not send email addresses, form contents, or subscription tokens to analytics. Campaign labels may be saved with a subscription to measure which campaigns produce confirmed readers. Analytics does not load on confirmation or unsubscribe pages, or when your browser sends Do Not Track.</p>
    <p>Source suggestions and feature requests are stored for review and sent privately to the product owner. Please avoid including sensitive personal information. Temporary request limits use a keyed hash rather than storing your IP address in the application database.</p>
    <p>Publisher links take you to other websites with their own privacy practices. To ask about your data, use the <Link href="/#feedback">feedback form</Link> and include a reply address if you want a response.</p>
    <p><Link href="/">Back to the briefing →</Link></p>
  </main>;
}
