import { unstable_cache } from 'next/cache';
import { hydrateStorySource } from '@/lib/pipeline/sourceContent';
import type { Story } from '@/types/story';

// Cache only the access verdict, never article text. No LLM calls or database migration.
const inspectAccess = unstable_cache(async (url: string, source: string) => {
  const result = await hydrateStorySource({ id: '', title: '', url, source, source_type: 'reporting', published_at: '', raw_snippet: '', created_at: '' }, 3_000);
  return result.article_access ?? 'unknown';
}, ['article-access-v1'], { revalidate: 7200 });

export async function annotateArticleAccess(stories: Story[]): Promise<Story[]> {
  return Promise.all(stories.map(async (story, index) => {
    if (story.source_type === 'primary' || index >= 100) return story;
    try { return { ...story, article_access: await inspectAccess(story.url, story.source) }; }
    catch { return { ...story, article_access: 'unknown' }; }
  }));
}
