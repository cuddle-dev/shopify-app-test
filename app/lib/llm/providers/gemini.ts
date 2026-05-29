import type { LlmCompletionOptions, LlmMessage, LlmProvider } from "../types";

export function createGeminiProvider(model: string): LlmProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required when LLM_PROVIDER=gemini");

  return {
    name: "gemini",
    async complete(messages: LlmMessage[], options?: LlmCompletionOptions) {
      const system = messages.find((m) => m.role === "system")?.content ?? "";
      const contents = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: options?.jsonMode
                  ? `${system}\n\nReturn valid JSON only.`
                  : system,
              },
            ],
          },
          contents,
          generationConfig: {
            temperature: options?.temperature ?? 0.5,
            maxOutputTokens: options?.maxTokens ?? 4096,
            responseMimeType: options?.jsonMode ? "application/json" : undefined,
          },
        }),
      });
      if (!res.ok) {
        throw new Error(`Gemini error: ${res.status} ${await res.text()}`);
      }
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    },
  };
}
