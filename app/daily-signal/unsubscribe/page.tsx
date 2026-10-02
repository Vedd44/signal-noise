import type { Metadata } from "next";
export const metadata: Metadata = { title: "Unsubscribe | Signal Brief", robots: { index: false, follow: false }, referrer: "no-referrer", alternates: {canonical:null} };
import { UnsubscribeControl } from "@/components/UnsubscribeControl";
import Link from "next/link";

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <main id="main-content" className="standalone-page">
      <Link className="standalone-brand" href="/">Signal <span>&gt;</span> Noise</Link>
      <UnsubscribeControl token={token} />
    </main>
  );
}
