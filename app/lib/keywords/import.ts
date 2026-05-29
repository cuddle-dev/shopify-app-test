import Papa from "papaparse";

export function parseKeywordCsv(csvText: string): string[] {
  const result = Papa.parse<string[]>(csvText.trim(), {
    skipEmptyLines: true,
  });
  const keywords: string[] = [];
  for (const row of result.data) {
    const cell = (row[0] ?? "").trim();
    if (cell && !cell.toLowerCase().startsWith("keyword")) {
      keywords.push(cell);
    }
  }
  return [...new Set(keywords)];
}

export function parseKeywordPaste(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\n,;]+/)
        .map((k) => k.trim())
        .filter(Boolean),
    ),
  ];
}
