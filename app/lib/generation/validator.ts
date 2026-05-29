import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { GeneratedPlpContent, PageTypeConfig } from "../types";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

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
