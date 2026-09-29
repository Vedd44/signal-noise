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

export default async function HomePage() {
  const { stories, lastRefreshedAt } = await getPublishedStories();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c")
        }}
      />
      <main className="page-shell">
        <Header />
        <Feed stories={stories} lastRefreshedAt={lastRefreshedAt} />
      </main>
    </>
  );
}
