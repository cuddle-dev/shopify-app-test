import type { CatalogProduct, MatchedProduct, ParsedIntent } from "../types";
import type { FacetConfig } from "../category/types";
import { getIntentFacet } from "../category/intent";

function haystack(product: CatalogProduct): string {
  return [
    product.title,
    product.description,
    product.productType,
    product.vendor,
    ...product.tags,
    ...product.collections,
  ]
    .join(" ")
    .toLowerCase();
}

function scoreProduct(
  product: CatalogProduct,
  intent: ParsedIntent,
  facetConfig: FacetConfig,
): number {
  const text = haystack(product);
  let score = 0;

  for (const facet of facetConfig.facets) {
    const value = getIntentFacet(intent, facet.key);
    if (!value) continue;
    const term = value.toLowerCase();
    if (text.includes(term)) score += facet.matchWeight;
    for (const token of term.split(/\s+/)) {
      if (token.length > 2 && text.includes(token)) score += 0.5;
    }
  }

  for (const token of intent.tokens) {
    if (text.includes(token)) score += 0.25;
  }

  for (const neg of facetConfig.negativeSignals) {
    const whenVal = getIntentFacet(intent, neg.whenFacet);
    if (whenVal && whenVal.toLowerCase() === neg.value.toLowerCase()) {
      for (const bad of neg.penalizeTerms) {
        if (text.includes(bad)) score -= 5;
      }
    }
  }

  return Math.max(0, score);
}

export function matchProducts(
  catalog: CatalogProduct[],
  intent: ParsedIntent,
  facetConfig: FacetConfig,
  options?: { minCount?: number; limit?: number; manualIds?: string[] },
): { products: MatchedProduct[]; belowThreshold: boolean } {
  const minCount = options?.minCount ?? Number(process.env.MIN_PRODUCT_COUNT ?? 6);
  const limit = options?.limit ?? 24;

  let ranked = catalog
    .map((p) => ({
      id: p.id,
      title: p.title,
      handle: p.handle,
      tags: p.tags,
      description: p.description,
      collections: p.collections,
      imageUrl: p.imageUrl,
      price: p.price,
      score: scoreProduct(p, intent, facetConfig),
    }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);

  if (options?.manualIds?.length) {
    const manualSet = new Set(options.manualIds);
    const manual = ranked.filter((p) => manualSet.has(p.id));
    const rest = ranked.filter((p) => !manualSet.has(p.id));
    ranked = [...manual, ...rest];
  }

  const products = ranked.slice(0, limit);
  return {
    products,
    belowThreshold: products.length < minCount,
  };
}
