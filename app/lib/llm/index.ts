import { createAnthropicProvider } from "./providers/anthropic";
import { createGeminiProvider } from "./providers/gemini";
import { createOpenAiProvider } from "./providers/openai";
import type { LlmCompletionOptions, LlmMessage, LlmProvider } from "./types";

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  gemini: "gemini-2.0-flash",
};

let cachedProvider: LlmProvider | null = null;

export function getLlmProvider(): LlmProvider {
  if (cachedProvider) return cachedProvider;

  const name = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();
  const model = process.env.LLM_MODEL ?? DEFAULT_MODELS[name] ?? DEFAULT_MODELS.anthropic;

  switch (name) {
    case "openai":
      cachedProvider = createOpenAiProvider(model);
      break;
    case "gemini":
      cachedProvider = createGeminiProvider(model);
      break;
    case "anthropic":
    default:
      cachedProvider = createAnthropicProvider(model);
  }
  return cachedProvider;
}

export async function completeJson(
  messages: LlmMessage[],
  options?: LlmCompletionOptions,
): Promise<string> {
  const provider = getLlmProvider();
  const raw = await provider.complete(messages, { ...options, jsonMode: true });
  return raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
}

export type { LlmMessage, LlmProvider };
