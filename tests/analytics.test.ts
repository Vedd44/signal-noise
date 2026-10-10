import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { safeAnalyticsLocation } from '@/lib/analytics';

// Execute the actual component with inert browser/React adapters. No scripts load,
// timers run, or requests leave the process, including requests to Google.
const component = ts.transpileModule(
  readFileSync(new URL('../components/Analytics.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }
).outputText;

function renderAnalytics(options: { path?: string; host?: string; dnt?: string } = {}) {
  const queue: unknown[] = [];
  const scripts: { id?: string; async?: boolean; src?: string }[] = [];
  let campaigns = 0;
  let timers = 0;
  const window = { dataLayer: queue, setTimeout: () => { timers++; return 1; }, clearTimeout: () => {} };
  const exports: { Analytics?: () => null } = {};
  runInNewContext(component, {
    exports, URL,
    require: (name: string) => {
      if (name === 'react') return { useEffect: (effect: () => void) => effect() };
      if (name === 'next/navigation') return { usePathname: () => options.path ?? '/' };
      if (name === '@/lib/analytics') return {
        captureCampaign: () => { campaigns++; }, safeAnalyticsLocation,
        track: () => { throw new Error('Inert timers must never invoke tracking'); }
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    window,
    location: {
      hostname: options.host ?? 'www.signalbrief.xyz',
      href: 'https://www.signalbrief.xyz/?utm_source=ad&token=private&email=private%40example.com#private'
    },
    navigator: { doNotTrack: options.dnt ?? '0' },
    document: {
      referrer: 'https://example.com/private?token=private',
      getElementById: () => null,
      createElement: () => ({}),
      head: { appendChild: (script: typeof scripts[number]) => scripts.push(script) }
    }
  });
  assert.equal(exports.Analytics?.(), null);
  return { queue, scripts, campaigns, timers };
}

test('GA4 bootstrap queues Arguments commands rather than data-model arrays', () => {
  const { queue, scripts } = renderAnalytics();
  assert.equal(queue.length, 3);
  for (const command of queue) {
    assert.equal(Array.isArray(command), false);
    assert.equal(Object.prototype.toString.call(command), '[object Arguments]');
  }
  const commands = queue.map(value => Array.from(value as IArguments));
  assert.equal(commands[0][0], 'js');
  assert.deepEqual(commands[1].slice(0, 2), ['config', 'G-Z489P9ZBC1']);
  assert.deepEqual(commands[2], ['event', 'page_view']);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-Z489P9ZBC1');
});

test('GA4 preserves sanitized locations and disabled advertising signals', () => {
  const config = (renderAnalytics().queue[1] as IArguments)[2];
  assert.equal(config.page_location, 'https://www.signalbrief.xyz/?utm_source=ad');
  assert.equal(config.page_referrer, 'https://example.com');
  assert.equal(config.send_page_view, false);
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
});

test('GA4 stays inactive for DNT, other hosts, and non-homepage/token routes', () => {
  for (const options of [
    { dnt: '1' }, { host: 'localhost' }, { host: 'signalbrief.xyz' },
    { host: 'preview.vercel.app' }, { path: '/privacy' },
    { path: '/daily-signal/confirm' }, { path: '/daily-signal/unsubscribe' }
  ]) {
    const result = renderAnalytics(options);
    assert.deepEqual(result, { queue: [], scripts: [], campaigns: 0, timers: 0 });
  }
});
