import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { GeneratedPlpContent, PageTypeConfig } from "../types";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim()) return val;
  }
  return undefined;
}

/** Map common LLM key aliases (including localized names) to the English schema keys. */
export function normalizeGeneratedContent(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }

  const obj = { ...(parsed as Record<string, unknown>) };

  if (Array.isArray(obj.sections)) {
    obj.sections = obj.sections.map((section) => {
      if (!section || typeof section !== "object" || Array.isArray(section)) {
        return section;
      }
      const s = section as Record<string, unknown>;
      return {
        heading:
          pickString(s, [
            "heading",
            "title",
            "h2",
            "h3",
            "headline",
            "name",
            "titel",
            "überschrift",
            "ueberschrift",
          ]) ?? "",
        body:
          pickString(s, [
            "body",
            "content",
            "text",
            "inhalt",
            "paragraph",
            "copy",
            "description",
            "p",
          ]) ?? "",
      };
    });
  }

  if (Array.isArray(obj.faq)) {
    obj.faq = obj.faq.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return item;
      }
      const f = item as Record<string, unknown>;
      return {
        question: pickString(f, ["question", "frage", "q"]) ?? "",
        answer: pickString(f, ["answer", "antwort", "a", "response"]) ?? "",
      };
    });
  }

  return obj;
}

export function validateGeneratedContent(
  raw: string,
  pageType: PageTypeConfig,
): { valid: boolean; data?: GeneratedPlpContent; errors?: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { valid: false, errors: [`Invalid JSON: ${(e as Error).message}`] };
  }

  parsed = normalizeGeneratedContent(parsed);

  const validate = ajv.compile(pageType.output_schema);
  const valid = validate(parsed);
  if (!valid) {
    return {
      valid: false,
      errors: (validate.errors ?? []).map(
        (err) => `${err.instancePath} ${err.message}`,
      ),
    };
  }

  return { valid: true, data: parsed as GeneratedPlpContent };
}
