import type { NormalizedStory } from "@/types/story";

export type LanguageEligibility = {
  eligible: boolean;
  reason: "english" | "ambiguous" | "non-english-metadata" | "non-english-url" | "non-english-headline";
  detectedLanguage?: string;
};

const NON_ENGLISH_URL_KEYS = new Set(["lang", "language", "locale", "hl"]);
const LOCALE_PATH_PATTERN = /^[a-z]{2}(?:-[a-z]{2})?$/i;
const NON_ENGLISH_LANGUAGE_CODES = new Set([
  "ar", "cs", "da", "de", "el", "es", "fi", "fr", "he", "hu", "id", "it", "ja",
  "ko", "nl", "no", "pl", "pt", "ro", "ru", "sv", "th", "tr", "uk", "vi", "zh",
  "ara", "ces", "dan", "deu", "ell", "spa", "fin", "fra", "heb", "hun", "ind",
  "ita", "jpn", "kor", "nld", "nor", "pol", "por", "ron", "rus", "swe", "tha",
  "tur", "ukr", "vie", "zho"
]);
// A bare /uk/ path commonly means United Kingdom, not the Ukrainian language.
const NON_ENGLISH_LOCALE_PATH_CODES = new Set(
  [...NON_ENGLISH_LANGUAGE_CODES].filter((code) => code.length === 2 && code !== "uk")
);

const LANGUAGE_MARKERS: Record<string, Set<string>> = {
  fr: new Set([
    "abonnement", "aujourd'hui", "aux", "avec", "davantage", "des", "du", "d'une",
    "en", "et", "fonctionnalites", "lancement", "lance", "lancent", "les", "nous",
    "offrant", "offre", "pour", "presentation", "se", "service", "une", "un"
  ]),
  es: new Set([
    "anuncia", "con", "de", "del", "empresa", "empresas", "en", "funcion", "funciones",
    "la", "las", "los", "mas", "nueva", "nuevas", "nuevo", "para", "presenta", "que", "servicio", "una", "un"
  ]),
  de: new Set([
    "auf", "der", "die", "ein", "eine", "einem", "einen", "fur", "gegen", "im", "ist",
    "mit", "neue", "neuen", "neuer", "schutz", "unternehmen", "und", "von", "vor", "wie", "zu"
  ]),
  pl: new Set([
    "dla", "ochrone", "oszustwami", "polsce", "przed", "w", "wzmacniamy", "z", "ze"
  ]),
  it: new Set([
    "annuncia", "con", "della", "delle", "gli", "il", "la", "le", "nuove", "nuovo",
    "per", "presenta", "servizio", "societa", "un", "una"
  ]),
  nl: new Set([
    "de", "een", "en", "het", "met", "nieuwe", "voor", "van", "wordt", "zijn"
  ]),
  pt: new Set([
    "anuncia", "apresenta", "com", "da", "das", "de", "do", "dos", "em", "empresa",
    "empresas", "mais", "nova", "novas", "novo", "para", "que", "servico", "um", "uma"
  ])
};

const NON_LATIN_SCRIPTS: Array<{ language: string; pattern: RegExp }> = [
  { language: "ar", pattern: /\p{Script=Arabic}/gu },
  { language: "ru", pattern: /\p{Script=Cyrillic}/gu },
  { language: "he", pattern: /\p{Script=Hebrew}/gu },
  { language: "cjk", pattern: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu },
  { language: "ko", pattern: /\p{Script=Hangul}/gu },
  { language: "th", pattern: /\p{Script=Thai}/gu }
];

const ENGLISH_MARKERS = new Set([
  "a", "about", "after", "ai", "an", "and", "announces", "are", "as", "at", "before",
  "built", "by", "connect", "create", "for", "from", "how", "in", "introducing", "is",
  "launches", "more", "new", "of", "on", "service", "stand", "subscription", "the", "to",
  "tools", "with", "without"
]);

function normalizeLanguageCode(value?: string) {
  return value?.trim().toLowerCase().replace("_", "-").split("-")[0] ?? "";
}

