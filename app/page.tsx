import { unstable_cache } from "next/cache";
import { Feed } from "@/components/Feed";
import { Header } from "@/components/Header";
import { getPublishedStories } from "@/lib/data";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "en-US",
      publisher: { "@id": `${SITE_URL}/#organization` }
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`
    }
  ]
};

const readBriefing = unstable_cache(() => getPublishedStories({throwOnError:true}), ['published-briefing-v2'], {revalidate:60});
export default async function HomePage() {
  let inventory: Awaited<ReturnType<typeof getPublishedStories>>;
  let unavailable = false;
  try { inventory = await readBriefing(); }
  catch { inventory = {stories:[],lastRefreshedAt:null}; unavailable = true; }
  const { stories, lastRefreshedAt } = inventory;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c")
        }}
      />
      <main id="main-content" className="page-shell">
        <Header />
        <Feed stories={stories} lastRefreshedAt={lastRefreshedAt} unavailable={unavailable} />
      </main>
    </>
  );
}
