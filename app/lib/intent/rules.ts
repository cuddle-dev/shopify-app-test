import type { ParsedIntent } from "../types";

const COLOR_PATTERNS =
  /\b(midnight blue|navy blue|sage green|blush pink|charcoal|ivory|cream|terracotta|emerald|botanical|floral)\b/gi;

const STYLE_PATTERNS =
  /\b(botanical|floral|geometric|minimalist|art deco|vintage|modern|scandinavian|tropical|striped)\b/gi;

const ATTRIBUTE_PATTERNS =
  /\b(sustainable|eco-friendly|organic|peel and stick|washable|non-toxic|vinyl|fabric-backed)\b/gi;

const ROOM_PATTERNS =
  /\b(kids room|children'?s room|nursery|bedroom|living room|lounge|bathroom|kitchen|hallway|office|dining room)\b/gi;

const AUDIENCE_PATTERNS =
  /\b(parents|renters|landlords|interior designers|first-time buyers)\b/gi;

function firstMatch(text: string, pattern: RegExp): string | undefined {
  const m = text.match(pattern);
  return m?.[0]?.toLowerCase();
}

export function parseIntentRules(keyword: string): ParsedIntent {
  const raw = keyword.trim().toLowerCase();
  const tokens = raw.split(/\s+/).filter(Boolean);

  const room = firstMatch(raw, ROOM_PATTERNS);
  const color = firstMatch(raw, COLOR_PATTERNS);
  const style = firstMatch(raw, STYLE_PATTERNS);
  const attribute = firstMatch(raw, ATTRIBUTE_PATTERNS);
  const audience = firstMatch(raw, AUDIENCE_PATTERNS);

  let use_case = room;
  if (raw.includes("kids") || raw.includes("nursery") || raw.includes("children")) {
    use_case = "kids room";
  }

  return {
    raw: keyword.trim(),
    color,
    style,
    attribute,
    use_case,
    room,
    audience,
    tokens,
  };
}
