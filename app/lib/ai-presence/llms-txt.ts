export type LlmsPlpEntry = {
  slug: string;
  localeId: string;
  keyword: string;
  intentSummary: string;
  productCount: number;
  url: string;
};

export function generateLlmsTxt(params: {
  shopName: string;
  collections: string[];
  plps: LlmsPlpEntry[];
}): string {
  const lines = [
    `# ${params.shopName}`,
    "",
    "> AI-readable index of catalog and SEO product listing pages.",
    "",
    "## Collections",
    ...params.collections.map((c) => `- ${c}`),
    "",
    "## Published PLPs",
  ];

  for (const plp of params.plps) {
    lines.push(
      `- [${plp.keyword}](${plp.url})`,
      `  - locale: ${plp.localeId}`,
      `  - slug: ${plp.slug}`,
      `  - intent: ${plp.intentSummary}`,
      `  - products: ${plp.productCount}`,
    );
  }

  lines.push("", "## Policy", "Only published, quality-approved PLPs are listed.");
  return lines.join("\n");
}
