import type { LlmCompletionOptions, LlmMessage, LlmProvider } from "../types";

export function createAnthropicProvider(model: string): LlmProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic");
  }

  return {
    name: "anthropic",
    async complete(messages: LlmMessage[], options?: LlmCompletionOptions) {
      const system = messages.find((m) => m.role === "system")?.content ?? "";
      const userMessages = messages.filter((m) => m.role !== "system");

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: options?.maxTokens ?? 4096,
          temperature: options?.temperature ?? 0.5,
          system: options?.jsonMode
            ? `${system}\n\nRespond with valid JSON only. No markdown fences.`
            : system,
          messages: userMessages.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          })),
        }),
      });
      if (!res.ok) {
        throw new Error(`Anthropic error: ${res.status} ${await res.text()}`);
      }
      const data = await res.json();
      const block = data.content?.find((b: { type: string }) => b.type === "text");
      return block?.text ?? "";
    },
  };
}
