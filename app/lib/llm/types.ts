export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmCompletionOptions = {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
};

export type LlmProvider = {
  name: string;
  complete(messages: LlmMessage[], options?: LlmCompletionOptions): Promise<string>;
};
