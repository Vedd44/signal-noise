import Link from "next/link";
import type { Metadata } from 'next';
import { ConfirmSubscription } from '@/components/ConfirmSubscription';
export const metadata: Metadata = { title:'Confirm your Daily Signal | Signal Brief', robots:{index:false,follow:false}, referrer:'no-referrer', alternates:{canonical:null} };
export default async function ConfirmPage({searchParams}:{searchParams:Promise<{token?:string}>}) {
  const {token=''} = await searchParams;
  return <main id="main-content" className="standalone-page"><Link className="standalone-brand" href="/">Signal <span>&gt;</span> Noise</Link><ConfirmSubscription token={token} /></main>;
}
