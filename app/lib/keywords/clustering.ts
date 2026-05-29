/**
 * Simple semantic clustering via token Jaccard similarity.
 * Groups similar keywords so we generate one canonical PLP per cluster.
 */

function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

export function jaccardSimilarity(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let intersection = 0;
  for (const t of sa) {
    if (sb.has(t)) intersection++;
  }
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : intersection / union;
}

export type KeywordClusterResult = {
  clusterId: string;
  canonicalKeyword: string;
  members: string[];
};

export function clusterKeywords(
  keywords: string[],
  threshold = 0.72,
): KeywordClusterResult[] {
  const clusters: KeywordClusterResult[] = [];

  for (const keyword of keywords) {
    let assigned = false;
    for (const cluster of clusters) {
      if (jaccardSimilarity(keyword, cluster.canonicalKeyword) >= threshold) {
        cluster.members.push(keyword);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      clusters.push({
        clusterId: `cluster_${clusters.length + 1}`,
        canonicalKeyword: keyword,
        members: [keyword],
      });
    }
  }

  return clusters;
}
