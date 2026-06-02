import OpenAI from "openai";

export function getAIClient() {
  const provider = process.env.AI_PROVIDER ?? "openai";
  const baseURL =
    provider === "ollama"
      ? (process.env.AI_BASE_URL ?? "http://localhost:11434/v1")
      : (process.env.AI_BASE_URL ?? "https://api.openai.com/v1");

  return new OpenAI({
    apiKey: process.env.AI_API_KEY ?? "ollama",
    baseURL,
  });
}

export function getAIModel(): string {
  return process.env.AI_MODEL ?? "gpt-4o";
}
