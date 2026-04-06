import type { Story, StorySourceType } from "@/types/story";

export type RssSource = {
  name: string;
  rss_url: string;
  source_type: StorySourceType;
};

export const rssSources: RssSource[] = [
  {
    name: "OpenAI",
    rss_url: "https://openai.com/news/rss.xml",
    source_type: "primary"
  },
  {
    name: "Google AI Blog",
    rss_url: "https://blog.google/technology/ai/rss/",
    source_type: "primary"
  },
  {
    name: "Hugging Face Blog",
    rss_url: "https://huggingface.co/blog/feed.xml",
    source_type: "primary"
  },
  {
    name: "AWS Machine Learning Blog",
    rss_url: "https://aws.amazon.com/blogs/machine-learning/feed/",
    source_type: "primary"
  },
  {
    name: "Netflix TechBlog",
    rss_url: "https://netflixtechblog.medium.com/feed",
    source_type: "primary"
  },
  {
    name: "Platformer",
    rss_url: "https://www.platformer.news/feed",
    source_type: "reporting"
  },
  {
    name: "Nieman Lab",
    rss_url: "https://www.niemanlab.org/feed/",
    source_type: "reporting"
  },
  {
    name: "Benedict Evans",
    rss_url: "https://www.ben-evans.com/benedictevans?format=rss",
    source_type: "analysis"
  },
  {
    name: "Stratechery",
    rss_url: "https://stratechery.com/feed/",
    source_type: "analysis"
  },
  {
    name: "Simon Willison",
    rss_url: "https://simonwillison.net/atom/everything/",
    source_type: "analysis"
  }
];

