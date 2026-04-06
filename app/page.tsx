import { Feed } from "@/components/Feed";
import { Header } from "@/components/Header";
import { getPublishedStories } from "@/lib/data";

export default async function HomePage() {
  const stories = await getPublishedStories();

  return (
    <main className="page-shell">
      <Header />
      <Feed stories={stories} />
    </main>
  );
}
