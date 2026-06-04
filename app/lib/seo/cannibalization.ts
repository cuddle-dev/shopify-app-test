import { jaccardSimilarity } from "../keywords/clustering";
import type { ParsedIntent } from "../types";
import { getIntentFacet } from "../category/intent";

export function intentSimilarity(
  a: ParsedIntent,
  b: ParsedIntent,
  cannibalizationKeys?: string[],
): number {
  const keys =
    cannibalizationKeys ??
    [
      "style",
      "room",
      "use_case",
      "color",
      "attribute",
      "audience",
      "product_type",
      "concern",
      "skin_type",
    ];

  let matches = 0;
  let total = 0;
  for (const key of keys) {
    const va = getIntentFacet(a, key);
    const vb = getIntentFacet(b, key);
    if (!va && !vb) continue;
    total++;
    if (va && vb && va.toLowerCase() === vb.toLowerCase()) matches++;
  }

  const fieldScore = total ? matches / total : 0;
  const tokenScore = jaccardSimilarity(a.raw, b.raw);
  return fieldScore * 0.6 + tokenScore * 0.4;
}

export function isTooSimilar(
  newIntent: ParsedIntent,
  existingIntents: ParsedIntent[],
  threshold = Number(process.env.SIMILARITY_THRESHOLD ?? 0.85),
  cannibalizationKeys?: string[],
): { blocked: boolean; score: number } {
  let maxScore = 0;
  for (const existing of existingIntents) {
    if (
      newIntent.categoryId &&
      existing.categoryId &&
      newIntent.categoryId !== existing.categoryId
    ) {
      continue;
    }
    const score = intentSimilarity(newIntent, existing, cannibalizationKeys);
    if (score > maxScore) maxScore = score;
  }
  return { blocked: maxScore >= threshold, score: maxScore };
}
