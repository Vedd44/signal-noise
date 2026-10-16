export type FeedView = "list" | "compact";

export function readFeedView(value: string | null): FeedView {
  return value === "compact" ? "compact" : "list";
}

export function withFeedView(href: string, view: FeedView): string {
  const url = new URL(href);
  if (view === "list") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  return `${url.pathname}${url.search}${url.hash}`;
}
