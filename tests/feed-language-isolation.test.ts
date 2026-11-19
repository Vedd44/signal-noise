import assert from 'node:assert/strict';
import test from 'node:test';
import { runIngestionPipeline } from '../lib/pipeline/ingest';

const item = (metadata = '') => `<item><title>OpenAI announces a major artificial intelligence model for consumers</title><link>https://news.example/valid</link><pubDate>${new Date().toUTCString()}</pubDate><description>OpenAI announced a new artificial intelligence model with improved reasoning and consumer access. The launch expands capabilities available to people using its chatbot and changes competition across the AI market.</description>${metadata}</item>`;
async function ingest(items: string, metadata = '') {
  const original = global.fetch;
  global.fetch = async () => new Response(`<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Offline fixture</title><link>https://news.example</link><description>Fixture</description>${metadata}${items}</channel></rss>`);
  try { return (await runIngestionPipeline()).sourceResults.find(s => s.source.name === 'OpenAI')!; }
  finally { global.fetch = original; }
}
for (const field of ['language', 'dc:language']) {
  test(`structured ${field} rejects only the affected item`, async () => {
    const result = await ingest(item(`<${field}><unexpected>fr</unexpected></${field}>`) + item('<language>en</language>'));
    assert.equal(result.error, null);
    assert.equal(result.pulledCount, 2);
    assert.equal(result.invalidCount, 1);
    assert.equal(result.normalized.length, 1);
    assert.equal(result.normalized[0].item_language, 'en');
  });
}
test('malformed secondary language does not hide behind valid primary metadata', async () => {
  const result = await ingest(item('<language>en</language><dc:language><unexpected>fr</unexpected></dc:language>') + item());
  assert.equal(result.error, null);
  assert.equal(result.invalidCount, 1);
  assert.equal(result.normalized.length, 1);
});
test('explicit non-English item and feed metadata still reject coverage', async () => {
  for (const field of ['language', 'dc:language']) {
    const result = await ingest(item(`<${field}>fr</${field}>`) + item('<language>en</language>'));
    assert.equal(result.nonEnglishRejectedCount, 1);
    assert.equal(result.normalized.length, 1);
  }
  const result = await ingest(item(), '<language>fr</language>');
  assert.equal(result.nonEnglishRejectedCount, 1);
  assert.equal(result.normalized.length, 0);
});
test('unparseable feed-level language remains fail-closed', async () => {
  const result = await ingest(item(), '<language><unexpected>fr</unexpected></language>');
  assert.ok(result.error);
  assert.equal(result.normalized.length, 0);
});