export const mockedStories: Story[] = [
  {
    id: "open-models-enterprise-distribution",
    title: "Open models are moving from experimentation to enterprise distribution.",
    url: "https://example.com/open-models-enterprise-distribution",
    source: "Platform Memo",
    source_type: "analysis",
    published_at: "2026-04-06T08:30:00.000Z",
    summary:
      "Founders are no longer debating whether open models matter. The live question is which layer captures trust, deployment, and recurring workflow value.",
    why_it_matters:
      "The winners may look less like model labs and more like workflow companies that can package reliability, governance, and decision speed.",
    tag: "Platform Move",
    score: 94,
    raw_snippet:
      "Enterprise buyers are standardizing around deployment layers that feel durable, governable, and easy to integrate.",
    created_at: "2026-04-06T09:05:00.000Z",
    is_top_signal: true,
    image_url: "https://example.com/images/open-models-enterprise-distribution.jpg",
    read_time: 4
  },
  {
    id: "creator-tooling-platform-shift",
    title: "Creator tooling is shifting from standalone apps to bundled operating systems.",
    url: "https://example.com/creator-tooling-platform-shift",
    source: "Interface Notes",
    source_type: "analysis",
    published_at: "2026-04-06T07:45:00.000Z",
    summary:
      "The most durable products are no longer winning on a single generative feature. They are winning by owning the workflow around planning, publishing, and iteration.",
    why_it_matters:
      "Platform value is migrating toward integrated stacks that reduce tool switching and make creative output feel operationally smoother.",
    tag: "Product Signal",
    score: 92,
    created_at: "2026-04-06T08:10:00.000Z",
    read_time: 3
  },
  {
    id: "streaming-bundles-audience-retention",
    title: "Streaming bundles are becoming a retention strategy, not just a pricing trick.",
    url: "https://example.com/streaming-bundles-audience-retention",
    source: "The Diff",
    source_type: "reporting",
    published_at: "2026-04-06T07:05:00.000Z",
    summary:
      "Media operators are rethinking bundles as a way to preserve attention density and reduce churn across fragmented subscription stacks.",
    why_it_matters:
      "If attention is the scarce asset, bundling changes from a discount mechanic into a product design choice with direct leverage on lifetime value.",
    tag: "Business Move",
    score: 89,
    raw_snippet:
      "Executives say bundle design is increasingly tied to retention curves rather than short-term conversion offers.",
    created_at: "2026-04-06T07:25:00.000Z",
    read_time: 5
  },
  {
    id: "audience-fragmentation-loyalty-loop",
    title: "Audience teams are borrowing product tactics to rebuild loyalty loops.",
    url: "https://example.com/audience-fragmentation-loyalty-loop",
    source: "The Audience Desk",
    source_type: "analysis",
    published_at: "2026-04-06T06:20:00.000Z",
    summary:
      "Membership, referrals, and repeat visitation are increasingly being treated as product behaviors rather than traditional campaign outcomes.",
    why_it_matters:
      "Teams that instrument audience behavior like product usage can make smarter editorial and distribution decisions with less guesswork.",
    tag: "Audience Trend",
    score: 88,
    created_at: "2026-04-06T06:42:00.000Z",
    read_time: 4
  },
  {
    id: "search-behavior-zero-click-brands",
    title: "Zero-click discovery is forcing brands to redesign how authority shows up.",
    url: "https://example.com/search-behavior-zero-click-brands",
    source: "Feed Signal",
    source_type: "analysis",
    published_at: "2026-04-06T05:40:00.000Z",
    summary:
      "As discovery shifts into summaries, assistants, and recommendation layers, brand strategy is being pulled upstream toward structured credibility.",
    why_it_matters:
      "This is less about SEO decay and more about distribution logic changing underneath the web. Brands that publish clean signals will compound.",
    tag: "Narrative Shift",
    score: 91,
    raw_snippet:
      "Search visibility is becoming inseparable from how brands are represented inside summary systems and AI interfaces.",
    created_at: "2026-04-06T06:00:00.000Z",
    read_time: 6
  },
  {
    id: "ai-agents-workflow-adoption",
    title: "AI agent adoption is being decided by workflow trust, not raw model novelty.",
    url: "https://example.com/ai-agents-workflow-adoption",
    source: "Operator Weekly",
    source_type: "primary",
    published_at: "2026-04-06T05:00:00.000Z",
    summary:
      "Teams are experimenting widely, but repeat usage is clustering around products that make approvals, observability, and rollback feel safe.",
    why_it_matters:
      "The products that survive this phase will be the ones that turn automation into a managed workflow, not a risky magic trick.",
    tag: "Product Signal",
    score: 90,
    created_at: "2026-04-06T05:20:00.000Z",
    read_time: 4
  },
  {
    id: "sports-rights-media-identity",
    title: "Live sports rights are becoming brand identity systems for media bundles.",
    url: "https://example.com/sports-rights-media-identity",
    source: "Media Operator",
    source_type: "reporting",
    published_at: "2026-04-06T04:35:00.000Z",
    summary:
      "Executives are increasingly using premium live programming as an anchor product that shapes subscriber perception across an entire bundle.",
    why_it_matters:
      "In a crowded market, tentpole rights do more than drive spikes. They teach customers what a platform is for and why it deserves a place in the habit stack.",
    tag: "Media Signal",
    score: 87,
    created_at: "2026-04-06T04:55:00.000Z",
    read_time: 5
  },
  {
    id: "founder-letter-pr-reset",
    title: "Founder letters are becoming reputation resets rather than routine updates.",
    url: "https://example.com/founder-letter-pr-reset",
    source: "Reputation Ledger",
    source_type: "analysis",
    published_at: "2026-04-06T03:50:00.000Z",
    summary:
      "Executive communications are being used more deliberately to close narrative gaps after product stumbles, policy shifts, and market skepticism.",
    why_it_matters:
      "PR signals now travel like product signals. The framing choices leaders make can reset market interpretation before the next launch even arrives.",
    tag: "PR Signal",
    score: 86,
    raw_snippet:
      "The most effective founder notes are no longer neutral status updates; they are precision tools for reframing attention.",
    created_at: "2026-04-06T04:08:00.000Z",
    read_time: 3
  }
];

export async function fetchFeeds() {
  return mockedStories;
}
