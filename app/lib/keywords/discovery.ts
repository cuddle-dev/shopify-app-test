import type { CatalogProduct } from "../types";

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "wallpaper", "paper", "roll", "set", "new", "sale",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function ngrams(tokens: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

/**
 * Auto-discover keyword opportunities from catalog signals.
 */
export function discoverKeywordsFromCatalog(
  products: CatalogProduct[],
  localeId: string,
  limit = 50,
): Array<{ keyword: string; source: "auto"; score: number }> {
  const counts = new Map<string, number>();

  for (const product of products) {
    const signals = [
      product.title,
      product.productType ?? "",
      product.description.slice(0, 200),
      ...product.tags,
      ...product.collections,
    ].join(" ");

    const tokens = tokenize(signals);
    for (const n of [2, 3, 4]) {
      for (const phrase of ngrams(tokens, n)) {
        if (!phrase.includes("wallpaper") && n < 3) continue;
        const key = phrase.includes("wallpaper")
          ? phrase
          : `${phrase} wallpaper`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .map(([keyword, count]) => ({
      keyword,
      source: "auto" as const,
      score: count,
      localeId,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ keyword, source, score }) => ({ keyword, source, score }));
}