function foldToken(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function tokenize(value: string) {
  return value.match(/\p{L}+(?:['’]\p{L}+)*/gu)?.map(foldToken) ?? [];
}

function getExplicitNonEnglishUrlLanguage(rawUrl: string) {
  try {
    const url = new URL(rawUrl);

    for (const [key, value] of url.searchParams) {
      if (!NON_ENGLISH_URL_KEYS.has(key.toLowerCase())) continue;
      const language = normalizeLanguageCode(value);
      if (NON_ENGLISH_LANGUAGE_CODES.has(language)) return language;
    }

    const firstPathSegment = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (LOCALE_PATH_PATTERN.test(firstPathSegment)) {
      const language = normalizeLanguageCode(firstPathSegment);
      if (NON_ENGLISH_LOCALE_PATH_CODES.has(language)) return language;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function detectClearlyNonEnglishHeadline(title: string) {
  const letterCount = title.match(/\p{L}/gu)?.length ?? 0;

  for (const { language, pattern } of NON_LATIN_SCRIPTS) {
    const scriptLetterCount = title.match(pattern)?.length ?? 0;

    if (scriptLetterCount >= 4 && scriptLetterCount / Math.max(letterCount, 1) >= 0.5) {
      return language;
    }
  }

  const tokens = tokenize(title);

  // Short headlines and name-like fragments do not provide enough evidence.
  if (tokens.length < 4) return undefined;

  const englishScore = tokens.reduce(
    (score, token) => score + (ENGLISH_MARKERS.has(token) ? 1 : 0),
    0
  );
  let strongest: { language: string; score: number } | undefined;

  for (const [language, markers] of Object.entries(LANGUAGE_MARKERS)) {
    const score = tokens.reduce(
      (total, token) => total + (markers.has(token) ? 1 : 0),
      0
    );

    if (!strongest || score > strongest.score) strongest = { language, score };
  }

  if (strongest && strongest.score >= 3 && strongest.score >= englishScore + 2) {
    return strongest.language;
  }

  return undefined;
}

export function evaluateEnglishLanguageEligibility(
  story: Pick<NormalizedStory, "title" | "url" | "feed_language" | "item_language">
): LanguageEligibility {
  const itemLanguage = normalizeLanguageCode(story.item_language);

  if (NON_ENGLISH_LANGUAGE_CODES.has(itemLanguage)) {
    return {
      eligible: false,
      reason: "non-english-metadata",
      detectedLanguage: itemLanguage
    };
  }

  const feedLanguage = normalizeLanguageCode(story.feed_language);
  if (NON_ENGLISH_LANGUAGE_CODES.has(feedLanguage)) {
    return {
      eligible: false,
      reason: "non-english-metadata",
      detectedLanguage: feedLanguage
    };
  }

  const urlLanguage = getExplicitNonEnglishUrlLanguage(story.url);
  if (urlLanguage) {
    return {
      eligible: false,
      reason: "non-english-url",
      detectedLanguage: urlLanguage
    };
  }

  const headlineLanguage = detectClearlyNonEnglishHeadline(story.title);
  if (headlineLanguage) {
    return {
      eligible: false,
      reason: "non-english-headline",
      detectedLanguage: headlineLanguage
    };
  }

  const englishEvidence = tokenize(story.title).filter((token) =>
    ENGLISH_MARKERS.has(token)
  ).length;

  return {
    eligible: true,
    reason: englishEvidence >= 2 ? "english" : "ambiguous"
  };
}

export function partitionStoriesByEnglishEligibility<T extends Pick<
  NormalizedStory,
  "title" | "url" | "feed_language" | "item_language"
>>(stories: T[]) {
  const eligibleStories: T[] = [];
  const rejectedStories: Array<T & { languageRejection: LanguageEligibility }> = [];

  for (const story of stories) {
    const eligibility = evaluateEnglishLanguageEligibility(story);
    if (eligibility.eligible) eligibleStories.push(story);
    else rejectedStories.push({ ...story, languageRejection: eligibility });
  }

  return { eligibleStories, rejectedStories };
}
