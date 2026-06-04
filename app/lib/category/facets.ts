import type { FacetConfig } from "./types";

/** Longest phrase match first so "living room" wins over "room". */
export function extractFacetsFromKeyword(
  keyword: string,
  facetConfig: FacetConfig,
): Record<string, string> {
  const raw = keyword.trim().toLowerCase();
  const facets: Record<string, string> = {};

  const extractable = facetConfig.facets.filter((f) => f.extractInKeyword && f.terms.length > 0);

  const sortedTerms = extractable.flatMap((f) =>
    f.terms.map((term) => ({ key: f.key, term: term.toLowerCase() })),
  );
  sortedTerms.sort((a, b) => b.term.length - a.term.length);

  const usedSpans: Array<[number, number]> = [];

  for (const { key, term } of sortedTerms) {
    if (facets[key]) continue;
    const idx = raw.indexOf(term);
    if (idx === -1) continue;
    const end = idx + term.length;
    const overlaps = usedSpans.some(([s, e]) => !(end <= s || idx >= e));
    if (overlaps) continue;
    facets[key] = term;
    usedSpans.push([idx, end]);
  }

  if (facetConfig.productNoun === "wallpaper") {
    if (
      (raw.includes("kids") || raw.includes("nursery") || raw.includes("children")) &&
      !facets.use_case
    ) {
      facets.use_case = "kids room";
    } else if (facets.room && !facets.use_case) {
      facets.use_case = facets.room;
    }
  }

  return facets;
}

export function scoreCategoryForKeyword(
  keyword: string,
  facetConfig: FacetConfig,
): number {
  const raw = keyword.toLowerCase();
  let score = 0;
  const noun = facetConfig.productNoun?.toLowerCase();
  if (noun && noun.length > 2 && raw.includes(noun)) score += 5;

  for (const facet of facetConfig.facets) {
    for (const term of facet.terms) {
      if (term.length > 2 && raw.includes(term.toLowerCase())) {
        score += facet.matchWeight;
      }
    }
  }
  return score;
}
