import { jaccardSimilarity } from "../keywords/clustering";
import type { ParsedIntent } from "../types";

export function intentSimilarity(a: ParsedIntent, b: ParsedIntent): number {
  const fields: Array<keyof ParsedIntent> = [
    "style",
    "room",
    "use_case",
    "color",
    "attribute",
    "audience",
  ];
  let matches = 0;
  let total = 0;
  for (const f of fields) {
    const va = a[f] as string | undefined;
    const vb = b[f] as string | undefined;
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
): { blocked: boolean; score: number } {
  let maxScore = 0;
  for (const existing of existingIntents) {
    const score = intentSimilarity(newIntent, existing);
    if (score > maxScore) maxScore = score;
  }
  return { blocked: maxScore >= threshold, score: maxScore };
}
