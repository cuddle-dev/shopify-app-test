import type { ParsedIntent } from "../types";
import { getIntentFacet } from "../category/intent";
import { normalizeParsedIntent } from "../category/intent";
import type { FacetConfig } from "../category/types";

export type PlpLinkCandidate = {
  id: string;
  slug: string;
  localeId: string;
  keyword: string;
  intentJson: string;
  categoryId?: string | null;
};

function sharedAttributes(
  a: ParsedIntent,
  b: ParsedIntent,
  linkKeys: string[],
): number {
  let score = 0;
  for (const key of linkKeys) {
    const va = getIntentFacet(a, key);
    const vb = getIntentFacet(b, key);
    if (va && vb && va === vb) score += 2;
    else if (va && vb) score += 0.5;
  }
  return score;
}

export function computeInternalLinks(
  current: { id: string; intent: ParsedIntent; localeId: string },
  published: PlpLinkCandidate[],
  facetConfig?: FacetConfig,
  limit = 6,
): Array<{ slug: string; anchor: string; localeId: string }> {
  const linkKeys =
    facetConfig?.facets
      .filter((f) => f.matchWeight >= 2)
      .map((f) => f.key)
      .slice(0, 6) ?? ["style", "room", "use_case"];

  const scored = published
    .filter((p) => p.id !== current.id && p.localeId === current.localeId)
    .filter((p) => {
      if (!current.intent.categoryId) return true;
      return !p.categoryId || p.categoryId === current.intent.categoryId;
    })
    .map((p) => {
      const intent = normalizeParsedIntent(JSON.parse(p.intentJson));
      return {
        slug: p.slug,
        localeId: p.localeId,
        anchor: p.keyword,
        score: sharedAttributes(current.intent, intent, linkKeys),
      };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ slug, anchor, localeId }) => ({ slug, anchor, localeId }));
}
