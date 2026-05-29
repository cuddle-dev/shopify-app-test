import type { CatalogProduct, MatchedProduct, ParsedIntent } from "../types";

const NEGATIVE_SIGNALS: Record<string, string[]> = {
  "kids room": ["dark", "moody", "gothic", "horror", "bar", "nightclub"],
  nursery: ["dark", "moody", "gothic", "horror"],
};

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

function scoreProduct(product: CatalogProduct, intent: ParsedIntent): number {
  const text = haystack(product);
  let score = 0;

  const boosts: Array<[string | undefined, number]> = [
    [intent.style, 3],
    [intent.room, 4],
    [intent.use_case, 4],
    [intent.color, 2],
    [intent.attribute, 3],
    [intent.audience, 1],
  ];

  for (const [term, weight] of boosts) {
    if (!term) continue;
    if (text.includes(term.toLowerCase())) score += weight;
    for (const token of term.split(/\s+/)) {
      if (token.length > 2 && text.includes(token)) score += 0.5;
    }
  }

  for (const token of intent.tokens) {
    if (text.includes(token)) score += 0.25;
  }

  const negatives = intent.use_case
    ? NEGATIVE_SIGNALS[intent.use_case] ?? []
    : [];
  for (const bad of negatives) {
    if (text.includes(bad)) score -= 5;
  }

  return Math.max(0, score);
}

export function matchProducts(
  catalog: CatalogProduct[],
  intent: ParsedIntent,
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
      score: scoreProduct(p, intent),
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
