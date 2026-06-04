import type { CatalogProduct } from "../types";
import type { FacetConfig, DiscoveryConfig } from "../category/types";

function tokenize(text: string, stopWords: Set<string>): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !stopWords.has(t));
}

function ngrams(tokens: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

function discoveryConfigFromFacet(facetConfig: FacetConfig): DiscoveryConfig {
  return (
    facetConfig.discovery ?? {
      stopWords: ["the", "and", "for", "with", "new", "sale"],
      requireAnyTerms: [],
      appendProductNoun: false,
      productNoun: facetConfig.productNoun ?? "",
    }
  );
}

/**
 * Auto-discover keyword opportunities from catalog signals for one category.
 */
export function discoverKeywordsFromCatalog(
  products: CatalogProduct[],
  facetConfig: FacetConfig,
  limit = 50,
): Array<{ keyword: string; source: "auto"; score: number }> {
  const discovery = discoveryConfigFromFacet(facetConfig);
  const stopWords = new Set(discovery.stopWords);
  const noun = discovery.productNoun || facetConfig.productNoun;
  const counts = new Map<string, number>();

  for (const product of products) {
    const signals = [
      product.title,
      product.productType ?? "",
      product.description.slice(0, 200),
      ...product.tags,
      ...product.collections,
    ].join(" ");

    const tokens = tokenize(signals, stopWords);
    for (const n of [2, 3, 4]) {
      for (const phrase of ngrams(tokens, n)) {
        if (discovery.requireAnyTerms.length > 0) {
          const ok = discovery.requireAnyTerms.some((t) => phrase.includes(t.toLowerCase()));
          if (!ok) continue;
        }

        if (noun && !phrase.includes(noun) && discovery.appendProductNoun && n < 3) {
          continue;
        }

        const key =
          noun && discovery.appendProductNoun && !phrase.includes(noun)
            ? `${phrase} ${noun}`
            : phrase;

        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .map(([keyword, count]) => ({
      keyword,
      source: "auto" as const,
      score: count,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
