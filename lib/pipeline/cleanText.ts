import he from "he";

type NormalizeExternalTextOptions = {
  stripHtml?: boolean;
};

export function normalizeExternalText<T>(
  value: T,
  options: NormalizeExternalTextOptions = {}
): T {
  if (typeof value !== "string") {
    return value;
  }

  let normalized = he.decode(value);

  if (options.stripHtml) {
    normalized = normalized
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/?[a-z][^>]*>/gi, " ");
  }

  return normalized.replace(/\s+/g, " ").trim() as T;
}
