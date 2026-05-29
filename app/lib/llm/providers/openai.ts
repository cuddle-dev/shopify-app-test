import type { LlmCompletionOptions, LlmMessage, LlmProvider } from "../types";

export function createOpenAiProvider(model: string): LlmProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai");

  return {
    name: "openai",
    async complete(messages: LlmMessage[], options?: LlmCompletionOptions) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options?.temperature ?? 0.5,
          max_tokens: options?.maxTokens ?? 4096,
          response_format: options?.jsonMode ? { type: "json_object" } : undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
      }
      const data = await res.json();
      return data.choices[0].message.content as string;
    },
  };
}
