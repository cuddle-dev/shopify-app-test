import type { ParsedIntent } from "../types";

export type PlpLinkCandidate = {
  id: string;
  slug: string;
  localeId: string;
  keyword: string;
  intentJson: string;
};

function parseIntent(json: string): ParsedIntent {
  return JSON.parse(json) as ParsedIntent;
}

function sharedAttributes(a: ParsedIntent, b: ParsedIntent): number {
  let score = 0;
  if (a.style && a.style === b.style) score += 2;
  if (a.room && b.room === a.room) score += 1;
  if (a.style && b.room && a.style !== b.style) score += 1;
  if (a.room && b.style && a.room !== b.room) score += 1;
  if (a.use_case && a.use_case === b.use_case) score += 1;
  return score;
}

export function computeInternalLinks(
  current: { id: string; intent: ParsedIntent; localeId: string },
  published: PlpLinkCandidate[],
  limit = 6,
): Array<{ slug: string; anchor: string; localeId: string }> {
  const scored = published
    .filter((p) => p.id !== current.id && p.localeId === current.localeId)
    .map((p) => {
      const intent = parseIntent(p.intentJson);
      return {
        slug: p.slug,
        localeId: p.localeId,
        anchor: p.keyword,
        score: sharedAttributes(current.intent, intent),
      };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ slug, anchor, localeId }) => ({ slug, anchor, localeId }));
}
