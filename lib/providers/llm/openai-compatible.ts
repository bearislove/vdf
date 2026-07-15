import OpenAI from "openai";
import type { LLMProvider } from "@/lib/providers/types";

/**
 * LLM provider for any OpenAI-compatible endpoint (9Router, OpenAI, Ollama, ...).
 * Configured entirely via env: AI_BASE_URL, AI_API_KEY, AI_MODEL.
 */
export class OpenAICompatibleLLMProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.AI_API_KEY ?? "",
      baseURL: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
    });
    this.model = process.env.AI_MODEL ?? "gpt-4o";
  }

  async chatComplete(system: string, user: string, opts?: { temperature?: number }): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: opts?.temperature,
    });
    return res.choices[0]?.message?.content ?? "";
  }
}
