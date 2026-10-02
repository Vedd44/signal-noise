import Link from "next/link";
export default function NotFound() {
  return <main id="main-content" className="standalone-page"><Link className="standalone-brand" href="/">Signal <span>&gt;</span> Noise</Link><h1>This page isn’t here.</h1><p>The briefing is still at home.</p><Link href="/">Read today’s stories →</Link></main>;
}
