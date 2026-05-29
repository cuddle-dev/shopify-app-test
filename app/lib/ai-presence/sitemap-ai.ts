export type SitemapAiEntry = {
  loc: string;
  lastmod: string;
  keyword: string;
  intentSummary: string;
  productCount: number;
  localeId: string;
};

export function generateSitemapAiXml(entries: SitemapAiEntry[]): string {
  const urls = entries
    .map(
      (e) => `  <url>
    <loc>${escapeXml(e.loc)}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <ai:primary_keyword>${escapeXml(e.keyword)}</ai:primary_keyword>
    <ai:intent_summary>${escapeXml(e.intentSummary)}</ai:intent_summary>
    <ai:product_count>${e.productCount}</ai:product_count>
    <ai:locale>${escapeXml(e.localeId)}</ai:locale>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:ai="https://plp-seo.app/schemas/sitemap-ai/1.0">
${urls}
</urlset>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
