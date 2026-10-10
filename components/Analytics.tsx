'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { captureCampaign, safeAnalyticsLocation, track } from '@/lib/analytics';

const ID = 'G-Z489P9ZBC1';
export function Analytics() {
  const pathname = usePathname();
  useEffect(() => {
    // Account-free email links contain bearer tokens. Never load analytics there.
    if (pathname !== '/' || location.hostname !== 'www.signalbrief.xyz' || navigator.doNotTrack === '1') return;
    captureCampaign();
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
      // gtag dispatches Arguments objects as commands; arrays are data-model calls.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    let referrer = '';
    try { referrer = document.referrer ? new URL(document.referrer).origin : ''; } catch { /* Invalid referrer is omitted. */ }
    window.gtag('js', new Date());
    window.gtag('config', ID, {
      send_page_view: false, page_location: safeAnalyticsLocation(location.href), page_referrer: referrer,
      allow_google_signals: false, allow_ad_personalization_signals: false
    });
    window.gtag('event', 'page_view');
    if (!document.getElementById('signal-analytics')) {
      const script = document.createElement('script');
      script.id = 'signal-analytics'; script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${ID}`;
      document.head.appendChild(script);
    }
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'visible') track('engaged_reading');
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [pathname]);
  return null;
}
