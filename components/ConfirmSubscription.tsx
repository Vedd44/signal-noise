'use client';
import Link from "next/link";

import { useState } from 'react';

export function ConfirmSubscription({ token }: { token: string }) {
  const [status, setStatus] = useState<'ready' | 'submitting' | 'success' | 'error'>('ready');
  const [message, setMessage] = useState('');
  const valid = /^[a-f0-9]{64}$/.test(token);
  async function confirm() {
    if (status === 'submitting') return;
    setStatus('submitting');
    try {
      const response = await fetch('/api/daily-signal/confirm', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({token}), signal:AbortSignal.timeout(15_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Please try again in a moment.');
      setStatus('success');
      window.history.replaceState(null, '', '/daily-signal/confirm');
    } catch(error) { setStatus('error'); setMessage(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'This is taking longer than expected. Please try again.'); }
  }
  return <div className="unsubscribe-state" aria-live="polite">
    <h1>{status === 'success' ? 'You’re confirmed.' : valid ? 'One step to your Daily Signal.' : 'This link isn’t valid.'}</h1>
    <p>{status === 'success' ? 'Your next Daily Signal will arrive around 8:10 AM Eastern. You can unsubscribe from any issue.' : valid ? 'Confirm below to receive the stories worth knowing and why they matter.' : 'Request a fresh Daily Signal confirmation email from the signup form.'}</p>
    {valid && status !== 'success' ? <button type="button" onClick={confirm} disabled={status === 'submitting'}>{status === 'submitting' ? 'CONFIRMING…' : 'CONFIRM SUBSCRIPTION'}</button> : null}
    {status === 'error' ? <p role="alert" className="daily-signal-error">{message}</p> : null}
    <p><Link href="/#daily-signal">{status === 'success' ? 'Read today’s briefing →' : 'Back to Signal Brief →'}</Link></p>
  </div>;
}
