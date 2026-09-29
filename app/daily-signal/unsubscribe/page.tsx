import { UnsubscribeControl } from "@/components/UnsubscribeControl";
import Link from "next/link";

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <main className="standalone-page">
      <Link className="standalone-brand" href="/">Signal <span>&gt;</span> Noise</Link>
      <UnsubscribeControl token={token} />
    </main>
  );
}
